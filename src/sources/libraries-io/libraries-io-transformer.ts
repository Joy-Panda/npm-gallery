import type {
  LibrariesIoProject,
  LibrariesIoProjectResult,
  LibrariesIoSearchResult,
  LibrariesIoDependenciesResponse,
  LibrariesIoVersion,
} from '../../api/libraries-io';
import type {
  PackageInfo,
  PackageDetails,
  VersionInfo,
  SearchResult,
  SecurityInfo,
} from '../../types/package';

/**
 * Transformer for Libraries.io API responses
 */
export class LibrariesIoTransformer {
  /**
   * Transform Libraries.io search response to SearchResult
   * Libraries.io API returns either:
   * 1. An array of projects directly: LibrariesIoProject[]
   * 2. An object with projects array: { total, page, per_page, projects: LibrariesIoProject[] }
   */
  transformSearchResult(
    raw: LibrariesIoSearchResult,
    from: number = 0,
    size: number = 20
  ): SearchResult {
    // Check if raw is an array (direct response)
    if (Array.isArray(raw)) {
      const packages: PackageInfo[] = raw.map((project) =>
        this.transformProject(project)
      );
      return {
        packages,
        total: raw.length,
        hasMore: false, // Can't determine if there are more without pagination info
      };
    }

    // Otherwise, it's an object with projects array
    if (!raw || !raw.projects || !Array.isArray(raw.projects)) {
      console.error(`[LibrariesIoTransformer] Invalid response:`, raw);
      return {
        packages: [],
        total: raw?.total || 0,
        hasMore: false,
      };
    }

    const packages: PackageInfo[] = raw.projects.map((project) =>
      this.transformProject(project)
    );

    return {
      packages,
      total: raw.total || raw.projects.length,
      hasMore: from + size < (raw.total || raw.projects.length),
    };
  }

  /**
   * Transform Libraries.io project to PackageInfo
   */
  transformProject(project: LibrariesIoProject): PackageInfo {
    const coordinate = project.name; // Libraries.io uses groupId:artifactId format for Maven

    return {
      name: coordinate,
      version: project.latest_release_number || project.latest_stable_release_number || '0.0.0',
      description: project.description,
      keywords: project.keywords || [],
      license: project.repository_license || project.licenses || project.normalized_licenses?.[0],
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
  transformProjectDetails(
    raw: LibrariesIoProjectResult,
    dependencies?: LibrariesIoDependenciesResponse,
    security?: SecurityInfo
  ): PackageDetails {
    // Check if raw is an array (first element is the project)
    if (Array.isArray(raw)) {
      if (raw.length === 0) {
        throw new Error('Invalid project response: empty array');
      }
      const projectData = raw[0] as LibrariesIoProject & { versions?: LibrariesIoVersion[] };
      const project: LibrariesIoProject = projectData;
      const versionsArray: LibrariesIoVersion[] = projectData.versions || [];
      
      return this.buildPackageDetails(project, versionsArray, dependencies, security);
    }
    
    // Check if raw is a project object directly (has name field) or wrapped in project field
    let project: LibrariesIoProject;
    let versionsArray: LibrariesIoVersion[] = [];
    
    if ('name' in raw && 'platform' in raw) {
      // Direct project object
      project = raw as LibrariesIoProject;
      versionsArray = (raw as LibrariesIoProject & { versions?: LibrariesIoVersion[] }).versions || [];
    } else if ('project' in raw && raw.project) {
      // Wrapped in project field
      project = raw.project;
      versionsArray = raw.versions || [];
    } else {
      console.error(`[LibrariesIoTransformer] Invalid project response:`, raw);
      throw new Error('Invalid project response: missing project data');
    }
    
    return this.buildPackageDetails(project, versionsArray, dependencies, security);
  }

  /**
   * Build PackageDetails from project data
   */
  private buildPackageDetails(
    project: LibrariesIoProject,
    versionsArray: LibrariesIoVersion[],
    dependencies?: LibrariesIoDependenciesResponse,
    security?: SecurityInfo
  ): PackageDetails {
    
    const coordinate = project.name;

    // Transform versions
    const versions: VersionInfo[] = this.transformVersions(versionsArray, project);

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

    // Build time map from versions
    const time: Record<string, string> = {};
    for (const v of versionsArray) {
      if (v.published_at) {
        time[v.number] = v.published_at;
      }
    }

    return {
      name: coordinate,
      version: dependencies?.version || project.latest_release_number || project.latest_stable_release_number || '0.0.0',
      description: project.description,
      keywords: project.keywords || [],
      license: project.repository_license || project.licenses || project.normalized_licenses?.[0],
      repository: project.repository_url ? { url: project.repository_url } : undefined,
      homepage: project.homepage,
      downloads: project.dependents_count,
      deprecated: project.deprecation_reason || undefined, 
      versions,
      dependencies: Object.keys(deps).length > 0 ? deps : undefined,
      time: Object.keys(time).length > 0 ? time : undefined,
      security: security || undefined,
    };
  }

  /**
   * Transform Libraries.io versions to VersionInfo array
   */
  transformVersions(
    versions: LibrariesIoVersion[],
    project: LibrariesIoProject
  ): VersionInfo[] {
    return versions.map((v) => ({
      version: v.number,
      publishedAt: v.published_at,
      tag: v.number === project.latest_stable_release_number ? 'latest' : undefined,
    }));
  }
}
