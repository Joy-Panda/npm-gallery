import { NpmBaseAdapter } from './npm-base-adapter';
import { SourceCapability, CapabilityNotSupportedError } from '../base/capabilities';
import { NpmsTransformer } from './npms-transformer';
import type { NpmsApiClient } from '../../api/npms-api';
import type { NpmRegistryClient } from '../../api/npm-registry';
import type { BundlephobiaClient } from '../../api/bundlephobia';
import type { OSVClient } from '../../api/osv';
import type {
  PackageInfo,
  PackageDetails,
  VersionInfo,
  SearchResult,
  SearchOptions,
  SearchSortBy,
  BundleSize,
  SecurityInfo,
} from '../../types/package';
import type { SourceType, ProjectType } from '../../types/project';

/**
 * npms.io source adapter
 * Wraps NpmsApiClient with ISourceAdapter interface
 * Used as a fallback for npm registry
 */
export class NpmsSourceAdapter extends NpmBaseAdapter {
  readonly sourceType: SourceType = 'npms-io';
  readonly displayName = 'npms.io';
  readonly projectType: ProjectType = 'npm';
  readonly supportedSortOptions: SearchSortBy[] = [
    'relevance',
    'popularity',
    'quality',
    'maintenance',
    'name',
  ];
  readonly supportedFilters = ['author', 'maintainer', 'scope', 'keywords'];

  private transformer: NpmsTransformer;

  constructor(
    private client: NpmsApiClient,
    private npmRegistryClient?: NpmRegistryClient,
    private bundlephobiaClient?: BundlephobiaClient,
    private osvClient?: OSVClient
  ) {
    super();
    this.transformer = new NpmsTransformer();
  }

  /**
   * Declare supported capabilities
   * npms.io supports most capabilities, but relies on npm registry for some
   */
  getSupportedCapabilities(): SourceCapability[] {
    return [
      SourceCapability.SEARCH,
      SourceCapability.PACKAGE_INFO,
      SourceCapability.PACKAGE_DETAILS,
      SourceCapability.VERSIONS,
      SourceCapability.INSTALLATION,
      SourceCapability.SUGGESTIONS,
      SourceCapability.DEPENDENCIES, // Via npm registry fallback
      SourceCapability.DOCUMENTATION, // Via npm registry fallback
      SourceCapability.SECURITY, // Via OSV client
      SourceCapability.BUNDLE_SIZE, // Via bundlephobia client
      SourceCapability.DOWNLOAD_STATS,
      SourceCapability.QUALITY_SCORE,
    ];
  }

  /**
   * Search for packages
   */
  async search(options: SearchOptions): Promise<SearchResult> {
    const { query, from = 0, size = 20, sortBy = 'relevance' } = options;

    if (!query.trim()) {
      return { packages: [], total: 0, hasMore: false };
    }

    const response = await this.client.search(query, { from, size });
    const result = this.transformer.transformSearchResult(response, from, size);

    // Fetch download stats for better sorting
    const packageNames = result.packages.map(p => p.name);
    try {
      const analysisMap = await this.client.getPackagesAnalysis(packageNames);
      result.packages = result.packages.map(pkg => {
        const analysis = analysisMap[pkg.name];
        if (analysis) {
          pkg.downloads = analysis.collected?.npm?.downloads?.[0]?.count;
        }
        return pkg;
      });
    } catch {
      // Continue without download data
    }

    // Apply sorting
    if (sortBy !== 'relevance') {
      result.packages = this.sortPackages(result.packages, sortBy);
    }

    return result;
  }

  /**
   * Get suggestions for autocomplete
   */
  async getSuggestions(query: string, limit: number = 10): Promise<PackageInfo[]> {
    const response = await this.client.getSuggestions(query, limit);
    const result = this.transformer.transformSearchResult(response, 0, limit);
    return result.packages;
  }

  /**
   * Get basic package info
   */
  async getPackageInfo(name: string): Promise<PackageInfo> {
    const analysis = await this.client.getPackageAnalysis(name);
    return this.transformer.transformPackageInfo(analysis);
  }

  /**
   * Get detailed package info
   * Falls back to npm registry for full details (readme, versions)
   */
  async getPackageDetails(name: string): Promise<PackageDetails> {
    // npms.io doesn't provide full package details
    // If npm registry client is available, use it for details
    if (this.npmRegistryClient) {
      const pkg = await this.npmRegistryClient.getPackage(name);
      const latestVersion = pkg['dist-tags']?.latest;
      const latestData = latestVersion ? pkg.versions[latestVersion] : undefined;

      // Get npms.io analysis for score
      let score;
      try {
        const analysis = await this.client.getPackageAnalysis(name);
        score = analysis.score;
      } catch {
        // Continue without score
      }

      // Get additional data
      const [downloads, bundleSize, security] = await Promise.all([
        this.npmRegistryClient.getDownloads(name).catch(() => ({ downloads: 0 })),
        this.bundlephobiaClient?.getSize(name, latestVersion).catch(() => null) ?? null,
        latestVersion && this.osvClient
          ? this.osvClient.queryVulnerabilities(name, latestVersion).catch(() => null)
          : null,
      ]);

      return {
        name: pkg.name,
        version: latestVersion || Object.keys(pkg.versions)[0] || '0.0.0',
        description: pkg.description,
        keywords: pkg.keywords,
        license: latestData?.license || pkg.license,
        author: pkg.author,
        repository: pkg.repository,
        homepage: pkg.homepage,
        downloads: downloads.downloads,
        score,
        bundleSize: bundleSize || undefined,
        readme: pkg.readme,
        versions: this.extractVersions(pkg),
        dependencies: latestData?.dependencies,
        devDependencies: latestData?.devDependencies,
        peerDependencies: latestData?.peerDependencies,
        maintainers: pkg.maintainers?.map(m => ({ name: m.name, email: m.email })),
        time: pkg.time,
        distTags: pkg['dist-tags'],
        bugs: pkg.bugs,
        security: security || undefined,
      };
    }

    // Fallback to npms.io only (limited details)
    const analysis = await this.client.getPackageAnalysis(name);
    return this.transformer.transformPackageDetails(analysis);
  }

  /**
   * Get package versions
   * Falls back to npm registry
   */
  async getVersions(name: string): Promise<VersionInfo[]> {
    if (this.npmRegistryClient) {
      const pkg = await this.npmRegistryClient.getPackage(name);
      return this.extractVersions(pkg);
    }
    // npms.io doesn't provide version list
    return [];
  }

  /**
   * Get bundle size info
   */
  async getBundleSize(name: string, version?: string): Promise<BundleSize | null> {
    if (!this.supportsCapability(SourceCapability.BUNDLE_SIZE)) {
      throw new CapabilityNotSupportedError(SourceCapability.BUNDLE_SIZE, this.sourceType);
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
   * Get security info
   */
  async getSecurityInfo(name: string, version: string): Promise<SecurityInfo | null> {
    if (!this.supportsCapability(SourceCapability.SECURITY)) {
      throw new CapabilityNotSupportedError(SourceCapability.SECURITY, this.sourceType);
    }

    if (!this.osvClient) {
      return null;
    }
    try {
      return await this.osvClient.queryVulnerabilities(name, version);
    } catch {
      return null;
    }
  }

  /**
   * Get security info for multiple packages (batch)
   */
  async getSecurityInfoBulk(
    packages: Array<{ name: string; version: string }>
  ): Promise<Record<string, SecurityInfo | null>> {
    if (!this.supportsCapability(SourceCapability.SECURITY)) {
      throw new CapabilityNotSupportedError(SourceCapability.SECURITY, this.sourceType);
    }

    if (!this.osvClient || packages.length === 0) {
      return {};
    }

    try {
      const result = await this.osvClient.queryBulkVulnerabilities(packages);
      const mapped: Record<string, SecurityInfo | null> = {};
      for (const pkg of packages) {
        const key = `${pkg.name}@${pkg.version}`;
        mapped[key] = result[key] ?? null;
      }
      return mapped;
    } catch {
      const empty: Record<string, SecurityInfo | null> = {};
      for (const pkg of packages) {
        const key = `${pkg.name}@${pkg.version}`;
        empty[key] = null;
      }
      return empty;
    }
  }


  /**
   * Extract versions from npm registry package
   */
  private extractVersions(pkg: {
    'dist-tags': Record<string, string>;
    versions: Record<string, { version: string; deprecated?: string; dist?: { unpackedSize?: number } }>;
    time?: Record<string, string>;
  }): VersionInfo[] {
    const distTags = pkg['dist-tags'];

    return Object.entries(pkg.versions)
      .map(([version, data]) => ({
        version,
        publishedAt: pkg.time?.[version],
        deprecated: data.deprecated,
        tag: Object.entries(distTags).find(([, v]) => v === version)?.[0],
        dist: data.dist,
      }))
      .sort((a, b) => {
        if (a.publishedAt && b.publishedAt) {
          return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
        }
        return 0;
      });
  }

  /**
   * Sort packages by criteria
   */
  private sortPackages(packages: PackageInfo[], sortBy: SearchSortBy): PackageInfo[] {
    return [...packages].sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'popularity':
          return (b.downloads || 0) - (a.downloads || 0);
        case 'quality':
          return (b.score?.final || 0) - (a.score?.final || 0);
        case 'maintenance':
          return (b.score?.detail?.maintenance || 0) - (a.score?.detail?.maintenance || 0);
        default:
          return 0;
      }
    });
  }

}
