import type { ISourceTransformer } from '../base/source-transformer.interface';
import type {
  PackageInfo,
  PackageDetails,
  VersionInfo,
  SearchResult,
} from '../../types/package';
import type {
  SonatypeSearchResponse,
  SonatypeArtifact,
  MavenPOM,
} from '../../api/sonatype-api';

/**
 * Transformer for Sonatype Central Repository API responses
 * Converts raw Sonatype API responses to unified data models
 */
export class SonatypeTransformer implements ISourceTransformer<SonatypeSearchResponse, SonatypeArtifact> {
  /**
   * Transform Sonatype search response to unified SearchResult
   */
  transformSearchResult(raw: SonatypeSearchResponse, from: number = 0, size: number = 20): SearchResult {
    const packages: PackageInfo[] = raw.response.docs.map((doc: SonatypeArtifact) =>
      this.transformArtifact(doc)
    );

    return {
      packages,
      total: raw.response.numFound,
      hasMore: from + size < raw.response.numFound,
    };
  }

  /**
   * Transform a single artifact to PackageInfo
   */
  private transformArtifact(artifact: SonatypeArtifact): PackageInfo {
    const coordinate = `${artifact.g}:${artifact.a}`;
    
    return {
      name: coordinate,
      version: artifact.v,
      description: undefined, // Will be filled from POM if available
      keywords: artifact.tags,
      license: undefined, // Will be filled from POM if available
      author: undefined, // Will be filled from POM if available
      repository: undefined, // Will be filled from POM if available
      homepage: undefined, // Will be filled from POM if available
    };
  }

  /**
   * Transform Sonatype artifact to unified PackageInfo
   */
  transformPackageInfo(raw: SonatypeArtifact | { artifact: SonatypeArtifact; pom?: MavenPOM | null }): PackageInfo {
    const artifact = 'artifact' in raw ? raw.artifact : raw;
    const pom = 'pom' in raw ? raw.pom : undefined;
    const coordinate = `${artifact.g}:${artifact.a}`;
    const project = pom?.project;

    return {
      name: coordinate,
      version: artifact.v,
      description: project?.description || project?.name,
      keywords: artifact.tags,
      license: project?.licenses?.license?.[0]?.name,
      author: project?.developers?.developer?.[0]
        ? {
            name: project.developers.developer[0].name,
            email: project.developers.developer[0].email,
            url: project.developers.developer[0].url,
          }
        : undefined,
      repository: project?.url ? { url: project.url } : undefined,
      homepage: project?.url,
    };
  }

  /**
   * Transform Sonatype artifact to unified PackageDetails
   */
  transformPackageDetails(raw: SonatypeArtifact | { artifact: SonatypeArtifact; versions: SonatypeArtifact[]; pom?: MavenPOM | null }): PackageDetails {
    const artifact = 'artifact' in raw ? raw.artifact : raw;
    const versions = 'versions' in raw ? raw.versions : [];
    const pom = 'pom' in raw ? raw.pom : undefined;
    const coordinate = `${artifact.g}:${artifact.a}`;
    const project = pom?.project;
    const versionInfos = this.transformVersions(versions);

    return {
      name: coordinate,
      version: artifact.v,
      description: project?.description || project?.name,
      keywords: artifact.tags,
      license: project?.licenses?.license?.[0]?.name,
      author: project?.developers?.developer?.[0]
        ? {
            name: project.developers.developer[0].name,
            email: project.developers.developer[0].email,
            url: project.developers.developer[0].url,
          }
        : undefined,
      repository: project?.url ? { url: project.url } : undefined,
      homepage: project?.url,
      versions: versionInfos,
      ...this.transformDependenciesByScope(project?.dependencies?.dependency || []),
      maintainers: project?.developers?.developer?.map((dev) => ({
        name: dev.name,
        email: dev.email,
        url: dev.url,
      })),
    };
  }

  /**
   * Transform versions list
   */
  transformVersions(raw: SonatypeArtifact | SonatypeArtifact[]): VersionInfo[] {
    const artifacts = Array.isArray(raw) ? raw : [raw];
    return artifacts
      .map((artifact) => ({
        version: artifact.v,
        publishedAt: artifact.timestamp ? new Date(artifact.timestamp).toISOString() : undefined,
        dist: {
          shasum: undefined, // Not available in search API
          tarball: undefined, // Maven uses different distribution mechanism
        },
      }))
      .sort((a, b) => {
        // Sort by version (simple string comparison, could be improved with semver)
        return b.version.localeCompare(a.version);
      });
  }

  /**
   * Transform Maven dependencies by scope
   * Maps Maven scopes to npm-style dependency types:
   * - compile (default) -> dependencies
   * - runtime -> dependencies
   * - test -> devDependencies
   * - provided -> peerDependencies
   */
  private transformDependenciesByScope(
    dependencies: Array<{
      groupId?: string;
      artifactId?: string;
      version?: string;
      scope?: string;
      optional?: string;
    }>
  ): {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
  } {
    const result: {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    } = {};

    for (const dep of dependencies) {
      if (!dep.groupId || !dep.artifactId) {
        continue;
      }

      const key = `${dep.groupId}:${dep.artifactId}`;
      const version = dep.version || '';

      // Handle optional dependencies first
      if (dep.optional === 'true') {
        if (!result.optionalDependencies) {
          result.optionalDependencies = {};
        }
        result.optionalDependencies[key] = version;
        continue;
      }

      // Map scope to dependency type
      const scope = dep.scope || 'compile';
      switch (scope) {
        case 'test':
          if (!result.devDependencies) {
            result.devDependencies = {};
          }
          result.devDependencies[key] = version;
          break;
        case 'provided':
          if (!result.peerDependencies) {
            result.peerDependencies = {};
          }
          result.peerDependencies[key] = version;
          break;
        case 'compile':
        case 'runtime':
        default:
          if (!result.dependencies) {
            result.dependencies = {};
          }
          result.dependencies[key] = version;
          break;
      }
    }

    return result;
  }

  /**
   * Transform Maven dependencies (legacy method for backward compatibility)
   */
  private transformDependencies(
    dependencies: Array<{
      groupId?: string;
      artifactId?: string;
      version?: string;
      scope?: string;
    }>
  ): Record<string, string> {
    const result: Record<string, string> = {};
    for (const dep of dependencies) {
      if (dep.groupId && dep.artifactId) {
        const key = `${dep.groupId}:${dep.artifactId}`;
        result[key] = dep.version || '';
      }
    }
    return result;
  }

  /**
   * Parse Maven coordinate to extract groupId and artifactId
   */
  parseCoordinate(coordinate: string): { groupId: string; artifactId: string } | null {
    const parts = coordinate.split(':');
    if (parts.length < 2) {
      return null;
    }
    return {
      groupId: parts[0],
      artifactId: parts[1],
    };
  }
}
