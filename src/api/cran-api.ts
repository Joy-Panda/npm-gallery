import { BaseApiClient } from './base-client';
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
}
