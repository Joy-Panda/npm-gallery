import { useState, useCallback, useEffect } from 'react';
import { useVSCode, type SourceInfo } from '../context/VSCodeContext';
import { parseQuery, buildQuery } from '../utils/queryParser';
import type { SearchResult } from '../../types/package';

/**
 * Hook for search functionality - manual trigger on Enter key
 */
export function useSearch(): {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  triggerSearch: () => void;
  searchResults: SearchResult | null;
  isLoading: boolean;
  error: string | null;
  loadMore: () => void;
  sourceInfo: SourceInfo;
  supportedSortOptions: string[];
  supportedFilters: string[];
} {
  const [searchQuery, setSearchQuery] = useState('');
  const { search, searchResults, isLoading, error, sourceInfo, refreshSourceInfo } = useVSCode();

  // Refresh source info on mount
  useEffect(() => {
    refreshSourceInfo();
  }, [refreshSourceInfo]);

  // Manual search trigger function
  const triggerSearch = useCallback(() => {
    if (!searchQuery.trim()) {
      return;
    }

    const parsed = parseQuery(searchQuery);

    const supportsFilter = (filter: string) => sourceInfo.supportedFilters.includes(filter);
    const searchText = buildQuery({
      baseQuery: parsed.baseQuery,
      author: supportsFilter('author') ? parsed.author : undefined,
      maintainer: supportsFilter('maintainer') ? parsed.maintainer : undefined,
      scope: supportsFilter('scope') ? parsed.scope : undefined,
      keywords: supportsFilter('keywords') ? parsed.keywords : undefined,
      excludeDeprecated: supportsFilter('deprecated') ? parsed.excludeDeprecated : undefined,
      includeDeprecated: supportsFilter('deprecated') ? parsed.includeDeprecated : undefined,
      excludeUnstable: supportsFilter('unstable') ? parsed.excludeUnstable : undefined,
      excludeInsecure: supportsFilter('insecure') ? parsed.excludeInsecure : undefined,
      includeUnstable: supportsFilter('unstable') ? parsed.includeUnstable : undefined,
      includeInsecure: supportsFilter('insecure') ? parsed.includeInsecure : undefined,
      // sort is passed separately
    });

    const selectedSort = parsed.sortBy || 'relevance';
    const effectiveSort = sourceInfo.supportedSortOptions.includes(selectedSort)
      ? selectedSort
      : (sourceInfo.supportedSortOptions[0] as typeof selectedSort | undefined) || 'relevance';

    search(searchText, 0, 20, effectiveSort, parsed.exactName);
  }, [searchQuery, search, sourceInfo.supportedSortOptions]);

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  const loadMore = useCallback(() => {
    if (searchResults && searchResults.hasMore) {
      const parsed = parseQuery(searchQuery);
      search(searchQuery, searchResults.packages.length, 20, undefined, parsed.exactName);
    }
  }, [search, searchQuery, searchResults]);

  return {
    searchQuery,
    setSearchQuery: handleSearch,
    triggerSearch,
    searchResults,
    isLoading,
    error,
    loadMore,
    // Source info
    sourceInfo,
    supportedSortOptions: sourceInfo.supportedSortOptions,
    supportedFilters: sourceInfo.supportedFilters,
  };
}
