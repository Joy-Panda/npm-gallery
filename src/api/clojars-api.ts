import { BaseApiClient } from './base-client';
import { API_ENDPOINTS } from '../types/config';

export type ClojarsArtifactResponse = Record<string, unknown>;
export type ClojarsSearchResponse = unknown;
export type ClojarsStatsResponse = unknown;

export class ClojarsApiClient extends BaseApiClient {
  constructor() {
    super(API_ENDPOINTS.CLOJARS, 'clojars');
  }

  async search(query: string, signal?: AbortSignal): Promise<ClojarsSearchResponse> {
    return this.get<ClojarsSearchResponse>('/search', {
      signal,
      params: {
        q: query,
        format: 'json',
      },
    });
  }

  async getArtifact(group: string, artifact: string, signal?: AbortSignal): Promise<ClojarsArtifactResponse> {
    return this.get<ClojarsArtifactResponse>(`/api/artifacts/${encodeURIComponent(group)}/${encodeURIComponent(artifact)}`, {
      signal,
    });
  }

  async getDownloadStats(group: string, artifact: string, signal?: AbortSignal): Promise<ClojarsStatsResponse> {
    return this.get<ClojarsStatsResponse>(`/api/artifacts/${encodeURIComponent(group)}/${encodeURIComponent(artifact)}/downloads`, {
      signal,
    });
  }
}
