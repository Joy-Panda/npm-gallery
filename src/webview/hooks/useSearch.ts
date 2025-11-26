import { useState, useEffect, useCallback } from 'react';
import { useVSCode } from '../context/VSCodeContext';

/**
 * Hook for search functionality with debouncing
 */
export function useSearch() {
  const [searchQuery, setSearchQuery] = useState('');
  const { search, searchResults, isLoading, error } = useVSCode();

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim()) {
      return;
    }

    const timeoutId = setTimeout(() => {
      search(searchQuery);
    }, 300);

    return () => clearTimeout(timeoutId);
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
    searchResults,
    isLoading,
    error,
    loadMore,
  };
}
