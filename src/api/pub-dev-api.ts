import { BaseApiClient } from './base-client';
import { API_ENDPOINTS } from '../types/config';

export interface PubDevSearchResponse {
  packages: Array<{ package: string }>;
  next?: string;
}

export interface PubDevPackageResponse {
  name: string;
  latest: {
    version: string;
    pubspec: Record<string, unknown>;
    archive_url?: string;
    published?: string;
  };
  versions: Array<{
    version: string;
    pubspec: Record<string, unknown>;
    archive_url?: string;
    published?: string;
  }>;
}

export interface PubDevScoreResponse {
  grantedPoints?: number;
  maxPoints?: number;
  likeCount?: number;
  popularityScore?: number;
  downloadCount30Days?: number;
  tags?: string[];
}

export class PubDevApiClient extends BaseApiClient {
  constructor() {
    super(API_ENDPOINTS.PUB_DEV, 'pub-dev');
  }

  async search(
    query: string,
    options: {
      page?: number;
      sort?: string;
      signal?: AbortSignal;
    } = {}
  ): Promise<PubDevSearchResponse> {
    const { page, sort, signal } = options;
    return this.get<PubDevSearchResponse>('/api/search', {
      signal,
      params: {
        q: query,
        page,
        sort,
      },
    });
  }

  async getPackage(name: string, signal?: AbortSignal): Promise<PubDevPackageResponse> {
    return this.get<PubDevPackageResponse>(`/api/packages/${encodeURIComponent(name)}`, { signal });
  }

  async getPackageVersion(name: string, version: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
    return this.get<Record<string, unknown>>(
      `/api/packages/${encodeURIComponent(name)}/versions/${encodeURIComponent(version)}`,
      { signal }
    );
  }

  async getScore(name: string, signal?: AbortSignal): Promise<PubDevScoreResponse> {
    return this.get<PubDevScoreResponse>(`/api/packages/${encodeURIComponent(name)}/score`, { signal });
  }
}
