import { useState, useCallback } from 'react';
import { useVSCode } from '../context/VSCodeContext';
import { parseQuery, buildQuery } from '../utils/queryParser';

/**
 * Hook for search functionality - manual trigger on Enter key
 */
export function useSearch() {
  const [searchQuery, setSearchQuery] = useState('');
  const { search, searchResults, isLoading, error } = useVSCode();

  // Manual search trigger function
  const triggerSearch = useCallback(() => {
    if (!searchQuery.trim()) {
      return;
    }

    const parsed = parseQuery(searchQuery);

    const searchText = buildQuery({
      baseQuery: parsed.baseQuery,
      author: parsed.author,
      maintainer: parsed.maintainer,
      scope: parsed.scope,
      keywords: parsed.keywords,
      excludeUnstable: parsed.excludeUnstable,
      excludeInsecure: parsed.excludeInsecure,
      includeUnstable: parsed.includeUnstable,
      includeInsecure: parsed.includeInsecure,
      // sort is passed separately
    });

    search(searchText, 0, 20, parsed.sortBy || 'relevance');
  }, [searchQuery, search]);

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  const loadMore = useCallback(() => {
    if (searchResults && searchResults.hasMore) {
      search(searchQuery, searchResults.packages.length);
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
  };
}
