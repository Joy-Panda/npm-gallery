import { BaseSourceAdapter } from '../base/source-adapter.interface';
import { SourceCapability } from '../base/capabilities';
import { LibrariesIoClient, type LibrariesIoProject, type LibrariesIoProjectResponse, type LibrariesIoVersion } from '../../api/libraries-io';
import type { DepsDevClient } from '../../api/deps-dev';
import type { OSVClient } from '../../api/osv';
import {
  createSortOption,
  getSortValue,
  type InstallOptions,
  type PackageDetails,
  type PackageInfo,
  type SearchFilter,
  type SearchOptions,
  type SearchResult,
  type SearchSortBy,
  type SecurityInfo,
  type VersionInfo,
} from '../../types/package';
import type { ProjectType, SourceType } from '../../types/project';
import { PkgGoDevTransformer } from './pkg-go-dev-transformer';

export class PkgGoDevSourceAdapter extends BaseSourceAdapter {
  readonly sourceType: SourceType = 'pkg-go-dev';
  readonly displayName = 'pkg.go.dev';
  readonly projectType: ProjectType = 'go';
  readonly supportedSortOptions: SearchSortBy[] = [
    createSortOption('relevance', 'Relevance'),
    createSortOption('popularity', 'Popularity'),
    createSortOption('name', 'Name'),
  ];
  readonly supportedFilters: SearchFilter[] = [];

  private transformer = new PkgGoDevTransformer();

  constructor(
    private librariesIoClient: LibrariesIoClient,
    private osvClient: OSVClient,
    depsDevClient: DepsDevClient
  ) {
    super(depsDevClient);
  }

  getEcosystem(): string {
    return 'go';
  }

  getSupportedCapabilities(): SourceCapability[] {
    return [
      SourceCapability.SEARCH,
      SourceCapability.PACKAGE_INFO,
      SourceCapability.PACKAGE_DETAILS,
      SourceCapability.VERSIONS,
      SourceCapability.INSTALLATION,
      SourceCapability.SUGGESTIONS,
      SourceCapability.DEPENDENCIES,
      SourceCapability.SECURITY,
      SourceCapability.DEPENDENTS,
      SourceCapability.REQUIREMENTS,
    ];
  }

  async search(options: SearchOptions): Promise<SearchResult> {
    const { query = '', exactName, from = 0, size = 20, sortBy = 'relevance' } = options;
    const searchQuery = (exactName || query).trim();
    if (!searchQuery) {
      return { packages: [], total: 0, hasMore: false };
    }

    const page = Math.floor(from / size) + 1;
    const raw = await this.librariesIoClient.search(searchQuery, 'Go', {
      page,
      per_page: size,
    });
    let result = this.transformer.transformSearchResult(raw);

    if (exactName) {
      const exact = result.packages.find((pkg) => pkg.name.toLowerCase() === exactName.toLowerCase());
      if (exact) {
        result = {
          ...result,
          packages: [
            { ...exact, exactMatch: true },
            ...result.packages.filter((pkg) => pkg.name.toLowerCase() !== exactName.toLowerCase()),
          ],
        };
      } else {
        try {
          const pkg = await this.getPackageInfo(exactName);
          result = {
            ...result,
            packages: [{ ...pkg, exactMatch: true }, ...result.packages],
            total: Math.max(result.total, result.packages.length + 1),
          };
        } catch {
          // Ignore exact fetch failures.
        }
      }
    }

    const sortValue = getSortValue(sortBy);
    if (sortValue === 'name') {
      result.packages = [...result.packages].sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortValue === 'popularity') {
      result.packages = [...result.packages].sort(
        (a, b) => (b.score?.final || 0) - (a.score?.final || 0)
      );
    }

    return result;
  }

  async getSuggestions(query: string, limit = 10): Promise<PackageInfo[]> {
    const result = await this.search({ query, size: limit });
    return result.packages;
  }

  async getPackageInfo(name: string): Promise<PackageInfo> {
    const project = await this.getProject(name);
    return this.transformer.transformProject(project.project);
  }

  async getPackageDetails(name: string, version?: string): Promise<PackageDetails> {
    const project = await this.getProject(name);
    const resolvedVersion =
      version ||
      project.project.latest_stable_release_number ||
      project.project.latest_release_number ||
      project.versions[0]?.number;
    const dependencies = resolvedVersion
      ? await this.librariesIoClient.getDependencies('Go', name, resolvedVersion).catch(() => undefined)
      : undefined;
    const details = this.transformer.transformDetails(project.project, project.versions, dependencies);
    details.version = resolvedVersion || details.version;
    try {
      details.security = await this.getSecurityInfo(name, details.version) || undefined;
    } catch {
      // Continue without security data.
    }
    return details;
  }

  async getVersions(name: string): Promise<VersionInfo[]> {
    const project = await this.getProject(name);
    return this.transformer.transformVersions(project.versions);
  }

  async getSecurityInfo(name: string, version: string): Promise<SecurityInfo | null> {
    try {
      return await this.osvClient.queryVulnerabilities(name, version, 'Go');
    } catch {
      return null;
    }
  }

  getInstallCommand(packageName: string, options: InstallOptions): string {
    const version = options.version || 'latest';
    return `go get ${packageName}@${version}`;
  }

  getUpdateCommand(packageName: string, version?: string): string {
    return `go get ${packageName}@${version || 'latest'}`;
  }

  getRemoveCommand(packageName: string): string {
    return `go get ${packageName}@none`;
  }

  private async getProject(name: string): Promise<{ project: LibrariesIoProject; versions: LibrariesIoVersion[] }> {
    const response = await this.librariesIoClient.getProject('Go', name);
    if (Array.isArray(response)) {
      const project = response[0];
      if (!project) {
        throw new Error(`Package not found: ${name}`);
      }
      return {
        project,
        versions: project.versions || [],
      };
    }

    if ('name' in response && 'platform' in response) {
      return {
        project: response,
        versions: response.versions || [],
      };
    }

    const wrapped = response as LibrariesIoProjectResponse;
    if (!wrapped.project) {
      throw new Error(`Package not found: ${name}`);
    }

    return {
      project: wrapped.project,
      versions: wrapped.versions || [],
    };
  }
}
