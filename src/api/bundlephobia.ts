import { BaseApiClient, ApiError, ApiErrorType } from './base-client';
import { API_ENDPOINTS } from '../types/config';
import type { BundlephobiaResponse } from '../types/api';
import type { BundleSize } from '../types/package';

/**
 * Client for Bundlephobia API
 */
export class BundlephobiaClient extends BaseApiClient {
  constructor() {
    super(API_ENDPOINTS.BUNDLEPHOBIA, 'bundlephobia', 15000); // Longer timeout
  }

  /**
   * Get bundle size for a package
   */
  async getSize(name: string, version?: string): Promise<BundleSize> {
    const packageSpec = version ? `${name}@${version}` : name;

    try {
      const response = await this.get<BundlephobiaResponse>('/size', {
        params: { package: packageSpec },
      });

      return {
        size: response.size,
        gzip: response.gzip,
        dependencyCount: response.dependencyCount,
        hasJSModule: response.hasJSModule,
        hasSideEffects: response.hasSideEffects,
      };
    } catch (error) {
      if (error instanceof ApiError && error.type === ApiErrorType.NOT_FOUND) {
        return { size: 0, gzip: 0 };
      }
      throw error;
    }
  }

  /**
   * Get bundle sizes for multiple packages
   */
  async getSizes(
    packages: Array<{ name: string; version?: string }>
  ): Promise<Map<string, BundleSize>> {
    const results = new Map<string, BundleSize>();
    const concurrency = 5;

    // Process in batches for concurrency control
    for (let i = 0; i < packages.length; i += concurrency) {
      const batch = packages.slice(i, i + concurrency);
      const promises = batch.map(async (pkg) => {
        try {
          const size = await this.getSize(pkg.name, pkg.version);
          results.set(pkg.name, size);
        } catch {
          results.set(pkg.name, { size: 0, gzip: 0 });
        }
      });
      await Promise.all(promises);
    }

    return results;
  }

  /**
   * Get package export sizes (tree-shaking analysis)
   */
  async getExportSizes(
    name: string,
    version?: string
  ): Promise<Array<{ name: string; size: number; gzip: number }>> {
    const packageSpec = version ? `${name}@${version}` : name;

    try {
      const response = await this.get<{
        assets: Array<{ name: string; size: number; gzip: number }>;
      }>('/exports-sizes', {
        params: { package: packageSpec },
        timeout: 20000,
      });

      return response.assets || [];
    } catch {
      return [];
    }
  }

  /**
   * Get bundle size history for a package
   */
  async getHistory(name: string): Promise<Record<string, { size: number; gzip: number }>> {
    try {
      return await this.get<Record<string, { size: number; gzip: number }>>(
        '/package-history',
        { params: { package: name } }
      );
    } catch {
      return {};
    }
  }
}
