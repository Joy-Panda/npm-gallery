import { BaseSourceAdapter } from '../base/source-adapter.interface';
import { SourceCapability, CapabilityNotSupportedError } from '../base/capabilities';
import { createFilterOption, createSortOption, getSortValue } from '../../types/package';
import type {
  DependentsInfo,
  InstallOptions,
  PackageDetails,
  PackageInfo,
  RequirementsInfo,
  SearchFilter,
  SearchOptions,
  SearchResult,
  SearchSortBy,
  SecurityInfo,
  VersionInfo,
} from '../../types/package';
import type { ProjectType, SourceType } from '../../types/project';
import { PackagistApiClient } from '../../api/packagist-api';
import { PackagistTransformer } from './packagist-transformer';

export class PackagistSourceAdapter extends BaseSourceAdapter {
  readonly sourceType: SourceType = 'packagist';
  readonly displayName = 'Packagist';
  readonly projectType: ProjectType = 'php';
  readonly supportedSortOptions: SearchSortBy[] = [
    createSortOption('relevance', 'Relevance'),
    createSortOption('popularity', 'Popularity'),
    createSortOption('name', 'Name'),
  ];
  readonly supportedFilters: SearchFilter[] = [
    createFilterOption('tags', 'Tags', 'tags (comma-separated)'),
    createFilterOption('type', 'Type', 'package type (e.g. library, composer-plugin)'),
  ];

  private transformer = new PackagistTransformer();

  constructor(private client: PackagistApiClient) {
    super();
  }

  getEcosystem(): string {
    return 'unknown';
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
    const { text, tags, type } = this.parseSearchQuery(query);
    const searchText = (exactName || text).trim();

    if (!searchText && !tags && !type) {
      return { packages: [], total: 0, hasMore: false };
    }

    const page = Math.floor(from / size) + 1;
    const response = await this.client.search(searchText, {
      page,
      perPage: size,
      tags,
      type,
      signal,
    });

    let result = this.transformer.transformSearchResult(response, from, size);
    const enrichedPackages = await Promise.all(result.packages.map(pkg => this.ensureVersion(pkg, signal)));
    result = { ...result, packages: enrichedPackages };

    if (exactName) {
      const exact = result.packages.find(pkg => pkg.name.toLowerCase() === exactName.toLowerCase());
      if (exact) {
        result = {
          ...result,
          packages: [{ ...exact, exactMatch: true }, ...result.packages.filter(pkg => pkg.name.toLowerCase() !== exactName.toLowerCase())],
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
          // Keep search result when exact fetch fails.
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
    const response = await this.client.getPackage(name);
    return this.transformer.transformPackageInfo(response.package);
  }

  async getPackageDetails(name: string, version?: string): Promise<PackageDetails> {
    const response = await this.client.getPackage(name);
    const details = this.transformer.transformPackageDetails(response.package, version);
    details.requirements = this.transformer.buildRequirements(response.package, version) || undefined;
    try {
      details.security = await this.getSecurityInfo(name, details.version) || undefined;
    } catch {
      // Continue without security info.
    }
    return details;
  }

  async getVersions(name: string): Promise<VersionInfo[]> {
    const response = await this.client.getPackage(name);
    return this.transformer.transformVersions(response.package);
  }

  async getSecurityInfo(name: string, _version: string): Promise<SecurityInfo | null> {
    const response = await this.client.getSecurityAdvisories([name]);
    const advisories = response.advisories[name] || [];
    if (advisories.length === 0) {
      return {
        vulnerabilities: [],
        summary: {
          total: 0,
          critical: 0,
          high: 0,
          moderate: 0,
          low: 0,
          info: 0,
        },
      };
    }
    return this.transformer.transformSecurityInfo(name, advisories);
  }

  async getRequirements(name: string, version: string): Promise<RequirementsInfo | null> {
    if (!this.supportsCapability(SourceCapability.REQUIREMENTS)) {
      throw new CapabilityNotSupportedError(SourceCapability.REQUIREMENTS, this.sourceType);
    }
    const response = await this.client.getPackage(name);
    return this.transformer.buildRequirements(response.package, version);
  }

  async getDependents(
    name: string,
    version: string,
    options?: { pageUrl?: string }
  ): Promise<DependentsInfo | null> {
    const response = await this.client.getDependents(name, {
      pageUrl: options?.pageUrl,
      orderBy: 'downloads',
    });
    return this.transformDependentsResponse(name, version, response);
  }

  getInstallCommand(packageName: string, options: InstallOptions): string {
    const versionPart = options.version ? `:${options.version}` : '';
    const devFlag = options.type === 'devDependencies' ? ' --dev' : '';
    return `composer require ${packageName}${versionPart}${devFlag}`;
  }

  getUpdateCommand(packageName: string, version?: string): string {
    if (version) {
      return `composer require ${packageName}:${version}`;
    }
    return `composer update ${packageName}`;
  }

  getRemoveCommand(packageName: string): string {
    return `composer remove ${packageName}`;
  }

  private parseSearchQuery(query: string): { text: string; tags?: string; type?: string } {
    const matchesToRemove: string[] = [];
    let tags: string | undefined;
    let type: string | undefined;

    for (const match of query.matchAll(/\btags:([^\s]+)/g)) {
      tags = match[1];
      matchesToRemove.push(match[0]);
    }

    for (const match of query.matchAll(/\btype:([^\s]+)/g)) {
      type = match[1];
      matchesToRemove.push(match[0]);
    }

    let text = query;
    for (const match of matchesToRemove) {
      const escaped = match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      text = text.replace(new RegExp(escaped, 'g'), '');
    }

    return {
      text: text.replace(/\s+/g, ' ').trim(),
      tags,
      type,
    };
  }

  private async ensureVersion(pkg: PackageInfo, signal?: AbortSignal): Promise<PackageInfo> {
    if (pkg.version) {
      return pkg;
    }

    try {
      const response = await this.client.getPackage(pkg.name, signal);
      const info = this.transformer.transformPackageInfo(response.package);
      return {
        ...pkg,
        version: info.version,
        keywords: pkg.keywords || info.keywords,
        license: pkg.license || info.license,
      };
    } catch {
      return { ...pkg, version: '0.0.0' };
    }
  }

  private transformDependentsResponse(
    name: string,
    version: string,
    raw: unknown
  ): DependentsInfo {
    const rows = this.extractDependentRows(raw);
    const directSample = rows
      .map((row) => {
        const packageName = this.readDependentName(row);
        if (!packageName) {
          return null;
        }

        return {
          package: {
            system: 'packagist',
            name: packageName,
          },
          version: this.readDependentVersion(row),
        };
      })
      .filter((item): item is DependentsInfo['directSample'][number] => !!item);

    const totalCount = this.readTotalCount(raw, directSample.length);
    return {
      package: {
        system: 'packagist',
        name,
      },
      version,
      totalCount,
      directCount: totalCount,
      indirectCount: 0,
      directSample,
      indirectSample: [],
      webUrl: `https://packagist.org/packages/${name}/dependents?order_by=downloads`,
      nextPageUrl: this.readNextPageUrl(raw),
    };
  }

  private extractDependentRows(raw: unknown): Array<Record<string, unknown>> {
    if (Array.isArray(raw)) {
      return raw.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
    }

    if (!raw || typeof raw !== 'object') {
      return [];
    }

    const candidateKeys = ['packages', 'results', 'rows', 'items', 'data', 'dependents'];
    for (const key of candidateKeys) {
      const value = (raw as Record<string, unknown>)[key];
      if (Array.isArray(value)) {
        return value.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
      }
    }

    return [];
  }

  private readTotalCount(raw: unknown, fallback: number): number {
    if (!raw || typeof raw !== 'object') {
      return fallback;
    }

    const candidateKeys = ['total', 'total_count', 'count', 'totalCount'];
    for (const key of candidateKeys) {
      const value = (raw as Record<string, unknown>)[key];
      if (typeof value === 'number') {
        return value;
      }
      if (typeof value === 'string') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
    }

    return fallback;
  }

  private readNextPageUrl(raw: unknown): string | undefined {
    if (!raw || typeof raw !== 'object') {
      return undefined;
    }

    const value = (raw as Record<string, unknown>).next;
    return typeof value === 'string' && value.trim() ? value : undefined;
  }

  private readDependentName(row: Record<string, unknown>): string | null {
    const directKeys = ['name', 'package_name', 'packageName'];
    for (const key of directKeys) {
      const value = row[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    const nestedPackage = row.package;
    if (nestedPackage && typeof nestedPackage === 'object') {
      const value = (nestedPackage as Record<string, unknown>).name;
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    return null;
  }

  private readDependentVersion(row: Record<string, unknown>): string {
    const keys = ['require', 'requirement', 'constraint', 'version', 'latest_version', 'latestVersion'];
    for (const key of keys) {
      const value = row[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    const nestedPackage = row.package;
    if (nestedPackage && typeof nestedPackage === 'object') {
      const value = (nestedPackage as Record<string, unknown>).version;
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    return '*';
  }
}
