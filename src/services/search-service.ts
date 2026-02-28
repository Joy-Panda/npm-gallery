import type { PackageInfo, SearchResult, SearchOptions } from '../types/package';
import type { SourceSelector } from '../registry/source-selector';
import { MemoryCache } from '../cache/memory-cache';

/**
 * Service for package search
 * Uses source selector for multi-source support
 */
export class SearchService {
  private searchCache = new MemoryCache(200);

  constructor(private sourceSelector?: SourceSelector) {}

  /**
   * Set the source selector (for late initialization)
   */
  setSourceSelector(selector: SourceSelector): void {
    this.sourceSelector = selector;
  }

  /**
   * Search for packages
   */
  async search(options: SearchOptions): Promise<SearchResult> {
    const { query, exactName } = options;

    if (!query.trim() && !exactName) {
      return { packages: [], total: 0, hasMore: false };
    }

    if (!this.sourceSelector) {
      throw new Error('SearchService not initialized: SourceSelector is required');
    }

    const sourceType = this.sourceSelector.getCurrentSourceType();
    const cacheKey = [
      sourceType,
      query.trim(),
      options.exactName || '',
      options.from || 0,
      options.size || 20,
      options.sortBy || 'relevance',
    ].join(':');
    const cached = this.searchCache.get<SearchResult>(cacheKey);
    if (cached) {
      return cached;
    }

    // Use source selector with fallback support
    const result = await this.sourceSelector.executeWithFallback(
      adapter => adapter.search(options)
    );
    this.searchCache.set(cacheKey, result, 5 * 60 * 1000);
    return result;
  }

  /**
   * Get search suggestions for autocomplete
   */
  async getSuggestions(query: string): Promise<PackageInfo[]> {
    if (!query.trim() || query.length < 2) {
      return [];
    }

    if (!this.sourceSelector) {
      throw new Error('SearchService not initialized: SourceSelector is required');
    }

    try {
      const adapter = this.sourceSelector.selectSource();
      if (adapter.getSuggestions) {
        return await adapter.getSuggestions(query, 10);
      }
      // Fallback: use search with small limit
      const result = await adapter.search({ query, size: 10 });
      return result.packages;
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
      sortBy: 'popularity',
    });
    return result.packages;
  }

  /**
   * Get supported sort options for current source
   */
  getSupportedSortOptions(): string[] {
    if (!this.sourceSelector) {
      return ['relevance', 'popularity', 'quality', 'maintenance', 'name'];
    }
    return this.sourceSelector.getSupportedSortOptions();
  }

  /**
   * Get supported filters for current source
   */
  getSupportedFilters(): string[] {
    if (!this.sourceSelector) {
      return ['author', 'maintainer', 'scope', 'keywords', 'unstable', 'insecure'];
    }
    return this.sourceSelector.getSupportedFilters();
  }
}
