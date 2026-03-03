import { BaseApiClient, createFetchRequestInit } from './base-client';
import { API_ENDPOINTS } from '../types/config';

export class CranApiClient extends BaseApiClient {
  constructor() {
    super(API_ENDPOINTS.CRAN_UNIVERSE, 'cran');
  }

  async search(query: string, signal?: AbortSignal): Promise<Array<Record<string, unknown>>> {
    return this.get<Array<Record<string, unknown>>>(`${API_ENDPOINTS.R_UNIVERSE}/api/search`, {
      signal,
      params: { q: query },
    });
  }

  async getPackage(name: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
    return this.get<Record<string, unknown>>(`/api/packages/${encodeURIComponent(name)}`, { signal });
  }

  async getDownloads(name: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
    return this.get<Record<string, unknown>>(
      `${API_ENDPOINTS.CRANLOGS}/downloads/total/last-month/${encodeURIComponent(name)}`,
      { signal }
    );
  }

  async getPackageReadme(
    pkg: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<string | null> {
    const readmeUrl = typeof pkg._readme === 'string' && pkg._readme.trim()
      ? pkg._readme.trim()
      : null;

    if (!readmeUrl) {
      return null;
    }

    const response = await fetch(
      readmeUrl,
      createFetchRequestInit({
        accept: 'text/plain, text/markdown, text/x-markdown, text/html',
        signal,
      })
    );

    if (!response.ok) {
      return null;
    }

    const readme = await response.text();
    return readme.trim() || null;
  }
}
