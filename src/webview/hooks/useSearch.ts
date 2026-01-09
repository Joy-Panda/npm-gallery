import { useState, useCallback, useEffect } from 'react';
import { useVSCode, type SourceInfo } from '../context/VSCodeContext';
import { parseQuery, buildQuery } from '../utils/queryParser';
import type { SearchResult, SearchSortBy, SearchFilter } from '../../types/package';
import { createSortOption, createFilterOption } from '../../types/package';

/**
 * Hook for search functionality - manual trigger on Enter key
 */
export function useSearch(): {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  triggerSearch: (sortBy?: SearchSortBy) => void;
  searchResults: SearchResult | null;
  isLoading: boolean;
  error: string | null;
  loadMore: (sortBy?: SearchSortBy) => void;
  sourceInfo: SourceInfo;
  supportedSortOptions: SearchSortBy[];
  supportedFilters: SearchFilter[];
} {
  const [searchQuery, setSearchQuery] = useState('');
  const { search, searchResults, isLoading, error, sourceInfo, refreshSourceInfo } = useVSCode();

  // Refresh source info on mount
  useEffect(() => {
    refreshSourceInfo();
  }, [refreshSourceInfo]);

  // Manual search trigger function
  // sortBy is passed as parameter, not parsed from query string
  const triggerSearch = useCallback((sortBy?: SearchSortBy) => {
    const parsed = parseQuery(searchQuery);

    // Check if there are any filters or base query
    const hasBaseQuery = parsed.baseQuery && parsed.baseQuery.trim().length > 0;
    const hasFilters = !!(
      parsed.author ||
      parsed.maintainer ||
      parsed.scope ||
      parsed.keywords ||
      parsed.groupId ||
      parsed.artifactId ||
      parsed.tags ||
      parsed.languages ||
      parsed.licenses ||
      parsed.platforms ||
      parsed.excludeUnstable ||
      parsed.excludeInsecure ||
      parsed.includeUnstable ||
      parsed.includeInsecure
    );

    // Allow search if there's a base query OR filters
    if (!hasBaseQuery && !hasFilters) {
      return;
    }

    const searchText = buildQuery({
      baseQuery: parsed.baseQuery,
      author: parsed.author,
      maintainer: parsed.maintainer,
      scope: parsed.scope,
      keywords: parsed.keywords,
      groupId: parsed.groupId,
      artifactId: parsed.artifactId,
      tags: parsed.tags,
      languages: parsed.languages,
      licenses: parsed.licenses,
      platforms: parsed.platforms,
      excludeUnstable: parsed.excludeUnstable,
      excludeInsecure: parsed.excludeInsecure,
      includeUnstable: parsed.includeUnstable,
      includeInsecure: parsed.includeInsecure,
    });

    // Sort is passed separately, not from query string
    search(searchText, 0, 20, sortBy || 'relevance');
  }, [searchQuery, search]);

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  const loadMore = useCallback((sortBy?: SearchSortBy) => {
    if (searchResults && searchResults.hasMore) {
      // Load more with same query and sort
      search(searchQuery, searchResults.packages.length, 20, sortBy || 'relevance');
    }
  }, [search, searchQuery, searchResults]);

  // Convert supportedSortOptions to SearchSortBy[]
  const supportedSortOptions: SearchSortBy[] = sourceInfo.supportedSortOptionsWithLabels
    ? sourceInfo.supportedSortOptionsWithLabels.map(opt => createSortOption(opt.value, opt.label))
    : sourceInfo.supportedSortOptions.map(opt => opt as SearchSortBy);

  // Convert supportedFilters to SearchFilter[]
  const supportedFilters: SearchFilter[] = sourceInfo.supportedFiltersWithLabels
    ? sourceInfo.supportedFiltersWithLabels.map(filter => createFilterOption(filter.value, filter.label, filter.placeholder))
    : sourceInfo.supportedFilters.map(filter => filter as SearchFilter);

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
    supportedSortOptions,
    supportedFilters,
  };
}
