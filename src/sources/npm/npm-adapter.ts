import { NpmBaseAdapter } from './npm-base-adapter';
import { SourceCapability, CapabilityNotSupportedError } from '../base/capabilities';
import { NpmTransformer } from './npm-transformer';
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
 * npm Registry source adapter
 * Wraps NpmRegistryClient with ISourceAdapter interface
 */
export class NpmRegistrySourceAdapter extends NpmBaseAdapter {
  readonly sourceType: SourceType = 'npm-registry';
  readonly displayName = 'npm Registry';
  readonly projectType: ProjectType = 'npm';
  readonly supportedSortOptions: SearchSortBy[] = [
    'relevance',
    'popularity',
    'quality',
    'maintenance',
    'name',
  ];
  readonly supportedFilters = ['author', 'maintainer', 'scope', 'keywords'];

  private transformer: NpmTransformer;

  constructor(
    private client: NpmRegistryClient,
    private bundlephobiaClient?: BundlephobiaClient,
    private osvClient?: OSVClient
  ) {
    super();
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

    // Map sortBy to npm registry format
    const apiSortBy = sortBy === 'name' ? 'relevance' : sortBy;

    const response = await this.client.search(query, {
      from,
      size,
      sortBy: apiSortBy as 'relevance' | 'popularity' | 'quality' | 'maintenance',
    });

    const result = this.transformer.transformSearchResult(response, from, size);

    // Client-side name sorting if needed
    if (sortBy === 'name') {
      result.packages = this.sortPackagesByName(result.packages);
    }

    return result;
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
  async getPackageDetails(name: string): Promise<PackageDetails> {
    const pkg = await this.client.getPackage(name);
    const details = this.transformer.transformPackageDetails(pkg);
    const latestVersion = pkg['dist-tags']?.latest;

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

    return details;
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
   * Get security info
   */
  async getSecurityInfo(name: string, version: string): Promise<SecurityInfo | null> {
    if (!this.supportsCapability(SourceCapability.SECURITY)) {
      throw new CapabilityNotSupportedError(
        SourceCapability.SECURITY,
        this.sourceType
      );
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
      throw new CapabilityNotSupportedError(
        SourceCapability.SECURITY,
        this.sourceType
      );
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
   * Sort packages by name
   */
  private sortPackagesByName(packages: PackageInfo[]): PackageInfo[] {
    return [...packages].sort((a, b) => a.name.localeCompare(b.name));
  }
}
