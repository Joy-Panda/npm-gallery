import type { DependencyType, InstalledPackage } from '../../../types/package';
import { parseDependencySpec } from '../../../utils/version-utils';
import { getFallbackManifestName, getWorkspaceFolderPath } from './shared';

function extractRubyDependencyType(optionsText: string): DependencyType | null {
  const normalized = optionsText.toLowerCase();
  if (
    /group:\s*:development\b/.test(normalized) ||
    /group:\s*:test\b/.test(normalized) ||
    /groups:\s*\[[^\]]*:(development|test)/.test(normalized)
  ) {
    return 'devDependencies';
  }
  return null;
}

function mapRubyGroupsToDependencyType(groupsText: string): DependencyType {
  return /:(development|test)\b/.test(groupsText.toLowerCase()) ? 'devDependencies' : 'dependencies';
}

export function parseGemfileDeclarations(
  content: string
): Array<{ name: string; versionSpecifier?: string; type: DependencyType }> {
  const declarations: Array<{ name: string; versionSpecifier?: string; type: DependencyType }> = [];
  const groupStack: DependencyType[] = ['dependencies'];

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const groupMatch = line.match(/^group\s+(.+?)\s+do\s*$/);
    if (groupMatch) {
      groupStack.push(mapRubyGroupsToDependencyType(groupMatch[1]));
      continue;
    }

    if (line === 'end' && groupStack.length > 1) {
      groupStack.pop();
      continue;
    }

    const gemMatch = rawLine.match(/^\s*gem\s+['"]([^'"]+)['"]\s*(?:,\s*(['"][^'"]+['"]|%q\{[^}]+\}|%Q\{[^}]+\}|[~><=\s\d.,-]+))?(.*)$/);
    if (!gemMatch) {
      continue;
    }

    const name = gemMatch[1]?.trim();
    if (!name) {
      continue;
    }

    const explicitGroupType = extractRubyDependencyType(gemMatch[3] || '');
    const versionSpecifier = gemMatch[2]?.trim().replace(/^['"]|['"]$/g, '');

    declarations.push({
      name,
      versionSpecifier,
      type: explicitGroupType || groupStack[groupStack.length - 1] || 'dependencies',
    });
  }

  return declarations;
}

export function parseGemfileLockVersions(content: string): Map<string, string> {
  const versions = new Map<string, string>();
  let inSpecs = false;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.replace(/\r$/, '');
    if (/^\s{2}specs:\s*$/.test(line)) {
      inSpecs = true;
      continue;
    }

    if (inSpecs && /^[A-Z][A-Z\s_-]*$/.test(line.trim())) {
      inSpecs = false;
      continue;
    }

    if (!inSpecs) {
      continue;
    }

    const match = line.match(/^\s{4}([^\s(]+)\s+\(([^)]+)\)/);
    if (match) {
      versions.set(match[1], match[2]);
    }
  }

  return versions;
}

export function parseGemfileManifest(
  gemfileContent: string,
  gemfileLockContent: string | null,
  manifestPath: string
): InstalledPackage[] {
  const workspaceFolderPath = getWorkspaceFolderPath(manifestPath);
  const manifestName = getFallbackManifestName(manifestPath);
  const declaredDependencies = parseGemfileDeclarations(gemfileContent);
  const lockedVersions = gemfileLockContent ? parseGemfileLockVersions(gemfileLockContent) : new Map<string, string>();
  const packages: InstalledPackage[] = [];

  for (const dependency of declaredDependencies) {
    const resolvedVersion = lockedVersions.get(dependency.name);
    const parsedSpec = parseDependencySpec(dependency.versionSpecifier || resolvedVersion || '');
    packages.push({
      workspaceFolderPath,
      manifestName,
      name: dependency.name,
      currentVersion: resolvedVersion || parsedSpec.displayText || dependency.versionSpecifier || 'latest',
      resolvedVersion,
      versionSpecifier: dependency.versionSpecifier,
      specKind: dependency.versionSpecifier ? parsedSpec.kind : undefined,
      isRegistryResolvable: !!resolvedVersion || !!dependency.versionSpecifier,
      type: dependency.type,
      hasUpdate: false,
      packageJsonPath: manifestPath,
    });
  }

  return packages;
}
