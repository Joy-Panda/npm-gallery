import { BaseSourceAdapter } from '../base/source-adapter.interface';
import { SourceCapability } from '../base/capabilities';
import { createSortOption, getSortValue } from '../../types/package';
import type {
  InstallOptions,
  PackageDetails,
  PackageInfo,
  SearchFilter,
  SearchOptions,
  SearchResult,
  SearchSortBy,
  VersionInfo,
} from '../../types/package';
import type { ProjectType, SourceType } from '../../types/project';
import { MetaCpanApiClient } from '../../api/metacpan-api';
import { MetaCpanTransformer } from './metacpan-transformer';

export class MetaCpanSourceAdapter extends BaseSourceAdapter {
  readonly sourceType: SourceType = 'metacpan';
  readonly displayName = 'MetaCPAN';
  readonly projectType: ProjectType = 'perl';
  readonly supportedSortOptions: SearchSortBy[] = [
    createSortOption('relevance', 'Relevance'),
    createSortOption('name', 'Name'),
  ];
  readonly supportedFilters: SearchFilter[] = [];

  private transformer = new MetaCpanTransformer();

  constructor(private client: MetaCpanApiClient) {
    super();
  }

  getSupportedCapabilities(): SourceCapability[] {
    return [
      SourceCapability.SEARCH,
      SourceCapability.PACKAGE_INFO,
      SourceCapability.PACKAGE_DETAILS,
      SourceCapability.VERSIONS,
      SourceCapability.INSTALLATION,
      SourceCapability.SUGGESTIONS,
      SourceCapability.DOWNLOAD_STATS,
      SourceCapability.REQUIREMENTS,
    ];
  }

  async search(options: SearchOptions): Promise<SearchResult> {
    const { query = '', exactName, from = 0, size = 20, sortBy = 'relevance', signal } = options;
    const searchQuery = (exactName || query).trim();
    if (!searchQuery) {
      return { packages: [], total: 0, hasMore: false };
    }

    const raw = await this.client.searchModules(searchQuery, { from, size, signal });
    const result = this.transformer.transformSearchResult(raw as Record<string, unknown>);
    if (getSortValue(sortBy) === 'name') {
      result.packages = [...result.packages].sort((a, b) => a.name.localeCompare(b.name));
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
    return result.packages;
  }

  async getPackageInfo(name: string): Promise<PackageInfo> {
    const moduleInfo = await this.client.getModule(name);
    const result = this.transformer.transformSearchItem(moduleInfo);
    result.name = name;
    return result;
  }

  async getPackageDetails(name: string): Promise<PackageDetails> {
    const moduleInfo = await this.client.getModule(name);
    const releaseName = typeof moduleInfo.release === 'string' ? moduleInfo.release : name;
    const [releaseInfo, versions, readme] = await Promise.all([
      this.client.getRelease(releaseName).catch(() => null),
      this.getVersions(name),
      this.client.getPodDocumentation(name).catch(() => null),
    ]);
    const details = this.transformer.transformPackageDetails(moduleInfo, releaseInfo, versions);
    if (readme) {
      details.readme = readme;
    }
    return details;
  }

  async getVersions(name: string): Promise<VersionInfo[]> {
    const moduleInfo = await this.client.getModule(name);
    const distribution = typeof moduleInfo.distribution === 'string'
      ? moduleInfo.distribution
      : typeof moduleInfo.release === 'string'
        ? moduleInfo.release
        : name;
    const raw = await this.client.searchReleases(distribution);
    return this.transformer.transformVersions(raw as Record<string, unknown>);
  }

  getInstallCommand(packageName: string, _options: InstallOptions): string {
    return `cpanm ${packageName}`;
  }

  getUpdateCommand(packageName: string): string {
    return `cpanm ${packageName}`;
  }
}
