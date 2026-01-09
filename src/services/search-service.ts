import type { PackageInfo, SearchResult, SearchOptions } from '../types/package';
import type { SourceSelector } from '../registry/source-selector';

/**
 * Service for package search
 * Uses source selector for multi-source support
 */
export class SearchService {
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
    const { query } = options;

    if (!query.trim()) {
      return { packages: [], total: 0, hasMore: false };
    }

    if (!this.sourceSelector) {
      throw new Error('SearchService not initialized: SourceSelector is required');
    }

    // Use source selector with fallback support
    return this.sourceSelector.executeWithFallback(
      adapter => adapter.search(options)
    );
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
      return ['author', 'maintainer', 'scope', 'keywords'];
    }
    return this.sourceSelector.getSupportedFilters();
  }
}
