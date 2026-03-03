import { BaseSourceAdapter } from '../base/source-adapter.interface';
import { SourceCapability, CapabilityNotSupportedError } from '../base/capabilities';
import { createSortOption, getSortValue } from '../../types/package';
import type {
  CopyOptions,
  InstallOptions,
  PackageDetails,
  PackageInfo,
  SearchFilter,
  SearchOptions,
  SearchResult,
  SearchSortBy,
  SecurityInfo,
  VersionInfo,
  DependentsInfo,
  RequirementsInfo,
} from '../../types/package';
import type { ProjectType, SourceType } from '../../types/project';
import type { OSVClient } from '../../api/osv';
import { ClojarsApiClient } from '../../api/clojars-api';
import { ClojarsTransformer } from './clojars-transformer';

export class ClojarsSourceAdapter extends BaseSourceAdapter {
  readonly sourceType: SourceType = 'clojars';
  readonly displayName = 'Clojars';
  readonly projectType: ProjectType = 'clojure';
  readonly supportedSortOptions: SearchSortBy[] = [
    createSortOption('relevance', 'Relevance'),
    createSortOption('popularity', 'Popularity'),
    createSortOption('name', 'Name'),
  ];
  readonly supportedFilters: SearchFilter[] = [];

  private transformer = new ClojarsTransformer();

  constructor(
    private client: ClojarsApiClient,
    private osvClient: OSVClient
  ) {
    super();
  }

  getEcosystem(): string {
    return 'maven';
  }

  getSupportedCapabilities(): SourceCapability[] {
    return [
      SourceCapability.SEARCH,
      SourceCapability.PACKAGE_INFO,
      SourceCapability.PACKAGE_DETAILS,
      SourceCapability.VERSIONS,
      SourceCapability.INSTALLATION,
      SourceCapability.COPY,
      SourceCapability.SUGGESTIONS,
      SourceCapability.DOWNLOAD_STATS,
      SourceCapability.SECURITY,
      SourceCapability.REQUIREMENTS,
    ];
  }

  async search(options: SearchOptions): Promise<SearchResult> {
    const { query = '', exactName, from = 0, size = 20, sortBy = 'relevance', signal } = options;
    const searchQuery = (exactName || query).trim();
    if (!searchQuery) {
      return { packages: [], total: 0, hasMore: false };
    }

    const raw = await this.client.search(searchQuery, signal);
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
          // Keep search result unchanged.
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
    const artifact = await this.getArtifactByName(name);
    const downloads = await this.getDownloadCount(name);
    return {
      ...this.transformer.transformArtifactDetails(artifact, downloads),
    };
  }

  async getPackageDetails(name: string, version?: string): Promise<PackageDetails> {
    const artifact = await this.getArtifactByName(name);
    const downloads = await this.getDownloadCount(name);
    const rawVersion =
      version ||
      (typeof artifact.latest_version === 'string' ? artifact.latest_version : undefined) ||
      (typeof artifact.version === 'string' ? artifact.version : undefined);
    const resolvedVersion = rawVersion?.trim() || undefined;
    const security = resolvedVersion
      ? await this.getSecurityInfo(name, resolvedVersion).catch(() => null)
      : null;
    const details = this.transformer.transformArtifactDetails(artifact, downloads, security);
    if (resolvedVersion) {
      details.version = resolvedVersion;
    }
    return details;
  }

  async getVersions(name: string): Promise<VersionInfo[]> {
    const artifact = await this.getArtifactByName(name);
    return this.transformer.transformVersions(artifact);
  }

  async getSecurityInfo(name: string, version: string): Promise<SecurityInfo | null> {
    const coordinate = this.toMavenCoordinate(name);
    try {
      return await this.osvClient.queryVulnerabilities(coordinate, version, 'Maven');
    } catch {
      return null;
    }
  }

  async getRequirements(name: string, version: string): Promise<RequirementsInfo | null> {
    const details = await this.getPackageDetails(name, version);
    return details.requirements || null;
  }

  async getDependents(_name: string, _version: string): Promise<DependentsInfo | null> {
    return null;
  }

  getCopySnippet(packageName: string, options: CopyOptions): string {
    if (!this.supportsCapability(SourceCapability.COPY)) {
      throw new CapabilityNotSupportedError(SourceCapability.COPY, this.sourceType);
    }

    const version = options.version || 'RELEASE';
    const format = options.format;
    if (format === 'leiningen') {
      return `[${packageName} "${version}"]`;
    }
    return `${packageName} {:mvn/version "${version}"}`;
  }

  getInstallCommand(packageName: string, options: InstallOptions): string {
    const versionPart = options.version ? ` --version ${options.version}` : '';
    return `neil add ${packageName}${versionPart}`;
  }

  private async getArtifactByName(name: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
    const [group, artifact] = this.splitCoordinate(name);
    return this.client.getArtifact(group, artifact, signal);
  }

  private async getDownloadCount(name: string, signal?: AbortSignal): Promise<number | undefined> {
    const [group, artifact] = this.splitCoordinate(name);
    try {
      const raw = await this.client.getDownloadStats(group, artifact, signal);
      if (Array.isArray(raw)) {
        return raw.reduce((sum, entry) => {
          if (entry && typeof entry === 'object') {
            const value = (entry as Record<string, unknown>).downloads ?? (entry as Record<string, unknown>).count;
            if (typeof value === 'number') {
              return sum + value;
            }
          }
          return sum;
        }, 0);
      }

      if (raw && typeof raw === 'object') {
        for (const key of ['downloads', 'total_downloads', 'count']) {
          const value = (raw as Record<string, unknown>)[key];
          if (typeof value === 'number') {
            return value;
          }
        }
      }
    } catch {
      // Ignore download stats failures.
    }
    return undefined;
  }

  private splitCoordinate(name: string): [string, string] {
    const normalized = name.replace(':', '/');
    const parts = normalized.split('/');
    if (parts.length >= 2) {
      return [parts[0], parts.slice(1).join('/')];
    }
    return [normalized, normalized];
  }

  private toMavenCoordinate(name: string): string {
    const [group, artifact] = this.splitCoordinate(name);
    return `${group}:${artifact}`;
  }
}
