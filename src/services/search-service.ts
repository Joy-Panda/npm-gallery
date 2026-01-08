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
    const { query, from = 0, size = 20, sortBy = 'relevance' } = options;

    if (!query.trim()) {
      return { packages: [], total: 0, hasMore: false };
    }

    let result: SearchResult;
    
    // API doesn't support 'name' sorting, so we'll handle it client-side
    const apiSortBy = sortBy === 'name' ? 'relevance' : sortBy;
    
    try {
      // Use npm registry first - it supports sorting via weight parameters
      result = await this.searchNpmRegistry(query, from, size, apiSortBy);
    } catch {
      // Fallback to npms.io for better search results
      // Note: npms.io doesn't support explicit sorting, results are sorted by relevance
      result = await this.searchNpmsFallback(query, from, size);
      
      // For npms.io, we need to sort client-side if not using relevance
      if (sortBy !== 'relevance' && sortBy !== 'name') {
        result.packages = this.sortPackagesByCriteria(result.packages, sortBy);
      }
    }

    // Only sort by name client-side if needed (API doesn't support name sorting)
    if (sortBy === 'name') {
      result.packages = this.sortPackagesByName(result.packages);
    }

    return result;
  }

  /**
   * Search using npm registry
   */
  private async searchNpmRegistry(
    query: string,
    from: number,
    size: number,
    sortBy: 'relevance' | 'popularity' | 'quality' | 'maintenance' = 'relevance'
  ): Promise<SearchResult> {
    const clients = getApiClients();
    const response = await clients.npmRegistry.search(query, { from, size, sortBy });

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
      downloads: obj.downloads.weekly,
    }));

    return {
      packages,
      total: response.total,
      hasMore: from + size < response.total,
    };
  }

  /**
   * Fallback search using npms.io
   * Note: npms.io doesn't support explicit sorting parameters
   */
  private async searchNpmsFallback(
    query: string,
    from: number,
    size: number
  ): Promise<SearchResult> {
    const clients = getApiClients();
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

  /**
   * Sort packages by name (only used when sortBy is 'name' since API doesn't support it)
   */
  private sortPackagesByName(packages: PackageInfo[]): PackageInfo[] {
    return [...packages].sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Sort packages by criteria (used for npms.io fallback when API doesn't support sorting)
   */
  private sortPackagesByCriteria(
    packages: PackageInfo[],
    sortBy: 'popularity' | 'quality' | 'maintenance'
  ): PackageInfo[] {
    return [...packages].sort((a, b) => {
      switch (sortBy) {
        case 'popularity':
          return (b.downloads || 0) - (a.downloads || 0);
        case 'quality':
          return (b.score?.final || 0) - (a.score?.final || 0);
        case 'maintenance':
          return (b.score?.detail?.maintenance || 0) - (a.score?.detail?.maintenance || 0);
        default:
          return 0;
      }
    });
  }
}
