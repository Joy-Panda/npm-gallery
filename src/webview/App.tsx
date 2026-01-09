import React, { useState, useEffect, useRef } from 'react';
import { SearchBar } from './components/SearchBar';
import { SearchResults } from './components/SearchResults';
import { AdvancedSearch } from './components/AdvancedSearch';
import { useSearch } from './hooks/useSearch';
import { useVSCode } from './context/VSCodeContext';
import { buildQuery, extractBaseText, parseQueryToFilters } from './utils/queryParser';
import type { PackageInfo, SearchOptions, SearchSortBy } from '../types/package';

interface FilterState {
  // Common filters (for npm sources)
  author: string;
  maintainer: string;
  scope: string;
  keywords: string;
  // Maven-specific filters (for Sonatype source)
  groupId: string;
  artifactId: string;
  version: string;
  tags: string;
  // Libraries.io specific filters
  languages: string;
  licenses: string;
  platforms: string;
  // Package status filters
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
  groupId: '',
  artifactId: '',
  version: '',
  tags: '',
  languages: '',
  licenses: '',
  platforms: '',
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
  const { searchQuery, setSearchQuery, triggerSearch, searchResults, isLoading, error, sourceInfo, supportedSortOptions, supportedFilters } = useSearch();
  const { installPackage, postMessage } = useVSCode();
  
  // Track previous source to detect source changes
  const previousSourceRef = useRef<string | undefined>(sourceInfo.currentSource);
  
  // Clear filters and search input when source changes, then trigger search
  useEffect(() => {
    const previousSource = previousSourceRef.current;
    const currentSource = sourceInfo.currentSource;
    
    // If source has changed (and it's not the initial mount)
    if (previousSource !== undefined && previousSource !== currentSource) {
      // Clear filters
      setFilters(defaultFilters);
      
      // Clear filter parts from search input, keep only base query text
      // Example: "spring artifactId:guice" -> "spring"
      const baseText = extractBaseText(searchQuery);
      setSearchQuery(baseText);
      
      // Reset sort to default
      setSortBy('relevance');
      
      // Trigger search with the base query if it's not empty
      if (baseText.trim()) {
        // Use setTimeout to ensure state updates are applied before triggering search
        setTimeout(() => {
          triggerSearch('relevance');
        }, 0);
      }
    }
    
    // Update previous source reference
    previousSourceRef.current = currentSource;
  }, [sourceInfo.currentSource, searchQuery, setSearchQuery, triggerSearch]);

  const handlePackageSelect = (pkg: PackageInfo) => {
    // Send message to extension to open package details in editor panel
    postMessage({ type: 'openPackageDetails', packageName: pkg.name });
  };

  const handleInstall = (pkg: PackageInfo, type: 'dependencies' | 'devDependencies') => {
    installPackage(pkg.name, { type, version: pkg.version });
  };

  const handleCopy = (packageName: string, version: string) => {
    // For Maven/Gradle/SBT packages, send message to extension to get copy snippet
    // The extension will auto-detect build tool and generate appropriate snippet
    postMessage({ 
      type: 'copySnippet', 
      packageName, 
      options: { version, scope: 'compile' } 
      // format will be auto-detected by installService based on build tool
    });
  };

  // 1. When user types in Search Input
  const handleSearchBarChange = (newQuery: string) => {
    // Update search query immediately for responsive input
    setSearchQuery(newQuery);
    
    // Parse the query string and update filters (sort is handled separately)
    setFilters(parseQueryToFilters(newQuery));
  };

  // 2. When user modifies filters in AdvancedSearch panel
  const handleFilterChange = (newFilters: FilterState) => {
    setFilters(newFilters);
    
    // Extract base text from current search query (preserve user's text input)
    const baseText = extractBaseText(searchQuery);
    
    // Build new query string from base text and new filters (sort is handled separately)
    const newQuery = buildQuery({
      baseQuery: baseText,
      author: newFilters.author,
      maintainer: newFilters.maintainer,
      scope: newFilters.scope,
      keywords: newFilters.keywords,
      groupId: newFilters.groupId,
      artifactId: newFilters.artifactId,
      version: newFilters.version,
      tags: newFilters.tags,
      languages: newFilters.languages,
      licenses: newFilters.licenses,
      platforms: newFilters.platforms,
      excludeUnstable: newFilters.excludeUnstable,
      excludeInsecure: newFilters.excludeInsecure,
      includeUnstable: newFilters.includeUnstable,
      includeInsecure: newFilters.includeInsecure,
    });
    
    setSearchQuery(newQuery);
  };

  // 3. When user changes sort in SearchResults
  const handleSortChange = (newSortBy: SearchSortBy) => {
    setSortBy(newSortBy);
    // Sort is handled separately, no need to modify query string
    // Trigger search with new sort if there's an active query
    if (searchQuery.trim()) {
      triggerSearch(newSortBy);
    }
  };

  // Legacy handler for AdvancedSearch onApply (backward compatibility)
  const handleAdvancedSearch = (options: SearchOptions) => {
    setSearchOptions(options);
    // Parse query and update filters (sort is handled separately via options.sortBy)
    setSortBy(options.sortBy || 'relevance');
    setFilters(parseQueryToFilters(options.query));
    setSearchQuery(options.query);
    // Trigger search immediately when applying advanced search with the sort from options
    setTimeout(() => triggerSearch(options.sortBy || 'relevance'), 0);
  };

  return (
    <div className="app">
      <SearchBar
        value={searchQuery}
        onChange={handleSearchBarChange}
        onSearch={() => triggerSearch(sortBy)}
        isLoading={isLoading}
        onAdvancedSearchToggle={() => setIsAdvancedSearchOpen(!isAdvancedSearchOpen)}
        isAdvancedSearchOpen={isAdvancedSearchOpen}
        sourceInfo={sourceInfo}
      />
      <AdvancedSearch
        isOpen={isAdvancedSearchOpen}
        onApply={handleAdvancedSearch}
        currentOptions={searchOptions}
        filters={filters}
        onFilterChange={handleFilterChange}
        supportedFilters={supportedFilters}
        currentSource={sourceInfo.currentSource}
        onReset={() => {
          setFilters(defaultFilters);
          // Also clear filters from search query
          const baseText = extractBaseText(searchQuery);
          setSearchQuery(baseText);
        }}
        onApplyFilters={() => {
          // Build query with current filters and trigger search
          const baseText = extractBaseText(searchQuery);
          
          // Check if there are any filters
          const hasFilters = !!(
            filters.author ||
            filters.maintainer ||
            filters.scope ||
            filters.keywords ||
            filters.groupId ||
            filters.artifactId ||
            filters.tags ||
            filters.languages ||
            filters.licenses ||
            filters.platforms ||
            filters.excludeUnstable ||
            filters.excludeInsecure ||
            filters.includeUnstable ||
            filters.includeInsecure
          );
          
          const newQuery = buildQuery({
            baseQuery: baseText,
            author: filters.author,
            maintainer: filters.maintainer,
            scope: filters.scope,
            keywords: filters.keywords,
            groupId: filters.groupId,
            artifactId: filters.artifactId,
            tags: filters.tags,
            languages: filters.languages,
            licenses: filters.licenses,
            platforms: filters.platforms,
            excludeUnstable: filters.excludeUnstable,
            excludeInsecure: filters.excludeInsecure,
            includeUnstable: filters.includeUnstable,
            includeInsecure: filters.includeInsecure,
          });
          setSearchQuery(newQuery);
          // Trigger search if there's base query or filters
          if (baseText.trim() || hasFilters) {
            triggerSearch(sortBy);
          }
        }}
        onClose={() => setIsAdvancedSearchOpen(false)}
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
        supportedSortOptions={supportedSortOptions}
        currentProjectType={sourceInfo.currentProjectType}
        onCopy={handleCopy}
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
