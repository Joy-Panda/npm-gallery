/**
 * NuGet V3 API client
 * Based on:
 * - Service Index: https://learn.microsoft.com/en-us/nuget/api/service-index
 * - Search: https://learn.microsoft.com/en-us/nuget/api/search-query-service-resource
 */

const DEFAULT_SERVICE_INDEX_URL = 'https://api.nuget.org/v3/index.json';

export interface NuGetServiceIndexResource {
  '@id': string;
  '@type': string;
  comment?: string;
}

export interface NuGetServiceIndex {
  version: string;
  resources: NuGetServiceIndexResource[];
}

export interface NuGetSearchResultVersion {
  version: string;
  downloads: number;
  '@id'?: string;
}

export interface NuGetSearchResultPackageType {
  name: string;
}

export interface NuGetSearchResultItem {
  id: string;
  version: string;
  description?: string;
  summary?: string;
  title?: string;
  authors?: string | string[];
  owners?: string | string[];
  iconUrl?: string;
  licenseUrl?: string;
  projectUrl?: string;
  tags?: string | string[];
  totalDownloads?: number;
  verified?: boolean;
  registration?: string;
  versions: NuGetSearchResultVersion[];
  packageTypes?: NuGetSearchResultPackageType[];
}

export interface NuGetSearchResponse {
  totalHits: number;
  data: NuGetSearchResultItem[];
}

export interface NuGetSearchOptions {
  query: string;
  skip?: number;
  take?: number;
  prerelease?: boolean;
  semVerLevel?: string;
  packageType?: string;
  signal?: AbortSignal;
}

/** Registration leaf: one version metadata */
export interface NuGetRegistrationLeaf {
  '@id'?: string;
  catalogEntry: {
    '@id'?: string;
    id: string;
    version: string;
    description?: string;
    summary?: string;
    title?: string;
    authors?: string;
    licenseUrl?: string;
    projectUrl?: string;
    published?: string;
    dependencyGroups?: Array<{
      targetFramework?: string;
      dependencies?: Array<{ id: string; range?: string }>;
    }>;
  };
}

/** Registration index: list of leaves for a package */
export interface NuGetRegistrationPage {
  '@id'?: string;
  count: number;
  items?: Array<{
    '@id'?: string;
    catalogEntry?: NuGetRegistrationLeaf['catalogEntry'];
  }>;
}

export interface NuGetRegistrationIndex {
  '@id'?: string;
  count: number;
  items: Array<{
    '@id'?: string;
    count?: number;
    items?: NuGetRegistrationLeaf[];
    lower?: string;
    upper?: string;
  }>;
}

export class NuGetApiClient {
  private serviceIndexUrl: string;
  private searchBaseUrl: string | null = null;
  private registrationsBaseUrl: string | null = null;
  /** ReadmeUriTemplate from service index, e.g. https://api.nuget.org/v3-flatcontainer/{lower_id}/{lower_version}/readme */
  private readmeUriTemplate: string | null = null;
  private indexPromise: Promise<void> | null = null;

  constructor(serviceIndexUrl: string = DEFAULT_SERVICE_INDEX_URL) {
    this.serviceIndexUrl = serviceIndexUrl;
  }

  /**
   * Fetch service index and cache SearchQueryService, RegistrationsBaseUrl, ReadmeUriTemplate
   */
  private async ensureIndex(signal?: AbortSignal): Promise<void> {
    if (this.searchBaseUrl) {
      return;
    }
    if (this.indexPromise) {
      return this.indexPromise;
    }
    this.indexPromise = (async () => {
      const res = await fetch(this.serviceIndexUrl, { signal });
      if (!res.ok) {
        throw new Error(`NuGet service index failed: ${res.status} ${res.statusText}`);
      }
      const index: NuGetServiceIndex = await res.json();
      const searchResource = index.resources.find(
        (r) =>
          r['@type'] === 'SearchQueryService' ||
          r['@type']?.startsWith('SearchQueryService/')
      );
      const regResource = index.resources.find(
        (r) =>
          r['@type'] === 'RegistrationsBaseUrl' ||
          r['@type']?.startsWith('RegistrationsBaseUrl/')
      );
      const readmeResource = index.resources.find(
        (r) =>
          r['@type'] === 'ReadmeUriTemplate/6.13.0' ||
          (typeof r['@type'] === 'string' && r['@type'].startsWith('ReadmeUriTemplate/'))
      );
      if (!searchResource) {
        throw new Error('NuGet service index: SearchQueryService not found');
      }
      this.searchBaseUrl = searchResource['@id'].replace(/\/$/, '');
      if (regResource) {
        this.registrationsBaseUrl = regResource['@id'].replace(/\/$/, '');
      }
      if (readmeResource?.['@id']) {
        this.readmeUriTemplate = readmeResource['@id'];
      }
    })();
    return this.indexPromise;
  }

  /**
   * Search packages
   * GET {SearchQueryService}?q=...&skip=...&take=...&prerelease=...&semVerLevel=...
   */
  async search(options: NuGetSearchOptions): Promise<NuGetSearchResponse> {
    await this.ensureIndex(options.signal);
    if (!this.searchBaseUrl) {
      throw new Error('NuGet SearchQueryService URL not available');
    }
    const { query, skip = 0, take = 20, prerelease = false, semVerLevel = '2.0.0', packageType, signal } = options;
    const params = new URLSearchParams();
    if (query.trim()) {
      params.set('q', query.trim());
    }
    params.set('skip', String(skip));
    params.set('take', String(Math.min(take, 1000)));
    params.set('prerelease', String(prerelease));
    if (semVerLevel) {
      params.set('semVerLevel', semVerLevel);
    }
    if (packageType?.trim()) {
      params.set('packageType', packageType.trim());
    }
    const url = `${this.searchBaseUrl}?${params.toString()}`;
    const res = await fetch(url, { signal });
    if (!res.ok) {
      throw new Error(`NuGet search failed: ${res.status} ${res.statusText}`);
    }
    return res.json();
  }

  /**
   * Get registration index for a package (all versions)
   * GET {RegistrationsBaseUrl}{id-lower}/index.json
   */
  async getRegistrationIndex(packageId: string, signal?: AbortSignal): Promise<NuGetRegistrationIndex> {
    await this.ensureIndex(signal);
    if (!this.registrationsBaseUrl) {
      throw new Error('NuGet RegistrationsBaseUrl not available');
    }
    const idLower = packageId.toLowerCase();
    const url = `${this.registrationsBaseUrl}/${idLower}/index.json`;
    const res = await fetch(url, { signal });
    if (!res.ok) {
      if (res.status === 404) {
        throw new Error(`Package not found: ${packageId}`);
      }
      throw new Error(`NuGet registration failed: ${res.status} ${res.statusText}`);
    }
    return res.json();
  }

  /**
   * Get package details by fetching registration and optionally a specific version leaf.
   * Uses search first for quick metadata, then registration for full version list and dependency groups.
   */
  async getPackageMetadata(packageId: string, signal?: AbortSignal): Promise<NuGetSearchResultItem | null> {
    const searchRes = await this.search({
      query: packageId,
      take: 1,
      signal,
    });
    const exact = searchRes.data.find(
      (p) => p.id.toLowerCase() === packageId.toLowerCase()
    );
    return exact || null;
  }

  /**
   * Autocomplete (optional): use SearchAutocompleteService if we add it later
   */
  async autocomplete(query: string, take: number = 10, signal?: AbortSignal): Promise<string[]> {
    await this.ensureIndex(signal);
    const searchRes = await this.search({ query, take, signal });
    return searchRes.data.map((p) => p.id);
  }

  /**
   * Get package README content using ReadmeUriTemplate from service index.
   * Template: https://api.nuget.org/v3-flatcontainer/{lower_id}/{lower_version}/readme
   * @see https://api.nuget.org/v3/index.json ReadmeUriTemplate/6.13.0
   */
  async getPackageReadme(packageId: string, version: string, signal?: AbortSignal): Promise<string | null> {
    await this.ensureIndex(signal);
    const template = this.readmeUriTemplate;
    if (!template) {
      return null;
    }
    const lowerId = packageId.toLowerCase();
    const lowerVersion = version.toLowerCase();
    const url = template
      .replace(/\{lower_id\}/g, lowerId)
      .replace(/\{lower_version\}/g, lowerVersion);
    try {
      const res = await fetch(url, { signal });
      if (!res.ok) {
        return null;
      }
      const text = await res.text();
      return text && text.trim() ? text : null;
    } catch {
      return null;
    }
  }
}
