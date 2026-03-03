import { BaseSourceAdapter } from '../base/source-adapter.interface';
import { SourceCapability } from '../base/capabilities';
import { createSortOption, getSortValue } from '../../types/package';
import type {
  CopyOptions,
  PackageDetails,
  PackageInfo,
  SearchFilter,
  SearchOptions,
  SearchResult,
  SearchSortBy,
  VersionInfo,
} from '../../types/package';
import type { ProjectType, SourceType } from '../../types/project';
import { CranApiClient } from '../../api/cran-api';
import { CranTransformer } from './cran-transformer';

export class CranSourceAdapter extends BaseSourceAdapter {
  readonly sourceType: SourceType = 'cran';
  readonly displayName = 'CRAN';
  readonly projectType: ProjectType = 'r';
  readonly supportedSortOptions: SearchSortBy[] = [
    createSortOption('relevance', 'Relevance'),
    createSortOption('popularity', 'Popularity'),
    createSortOption('name', 'Name'),
  ];
  readonly supportedFilters: SearchFilter[] = [];

  private transformer = new CranTransformer();

  constructor(private client: CranApiClient) {
    super();
  }

  getSupportedCapabilities(): SourceCapability[] {
    return [
      SourceCapability.SEARCH,
      SourceCapability.PACKAGE_INFO,
      SourceCapability.PACKAGE_DETAILS,
      SourceCapability.VERSIONS,
      SourceCapability.COPY,
      SourceCapability.SUGGESTIONS,
      SourceCapability.REQUIREMENTS,
      SourceCapability.DOWNLOAD_STATS,
    ];
  }

  async search(options: SearchOptions): Promise<SearchResult> {
    const { query = '', exactName, sortBy = 'relevance', signal } = options;
    const searchQuery = (exactName || query).trim();
    if (!searchQuery) {
      return { packages: [], total: 0, hasMore: false };
    }

    const raw = await this.client.search(searchQuery, signal);
    const result = this.transformer.transformSearchResult(raw);
    if (getSortValue(sortBy) === 'name') {
      result.packages = [...result.packages].sort((a, b) => a.name.localeCompare(b.name));
    } else if (getSortValue(sortBy) === 'popularity') {
      result.packages = [...result.packages].sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
    }

    if (exactName) {
      const exact = result.packages.find((pkg) => pkg.name.toLowerCase() === exactName.toLowerCase());
      if (exact) {
        result.packages = [
          { ...exact, exactMatch: true },
          ...result.packages.filter((pkg) => pkg.name.toLowerCase() !== exactName.toLowerCase()),
        ];
      }
    }

    return result;
  }

  async getSuggestions(query: string, limit = 10): Promise<PackageInfo[]> {
    const result = await this.search({ query, size: limit });
    return result.packages.slice(0, limit);
  }

  async getPackageInfo(name: string): Promise<PackageInfo> {
    const [pkg, downloads] = await Promise.all([
      this.client.getPackage(name),
      this.client.getDownloads(name).catch(() => undefined),
    ]);
    return this.transformer.transformPackageDetails(pkg, typeof downloads?.count === 'number' ? downloads.count : undefined);
  }

  async getPackageDetails(name: string): Promise<PackageDetails> {
    const [pkg, downloads] = await Promise.all([
      this.client.getPackage(name),
      this.client.getDownloads(name).catch(() => undefined),
    ]);
    return this.transformer.transformPackageDetails(pkg, typeof downloads?.count === 'number' ? downloads.count : undefined);
  }

  async getVersions(name: string): Promise<VersionInfo[]> {
    const pkg = await this.client.getPackage(name);
    return this.transformer.transformVersions(pkg);
  }

  getCopySnippet(packageName: string, options: CopyOptions): string {
    const version = options.version ? ` (>= ${options.version})` : '';
    return `${packageName}${version}`;
  }
}
