import React, { useEffect, useState } from 'react';
import { SearchBar } from './components/SearchBar';
import { SearchResults } from './components/SearchResults';
import { AdvancedSearch } from './components/AdvancedSearch';
import { useSearch } from './hooks/useSearch';
import { useVSCode } from './context/VSCodeContext';
import { parseQuery, buildQuery, extractBaseText, parseQueryToFilters } from './utils/queryParser';
import type { DependencyType, PackageInfo, SearchOptions, SearchSortBy } from '../types/package';

interface FilterState {
  author: string;
  maintainer: string;
  scope: string;
  keywords: string;
  excludeDeprecated: boolean;
  includeDeprecated: boolean;
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
  excludeDeprecated: false,
  includeDeprecated: false,
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
  const {
    searchQuery,
    setSearchQuery,
    triggerSearch,
    searchResults,
    isLoading,
    error,
    supportedSortOptions,
    supportedFilters,
    sourceInfo,
  } = useSearch();
  const { installPackage, postMessage } = useVSCode();

  const availableSortOptions = supportedSortOptions as SearchSortBy[];
  const sourceHint = buildSourceHint(
    availableSortOptions,
    supportedFilters,
    sourceInfo.detectedPackageManager,
    sourceInfo.installTarget
  );
  const canInstall = sourceInfo.supportedCapabilities.includes('installation');
  const supportedInstallTypes: DependencyType[] =
    sourceInfo.currentProjectType === 'npm'
      ? ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']
      : ['dependencies'];

  const handlePackageSelect = (pkg: PackageInfo) => {
    // Send message to extension to open package details in editor panel
    postMessage({ type: 'openPackageDetails', packageName: pkg.name });
  };

  const handleInstall = (pkg: PackageInfo, type: DependencyType) => {
    installPackage(pkg.name, { type, version: pkg.version });
  };

  // 1. When user types in Search Input
  const handleSearchBarChange = (newQuery: string) => {
    // Update search query immediately for responsive input
    setSearchQuery(newQuery);
    
    // Parse the query string and update filters/sort
    const parsed = parseQuery(newQuery);
    const nextSort = parsed.sortBy || 'relevance';
    setSortBy(
      availableSortOptions.includes(nextSort)
        ? nextSort
        : (availableSortOptions[0] || 'relevance')
    );
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
    if (!availableSortOptions.includes(newSortBy)) {
      return;
    }
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
    const nextSort = parsed.sortBy || 'relevance';
    setSortBy(
      availableSortOptions.includes(nextSort)
        ? nextSort
        : (availableSortOptions[0] || 'relevance')
    );
    setFilters(parseQueryToFilters(options.query));
    setSearchQuery(options.query);
    // Trigger search immediately when applying advanced search
    setTimeout(() => triggerSearch(), 0);
  };

  useEffect(() => {
    if (!availableSortOptions.includes(sortBy)) {
      setSortBy(availableSortOptions[0] || 'relevance');
    }
  }, [availableSortOptions, sortBy]);

  useEffect(() => {
    setFilters((current) => ({
      ...current,
      author: supportedFilters.includes('author') ? current.author : '',
      maintainer: supportedFilters.includes('maintainer') ? current.maintainer : '',
      scope: supportedFilters.includes('scope') ? current.scope : '',
      keywords: supportedFilters.includes('keywords') ? current.keywords : '',
      excludeDeprecated: supportedFilters.includes('deprecated') ? current.excludeDeprecated : false,
      includeDeprecated: supportedFilters.includes('deprecated') ? current.includeDeprecated : false,
      excludeUnstable: supportedFilters.includes('unstable') ? current.excludeUnstable : false,
      includeUnstable: supportedFilters.includes('unstable') ? current.includeUnstable : false,
      excludeInsecure: supportedFilters.includes('insecure') ? current.excludeInsecure : false,
      includeInsecure: supportedFilters.includes('insecure') ? current.includeInsecure : false,
    }));
    setIsAdvancedSearchOpen((open) => open && supportedFilters.length > 0);
  }, [supportedFilters]);

  return (
    <div className="app">
      <SearchBar
        value={searchQuery}
        onChange={handleSearchBarChange}
        onSearch={triggerSearch}
        isLoading={isLoading}
        onAdvancedSearchToggle={
          supportedFilters.length > 0 ? () => setIsAdvancedSearchOpen(!isAdvancedSearchOpen) : undefined
        }
        isAdvancedSearchOpen={isAdvancedSearchOpen}
        sourceHint={sourceHint}
      />
      <AdvancedSearch
        isOpen={isAdvancedSearchOpen}
        onApply={handleAdvancedSearch}
        currentOptions={searchOptions}
        filters={filters}
        onFilterChange={handleFilterChange}
        supportedFilters={supportedFilters}
      />
      {error && <div className="error-message">{error}</div>}
      <SearchResults
        packages={searchResults?.packages || []}
        total={searchResults?.total || 0}
        isLoading={isLoading}
        onPackageSelect={handlePackageSelect}
        onInstall={handleInstall}
        sortBy={sortBy}
        onSortChange={availableSortOptions.length > 1 ? handleSortChange : undefined}
        supportedSortOptions={availableSortOptions}
        supportedInstallTypes={supportedInstallTypes}
        showInstall={canInstall}
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

function buildSourceHint(
  sortOptions: SearchSortBy[],
  filters: string[],
  packageManager?: string,
  installTarget?: { label: string; description: string; packageManager: string }
): string {
  const sortLabels = sortOptions.map((option) => {
    switch (option) {
      case 'quality':
        return 'quality score';
      case 'maintenance':
        return 'maintenance score';
      case 'name':
        return 'name (A-Z)';
      default:
        return option;
    }
  });

  const filterLabels = filters.map((filter) => {
    switch (filter) {
      case 'unstable':
        return 'stable/unstable';
      case 'deprecated':
        return 'deprecated';
      case 'insecure':
        return 'secure/insecure';
      default:
        return filter;
    }
  });

  const sortsText = sortLabels.length > 0 ? sortLabels.join(', ') : 'none';
  const filtersText = filterLabels.length > 0 ? filterLabels.join(', ') : 'none';
  const managerText = packageManager ? ` Detected package manager: ${packageManager}.` : '';
  const installText = installTarget
    ? ` Install target: ${installTarget.label} (${installTarget.packageManager})${installTarget.description ? ` - ${installTarget.description}` : ''}.`
    : '';
  return `Current source supports sorts: ${sortsText}. Filters: ${filtersText}.${managerText}${installText}`;
}
