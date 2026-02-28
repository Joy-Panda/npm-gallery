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

    const supportsFilter = (filter: string) => sourceInfo.supportedFilters.includes(filter);
    const searchText = buildQuery({
      baseQuery: parsed.baseQuery,
      author: supportsFilter('author') ? parsed.author : undefined,
      maintainer: supportsFilter('maintainer') ? parsed.maintainer : undefined,
      scope: supportsFilter('scope') ? parsed.scope : undefined,
      keywords: supportsFilter('keywords') ? parsed.keywords : undefined,
      groupId: parsed.groupId,
      artifactId: parsed.artifactId,
      tags: parsed.tags,
      languages: parsed.languages,
      licenses: parsed.licenses,
      platforms: parsed.platforms,
      excludeDeprecated: supportsFilter('deprecated') ? parsed.excludeDeprecated : undefined,
      includeDeprecated: supportsFilter('deprecated') ? parsed.includeDeprecated : undefined,
      excludeUnstable: supportsFilter('unstable') ? parsed.excludeUnstable : undefined,
      excludeInsecure: supportsFilter('insecure') ? parsed.excludeInsecure : undefined,
      includeUnstable: supportsFilter('unstable') ? parsed.includeUnstable : undefined,
      includeInsecure: supportsFilter('insecure') ? parsed.includeInsecure : undefined,
      boostExact: parsed.boostExact,
    });

    // Use sortBy parameter if provided, otherwise use default
    const selectedSort = sortBy || 'relevance';
    const effectiveSort = sourceInfo.supportedSortOptions.includes(typeof selectedSort === 'string' ? selectedSort : selectedSort.value)
      ? (typeof selectedSort === 'string' ? selectedSort : selectedSort.value)
      : (sourceInfo.supportedSortOptions[0] || 'relevance');

    search(searchText, 0, 20, effectiveSort, parsed.exactName);
  }, [searchQuery, search, sourceInfo.supportedSortOptions, sourceInfo.supportedFilters]);

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  const loadMore = useCallback((sortBy?: SearchSortBy) => {
    if (searchResults && searchResults.hasMore) {
      const parsed = parseQuery(searchQuery);
      const effectiveSort = sortBy 
        ? (typeof sortBy === 'string' ? sortBy : sortBy.value)
        : undefined;
      search(searchQuery, searchResults.packages.length, 20, effectiveSort, parsed.exactName);
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
