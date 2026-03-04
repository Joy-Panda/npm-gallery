import type { DependencyType, InstalledPackage } from '../../../types/package';
import { getFallbackManifestName, getWorkspaceFolderPath, dedupeInstalledPackages } from './shared';
import { parseDepsEdnDependencies } from '../../../utils/clojure-deps';

export function parseDepsEdnManifest(content: string, manifestPath: string): InstalledPackage[] {
  const workspaceFolderPath = getWorkspaceFolderPath(manifestPath);
  const manifestName = getFallbackManifestName(manifestPath);
  const packages: InstalledPackage[] = [];
  const addPackage = (name: string, version: string, type: DependencyType) => {
    packages.push({
      workspaceFolderPath,
      manifestName,
      name,
      currentVersion: version,
      resolvedVersion: version,
      versionSpecifier: version,
      specKind: 'semver',
      isRegistryResolvable: true,
      type,
      hasUpdate: false,
      packageJsonPath: manifestPath,
    });
  };

  for (const dependency of parseDepsEdnDependencies(content)) {
    const before = content.slice(0, dependency.start);
    const lastExtraDepsIndex = before.lastIndexOf(':extra-deps');
    const lastAliasesIndex = before.lastIndexOf(':aliases');
    const type: DependencyType =
      lastExtraDepsIndex > lastAliasesIndex ? 'devDependencies' : 'dependencies';
    addPackage(dependency.name, dependency.version, type);
  }

  return dedupeInstalledPackages(packages);
}

export function parseLeiningenManifest(content: string, manifestPath: string): InstalledPackage[] {
  const workspaceFolderPath = getWorkspaceFolderPath(manifestPath);
  const manifestName = getFallbackManifestName(manifestPath);
  const packages: InstalledPackage[] = [];
  const addPackage = (name: string, version: string, type: DependencyType) => {
    packages.push({
      workspaceFolderPath,
      manifestName,
      name,
      currentVersion: version,
      resolvedVersion: version,
      versionSpecifier: version,
      specKind: 'semver',
      isRegistryResolvable: true,
      type,
      hasUpdate: false,
      packageJsonPath: manifestPath,
    });
  };

  for (const match of content.matchAll(/\[([A-Za-z0-9.\-]+\/[A-Za-z0-9.\-]+)\s+"([^"]+)"[^\]]*\]/g)) {
    addPackage(match[1], match[2], 'dependencies');
  }

  for (const match of content.matchAll(/:profiles\s+\{[\s\S]*?:dev\s+\{[\s\S]*?:dependencies\s+\[([\s\S]*?)\][\s\S]*?\}/g)) {
    for (const depMatch of match[1].matchAll(/\[([A-Za-z0-9.\-]+\/[A-Za-z0-9.\-]+)\s+"([^"]+)"[^\]]*\]/g)) {
      addPackage(depMatch[1], depMatch[2], 'devDependencies');
    }
  }

  return dedupeInstalledPackages(packages);
}
