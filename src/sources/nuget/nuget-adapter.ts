import { BaseSourceAdapter } from '../base/source-adapter.interface';
import { SourceCapability, CapabilityNotSupportedError } from '../base/capabilities';
import { NuGetTransformer } from './nuget-transformer';
import {
  NuGetApiClient,
  type NuGetRegistrationIndex,
} from '../../api/nuget-api';
import type { OSVClient } from '../../api/osv';
import type { DepsDevClient } from '../../api/deps-dev';
import type {
  PackageInfo,
  PackageDetails,
  VersionInfo,
  SearchResult,
  SearchOptions,
  SearchSortBy,
  SearchFilter,
  CopyOptions,
  NuGetCopyFormat,
  SecurityInfo,
} from '../../types/package';
import { getSortValue, createSortOption, createFilterOption } from '../../types/package';
import type { SourceType, ProjectType } from '../../types/project';

/**
 * NuGet source adapter
 * Uses NuGet V3 API (Service Index + SearchQueryService).
 * Supports: .NET CLI, PMC, PackageReference, CPM, Paket CLI, Script & Interactive, Cake
 */
export class NuGetSourceAdapter extends BaseSourceAdapter {
  readonly sourceType: SourceType = 'nuget';
  readonly displayName = 'NuGet';
  readonly projectType: ProjectType = 'dotnet';
  readonly supportedSortOptions: SearchSortBy[] = [
    createSortOption('relevance', 'Relevance'),
    createSortOption('popularity', 'Popularity'),
    createSortOption('name', 'Name'),
  ];
  readonly supportedFilters: SearchFilter[] = [
    createFilterOption('author', 'Author', 'author or owner'),
    createFilterOption('tags', 'Tags', 'tags (comma-separated)'),
    createFilterOption('packageType', 'Package type', 'e.g. Dependency, DotnetTool'),
  ];

  private transformer = new NuGetTransformer();

  constructor(
    private client: NuGetApiClient,
    private osvClient: OSVClient,
    depsDevClient?: DepsDevClient
  ) {
    super(depsDevClient);
  }

  getEcosystem(): string {
    return 'nuget';
  }

  getSupportedCapabilities(): SourceCapability[] {
    return [
      SourceCapability.SEARCH,
      SourceCapability.PACKAGE_INFO,
      SourceCapability.PACKAGE_DETAILS,
      SourceCapability.VERSIONS,
      SourceCapability.COPY,
      SourceCapability.SUGGESTIONS,
      SourceCapability.DOWNLOAD_STATS,
      SourceCapability.SECURITY,
      SourceCapability.DEPENDENTS,
    ];
  }

  async getSecurityInfo(name: string, version: string): Promise<SecurityInfo | null> {
    try {
      return await this.osvClient.queryVulnerabilities(name, version, 'NuGet');
    } catch {
      return null;
    }
  }

  async getSecurityInfoBulk(
    packages: Array<{ name: string; version: string }>
  ): Promise<Record<string, SecurityInfo | null>> {
    try {
      const results = await this.osvClient.queryBulkVulnerabilities(
        packages.map((p) => ({ name: p.name, version: p.version, ecosystem: 'NuGet' }))
      );
      return results;
    } catch {
      const empty: Record<string, SecurityInfo | null> = {};
      for (const p of packages) {
        empty[`${p.name}@${p.version}`] = null;
      }
      return empty;
    }
  }

  async search(options: SearchOptions): Promise<SearchResult> {
    const { query = '', exactName, from = 0, size = 20, sortBy = 'relevance', signal } = options;
    const searchQuery = (exactName || query).trim();
    if (!searchQuery) {
      return { packages: [], total: 0, hasMore: false };
    }

    const res = await this.client.search({
      query: searchQuery,
      skip: from,
      take: size,
      prerelease: false,
      semVerLevel: '2.0.0',
      signal,
    });

    let result = this.transformer.transformSearchResult(res, from, size);

    if (exactName && result.packages.length > 0) {
      const exact = result.packages.find(
        (p) => p.name.toLowerCase() === exactName.toLowerCase()
      );
      if (exact) {
        result = {
          ...result,
          packages: [
            { ...exact, exactMatch: true },
            ...result.packages.filter((p) => p.name.toLowerCase() !== exactName.toLowerCase()),
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
          // keep current result
        }
      }
    }

    const sortValue = getSortValue(sortBy);
    if (sortValue === 'name') {
      result.packages = [...result.packages].sort((a, b) => a.name.localeCompare(b.name));
    }
    return result;
  }

  async getPackageInfo(name: string): Promise<PackageInfo> {
    const meta = await this.client.getPackageMetadata(name);
    if (!meta) {
      throw new Error(`Package not found: ${name}`);
    }
    return this.transformer.transformPackageInfo(meta);
  }

  async getPackageDetails(name: string, _version?: string): Promise<PackageDetails> {
    const meta = await this.client.getPackageMetadata(name);
    if (!meta) {
      throw new Error(`Package not found: ${name}`);
    }
    let registrationIndex: NuGetRegistrationIndex | null = null;
    try {
      registrationIndex = await this.client.getRegistrationIndex(name);
    } catch {
      // use search versions only
    }
    const details = this.transformer.transformPackageDetails(meta, registrationIndex);
    try {
      const readme = await this.client.getPackageReadme(name, details.version);
      if (readme) {
        details.readme = readme;
      } else if (meta.description || meta.summary) {
        details.readme = (meta.description || meta.summary || '').trim() || undefined;
      }
    } catch {
      if (meta.description || meta.summary) {
        details.readme = (meta.description || meta.summary || '').trim() || undefined;
      }
    }
    return details;
  }

  async getVersions(name: string): Promise<VersionInfo[]> {
    const meta = await this.client.getPackageMetadata(name);
    if (!meta) {
      throw new Error(`Package not found: ${name}`);
    }
    return this.transformer.transformVersions(meta.versions);
  }

  async getSuggestions(query: string, limit = 10): Promise<PackageInfo[]> {
    const res = await this.client.search({ query, take: limit });
    return res.data.map((item) => this.transformer.transformSearchItem(item));
  }

  getCopySnippet(packageName: string, options: CopyOptions): string {
    if (!this.supportsCapability(SourceCapability.COPY)) {
      throw new CapabilityNotSupportedError(SourceCapability.COPY, this.sourceType);
    }
    const version = options.version || '*';
    const format = (options.format as NuGetCopyFormat) || 'packagereference';

    switch (format) {
      case 'packagereference':
        return this.snippetPackageReference(packageName, version);
      case 'dotnet-cli':
        return this.snippetDotNetCli(packageName, version);
      case 'cpm':
        return this.snippetCpm(packageName, version);
      case 'cpm-project':
        return this.snippetCpmProject(packageName);
      case 'paket':
        return this.snippetPaketCli(packageName, version);
      case 'paket-deps':
        return this.snippetPaketDeps(packageName, version);
      case 'cake':
        return this.snippetCakeAddin(packageName, version);
      case 'cake-tool':
        return this.snippetCakeTool(packageName, version);
      case 'pmc':
        return this.snippetPmc(packageName, version);
      case 'script':
        return this.snippetScript(packageName, version);
      case 'file-based':
        return this.snippetFileBased(packageName, version);
      default:
        return this.snippetPackageReference(packageName, version);
    }
  }

  /** PackageReference: copy to .csproj */
  private snippetPackageReference(id: string, version: string): string {
    return `    <PackageReference Include="${id}" Version="${version}" />`;
  }

  /** .NET CLI: run in terminal */
  private snippetDotNetCli(id: string, version: string): string {
    const ver = version === '*' ? '' : ` --version ${version}`;
    return `dotnet add package ${id}${ver}`;
  }

  /** CPM Directory.Packages.props: PackageVersion */
  private snippetCpm(id: string, version: string): string {
    return `    <PackageVersion Include="${id}" Version="${version}" />`;
  }

  /** CPM project file: PackageReference without version (version from CPM) */
  private snippetCpmProject(id: string): string {
    return `    <PackageReference Include="${id}" />`;
  }

  /** Paket CLI: run in terminal */
  private snippetPaketCli(id: string, version: string): string {
    const ver = version === '*' ? '' : ` --version ${version}`;
    return `paket add ${id}${ver}`;
  }

  /** Paket: copy to paket.dependencies */
  private snippetPaketDeps(id: string, version: string): string {
    return `nuget ${id} ${version}`;
  }

  /** Cake Addin: copy to .cake */
  private snippetCakeAddin(id: string, version: string): string {
    const ver = version === '*' ? '' : `&version=${version}`;
    return ver ? `#addin nuget:?package=${id}&version=${version}` : `#addin nuget:?package=${id}`;
  }

  /** Cake Tool: copy to .cake */
  private snippetCakeTool(id: string, version: string): string {
    const ver = version === '*' ? '' : `&version=${version}`;
    return ver ? `#tool nuget:?package=${id}&version=${version}` : `#tool nuget:?package=${id}`;
  }

  /** PMC: copy then paste in Package Manager Console */
  private snippetPmc(id: string, version: string): string {
    const ver = version === '*' ? '' : ` -Version ${version}`;
    return `Install-Package ${id}${ver}`;
  }

  /** Script & Interactive: #r "nuget: ..." */
  private snippetScript(id: string, version: string): string {
    const ver = version === '*' ? '' : `, ${version}`;
    return `#r "nuget: ${id}${ver}"`;
  }

  /** File-based Apps */
  private snippetFileBased(id: string, version: string): string {
    const ver = version === '*' ? '' : `@${version}`;
    return `#:package ${id}${ver}`;
  }
}
