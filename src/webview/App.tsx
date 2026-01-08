import React, { useState } from 'react';
import { SearchBar } from './components/SearchBar';
import { SearchResults } from './components/SearchResults';
import { AdvancedSearch } from './components/AdvancedSearch';
import { useSearch } from './hooks/useSearch';
import { useVSCode } from './context/VSCodeContext';
import { parseQuery, buildQuery, extractBaseText, parseQueryToFilters } from './utils/queryParser';
import type { PackageInfo, SearchOptions, SearchSortBy } from '../types/package';

interface FilterState {
  author: string;
  maintainer: string;
  scope: string;
  keywords: string;
  excludeUnstable: boolean;
  excludeInsecure: boolean;
  includeUnstable: boolean;
  includeInsecure: boolean;
}

const defaultFilters: FilterState = {
  author: '',
  maintainer: '',
  scope: '',
  keywords: '',
  excludeUnstable: false,
  excludeInsecure: false,
  includeUnstable: false,
  includeInsecure: false,
};

export const App: React.FC = () => {
  const [isAdvancedSearchOpen, setIsAdvancedSearchOpen] = useState(false);
  const [searchOptions, setSearchOptions] = useState<SearchOptions | undefined>();
  const [sortBy, setSortBy] = useState<SearchSortBy>('relevance');
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  
  // Get searchQuery from useSearch hook (this is used for actual searching)
  const { searchQuery, setSearchQuery, searchResults, isLoading, error } = useSearch();
  const { installPackage, postMessage } = useVSCode();

  const handlePackageSelect = (pkg: PackageInfo) => {
    // Send message to extension to open package details in editor panel
    postMessage({ type: 'openPackageDetails', packageName: pkg.name });
  };

  const handleInstall = (pkg: PackageInfo, type: 'dependencies' | 'devDependencies') => {
    installPackage(pkg.name, { type, version: pkg.version });
  };

  // 1. When user types in Search Input
  const handleSearchBarChange = (newQuery: string) => {
    // Update search query immediately for responsive input
    setSearchQuery(newQuery);
    
    // Parse the query string and update filters/sort
    const parsed = parseQuery(newQuery);
    setSortBy(parsed.sortBy || 'relevance');
    setFilters(parseQueryToFilters(newQuery));
  };

  // 2. When user modifies filters in AdvancedSearch panel
  const handleFilterChange = (newFilters: FilterState) => {
    setFilters(newFilters);
    
    // Extract base text from current search query (preserve user's text input)
    const baseText = extractBaseText(searchQuery);
    
    // Build new query string from base text and new filters
    const newQuery = buildQuery({
      baseQuery: baseText,
      ...newFilters,
      sortBy: sortBy,
    });
    
    setSearchQuery(newQuery);
  };

  // 3. When user changes sort in SearchResults
  const handleSortChange = (newSortBy: SearchSortBy) => {
    setSortBy(newSortBy);
    
    // Extract base text from current search query
    const baseText = extractBaseText(searchQuery);
    
    // Build new query string with new sort
    const newQuery = buildQuery({
      baseQuery: baseText,
      ...filters,
      sortBy: newSortBy,
    });
    
    setSearchQuery(newQuery);
  };

  // Legacy handler for AdvancedSearch onApply (backward compatibility)
  const handleAdvancedSearch = (options: SearchOptions) => {
    setSearchOptions(options);
    const parsed = parseQuery(options.query);
    setSortBy(parsed.sortBy || 'relevance');
    setFilters(parseQueryToFilters(options.query));
    setSearchQuery(options.query);
  };

  return (
    <div className="app">
      <SearchBar
        value={searchQuery}
        onChange={handleSearchBarChange}
        isLoading={isLoading}
        onAdvancedSearchToggle={() => setIsAdvancedSearchOpen(!isAdvancedSearchOpen)}
        isAdvancedSearchOpen={isAdvancedSearchOpen}
      />
      <AdvancedSearch
        isOpen={isAdvancedSearchOpen}
        onApply={handleAdvancedSearch}
        currentOptions={searchOptions}
        filters={filters}
        onFilterChange={handleFilterChange}
      />
      {error && <div className="error-message">{error}</div>}
      <SearchResults
        packages={searchResults?.packages || []}
        total={searchResults?.total || 0}
        isLoading={isLoading}
        onPackageSelect={handlePackageSelect}
        onInstall={handleInstall}
        sortBy={sortBy}
        onSortChange={handleSortChange}
      />

      <style>{`
        .app {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
        }

        .error-message {
          padding: 8px 12px;
          margin: 0 8px 8px 8px;
          background: var(--vscode-inputValidation-errorBackground);
          border: 1px solid var(--vscode-inputValidation-errorBorder);
          border-radius: 2px;
          color: var(--vscode-inputValidation-errorForeground);
          font-size: 12px;
        }
      `}</style>
    </div>
  );
};
