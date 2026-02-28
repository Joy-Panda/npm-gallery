import { NpmBaseAdapter } from './npm-base-adapter';
import { SourceCapability, CapabilityNotSupportedError } from '../base/capabilities';
import { NpmTransformer } from './npm-transformer';
import { LibrariesIoClient } from '../../api/libraries-io';
import type { 
  LibrariesIoProject, 
  LibrariesIoVersion
} from '../../api/libraries-io';
import type { NpmRegistryClient } from '../../api/npm-registry';
import type { BundlephobiaClient } from '../../api/bundlephobia';
import type { DepsDevClient } from '../../api/deps-dev';
import type { OSVClient } from '../../api/osv';
import type {
  PackageInfo,
  PackageDetails,
  VersionInfo,
  SearchResult,
  SearchOptions,
  SearchSortBy,
  SearchFilter,
  BundleSize,
  SecurityInfo,
} from '../../types/package';
import { createSortOption, getSortValue, createFilterOption } from '../../types/package';
import type { SourceType, ProjectType } from '../../types/project';

/**
 * npm Registry source adapter
 * Wraps NpmRegistryClient with ISourceAdapter interface
 */
export class NpmRegistrySourceAdapter extends NpmBaseAdapter {
  readonly sourceType: SourceType = 'npm-registry';
  readonly displayName = 'npm Registry';
  readonly projectType: ProjectType = 'npm';
  readonly supportedSortOptions: SearchSortBy[] = [
    createSortOption('relevance', 'Relevance'),
    createSortOption('popularity', 'Popularity'),
    createSortOption('quality', 'Quality'),
    createSortOption('maintenance', 'Maintenance'),
    createSortOption('name', 'Name'),
  ];
  readonly supportedFilters: SearchFilter[] = [
    createFilterOption('author', 'Author', 'author username'),
    createFilterOption('maintainer', 'Maintainer', 'maintainer username'),
    createFilterOption('scope', 'Scope', 'scope (e.g., @foo/bar)'),
    createFilterOption('keywords', 'Keywords', 'keywords: Use + for AND, , for OR, - to exclude'),
    createFilterOption('deprecated', 'Deprecated', 'filter deprecated packages (use not:deprecated or is:deprecated)'),
    createFilterOption('unstable', 'Unstable', 'filter unstable packages < 1.0.0 (use not:unstable or is:unstable)'),
    createFilterOption('insecure', 'Insecure', 'filter insecure packages (use not:insecure or is:insecure)'),
    createFilterOption('boost-exact', 'Boost Exact', 'boost exact matches (use boost-exact:false to disable)'),
  ];

  private transformer: NpmTransformer;

  constructor(
    private client: NpmRegistryClient,
    private bundlephobiaClient?: BundlephobiaClient,
    osvClient?: OSVClient,
    private librariesIoClient?: LibrariesIoClient,
    depsDevClient?: DepsDevClient
  ) {
    super(osvClient, depsDevClient);
    this.transformer = new NpmTransformer();
  }

  /**
   * Declare supported capabilities
   */
  getSupportedCapabilities(): SourceCapability[] {
    return [
      SourceCapability.SEARCH,
      SourceCapability.PACKAGE_INFO,
      SourceCapability.PACKAGE_DETAILS,
      SourceCapability.VERSIONS,
      SourceCapability.INSTALLATION,
      SourceCapability.SUGGESTIONS,
      SourceCapability.DEPENDENCIES,
      SourceCapability.DOCUMENTATION,
      SourceCapability.SECURITY,
      SourceCapability.BUNDLE_SIZE,
      SourceCapability.DOWNLOAD_STATS,
      SourceCapability.QUALITY_SCORE,
      SourceCapability.DEPENDENTS,
      SourceCapability.REQUIREMENTS,
    ];
  }

  /**
   * Search for packages
   */
  async search(options: SearchOptions): Promise<SearchResult> {
    const { query, exactName, from = 0, size = 20, sortBy = 'relevance', signal } = options;

    if (!query.trim() && !exactName) {
      return { packages: [], total: 0, hasMore: false };
    }
    const searchQuery = query.trim() || exactName || '';

    const sortValue = getSortValue(sortBy);
    // Map sortBy to npm registry format
    const apiSortBy = sortValue === 'name' ? 'relevance' : sortValue;

    try {
      const response = await this.client.search(searchQuery, {
        from,
        size,
        sortBy: apiSortBy as 'relevance' | 'popularity' | 'quality' | 'maintenance',
        signal,
      });

      const result = this.transformer.transformSearchResult(response, from, size);

      // Client-side name sorting if needed
      if (sortValue === 'name') {
        result.packages = this.sortPackagesByName(result.packages);
      }

      // Prioritize exact match if exactName is provided
      if (exactName && result.packages.length > 0) {
        const exactMatch = result.packages.find(pkg => pkg.name === exactName);
        if (exactMatch) {
          result.packages = [exactMatch, ...result.packages.filter(pkg => pkg.name !== exactName)];
        }
      }

      return result;
    } catch (error) {
      // Fallback to Libraries.io if primary search fails
      if (this.librariesIoClient) {
        try {
          const page = Math.floor(from / size) + 1;
          const platform = LibrariesIoClient.getPlatformForProjectType(this.projectType);
          const librariesIoResponse = await this.librariesIoClient.search(query, platform, {
            page,
            per_page: size,
          });
          
          // Handle both array and object response formats
          const projectsArray = Array.isArray(librariesIoResponse) 
            ? librariesIoResponse 
            : librariesIoResponse.projects || [];
          
          const total = Array.isArray(librariesIoResponse)
            ? librariesIoResponse.length
            : librariesIoResponse.total || projectsArray.length;
          
          // Transform Libraries.io response to SearchResult format
          const packages: PackageInfo[] = projectsArray.map((project) => ({
            name: project.name,
            version: project.latest_release_number || project.latest_stable_release_number || '0.0.0',
            description: project.description,
            keywords: project.keywords || [],
            license: project.licenses || project.normalized_licenses?.[0],
            repository: project.repository_url ? { url: project.repository_url } : undefined,
            homepage: project.homepage,
            downloads: project.dependents_count,
            deprecated: project.deprecation_reason || undefined,
          }));

          // Client-side name sorting if needed
          const sortValue = getSortValue(sortBy);
          const sortedPackages = sortValue === 'name' 
            ? this.sortPackagesByName(packages)
            : packages;

          return {
            packages: sortedPackages,
            total,
            hasMore: from + size < total,
          };
        } catch (fallbackError) {
          // If both fail, throw the original error
          throw error;
        }
      } else {
        throw error;
      }
    }
  }

  /**
   * Get suggestions for autocomplete
   */
  async getSuggestions(query: string, limit: number = 10): Promise<PackageInfo[]> {
    const result = await this.search({ query, size: limit });
    return result.packages;
  }

  /**
   * Get basic package info
   */
  async getPackageInfo(name: string): Promise<PackageInfo> {
    const pkg = await this.client.getPackage(name);
    const info = this.transformer.transformPackageInfo(pkg);

    // Add download stats
    try {
      const downloads = await this.client.getDownloads(name);
      info.downloads = downloads.downloads;
    } catch {
      // Continue without download stats
    }

    return info;
  }

  /**
   * Get detailed package info
   * Only fetches data for supported capabilities
   */
  async getPackageDetails(name: string, requestedVersion?: string): Promise<PackageDetails> {
    try {
      const pkg = await this.client.getPackage(name);
      const latestVersion = pkg['dist-tags']?.latest;
        const selectedVersion =
        (requestedVersion && pkg.versions[requestedVersion] ? requestedVersion : undefined) ||
        latestVersion ||
        Object.keys(pkg.versions)[0] ||
        '0.0.0';
      const selectedData = pkg.versions[selectedVersion];
      const details = this.transformer.transformPackageDetails(pkg);
      details.version = selectedVersion;
      details.license = selectedData?.license || pkg.license;
      details.description = selectedData?.description || pkg.description;
      details.repository = selectedData?.repository
        ? {
            ...selectedData.repository,
            directory: selectedData.repository.directory || pkg.repository?.directory,
          }
        : pkg.repository;
      details.dependencies = selectedData?.dependencies;
      details.devDependencies = selectedData?.devDependencies;
      details.peerDependencies = selectedData?.peerDependencies;
      details.optionalDependencies = selectedData?.optionalDependencies;

      // Only fetch data for supported capabilities
      const promises: Promise<unknown>[] = [];

      // Download stats (if supported)
      if (this.supportsCapability(SourceCapability.DOWNLOAD_STATS)) {
        promises.push(
          this.client.getDownloads(name).catch(() => ({ downloads: 0 }))
        );
      }

      // Bundle size (if supported)
      if (this.supportsCapability(SourceCapability.BUNDLE_SIZE) && this.bundlephobiaClient) {
        promises.push(
          this.bundlephobiaClient.getSize(name, latestVersion).catch(() => null)
        );
      }

      // Security info (if supported)
      if (this.supportsCapability(SourceCapability.SECURITY) && latestVersion && this.osvClient) {
        promises.push(
          this.osvClient.queryVulnerabilities(name, latestVersion).catch(() => null)
        );
      }

      const results = await Promise.all(promises);
      let resultIndex = 0;

      // Fill in supported data
      if (this.supportsCapability(SourceCapability.DOWNLOAD_STATS)) {
        details.downloads = (results[resultIndex++] as { downloads: number }).downloads;
      }

      if (this.supportsCapability(SourceCapability.BUNDLE_SIZE)) {
        details.bundleSize = results[resultIndex++] as BundleSize | null || undefined;
      }

      if (this.supportsCapability(SourceCapability.SECURITY)) {
        details.security = results[resultIndex++] as SecurityInfo | null || undefined;
      }

      // Fetch readme from unpkg if not available or if requesting a specific version
      if (requestedVersion && selectedVersion !== latestVersion) {
        // For specific versions, always try to fetch from unpkg
        const readme = await this.fetchReadmeFromUnpkg(
          name,
          selectedVersion,
          pkg.readmeFilename
        );
        if (readme) {
          details.readme = readme;
        }
      } else if (!details.readme || details.readme.trim().length === 0) {
        // For latest version, only fetch if readme is missing or empty
        const readme = await this.fetchReadmeFromUnpkg(
          name,
          selectedVersion,
          pkg.readmeFilename
        );
        if (readme) {
          details.readme = readme;
        }
      }

      return details;
    } catch (error) {
      // Fallback to Libraries.io if primary API fails
      if (this.librariesIoClient) {
        try {
          const platform = LibrariesIoClient.getPlatformForProjectType(this.projectType);
          const librariesIoResponse = await this.librariesIoClient.getProject(platform, name);
          let dependencies;
          try {
            dependencies = await this.librariesIoClient.getDependencies(platform, name);
          } catch {
            // Continue without dependencies if fetch fails
          }

          // Handle different response formats from Libraries.io
          let project: LibrariesIoProject;
          let versionsArray: LibrariesIoVersion[] = [];
          
          if (Array.isArray(librariesIoResponse)) {
            // Array format: [project with versions]
            if (librariesIoResponse.length === 0) {
              throw new Error(`Package ${name} not found`);
            }
            const projectData = librariesIoResponse[0] as LibrariesIoProject & { versions?: LibrariesIoVersion[] };
            project = projectData;
            versionsArray = projectData.versions || [];
          } else if ('name' in librariesIoResponse && 'platform' in librariesIoResponse) {
            // Direct project object
            project = librariesIoResponse as LibrariesIoProject;
            versionsArray = (librariesIoResponse as LibrariesIoProject & { versions?: LibrariesIoVersion[] }).versions || [];
          } else if ('project' in librariesIoResponse && librariesIoResponse.project) {
            // Wrapped in project field
            project = librariesIoResponse.project;
            versionsArray = librariesIoResponse.versions || [];
          } else {
            throw new Error(`Invalid project response for ${name}`);
          }

          // Transform Libraries.io response to PackageDetails format
          const versions: VersionInfo[] = versionsArray.map((v) => ({
            version: v.number,
            publishedAt: v.published_at,
            tag: v.number === project.latest_stable_release_number ? 'latest' : undefined,
          }));

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

          const time: Record<string, string> = {};
          for (const v of versionsArray) {
            if (v.published_at) {
              time[v.number] = v.published_at;
            }
          }

          // Try to get security info
          let security: SecurityInfo | undefined;
          if (this.supportsCapability(SourceCapability.SECURITY) && this.osvClient) {
            try {
              const packageVersion = dependencies?.version || project.latest_release_number || project.latest_stable_release_number || '0.0.0';
              security = await this.osvClient.queryVulnerabilities(name, packageVersion);
            } catch {
              // Continue without security info
            }
          }

          return {
            name: project.name,
            version: dependencies?.version || project.latest_release_number || project.latest_stable_release_number || '0.0.0',
            description: project.description,
            keywords: project.keywords || [],
            license: project.licenses || project.normalized_licenses?.[0],
            repository: project.repository_url ? { url: project.repository_url } : undefined,
            homepage: project.homepage,
            downloads: project.dependents_count,
            deprecated: project.deprecation_reason || undefined,
            versions,
            dependencies: Object.keys(deps).length > 0 ? deps : undefined,
            time: Object.keys(time).length > 0 ? time : undefined,
            security: security || undefined,
          };
        } catch (fallbackError) {
          // If both fail, throw the original error
          throw error;
        }
      } else {
        throw error;
      }
    }
  }

  /**
   * Get package versions
   */
  async getVersions(name: string): Promise<VersionInfo[]> {
    const pkg = await this.client.getPackage(name);
    return this.transformer.transformVersions(pkg);
  }

  /**
   * Get bundle size info
   */
  async getBundleSize(name: string, version?: string): Promise<BundleSize | null> {
    if (!this.supportsCapability(SourceCapability.BUNDLE_SIZE)) {
      throw new CapabilityNotSupportedError(
        SourceCapability.BUNDLE_SIZE,
        this.sourceType
      );
    }

    if (!this.bundlephobiaClient) {
      return null;
    }
    try {
      return await this.bundlephobiaClient.getSize(name, version);
    } catch {
      return null;
    }
  }

  /**
   * Sort packages by name
   */
  private sortPackagesByName(packages: PackageInfo[]): PackageInfo[] {
    return [...packages].sort((a, b) => a.name.localeCompare(b.name));
  }
}
