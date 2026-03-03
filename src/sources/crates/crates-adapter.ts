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
  RequirementsInfo,
} from '../../types/package';
import type { ProjectType, SourceType } from '../../types/project';
import type { OSVClient } from '../../api/osv';
import { CratesIoApiClient } from '../../api/crates-api';
import { CratesIoTransformer } from './crates-transformer';

export class CratesIoSourceAdapter extends BaseSourceAdapter {
  readonly sourceType: SourceType = 'crates-io';
  readonly displayName = 'crates.io';
  readonly projectType: ProjectType = 'rust';
  readonly supportedSortOptions: SearchSortBy[] = [
    createSortOption('relevance', 'Relevance'),
    createSortOption('popularity', 'Popularity'),
    createSortOption('name', 'Name'),
  ];
  readonly supportedFilters: SearchFilter[] = [];

  private transformer = new CratesIoTransformer();

  constructor(
    private client: CratesIoApiClient,
    private osvClient: OSVClient
  ) {
    super();
  }

  getEcosystem(): string {
    return 'cargo';
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
    const raw = await this.client.search(searchQuery, { page, perPage: size, signal });
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
      result.packages = [...result.packages].sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
    }

    return result;
  }

  async getSuggestions(query: string, limit = 10): Promise<PackageInfo[]> {
    const result = await this.search({ query, size: limit });
    return result.packages;
  }

  async getPackageInfo(name: string): Promise<PackageInfo> {
    const crate = await this.client.getCrate(name);
    return this.transformer.transformPackageInfo(crate.crate);
  }

  async getPackageDetails(name: string, version?: string): Promise<PackageDetails> {
    const crate = await this.client.getCrate(name);
    const versions = crate.versions || (await this.client.getVersions(name)).versions;
    const resolvedVersion =
      version ||
      crate.crate.max_stable_version ||
      crate.crate.max_version ||
      versions[0]?.num ||
      '0.0.0';
    const dependencies = await this.client.getDependencies(name, resolvedVersion).catch(() => ({ dependencies: [] }));
    const details = this.transformer.transformPackageDetails(
      crate.crate,
      versions,
      dependencies.dependencies,
      resolvedVersion
    );
    try {
      details.security = await this.getSecurityInfo(name, details.version) || undefined;
    } catch {
      // Continue without security data.
    }
    return details;
  }

  async getVersions(name: string): Promise<VersionInfo[]> {
    const versions = await this.client.getVersions(name);
    return this.transformer.transformVersions(versions.versions);
  }

  async getSecurityInfo(name: string, version: string): Promise<SecurityInfo | null> {
    try {
      return await this.osvClient.queryVulnerabilities(name, version, 'crates.io');
    } catch {
      return null;
    }
  }

  async getDependents(name: string, version: string): Promise<DependentsInfo | null> {
    const reverseDependencies = await this.client.getReverseDependencies(name);
    return this.transformer.transformDependents(name, version, reverseDependencies);
  }

  async getRequirements(name: string, version: string): Promise<RequirementsInfo | null> {
    const dependencies = await this.client.getDependencies(name, version).catch(() => ({ dependencies: [] }));
    const details = await this.client.getCrate(name);
    return this.transformer.transformPackageDetails(
      details.crate,
      details.versions || [],
      dependencies.dependencies,
      version
    ).requirements || null;
  }

  getInstallCommand(packageName: string, options: InstallOptions): string {
    const depTypeFlag =
      options.type === 'devDependencies'
        ? ' --dev'
        : options.type === 'optionalDependencies'
          ? ' --optional'
          : '';
    const packageSpec = options.version ? `${packageName}@${options.version}` : packageName;
    return `cargo add ${packageSpec}${depTypeFlag}`;
  }

  getUpdateCommand(packageName: string, version?: string): string {
    return version
      ? `cargo add ${packageName}@${version}`
      : `cargo update -p ${packageName}`;
  }

  getRemoveCommand(packageName: string): string {
    return `cargo remove ${packageName}`;
  }
}
