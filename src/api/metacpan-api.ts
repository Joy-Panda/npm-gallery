import { BaseApiClient } from './base-client';
import { API_ENDPOINTS } from '../types/config';

export interface MetaCpanSearchHit {
  _source?: Record<string, unknown>;
}

export interface MetaCpanSearchResponse {
  hits?: {
    total?: number | { value: number };
    hits?: MetaCpanSearchHit[];
  };
}

export class MetaCpanApiClient extends BaseApiClient {
  constructor() {
    super(API_ENDPOINTS.METACPAN, 'metacpan');
  }

  async searchModules(
    query: string,
    options: {
      from?: number;
      size?: number;
      signal?: AbortSignal;
    } = {}
  ): Promise<MetaCpanSearchResponse> {
    const { from = 0, size = 20, signal } = options;
    return this.get<MetaCpanSearchResponse>('/v1/module/_search', {
      signal,
      params: {
        q: query,
        from,
        size,
      },
    });
  }

  async getModule(name: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
    return this.get<Record<string, unknown>>(`/v1/module/${encodeURIComponent(name)}`, { signal });
  }

  async getRelease(name: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
    return this.get<Record<string, unknown>>(`/v1/release/${encodeURIComponent(name)}`, { signal });
  }

  async searchReleases(
    distribution: string,
    options: {
      size?: number;
      signal?: AbortSignal;
    } = {}
  ): Promise<MetaCpanSearchResponse> {
    const { size = 50, signal } = options;
    return this.get<MetaCpanSearchResponse>('/v1/release/_search', {
      signal,
      params: {
        q: `distribution:${distribution}`,
        size,
        sort: 'date:desc',
      },
    });
  }
}
