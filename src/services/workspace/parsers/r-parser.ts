import type { DependencyType, InstalledPackage } from '../../../types/package';
import { dedupeInstalledPackages, getFallbackManifestName, getWorkspaceFolderPath } from './shared';

export function parseDcfFields(content: string): Record<string, string> {
  const fields: Record<string, string> = {};
  let currentKey: string | null = null;
  for (const rawLine of content.split(/\r?\n/)) {
    if (!rawLine.trim()) {
      currentKey = null;
      continue;
    }
    const fieldMatch = rawLine.match(/^([A-Za-z0-9/._-]+):\s*(.*)$/);
    if (fieldMatch) {
      currentKey = fieldMatch[1];
      fields[currentKey] = fieldMatch[2].trim();
      continue;
    }
    if (currentKey && /^\s+/.test(rawLine)) {
      fields[currentKey] = `${fields[currentKey]} ${rawLine.trim()}`.trim();
    }
  }
  return fields;
}

export function parseDescriptionDependencyField(field?: string): Array<{ name: string; versionSpecifier?: string }> {
  if (!field) {
    return [];
  }
  return field
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce<Array<{ name: string; versionSpecifier?: string }>>((entries, entry) => {
      const match = entry.match(/^([A-Za-z0-9.]+)\s*(?:\(([^)]+)\))?/);
      if (!match || match[1] === 'R') {
        return entries;
      }
      entries.push({
        name: match[1],
        versionSpecifier: match[2]?.trim(),
      });
      return entries;
    }, []);
}

export function parseDescriptionManifest(content: string, manifestPath: string): InstalledPackage[] {
  const workspaceFolderPath = getWorkspaceFolderPath(manifestPath);
  const fields = parseDcfFields(content);
  const manifestName = fields.Package || getFallbackManifestName(manifestPath);
  const packages: InstalledPackage[] = [];
  const addPackages = (fieldName: string, type: DependencyType) => {
    const parsed = parseDescriptionDependencyField(fields[fieldName]);
    for (const entry of parsed) {
      packages.push({
        workspaceFolderPath,
        manifestName,
        name: entry.name,
        currentVersion: entry.versionSpecifier || '*',
        resolvedVersion: entry.versionSpecifier,
        versionSpecifier: entry.versionSpecifier,
        specKind: entry.versionSpecifier ? 'semver' : undefined,
        isRegistryResolvable: true,
        type,
        hasUpdate: false,
        packageJsonPath: manifestPath,
      });
    }
  };

  addPackages('Depends', 'dependencies');
  addPackages('Imports', 'dependencies');
  addPackages('LinkingTo', 'dependencies');
  addPackages('Suggests', 'devDependencies');
  addPackages('Enhances', 'devDependencies');
  return dedupeInstalledPackages(packages);
}
