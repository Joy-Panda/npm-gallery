import type { DependencyType, InstalledPackage } from '../../../types/package';
import { parseDependencySpec } from '../../../utils/version-utils';
import { dedupeInstalledPackages, getFallbackManifestName, getWorkspaceFolderPath } from './shared';

function parsePerlSnapshot(content: string): Map<string, string> {
  const versions = new Map<string, string>();
  for (const match of content.matchAll(/distribution:\s+.+\/([A-Za-z0-9_:.-]+)-([0-9][A-Za-z0-9._-]*)/g)) {
    versions.set(match[1], match[2]);
  }
  return versions;
}

function extractPubspecName(content: string): string | undefined {
  return content.match(/^\s*name:\s*([A-Za-z0-9_]+)/m)?.[1];
}

function parsePubspecLockVersions(content: string): Map<string, string> {
  const versions = new Map<string, string>();
  const lines = content.split(/\r?\n/);
  let currentPackage: string | null = null;

  for (const line of lines) {
    const packageMatch = line.match(/^  ([A-Za-z0-9_]+):$/);
    if (packageMatch) {
      currentPackage = packageMatch[1];
      continue;
    }
    if (!currentPackage) {
      continue;
    }
    const versionMatch = line.match(/^\s{4}version:\s*"([^"]+)"/);
    if (versionMatch) {
      versions.set(currentPackage, versionMatch[1]);
      currentPackage = null;
    }
  }

  return versions;
}

function mapPubspecSectionToDependencyType(section: string): DependencyType | null {
  if (section === 'dependencies') {
    return 'dependencies';
  }
  if (section === 'dev_dependencies') {
    return 'devDependencies';
  }
  return null;
}

export function parsePerlManifest(
  cpanfileContent: string,
  snapshotContent: string | null,
  manifestPath: string
): InstalledPackage[] {
  const workspaceFolderPath = getWorkspaceFolderPath(manifestPath);
  const manifestName = getFallbackManifestName(manifestPath);
  const resolvedVersions = snapshotContent ? parsePerlSnapshot(snapshotContent) : new Map<string, string>();
  const packages: InstalledPackage[] = [];
  let currentType: DependencyType = 'dependencies';

  for (const rawLine of cpanfileContent.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    if (/^on\s+['"](test|develop|configure)['"]/.test(line)) {
      currentType = 'devDependencies';
    }
    if (/^\};?\s*$/.test(line)) {
      currentType = 'dependencies';
    }

    const match = line.match(/(?:requires|recommends|suggests)\s+['"]([^'"]+)['"]\s*(?:,\s*['"]([^'"]+)['"])?/);
    if (!match) {
      continue;
    }

    const name = match[1];
    const versionSpecifier = match[2];
    const resolvedVersion = resolvedVersions.get(name);
    const parsedSpec = parseDependencySpec(versionSpecifier || resolvedVersion || '');
    packages.push({
      workspaceFolderPath,
      manifestName,
      name,
      currentVersion: resolvedVersion || parsedSpec.displayText || versionSpecifier || 'latest',
      resolvedVersion,
      versionSpecifier,
      specKind: versionSpecifier ? parsedSpec.kind : undefined,
      isRegistryResolvable: true,
      type: currentType,
      hasUpdate: false,
      packageJsonPath: manifestPath,
    });
  }

  return dedupeInstalledPackages(packages);
}

export function parsePubspecManifest(
  pubspecContent: string,
  lockContent: string | null,
  manifestPath: string
): InstalledPackage[] {
  const workspaceFolderPath = getWorkspaceFolderPath(manifestPath);
  const manifestName = extractPubspecName(pubspecContent) || getFallbackManifestName(manifestPath);
  const lockedVersions = lockContent ? parsePubspecLockVersions(lockContent) : new Map<string, string>();
  const packages: InstalledPackage[] = [];
  let currentSection = '';

  for (const rawLine of pubspecContent.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+#.*$/, '');
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const sectionMatch = trimmed.match(/^([A-Za-z_]+):\s*$/);
    if (sectionMatch && trimmed === sectionMatch[0]) {
      currentSection = sectionMatch[1];
      continue;
    }

    const depType = mapPubspecSectionToDependencyType(currentSection);
    if (!depType) {
      continue;
    }

    const indent = rawLine.match(/^\s*/)?.[0].length || 0;
    if (indent < 2) {
      continue;
    }

    const packageMatch = trimmed.match(/^([A-Za-z0-9_]+):\s*(.+)?$/);
    if (!packageMatch) {
      continue;
    }

    const name = packageMatch[1];
    const rawSpec = packageMatch[2]?.trim();
    const normalizedSpec = rawSpec && rawSpec !== '' ? rawSpec.replace(/^['"]|['"]$/g, '') : undefined;
    const isRegistryResolvable =
      !!normalizedSpec &&
      !/^sdk:/i.test(normalizedSpec) &&
      !/^path:/i.test(normalizedSpec) &&
      !/^git:/i.test(normalizedSpec) &&
      normalizedSpec !== '{}';
    const resolvedVersion = lockedVersions.get(name);
    const displayVersion = resolvedVersion || normalizedSpec || 'sdk/path/git';
    const parsedSpec = parseDependencySpec(normalizedSpec || '');

    packages.push({
      workspaceFolderPath,
      manifestName,
      name,
      currentVersion: displayVersion,
      resolvedVersion,
      versionSpecifier: normalizedSpec,
      specKind: normalizedSpec ? parsedSpec.kind : undefined,
      isRegistryResolvable,
      type: depType,
      hasUpdate: false,
      packageJsonPath: manifestPath,
    });
  }

  return dedupeInstalledPackages(packages);
}
