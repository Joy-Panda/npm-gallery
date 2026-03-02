import { BaseApiClient } from './base-client';
import { API_ENDPOINTS } from '../types/config';

export interface PackagistSearchResultItem {
  name: string;
  description?: string;
  url?: string;
  repository?: string;
  downloads?: number;
  favers?: number;
}

export interface PackagistSearchResponse {
  results: PackagistSearchResultItem[];
  total: number;
  next?: string;
}

export interface PackagistPackageVersion {
  name: string;
  description?: string;
  version: string;
  version_normalized?: string;
  license?: string[];
  keywords?: string[];
  homepage?: string;
  authors?: Array<{
    name?: string;
    email?: string;
    homepage?: string;
    role?: string;
  }>;
  source?: {
    type?: string;
    url?: string;
    reference?: string;
  };
  dist?: {
    type?: string;
    url?: string;
    reference?: string;
    shasum?: string;
  };
  type?: string;
  support?: {
    issues?: string;
    source?: string;
    docs?: string;
  };
  time?: string;
  require?: Record<string, string>;
  'require-dev'?: Record<string, string>;
  suggest?: Record<string, string>;
  provide?: Record<string, string>;
  replace?: Record<string, string>;
  conflict?: Record<string, string>;
  abandoned?: boolean | string;
}

export interface PackagistPackageMetadata {
  name: string;
  description?: string;
  time?: string;
  maintainers?: Array<{
    name?: string;
    avatar_url?: string;
  }>;
  versions: Record<string, PackagistPackageVersion>;
  type?: string;
  repository?: string;
  github_stars?: number;
  github_watchers?: number;
  github_forks?: number;
  github_open_issues?: number;
  language?: string;
  dependents?: number;
  suggesters?: number;
  downloads?: {
    total?: number;
    monthly?: number;
    daily?: number;
  };
  favers?: number;
}

export interface PackagistPackageResponse {
  package: PackagistPackageMetadata;
}

export interface PackagistAdvisory {
  advisoryId?: string;
  packageName: string;
  remoteId?: string;
  title?: string;
  link?: string;
  cve?: string;
  affectedVersions?: string;
  sources?: Array<{
    name?: string;
    remoteId?: string;
  }>;
  reportedAt?: string;
  composerRepository?: string;
  severity?: string;
}

export interface PackagistSecurityAdvisoriesResponse {
  advisories: Record<string, PackagistAdvisory[]>;
}

export type PackagistDependentsResponse = unknown;

export class PackagistApiClient extends BaseApiClient {
  constructor() {
    super(API_ENDPOINTS.PACKAGIST, 'packagist');
  }

  async search(
    query: string,
    options: {
      page?: number;
      perPage?: number;
      tags?: string;
      type?: string;
      signal?: AbortSignal;
    } = {}
  ): Promise<PackagistSearchResponse> {
    const { page = 1, perPage = 20, tags, type, signal } = options;
    return this.get<PackagistSearchResponse>('/search.json', {
      signal,
      params: {
        q: query,
        page,
        per_page: perPage,
        tags,
        type,
      },
    });
  }

  async getPackage(name: string, signal?: AbortSignal): Promise<PackagistPackageResponse> {
    return this.get<PackagistPackageResponse>(`/packages/${this.encodePackagistName(name)}.json`, {
      signal,
    });
  }

  async getSecurityAdvisories(
    packages: string[],
    options: {
      updatedSince?: number;
      signal?: AbortSignal;
    } = {}
  ): Promise<PackagistSecurityAdvisoriesResponse> {
    const { updatedSince, signal } = options;
    const params = new URLSearchParams();
    for (const pkg of packages) {
      params.append('packages[]', pkg);
    }
    if (updatedSince !== undefined) {
      params.append('updatedSince', String(updatedSince));
    }

    return this.get<PackagistSecurityAdvisoriesResponse>(`/api/security-advisories/?${params.toString()}`, {
      signal,
    });
  }

  async getDependents(
    name: string,
    options: {
      pageUrl?: string;
      orderBy?: 'downloads' | 'name';
      signal?: AbortSignal;
    } = {}
  ): Promise<PackagistDependentsResponse> {
    const { pageUrl, orderBy = 'downloads', signal } = options;
    const endpoint = pageUrl || `/packages/${this.encodePackagistName(name)}/dependents.json`;
    return this.get<PackagistDependentsResponse>(endpoint, {
      signal,
      params: {
        order_by: orderBy,
      },
    });
  }

  private encodePackagistName(name: string): string {
    return name
      .split('/')
      .map(part => encodeURIComponent(part))
      .join('/');
  }
}
