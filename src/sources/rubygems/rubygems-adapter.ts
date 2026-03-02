import { BaseSourceAdapter } from '../base/source-adapter.interface';
import { SourceCapability } from '../base/capabilities';
import { createSortOption, getSortValue } from '../../types/package';
import type {
  DependentsInfo,
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
import { RubyGemsApiClient } from '../../api/rubygems-api';
import { RubyGemsTransformer } from './rubygems-transformer';

export class RubyGemsSourceAdapter extends BaseSourceAdapter {
  readonly sourceType: SourceType = 'rubygems';
  readonly displayName = 'RubyGems';
  readonly projectType: ProjectType = 'ruby';
  readonly supportedSortOptions: SearchSortBy[] = [
    createSortOption('relevance', 'Relevance'),
    createSortOption('popularity', 'Popularity'),
    createSortOption('name', 'Name'),
  ];
  readonly supportedFilters: SearchFilter[] = [];

  private transformer = new RubyGemsTransformer();

  constructor(
    private client: RubyGemsApiClient,
    private osvClient: OSVClient
  ) {
    super();
  }

  getEcosystem(): string {
    return 'rubygems';
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
      SourceCapability.SECURITY,
      SourceCapability.DEPENDENTS,
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
    const raw = await this.client.search(searchQuery, { page, signal });
    let result = this.transformer.transformSearchResult(raw, from, size);

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
      result.packages = [...result.packages].sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
    }

    return result;
  }

  async getSuggestions(query: string, limit = 10): Promise<PackageInfo[]> {
    const result = await this.search({ query, size: limit });
    return result.packages;
  }

  async getPackageInfo(name: string): Promise<PackageInfo> {
    const gem = await this.client.getGem(name);
    return this.transformer.transformPackageInfo(gem);
  }

  async getPackageDetails(name: string, version?: string): Promise<PackageDetails> {
    const [gem, versions] = await Promise.all([
      this.client.getGem(name),
      this.client.getVersions(name),
    ]);

    const selectedVersion =
      version && versions.some((item) => item.number === version)
        ? version
        : gem.version;

    const details = this.transformer.transformPackageDetails(gem, versions, selectedVersion);
    try {
      details.security = await this.getSecurityInfo(name, details.version) || undefined;
    } catch {
      // Continue without security data.
    }
    return details;
  }

  async getVersions(name: string): Promise<VersionInfo[]> {
    const versions = await this.client.getVersions(name);
    return this.transformer.transformVersions(versions);
  }

  async getSecurityInfo(name: string, version: string): Promise<SecurityInfo | null> {
    try {
      return await this.osvClient.queryVulnerabilities(name, version, 'RubyGems');
    } catch {
      return null;
    }
  }

  async getDependents(name: string, version: string): Promise<DependentsInfo | null> {
    const reverseDependencies = await this.client.getReverseDependencies(name);
    return this.transformer.transformDependents(name, version, reverseDependencies);
  }

  getInstallCommand(packageName: string, options: InstallOptions): string {
    const versionPart = options.version ? ` --version "${options.version}"` : '';
    const groupPart = options.type === 'devDependencies' ? ' --group development' : '';
    return `bundle add ${packageName}${versionPart}${groupPart}`;
  }

  getUpdateCommand(packageName: string, _version?: string): string {
    return `bundle update ${packageName}`;
  }

  getRemoveCommand(packageName: string): string {
    return `bundle remove ${packageName}`;
  }
}
