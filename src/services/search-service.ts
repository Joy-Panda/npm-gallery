import { getApiClients } from '../api/clients';
import type { PackageInfo, SearchResult, SearchOptions } from '../types/package';
import type { NpmsSearchResult, NpmSearchObject, NpmsPackageAnalysis } from '../types/api';

/**
 * Service for package search
 */
export class SearchService {
  /**
   * Search for packages
   */
  async search(options: SearchOptions): Promise<SearchResult> {
    const { query, from = 0, size = 20 } = options;

    if (!query.trim()) {
      return { packages: [], total: 0, hasMore: false };
    }

    const clients = getApiClients();

    try {
      // Use npms.io for better search results
      const response = await clients.npms.search(query, { from, size });

      const packageNames = response.results.map((r: NpmsSearchResult) => r.package.name);

      // Fetch download stats for all packages in parallel
      let analysisMap: Record<string, NpmsPackageAnalysis> = {};
      try {
        analysisMap = await clients.npms.getPackagesAnalysis(packageNames);
      } catch {
        // Continue without download data if it fails
      }

      const packages: PackageInfo[] = response.results.map((result: NpmsSearchResult) => {
        const analysis = analysisMap[result.package.name];
        // Get the latest download count from the analysis
        const downloads = analysis?.collected?.npm?.downloads?.[0]?.count;

        return {
          name: result.package.name,
          version: result.package.version,
          description: result.package.description,
          keywords: result.package.keywords,
          author: result.package.author,
          publisher: result.package.publisher,
          repository: result.package.links?.repository
            ? { url: result.package.links.repository }
            : undefined,
          homepage: result.package.links?.homepage,
          score: result.score,
          downloads,
        };
      });

      return {
        packages,
        total: response.total,
        hasMore: from + size < response.total,
      };
    } catch {
      // Fallback to npm registry search
      return this.searchFallback(query, from, size);
    }
  }

  /**
   * Fallback search using npm registry
   */
  private async searchFallback(
    query: string,
    from: number,
    size: number
  ): Promise<SearchResult> {
    const clients = getApiClients();
    const response = await clients.npmRegistry.search(query, { from, size });

    const packages: PackageInfo[] = response.objects.map((obj: NpmSearchObject) => ({
      name: obj.package.name,
      version: obj.package.version,
      description: obj.package.description,
      keywords: obj.package.keywords,
      author: obj.package.author,
      publisher: obj.package.publisher,
      repository: obj.package.links?.repository
        ? { url: obj.package.links.repository }
        : undefined,
      homepage: obj.package.links?.homepage,
      score: obj.score,
    }));

    return {
      packages,
      total: response.total,
      hasMore: from + size < response.total,
    };
  }

  /**
   * Get search suggestions for autocomplete
   */
  async getSuggestions(query: string): Promise<PackageInfo[]> {
    if (!query.trim() || query.length < 2) {
      return [];
    }

    const clients = getApiClients();

    try {
      const response = await clients.npms.getSuggestions(query, 10);
      return response.results.map((result: NpmsSearchResult) => ({
        name: result.package.name,
        version: result.package.version,
        description: result.package.description,
        score: result.score,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Get popular packages
   */
  async getPopularPackages(size: number = 20): Promise<PackageInfo[]> {
    const result = await this.search({
      query: 'keywords:popular',
      size,
    });
    return result.packages;
  }
}
