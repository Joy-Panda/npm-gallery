import type { ISourceTransformer } from '../base/source-transformer.interface';
import type {
  PackageInfo,
  PackageDetails,
  VersionInfo,
  SearchResult,
  PackageRepository,
  SecurityInfo,
} from '../../types/package';
import type {
  SonatypeSearchResponse,
  SonatypeArtifact,
  MavenPOM,
  DepsDevDependencyTree,
  DepsDevPackage,
  DepsDevVersion,
} from '../../api/sonatype-api';
import type {
  LibrariesIoProject,
  LibrariesIoProjectResult,
  LibrariesIoSearchResult,
  LibrariesIoDependenciesResponse,
  LibrariesIoVersion,
} from '../../api/libraries-io';

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
      version: artifact.latestVersion || artifact.v,
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
  transformPackageInfo(raw: SonatypeArtifact | { 
    artifact: SonatypeArtifact; 
    pom?: MavenPOM | null;
    depsDevVersion?: DepsDevVersion | null;
  }): PackageInfo {
    const artifact = 'artifact' in raw ? raw.artifact : raw;
    const pom = 'pom' in raw ? raw.pom : undefined;
    const depsDevVersion = 'depsDevVersion' in raw ? raw.depsDevVersion : undefined;
    const coordinate = `${artifact.g}:${artifact.a}`;
    const project = pom?.project;

    // Extract links from deps.dev version
    let homepage: string | undefined;
    let repository: PackageRepository | undefined;
    if (depsDevVersion?.links) {
      for (const link of depsDevVersion.links) {
        if (link.label === 'Homepage' || link.label === 'Website') {
          homepage = link.url;
        } else if (link.label === 'Repository' || link.label === 'Source') {
          repository = { url: link.url };
        } else if (!homepage && link.url) {
          // Use first link as homepage if no explicit homepage found
          homepage = link.url;
        }
      }
    }

    // Fallback to POM URL if deps.dev doesn't have links
    if (!homepage && project?.url) {
      homepage = project.url;
    }
    if (!repository && project?.url) {
      repository = { url: project.url };
    }

    // Get license from deps.dev (more reliable) or POM
    const license = depsDevVersion?.licenses?.[0] || project?.licenses?.license?.[0]?.name;

    return {
      name: coordinate,
      version: artifact.v,
      description: project?.description || project?.name,
      keywords: artifact.tags,
      license,
      author: project?.developers?.developer?.[0]
        ? {
            name: project.developers.developer[0].name,
            email: project.developers.developer[0].email,
            url: project.developers.developer[0].url,
          }
        : undefined,
      repository,
      homepage,
    };
  }

  /**
   * Transform Sonatype artifact to unified PackageDetails
   */
  transformPackageDetails(raw: SonatypeArtifact | { 
    artifact: SonatypeArtifact; 
    versions: SonatypeArtifact[]; 
    pom?: MavenPOM | null; 
    dependencyTree?: DepsDevDependencyTree | null;
    depsDevPackage?: DepsDevPackage | null;
    depsDevVersion?: DepsDevVersion | null;
    security?: SecurityInfo | null;
  }): PackageDetails {
    const artifact = 'artifact' in raw ? raw.artifact : raw;
    const versions = 'versions' in raw ? raw.versions : [];
    const pom = 'pom' in raw ? raw.pom : undefined;
    const dependencyTree = 'dependencyTree' in raw ? raw.dependencyTree : undefined;
    const depsDevPackage = 'depsDevPackage' in raw ? raw.depsDevPackage : undefined;
    const depsDevVersion = 'depsDevVersion' in raw ? raw.depsDevVersion : undefined;
    const security = 'security' in raw ? raw.security : undefined;
    const coordinate = `${artifact.g}:${artifact.a}`;
    const project = pom?.project;
    
    // Transform versions with enhanced info from deps.dev
    const versionInfos = this.transformVersions(versions, depsDevPackage);

    // Prefer dependency tree from deps.dev if available (more complete and accurate)
    let dependencies: {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    } = {};

    if (dependencyTree) {
      dependencies = this.transformDependencyTree(dependencyTree);
    } else {
      // Fallback to POM dependencies
      dependencies = this.transformDependenciesByScope(project?.dependencies?.dependency || []);
    }

    // Extract links from deps.dev version
    let homepage: string | undefined;
    let repository: PackageRepository | undefined;
    if (depsDevVersion?.links) {
      for (const link of depsDevVersion.links) {
        if (link.label === 'Homepage' || link.label === 'Website') {
          homepage = link.url;
        } else if (link.label === 'Repository' || link.label === 'Source') {
          repository = { url: link.url };
        } else if (!homepage && link.url) {
          homepage = link.url;
        }
      }
    }

    // Fallback to POM URL if deps.dev doesn't have links
    if (!homepage && project?.url) {
      homepage = project.url;
    }
    if (!repository && project?.url) {
      repository = { url: project.url };
    }

    // Get license from deps.dev (more reliable) or POM
    const license = depsDevVersion?.licenses?.[0] || project?.licenses?.license?.[0]?.name;

    // Build time map from deps.dev versions
    const time: Record<string, string> = {};
    if (depsDevPackage?.versions) {
      for (const v of depsDevPackage.versions) {
        if (v.publishedAt) {
          time[v.versionKey.version] = v.publishedAt;
        }
      }
    }

    return {
      name: coordinate,
      version: artifact.v,
      description: project?.description || project?.name,
      keywords: artifact.tags,
      license,
      author: project?.developers?.developer?.[0]
        ? {
            name: project.developers.developer[0].name,
            email: project.developers.developer[0].email,
            url: project.developers.developer[0].url,
          }
        : undefined,
      repository,
      homepage,
      versions: versionInfos,
      ...dependencies,
      maintainers: project?.developers?.developer?.map((dev) => ({
        name: dev.name,
        email: dev.email,
        url: dev.url,
      })),
      time: Object.keys(time).length > 0 ? time : undefined,
      security: security || undefined,
    };
  }

  /**
   * Transform deps.dev dependency tree to unified dependency format
   * Extracts only DIRECT dependencies (indirect dependencies are fetched recursively)
   */
  private transformDependencyTree(tree: DepsDevDependencyTree): {
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

    // Find all DIRECT dependencies (relation === 'DIRECT')
    const directDeps = tree.nodes.filter((node) => node.relation === 'DIRECT');
    
    // Build a map of node index to version requirement from edges
    const requirementMap = new Map<number, string>();
    for (const edge of tree.edges) {
      // Find edges from the root node (index 0) to direct dependencies
      if (edge.fromNode === 0) {
        requirementMap.set(edge.toNode, edge.requirement);
      }
    }

    // Group dependencies by scope (we'll map them to npm-style dependency types)
    // For Maven, we'll put all direct dependencies in 'dependencies'
    // Test scope dependencies could go to devDependencies, but deps.dev doesn't provide scope info
    // So we'll put all in dependencies for now
    if (directDeps.length > 0) {
      result.dependencies = {};
      for (const dep of directDeps) {
        const depName = dep.versionKey.name;
        const nodeIndex = tree.nodes.indexOf(dep);
        const depVersion = requirementMap.get(nodeIndex) || dep.versionKey.version;
        result.dependencies[depName] = depVersion;
      }
    }

    return result;
  }

  /**
   * Transform versions list
   */
  transformVersions(raw: SonatypeArtifact | SonatypeArtifact[], depsDevPackage?: DepsDevPackage | null): VersionInfo[] {
    const artifacts = Array.isArray(raw) ? raw : [raw];
    
    // Build a map of version to deps.dev version info for enhanced metadata
    const depsDevVersionMap = new Map<string, { publishedAt?: string; isDefault: boolean }>();
    if (depsDevPackage?.versions) {
      for (const v of depsDevPackage.versions) {
        depsDevVersionMap.set(v.versionKey.version, {
          publishedAt: v.publishedAt,
          isDefault: v.isDefault,
        });
      }
    }
    
    return artifacts
      .map((artifact) => {
        const depsDevInfo = depsDevVersionMap.get(artifact.v);
        return {
          version: artifact.v,
          publishedAt: depsDevInfo?.publishedAt || (artifact.timestamp ? new Date(artifact.timestamp).toISOString() : undefined),
          tag: depsDevInfo?.isDefault ? 'latest' : undefined,
          dist: {
            shasum: undefined, // Not available in search API
            tarball: undefined, // Maven uses different distribution mechanism
          },
        };
      })
      .sort((a, b) => {
        // Sort by version (newest first)
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

  /**
   * Transform Libraries.io search response to unified SearchResult
   * Libraries.io API can return either:
   * 1. An array of projects directly: LibrariesIoProject[]
   * 2. An object with projects array: { total, page, per_page, projects: LibrariesIoProject[] }
   */
  transformLibrariesIoSearchResult(
    raw: LibrariesIoSearchResult,
    from: number = 0,
    size: number = 20
  ): SearchResult {
    // Handle both array and object response formats
    const projectsArray = Array.isArray(raw) 
      ? raw 
      : raw.projects || [];
    
    const total = Array.isArray(raw)
      ? raw.length
      : raw.total || projectsArray.length;

    const packages: PackageInfo[] = projectsArray.map((project) =>
      this.transformLibrariesIoProject(project)
    );

    return {
      packages,
      total,
      hasMore: from + size < total,
    };
  }

  /**
   * Transform Libraries.io project to PackageInfo
   */
  transformLibrariesIoProject(project: LibrariesIoProject): PackageInfo {
    const coordinate = project.name; // Libraries.io uses groupId:artifactId format for Maven

    return {
      name: coordinate,
      version: project.latest_release_number || project.latest_stable_release_number || '0.0.0',
      description: project.description,
      keywords: project.keywords || [],
      license: project.licenses || project.normalized_licenses?.[0],
      repository: project.repository_url ? { url: project.repository_url } : undefined,
      homepage: project.homepage,
      downloads: project.dependents_count,
      deprecated: project.deprecation_reason || undefined,
    };
  }

  /**
   * Transform Libraries.io project response to PackageDetails
   * Libraries.io API returns either:
   * 1. An array with a single project object: [LibrariesIoProject & { versions?: LibrariesIoVersion[] }]
   * 2. A project object directly with versions: LibrariesIoProject & { versions?: LibrariesIoVersion[] }
   * 3. An object with project and versions fields: { project: LibrariesIoProject, versions?: LibrariesIoVersion[] }
   */
  transformLibrariesIoProjectDetails(
    raw: LibrariesIoProjectResult,
    dependencies?: LibrariesIoDependenciesResponse
  ): PackageDetails {
    // Handle different response formats from Libraries.io
    let project: LibrariesIoProject;
    let versionsArray: LibrariesIoVersion[] = [];
    
    if (Array.isArray(raw)) {
      // Array format: [project with versions]
      if (raw.length === 0) {
        throw new Error('Invalid project response: empty array');
      }
      const projectData = raw[0] as LibrariesIoProject & { versions?: LibrariesIoVersion[] };
      project = projectData;
      versionsArray = projectData.versions || [];
    } else if ('name' in raw && 'platform' in raw) {
      // Direct project object
      project = raw as LibrariesIoProject;
      versionsArray = (raw as LibrariesIoProject & { versions?: LibrariesIoVersion[] }).versions || [];
    } else if ('project' in raw && raw.project) {
      // Wrapped in project field
      project = raw.project;
      versionsArray = raw.versions || [];
    } else {
      throw new Error('Invalid project response: missing project data');
    }
    
    const coordinate = project.name;

    // Transform versions
    const versions: VersionInfo[] = versionsArray.map((v) => ({
      version: v.number,
      publishedAt: v.published_at,
      tag: v.number === project.latest_stable_release_number ? 'latest' : undefined,
    }));

    // Transform dependencies
    const deps: Record<string, string> = {};
    if (dependencies?.dependencies) {
      for (const dep of dependencies.dependencies) {
        if (dep.requirements) {
          deps[dep.name] = dep.requirements;
        } else if (dep.latest) {
          deps[dep.name] = dep.latest;
        }
      }
    }

    return {
      name: coordinate,
      version: project.latest_release_number || project.latest_stable_release_number || '0.0.0',
      description: project.description,
      keywords: project.keywords || [],
      license: project.licenses || project.normalized_licenses?.[0],
      repository: project.repository_url ? { url: project.repository_url } : undefined,
      homepage: project.homepage,
      downloads: project.dependents_count,
      deprecated: project.deprecation_reason || undefined,
      versions,
      dependencies: Object.keys(deps).length > 0 ? deps : undefined,
    };
  }
}
