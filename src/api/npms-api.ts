import { BaseApiClient } from './base-client';
import { API_ENDPOINTS } from '../types/config';
import type { NpmsSearchResponse, NpmsPackageAnalysis } from '../types/api';

/**
 * Client for npms.io API (enhanced search and package analysis)
 */
export class NpmsApiClient extends BaseApiClient {
  constructor() {
    super(API_ENDPOINTS.NPMS_API, 'npms');
  }

  /**
   * Search packages with enhanced scoring
   * Note: npms.io API doesn't support explicit sorting parameters
   * Results are sorted by relevance/score by default
   */
  async search(
    query: string,
    options: { from?: number; size?: number; signal?: AbortSignal } = {}
  ): Promise<NpmsSearchResponse> {
    const { from = 0, size = 20, signal } = options;

    return this.get<NpmsSearchResponse>('/search', {
      signal,
      params: {
        q: query,
        from,
        size: Math.min(size, 250),
      },
    });
  }

  /**
   * Get search suggestions (autocomplete)
   */
  async getSuggestions(query: string, size: number = 10): Promise<NpmsSearchResponse> {
    return this.get<NpmsSearchResponse>('/search/suggestions', {
      params: {
        q: query,
        size: Math.min(size, 25),
      },
    });
  }

  /**
   * Get detailed package analysis
   */
  async getPackageAnalysis(name: string): Promise<NpmsPackageAnalysis> {
    const encodedName = this.encodePackageName(name);
    return this.get<NpmsPackageAnalysis>(`/package/${encodedName}`);
  }

  /**
   * Get analysis for multiple packages at once
   */
  async getPackagesAnalysis(names: string[]): Promise<Record<string, NpmsPackageAnalysis>> {
    if (names.length === 0) {
      return {};
    }

    // npms.io bulk endpoint accepts up to 250 packages
    const batches: string[][] = [];
    for (let i = 0; i < names.length; i += 250) {
      batches.push(names.slice(i, i + 250));
    }

    const results: Record<string, NpmsPackageAnalysis> = {};

    for (const batch of batches) {
      const response = await this.post<Record<string, NpmsPackageAnalysis>>(
        '/package/mget',
        batch
      );
      Object.assign(results, response);
    }

    return results;
  }

  /**
   * Build search query with modifiers
   */
  static buildQuery(
    baseQuery: string,
    modifiers: {
      scope?: string;
      author?: string;
      maintainer?: string;
      keywords?: string[];
      excludeDeprecated?: boolean;
      excludeUnstable?: boolean;
    } = {}
  ): string {
    let query = baseQuery;

    if (modifiers.scope) {
      query += ` scope:${modifiers.scope}`;
    }
    if (modifiers.author) {
      query += ` author:${modifiers.author}`;
    }
    if (modifiers.maintainer) {
      query += ` maintainer:${modifiers.maintainer}`;
    }
    if (modifiers.keywords?.length) {
      query += modifiers.keywords.map((k) => ` keywords:${k}`).join('');
    }
    if (modifiers.excludeDeprecated) {
      query += ' not:deprecated';
    }
    if (modifiers.excludeUnstable) {
      query += ' not:unstable';
    }

    return query.trim();
  }
}
