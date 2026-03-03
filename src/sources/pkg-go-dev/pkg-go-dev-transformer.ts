import type {
  PackageDetails,
  PackageInfo,
  SearchResult,
  VersionInfo,
} from '../../types/package';
import { compareVersions } from '../../utils/version-utils';
import type {
  LibrariesIoDependenciesResponse,
  LibrariesIoProject,
  LibrariesIoSearchResult,
  LibrariesIoVersion,
} from '../../api/libraries-io';

export class PkgGoDevTransformer {
  transformSearchResult(raw: LibrariesIoSearchResult): SearchResult {
    const projects = Array.isArray(raw) ? raw : raw.projects || [];
    const total = Array.isArray(raw) ? projects.length : raw.total || projects.length;
    return {
      packages: projects.map((project) => this.transformProject(project)),
      total,
      hasMore: projects.length > 0 && total > projects.length,
    };
  }

  transformProject(project: LibrariesIoProject): PackageInfo {
    return {
      name: project.name,
      version: project.latest_stable_release_number || project.latest_release_number || 'latest',
      description: project.description,
      license: project.repository_license || project.normalized_licenses?.[0] || project.licenses,
      homepage: project.homepage,
      repository: project.repository_url ? { url: project.repository_url } : undefined,
      keywords: project.keywords,
      score: typeof project.score === 'number'
        ? {
            final: project.score > 1 ? project.score / 100 : project.score,
          }
        : undefined,
    };
  }

  transformDetails(
    project: LibrariesIoProject,
    versions: LibrariesIoVersion[],
    dependencies?: LibrariesIoDependenciesResponse
  ): PackageDetails {
    const dependencyMap = dependencies?.dependencies?.reduce<Record<string, string>>((acc, dep) => {
      if (dep.name) {
        acc[dep.name] = dep.requirements || dep.latest || '*';
      }
      return acc;
    }, {});

    return {
      ...this.transformProject(project),
      readme: project.description,
      versions: this.transformVersions(versions),
      dependencies: dependencyMap && Object.keys(dependencyMap).length > 0 ? dependencyMap : undefined,
    };
  }

  transformVersions(versions: LibrariesIoVersion[]): VersionInfo[] {
    return [...versions]
      .map((version) => ({
        version: version.number,
        publishedAt: version.published_at,
      }))
      .sort((a, b) => compareVersions(b.version, a.version));
  }
}
