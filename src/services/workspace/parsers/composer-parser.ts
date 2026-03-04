import type { DependencyType, InstalledPackage } from '../../../types/package';
import { parseDependencySpec } from '../../../utils/version-utils';
import { getFallbackManifestName, getWorkspaceFolderPath } from './shared';

function readComposerDependencyObject(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[0] === 'string' && typeof entry[1] === 'string'
    )
  );
}

function readComposerDependencyMap(value: unknown): Map<string, string> {
  return new Map(Object.entries(readComposerDependencyObject(value)));
}

function isComposerPlatformPackage(name: string): boolean {
  const normalized = name.toLowerCase();
  return normalized === 'php' ||
    normalized.startsWith('ext-') ||
    normalized.startsWith('lib-') ||
    normalized === 'composer-plugin-api' ||
    normalized === 'composer-runtime-api' ||
    normalized === 'composer-api';
}

export function parseComposerManifest(
  composerJson: Record<string, unknown>,
  composerLock: Record<string, unknown> | null,
  manifestPath: string
): InstalledPackage[] {
  const workspaceFolderPath = getWorkspaceFolderPath(manifestPath);
  const manifestName =
    typeof composerJson.name === 'string' && composerJson.name.trim()
      ? composerJson.name.trim()
      : getFallbackManifestName(manifestPath);

  const packages: InstalledPackage[] = [];
  const addPackage = (name: string, version: string, type: DependencyType, versionSpecifier?: string) => {
    if (isComposerPlatformPackage(name)) {
      return;
    }

    const parsedSpec = parseDependencySpec(versionSpecifier || version);
    packages.push({
      workspaceFolderPath,
      manifestName,
      name,
      currentVersion: version,
      resolvedVersion: version,
      versionSpecifier: versionSpecifier || version,
      specKind: parsedSpec.kind,
      isRegistryResolvable: true,
      type,
      hasUpdate: false,
      packageJsonPath: manifestPath,
    });
  };

  if (composerLock) {
    const requireMap = readComposerDependencyMap(composerJson.require);
    const requireDevMap = readComposerDependencyMap(composerJson['require-dev']);
    const runtimePackages = Array.isArray(composerLock.packages) ? composerLock.packages as Array<Record<string, unknown>> : [];
    const devPackages = Array.isArray(composerLock['packages-dev'])
      ? composerLock['packages-dev'] as Array<Record<string, unknown>>
      : [];

    for (const pkg of runtimePackages) {
      const name = typeof pkg.name === 'string' ? pkg.name : undefined;
      const version = typeof pkg.version === 'string' ? pkg.version : undefined;
      if (name && version) {
        addPackage(name, version, 'dependencies', requireMap.get(name) || version);
      }
    }

    for (const pkg of devPackages) {
      const name = typeof pkg.name === 'string' ? pkg.name : undefined;
      const version = typeof pkg.version === 'string' ? pkg.version : undefined;
      if (name && version) {
        addPackage(name, version, 'devDependencies', requireDevMap.get(name) || version);
      }
    }

    return packages;
  }

  const dependencySets: Array<{ deps: Record<string, string>; type: DependencyType }> = [
    { deps: readComposerDependencyObject(composerJson.require), type: 'dependencies' },
    { deps: readComposerDependencyObject(composerJson['require-dev']), type: 'devDependencies' },
  ];

  for (const dependencySet of dependencySets) {
    for (const [name, versionRange] of Object.entries(dependencySet.deps)) {
      if (isComposerPlatformPackage(name)) {
        continue;
      }

      const parsedSpec = parseDependencySpec(versionRange);
      packages.push({
        workspaceFolderPath,
        manifestName,
        name,
        currentVersion: parsedSpec.displayText || versionRange,
        resolvedVersion: parsedSpec.normalizedVersion,
        versionSpecifier: versionRange,
        specKind: parsedSpec.kind,
        isRegistryResolvable: parsedSpec.isRegistryResolvable,
        type: dependencySet.type,
        hasUpdate: false,
        packageJsonPath: manifestPath,
      });
    }
  }

  return packages;
}
