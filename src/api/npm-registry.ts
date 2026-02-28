import axios from 'axios';
import { BaseApiClient } from './base-client';
import { API_ENDPOINTS } from '../types/config';
import type {
  NpmRegistryPackage,
  NpmSearchResponse,
  NpmDownloadsResponse,
} from '../types/api';

/**
 * Client for npm Registry API
 */
export class NpmRegistryClient extends BaseApiClient {
  constructor() {
    super(API_ENDPOINTS.NPM_REGISTRY, 'npm-registry');
  }

  /**
   * Get full package information
   */
  async getPackage(name: string): Promise<NpmRegistryPackage> {
    const encodedName = this.encodePackageName(name);
    return this.get<NpmRegistryPackage>(`/${encodedName}`);
  }

  /**
   * Get abbreviated package info (smaller response)
   */
  async getPackageAbbreviated(name: string): Promise<NpmRegistryPackage> {
    const encodedName = this.encodePackageName(name);
    return this.get<NpmRegistryPackage>(`/${encodedName}`, {
      headers: {
        Accept: 'application/vnd.npm.install-v1+json',
      },
    });
  }

  /**
   * Search packages
   */
  async search(
    query: string,
    options: {
      from?: number;
      size?: number;
      quality?: number;
      popularity?: number;
      maintenance?: number;
      sortBy?: 'relevance' | 'popularity' | 'quality' | 'maintenance';
      signal?: AbortSignal;
    } = {}
  ): Promise<NpmSearchResponse> {
    const { from = 0, size = 20, sortBy = 'relevance', signal } = options;

    // Map sortBy to weight values for npm registry API
    // npm registry uses weights (0-1) to control sorting
    let quality = 0.65;
    let popularity = 0.98;
    let maintenance = 0.5;

    switch (sortBy) {
      case 'popularity':
        quality = 0.1;
        popularity = 1.0;
        maintenance = 0.1;
        break;
      case 'quality':
        quality = 1.0;
        popularity = 0.5;
        maintenance = 0.5;
        break;
      case 'maintenance':
        quality = 0.5;
        popularity = 0.5;
        maintenance = 1.0;
        break;
      case 'relevance':
      default:
        // Default optimal weights
        quality = 0.65;
        popularity = 0.98;
        maintenance = 0.5;
        break;
    }

    return this.get<NpmSearchResponse>('/-/v1/search', {
      signal,
      params: {
        text: query,
        from,
        size,
        quality,
        popularity,
        maintenance,
      },
    });
  }

  /**
   * Get download counts for a package
   */
  async getDownloads(
    name: string,
    period: 'last-day' | 'last-week' | 'last-month' | 'last-year' = 'last-week'
  ): Promise<NpmDownloadsResponse> {
    const encodedName = this.encodePackageName(name);

    try {
      const response = await axios.get<NpmDownloadsResponse>(
        `${API_ENDPOINTS.NPM_API}/downloads/point/${period}/${encodedName}`
      );
      return response.data;
    } catch {
      return { downloads: 0, start: '', end: '', package: name };
    }
  }

  /**
   * Get specific version of a package
   */
  async getPackageVersion(name: string, version: string): Promise<NpmRegistryPackage> {
    const encodedName = this.encodePackageName(name);
    return this.get<NpmRegistryPackage>(`/${encodedName}/${version}`);
  }

  /**
   * Get all versions of a package
   */
  async getPackageVersions(name: string): Promise<{
    'dist-tags': Record<string, string>;
    versions: Record<string, { version: string; deprecated?: string }>;
    time: Record<string, string>;
  }> {
    const pkg = await this.getPackage(name);
    return {
      'dist-tags': pkg['dist-tags'],
      versions: Object.fromEntries(
        Object.entries(pkg.versions).map(([v, data]) => [
          v,
          { version: v, deprecated: data.deprecated },
        ])
      ),
      time: pkg.time || {},
    };
  }
}
