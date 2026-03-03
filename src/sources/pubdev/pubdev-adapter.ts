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
  SecurityInfo,
  VersionInfo,
} from '../../types/package';
import type { ProjectType, SourceType } from '../../types/project';
import type { OSVClient } from '../../api/osv';
import { PubDevApiClient } from '../../api/pub-dev-api';
import { PubDevTransformer } from './pubdev-transformer';

export class PubDevSourceAdapter extends BaseSourceAdapter {
  readonly sourceType: SourceType = 'pub-dev';
  readonly displayName = 'pub.dev';
  readonly projectType: ProjectType = 'dart';
  readonly supportedSortOptions: SearchSortBy[] = [
    createSortOption('relevance', 'Relevance'),
    createSortOption('popularity', 'Popularity'),
    createSortOption('quality', 'Points'),
    createSortOption('name', 'Name'),
  ];
  readonly supportedFilters: SearchFilter[] = [];

  private transformer = new PubDevTransformer();

  constructor(
    private client: PubDevApiClient,
    private osvClient: OSVClient
  ) {
    super();
  }

  getEcosystem(): string {
    return 'pub';
  }

  getSupportedCapabilities(): SourceCapability[] {
    return [
      SourceCapability.SEARCH,
      SourceCapability.PACKAGE_INFO,
      SourceCapability.PACKAGE_DETAILS,
      SourceCapability.VERSIONS,
      SourceCapability.INSTALLATION,
      SourceCapability.SUGGESTIONS,
      SourceCapability.SECURITY,
      SourceCapability.DOWNLOAD_STATS,
      SourceCapability.QUALITY_SCORE,
      SourceCapability.REQUIREMENTS,
    ];
  }

  async search(options: SearchOptions): Promise<SearchResult> {
    const { query = '', exactName, from = 0, size = 20, sortBy = 'relevance', signal } = options;
    const searchQuery = (exactName || query).trim();
    if (!searchQuery) {
      return { packages: [], total: 0, hasMore: false };
    }

    const page = Math.floor(from / size) + 1;
    const raw = await this.client.search(searchQuery, {
      page,
      sort: this.mapSort(sortBy),
      signal,
    });
    const packages = await Promise.all(
      (raw.packages || []).slice(0, size).map(async (item) => {
        try {
          const [pkg, score] = await Promise.all([
            this.client.getPackage(item.package, signal),
            this.client.getScore(item.package, signal).catch(() => undefined),
          ]);
          return this.transformer.transformPackageInfo(pkg, score);
        } catch {
          return {
            name: item.package,
            version: 'latest',
          } as PackageInfo;
        }
      })
    );

    let result: SearchResult = {
      packages,
      total: raw.next ? from + packages.length + 1 : from + packages.length,
      hasMore: !!raw.next,
    };

    if (exactName) {
      const exact = result.packages.find((pkg) => pkg.name.toLowerCase() === exactName.toLowerCase());
      if (exact) {
        result.packages = [
          { ...exact, exactMatch: true },
          ...result.packages.filter((pkg) => pkg.name.toLowerCase() !== exactName.toLowerCase()),
        ];
      }
    }

    if (getSortValue(sortBy) === 'name') {
      result.packages = [...result.packages].sort((a, b) => a.name.localeCompare(b.name));
    }

    return result;
  }

  async getSuggestions(query: string, limit = 10): Promise<PackageInfo[]> {
    const result = await this.search({ query, size: limit });
    return result.packages;
  }

  async getPackageInfo(name: string): Promise<PackageInfo> {
    const [pkg, score] = await Promise.all([
      this.client.getPackage(name),
      this.client.getScore(name).catch(() => undefined),
    ]);
    return this.transformer.transformPackageInfo(pkg, score);
  }

  async getPackageDetails(name: string, version?: string): Promise<PackageDetails> {
    const [pkg, score] = await Promise.all([
      this.client.getPackage(name),
      this.client.getScore(name).catch(() => undefined),
    ]);
    const details = this.transformer.transformPackageDetails(pkg, score, version);
    try {
      details.security = await this.getSecurityInfo(name, details.version) || undefined;
    } catch {
      // ignore security failures
    }
    return details;
  }

  async getVersions(name: string): Promise<VersionInfo[]> {
    const pkg = await this.client.getPackage(name);
    return pkg.versions.map((version) => ({
      version: version.version,
      publishedAt: version.published,
    }));
  }

  async getSecurityInfo(name: string, version: string): Promise<SecurityInfo | null> {
    try {
      return await this.osvClient.queryVulnerabilities(name, version, 'Pub');
    } catch {
      return null;
    }
  }

  getInstallCommand(packageName: string, options: InstallOptions): string {
    const tool = options.packageManager === 'flutter' ? 'flutter pub' : 'dart pub';
    const typeFlag = options.type === 'devDependencies' ? ' --dev' : '';
    return `${tool} add ${packageName}${typeFlag}`;
  }

  getUpdateCommand(packageName: string, version?: string): string {
    return version ? `dart pub add ${packageName}:${version}` : `dart pub add ${packageName}`;
  }

  getRemoveCommand(packageName: string): string {
    return `dart pub remove ${packageName}`;
  }

  private mapSort(sortBy: SearchSortBy): string | undefined {
    switch (getSortValue(sortBy)) {
      case 'popularity':
        return 'popularity';
      case 'quality':
        return 'points';
      case 'name':
        return 'text';
      default:
        return 'top';
    }
  }
}
