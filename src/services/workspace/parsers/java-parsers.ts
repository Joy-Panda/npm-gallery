import type { DependencyType, InstalledPackage } from '../../../types/package';
import { getFallbackManifestName, getWorkspaceFolderPath } from './shared';

export function parsePomXml(xml: string, pomPath: string): InstalledPackage[] {
  const packages: InstalledPackage[] = [];

  try {
    const extractTag = (tag: string, content: string): string | undefined => {
      const regex = new RegExp(`<${tag}>(.*?)</${tag}>`, 's');
      const match = content.match(regex);
      return match ? match[1].trim() : undefined;
    };

    const properties: Record<string, string> = {};
    const propertiesMatch = xml.match(/<properties>(.*?)<\/properties>/s);
    if (propertiesMatch) {
      const propsContent = propertiesMatch[1];
      const propRegex = /<([\w.-]+)>(.*?)<\/\1>/gs;
      let propMatch: RegExpExecArray | null;
      while ((propMatch = propRegex.exec(propsContent)) !== null) {
        properties[propMatch[1]] = propMatch[2].trim();
      }
    }

    const resolveProperty = (value?: string): string | undefined => {
      if (!value) {
        return value;
      }
      return value.replace(/\$\{([\w.-]+)\}/g, (match, propName) => properties[propName] || match);
    };

    const extractDependencies = (
      xmlContent: string
    ): Array<{ groupId?: string; artifactId?: string; version?: string; scope?: string; optional?: string }> => {
      const deps: Array<{ groupId?: string; artifactId?: string; version?: string; scope?: string; optional?: string }> = [];
      const depsMatch = xmlContent.match(/<dependencies>(.*?)<\/dependencies>/s);
      if (!depsMatch) {
        return deps;
      }

      const depsContent = depsMatch[1];
      const depRegex = /<dependency>(.*?)<\/dependency>/gs;
      let depMatch: RegExpExecArray | null;

      while ((depMatch = depRegex.exec(depsContent)) !== null) {
        const depContent = depMatch[1];
        const groupId = extractTag('groupId', depContent);
        const artifactId = extractTag('artifactId', depContent);
        const version = extractTag('version', depContent);
        const scope = extractTag('scope', depContent) || 'compile';
        const optional = extractTag('optional', depContent);

        if (groupId && artifactId) {
          deps.push({ groupId, artifactId, version, scope, optional });
        }
      }

      return deps;
    };

    const dependencies = extractDependencies(xml);
    const projectArtifactId = extractTag('artifactId', xml);

    for (const dep of dependencies) {
      if (!dep.groupId || !dep.artifactId) {
        continue;
      }

      const coordinate = `${dep.groupId}:${dep.artifactId}`;
      const version = dep.version || '';
      const resolvedVersion = resolveProperty(version);
      const isRegistryResolvable = !!resolvedVersion && !/\$\{.+\}/.test(resolvedVersion);

      let depType: DependencyType = 'dependencies';
      if (dep.optional === 'true') {
        depType = 'optionalDependencies';
      } else if (dep.scope === 'test') {
        depType = 'devDependencies';
      } else if (dep.scope === 'provided') {
        depType = 'peerDependencies';
      }

      packages.push({
        workspaceFolderPath: getWorkspaceFolderPath(pomPath),
        manifestName: projectArtifactId,
        name: coordinate,
        currentVersion: resolvedVersion || version,
        resolvedVersion: isRegistryResolvable ? resolvedVersion : undefined,
        versionSpecifier: version || undefined,
        isRegistryResolvable,
        type: depType,
        hasUpdate: false,
        packageJsonPath: pomPath,
      });
    }
  } catch {
    return [];
  }

  return packages;
}

export function parseGradleManifest(text: string, manifestPath: string): InstalledPackage[] {
  const packages: InstalledPackage[] = [];
  const manifestName = getFallbackManifestName(manifestPath);
  const dependencyRegex =
    /(?:^|\s)(implementation|testImplementation|compileOnly|runtimeOnly|api|compile)\s*(?:\(\s*)?["']([^:"']+):([^:"']+):([^"')\s]+)["']\s*\)?/gm;

  let match: RegExpExecArray | null;
  while ((match = dependencyRegex.exec(text)) !== null) {
    const [, configuration, groupId, artifactId, versionText] = match;
    const coordinate = `${groupId}:${artifactId}`;
    const resolvedVersion = /[${]/.test(versionText) ? undefined : versionText;

    let depType: DependencyType = 'dependencies';
    if (configuration === 'testImplementation') {
      depType = 'devDependencies';
    } else if (configuration === 'compileOnly') {
      depType = 'peerDependencies';
    }

    packages.push({
      workspaceFolderPath: getWorkspaceFolderPath(manifestPath),
      manifestName,
      name: coordinate,
      currentVersion: versionText,
      resolvedVersion,
      versionSpecifier: versionText,
      isRegistryResolvable: !!resolvedVersion,
      type: depType,
      hasUpdate: false,
      packageJsonPath: manifestPath,
    });
  }

  return packages;
}
