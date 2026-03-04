import { parseCakeDirectives } from '../../../utils/cake-utils';
import type { InstalledPackage } from '../../../types/package';
import { getFallbackManifestName, getWorkspaceFolderPath, readXmlAttribute, readXmlElementText } from './shared';

export function parseDirectoryPackagesProps(xml: string, manifestPath: string): InstalledPackage[] {
  const packages: InstalledPackage[] = [];
  const re = /<PackageVersion\s+Include="([^"]+)"\s+Version="([^"]+)"\s*\/>|<PackageVersion\s+Version="([^"]+)"\s+Include="([^"]+)"\s*\/>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const id = (m[1] ?? m[4])?.trim();
    const version = (m[2] ?? m[3])?.trim();
    if (id && version) {
      packages.push({
        workspaceFolderPath: getWorkspaceFolderPath(manifestPath),
        manifestName: 'Directory.Packages.props',
        name: id,
        currentVersion: version,
        resolvedVersion: version,
        versionSpecifier: version,
        isRegistryResolvable: true,
        type: 'dependencies',
        hasUpdate: false,
        packageJsonPath: manifestPath,
      });
    }
  }
  return packages;
}

export function parsePaketDependencies(text: string, manifestPath: string): InstalledPackage[] {
  const packages: InstalledPackage[] = [];
  const re = /^\s*nuget\s+([^\s]+)\s+([^\s~]+)/gim;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const id = m[1]?.trim();
    const version = m[2]?.trim();
    if (id && version) {
      packages.push({
        workspaceFolderPath: getWorkspaceFolderPath(manifestPath),
        manifestName: 'paket.dependencies',
        name: id,
        currentVersion: version,
        resolvedVersion: version,
        versionSpecifier: version,
        isRegistryResolvable: true,
        type: 'dependencies',
        hasUpdate: false,
        packageJsonPath: manifestPath,
      });
    }
  }
  return packages;
}

export function parsePackagesConfig(xml: string, manifestPath: string): InstalledPackage[] {
  const packages: InstalledPackage[] = [];
  const re = /<package\b([^>]*?)\/?>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const attrs = m[1] ?? '';
    const id = readXmlAttribute(attrs, 'id');
    const version = readXmlAttribute(attrs, 'version');
    if (!id || !version) {
      continue;
    }

    packages.push({
      workspaceFolderPath: getWorkspaceFolderPath(manifestPath),
      manifestName: 'packages.config',
      name: id,
      currentVersion: version,
      resolvedVersion: version,
      versionSpecifier: version,
      isRegistryResolvable: true,
      type: 'dependencies',
      hasUpdate: false,
      packageJsonPath: manifestPath,
    });
  }

  return packages;
}

export function parseProjectPackageReferences(xml: string, manifestPath: string): InstalledPackage[] {
  const packages: InstalledPackage[] = [];
  const re = /<PackageReference\b([^>]*?)\/>|<PackageReference\b([^>]*?)>([\s\S]*?)<\/PackageReference>/gi;
  let m: RegExpExecArray | null;
  const manifestName = getFallbackManifestName(manifestPath);

  while ((m = re.exec(xml)) !== null) {
    const attrs = (m[1] ?? m[2] ?? '').trim();
    const body = m[3] ?? '';
    const id = readXmlAttribute(attrs, 'Include') || readXmlAttribute(attrs, 'Update');
    const version = readXmlAttribute(attrs, 'Version') || readXmlElementText(body, 'Version');
    if (!id || !version) {
      continue;
    }

    packages.push({
      workspaceFolderPath: getWorkspaceFolderPath(manifestPath),
      manifestName,
      name: id,
      currentVersion: version,
      resolvedVersion: version,
      versionSpecifier: version,
      isRegistryResolvable: true,
      type: 'dependencies',
      hasUpdate: false,
      packageJsonPath: manifestPath,
    });
  }

  return packages;
}

export function parseCakePackages(text: string, manifestPath: string): InstalledPackage[] {
  const packages: InstalledPackage[] = [];
  const path = require('path') as typeof import('path');
  const manifestName = path.basename(manifestPath);
  for (const directive of parseCakeDirectives(text)) {
    packages.push({
      workspaceFolderPath: getWorkspaceFolderPath(manifestPath),
      manifestName,
      name: directive.packageId,
      currentVersion: directive.version || 'floating',
      resolvedVersion: directive.version,
      versionSpecifier: directive.version,
      isRegistryResolvable: !!directive.version,
      type: 'dependencies',
      hasUpdate: false,
      packageJsonPath: manifestPath,
    });
  }
  return packages;
}
