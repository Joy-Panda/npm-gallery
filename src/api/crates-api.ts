import { BaseApiClient } from './base-client';
import { API_ENDPOINTS } from '../types/config';

export interface CratesIoSearchItem {
  id: string;
  description?: string;
  max_stable_version?: string;
  max_version?: string;
  newest_version?: string;
  downloads?: number;
  recent_downloads?: number;
  homepage?: string;
  repository?: string;
  documentation?: string;
  keywords?: string[];
  categories?: string[];
}

export interface CratesIoSearchResponse {
  crates: CratesIoSearchItem[];
  meta?: {
    total?: number;
    next_page?: string | null;
  };
}

export interface CratesIoCrate {
  id: string;
  description?: string;
  homepage?: string;
  repository?: string;
  documentation?: string;
  downloads?: number;
  recent_downloads?: number;
  max_version?: string;
  newest_version?: string;
  max_stable_version?: string;
  categories?: Array<{ category: string }>;
  keywords?: string[];
}

export interface CratesIoCrateResponse {
  crate: CratesIoCrate;
  versions?: CratesIoVersion[];
}

export interface CratesIoVersion {
  num: string;
  created_at?: string;
  updated_at?: string;
  downloads?: number;
  license?: string;
  features?: Record<string, string[]>;
  yanked?: boolean;
}

export interface CratesIoVersionsResponse {
  versions: CratesIoVersion[];
}

export interface CratesIoDependency {
  crate_id: string;
  req: string;
  kind?: 'normal' | 'dev' | 'build';
  optional?: boolean;
  target?: string | null;
}

export interface CratesIoDependenciesResponse {
  dependencies: CratesIoDependency[];
}

export interface CratesIoReverseDependencyItem {
  crate_id?: string;
  version_id?: number;
  req?: string;
  downloads?: number;
}

export interface CratesIoReverseDependenciesResponse {
  dependencies: CratesIoReverseDependencyItem[];
  versions?: Array<{
    crate: string;
    num?: string;
  }>;
  meta?: {
    total?: number;
    next_page?: string | null;
  };
}

export class CratesIoApiClient extends BaseApiClient {
  constructor() {
    super(API_ENDPOINTS.CRATES_IO, 'crates-io');
  }

  async search(
    query: string,
    options: {
      page?: number;
      perPage?: number;
      signal?: AbortSignal;
    } = {}
  ): Promise<CratesIoSearchResponse> {
    const { page = 1, perPage = 20, signal } = options;
    return this.get<CratesIoSearchResponse>('/api/v1/crates', {
      signal,
      params: {
        q: query,
        page,
        per_page: perPage,
      },
    });
  }

  async getCrate(name: string, signal?: AbortSignal): Promise<CratesIoCrateResponse> {
    return this.get<CratesIoCrateResponse>(`/api/v1/crates/${encodeURIComponent(name)}`, {
      signal,
    });
  }

  async getVersions(name: string, signal?: AbortSignal): Promise<CratesIoVersionsResponse> {
    return this.get<CratesIoVersionsResponse>(`/api/v1/crates/${encodeURIComponent(name)}/versions`, {
      signal,
    });
  }

  async getDependencies(name: string, version: string, signal?: AbortSignal): Promise<CratesIoDependenciesResponse> {
    return this.get<CratesIoDependenciesResponse>(
      `/api/v1/crates/${encodeURIComponent(name)}/${encodeURIComponent(version)}/dependencies`,
      { signal }
    );
  }

  async getReverseDependencies(
    name: string,
    options: {
      page?: number;
      perPage?: number;
      signal?: AbortSignal;
    } = {}
  ): Promise<CratesIoReverseDependenciesResponse> {
    const { page = 1, perPage = 20, signal } = options;
    return this.get<CratesIoReverseDependenciesResponse>(
      `/api/v1/crates/${encodeURIComponent(name)}/reverse_dependencies`,
      {
        signal,
        params: {
          page,
          per_page: perPage,
        },
      }
    );
  }
}
