import type { DependencyType, InstalledPackage } from '../../../types/package';
import { parseDependencySpec } from '../../../utils/version-utils';
import { dedupeInstalledPackages, getFallbackManifestName, getWorkspaceFolderPath } from './shared';

function extractCargoPackageName(content: string): string | undefined {
  const packageSection = content.match(/\[package\]([\s\S]*?)(?:\n\[|$)/);
  if (!packageSection) {
    return undefined;
  }
  const nameMatch = packageSection[1].match(/^\s*name\s*=\s*"([^"]+)"/m);
  return nameMatch?.[1];
}

function parseCargoLockVersions(content: string): Map<string, string> {
  const versions = new Map<string, string>();
  const packageBlocks = content.split(/\[\[package\]\]/g);
  for (const block of packageBlocks) {
    const nameMatch = block.match(/^\s*name\s*=\s*"([^"]+)"/m);
    const versionMatch = block.match(/^\s*version\s*=\s*"([^"]+)"/m);
    if (!nameMatch || !versionMatch) {
      continue;
    }
    versions.set(nameMatch[1], versionMatch[1]);
  }
  return versions;
}

function mapCargoSectionToDependencyType(section: string): DependencyType | null {
  if (section === 'dependencies' || section.endsWith('.dependencies')) {
    return 'dependencies';
  }
  if (
    section === 'dev-dependencies' ||
    section === 'build-dependencies' ||
    section.endsWith('.dev-dependencies') ||
    section.endsWith('.build-dependencies')
  ) {
    return 'devDependencies';
  }
  return null;
}

function parseCargoDependencyLine(
  line: string
): { name: string; versionSpecifier?: string; displayVersion: string; isRegistryResolvable: boolean } | null {
  const stringMatch = line.match(/^([A-Za-z0-9_-]+)\s*=\s*"([^"]+)"/);
  if (stringMatch) {
    return {
      name: stringMatch[1],
      versionSpecifier: stringMatch[2],
      displayVersion: stringMatch[2],
      isRegistryResolvable: true,
    };
  }

  const inlineTableMatch = line.match(/^([A-Za-z0-9_-]+)\s*=\s*\{(.*)\}$/);
  if (!inlineTableMatch) {
    return null;
  }

  const name = inlineTableMatch[1];
  const body = inlineTableMatch[2];
  const versionMatch = body.match(/(?:^|,)\s*version\s*=\s*"([^"]+)"/);
  if (versionMatch) {
    return {
      name,
      versionSpecifier: versionMatch[1],
      displayVersion: versionMatch[1],
      isRegistryResolvable: true,
    };
  }

  if (/\bworkspace\s*=\s*true\b/.test(body)) {
    return { name, displayVersion: 'workspace', isRegistryResolvable: false };
  }
  if (/\bpath\s*=/.test(body)) {
    return { name, displayVersion: 'path', isRegistryResolvable: false };
  }
  if (/\bgit\s*=/.test(body)) {
    return { name, displayVersion: 'git', isRegistryResolvable: false };
  }

  return { name, displayVersion: 'custom', isRegistryResolvable: false };
}

function extractGoModuleName(content: string): string | undefined {
  return content.match(/^\s*module\s+([^\s]+)\s*$/m)?.[1];
}

function parseGoDependencyLine(line: string): { name: string; version: string } | null {
  const match = line.match(/^([^\s]+)\s+(v[^\s]+)$/);
  if (!match) {
    return null;
  }

  return {
    name: match[1],
    version: match[2],
  };
}

export function parseCargoManifest(
  cargoTomlContent: string,
  cargoLockContent: string | null,
  manifestPath: string
): InstalledPackage[] {
  const workspaceFolderPath = getWorkspaceFolderPath(manifestPath);
  const manifestName = extractCargoPackageName(cargoTomlContent) || getFallbackManifestName(manifestPath);
  const lockedVersions = cargoLockContent ? parseCargoLockVersions(cargoLockContent) : new Map<string, string>();
  const packages: InstalledPackage[] = [];
  let currentSection = '';

  for (const rawLine of cargoTomlContent.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+#.*$/, '').trim();
    if (!line) {
      continue;
    }

    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      continue;
    }

    const dependencyType = mapCargoSectionToDependencyType(currentSection);
    if (!dependencyType) {
      continue;
    }

    const parsed = parseCargoDependencyLine(line);
    if (!parsed) {
      continue;
    }

    const resolvedVersion = lockedVersions.get(parsed.name);
    const displayVersion = resolvedVersion || parsed.versionSpecifier || parsed.displayVersion;
    const parsedSpec = parseDependencySpec(parsed.versionSpecifier || displayVersion || '');
    packages.push({
      workspaceFolderPath,
      manifestName,
      name: parsed.name,
      currentVersion: displayVersion,
      resolvedVersion,
      versionSpecifier: parsed.versionSpecifier,
      specKind: parsed.versionSpecifier ? parsedSpec.kind : undefined,
      isRegistryResolvable: parsed.isRegistryResolvable,
      type: dependencyType,
      hasUpdate: false,
      packageJsonPath: manifestPath,
    });
  }

  return dedupeInstalledPackages(packages);
}

export function parseGoManifest(content: string, manifestPath: string): InstalledPackage[] {
  const workspaceFolderPath = getWorkspaceFolderPath(manifestPath);
  const manifestName = extractGoModuleName(content) || getFallbackManifestName(manifestPath);
  const packages: InstalledPackage[] = [];
  let inRequireBlock = false;

  const addPackage = (line: string, type: DependencyType) => {
    const parsed = parseGoDependencyLine(line);
    if (!parsed) {
      return;
    }

    const parsedSpec = parseDependencySpec(parsed.version);
    packages.push({
      workspaceFolderPath,
      manifestName,
      name: parsed.name,
      currentVersion: parsed.version,
      resolvedVersion: parsed.version,
      versionSpecifier: parsed.version,
      specKind: parsedSpec.kind,
      isRegistryResolvable: true,
      type,
      hasUpdate: false,
      packageJsonPath: manifestPath,
    });
  };

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.replace(/\s*\/\/.*$/, '').trim();
    if (!line) {
      continue;
    }

    if (/^require\s*\($/.test(line)) {
      inRequireBlock = true;
      continue;
    }

    if (inRequireBlock && line === ')') {
      inRequireBlock = false;
      continue;
    }

    if (inRequireBlock) {
      addPackage(line, 'dependencies');
      continue;
    }

    const singleRequire = line.match(/^require\s+(.+)$/);
    if (singleRequire) {
      addPackage(singleRequire[1], 'dependencies');
    }
  }

  return dedupeInstalledPackages(packages);
}
