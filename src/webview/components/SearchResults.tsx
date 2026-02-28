import React from 'react';
import { PackageCard } from './PackageCard';
import { Search, Loader2, Package, SortAsc } from 'lucide-react';
import { Badge } from './ui/badge';
import { Card } from './ui/card';
import { Separator } from './ui/separator';
import type { DependencyType, PackageInfo, SearchSortBy } from '../../types/package';

interface SearchResultsProps {
  packages: PackageInfo[];
  total: number;
  isLoading: boolean;
  onPackageSelect: (pkg: PackageInfo) => void;
  onInstall: (pkg: PackageInfo, type: DependencyType) => void;
  sortBy?: SearchSortBy;
  onSortChange?: (sortBy: SearchSortBy) => void;
  supportedSortOptions?: SearchSortBy[];
  supportedInstallTypes?: DependencyType[];
  showInstall?: boolean;
}

export const SearchResults: React.FC<SearchResultsProps> = ({
  packages,
  total,
  isLoading,
  onPackageSelect,
  onInstall,
  sortBy = 'relevance',
  onSortChange,
  supportedSortOptions = ['relevance'],
  supportedInstallTypes = ['dependencies'],
  showInstall = true,
}) => {
  // Loading state
  if (isLoading && packages.length === 0) {
    return (
      <div className="results-container">
        <div className="empty-state">
          <Card className="empty-icon loading">
            <Loader2 size={28} className="spinner" />
          </Card>
          <h3 className="empty-title">Searching packages...</h3>
          <p className="empty-description">Finding the best matches for you</p>
        </div>
        <style>{styles}</style>
      </div>
    );
  }

  // Empty state
  if (!isLoading && packages.length === 0) {
    return (
      <div className="results-container">
        <div className="empty-state">
          <Card className="empty-icon">
            <Search size={28} />
          </Card>
          <h3 className="empty-title">Search packages</h3>
          <p className="empty-description">
            Find packages by name, keywords, or description
          </p>
          <div className="suggestion-tags">
            <Badge variant="default">react</Badge>
            <Badge variant="default">typescript</Badge>
            <Badge variant="default">lodash</Badge>
            <Badge variant="default">axios</Badge>
          </div>
        </div>
        <style>{styles}</style>
      </div>
    );
  }

  return (
    <div className="results-container">
      {/* Results header */}
      <div className="results-header">
        <div className="results-info">
          <Package size={14} />
          <span><strong>{total.toLocaleString()}</strong> packages found</span>
        </div>
        <div className="results-controls">
          {onSortChange && (
            <div className="sort-control">
              <SortAsc size={14} />
              <select
                value={sortBy}
                onChange={(e) => onSortChange(e.target.value as SearchSortBy)}
                className="sort-select"
              >
                {supportedSortOptions.map((option) => (
                  <option key={option} value={option}>
                    {formatSortLabel(option)}
                  </option>
                ))}
              </select>
            </div>
          )}
          {packages.length < total && (
            <Badge variant="secondary">
              Showing {packages.length}
            </Badge>
          )}
        </div>
      </div>

      <Separator />

      {/* Results list */}
      <div className="results-list">
        {packages.map((pkg) => (
          <PackageCard
            key={pkg.name}
            package={pkg}
            onClick={() => onPackageSelect(pkg)}
            onInstall={(type) => onInstall(pkg, type)}
            supportedInstallTypes={supportedInstallTypes}
            showInstall={showInstall}
          />
        ))}
      </div>

      {/* Loading more */}
      {isLoading && packages.length > 0 && (
        <div className="loading-more">
          <Loader2 size={16} className="spinner" />
          <span>Loading more packages...</span>
        </div>
      )}

      <style>{styles}</style>
    </div>
  );
};

function formatSortLabel(option: SearchSortBy): string {
  switch (option) {
    case 'name':
      return 'Name (A-Z)';
    default:
      return option.charAt(0).toUpperCase() + option.slice(1);
  }
}

const styles = `
  .results-container {
    display: flex;
    flex-direction: column;
    flex: 1;
  }

  /* Empty / Loading State */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 24px;
    text-align: center;
  }

  .empty-icon {
    width: 72px;
    height: 72px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 18px;
    margin-bottom: 20px;
    color: var(--vscode-descriptionForeground);
  }

  .empty-icon.loading {
    background: linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(59, 130, 246, 0.05)) !important;
    color: var(--vscode-button-background);
    border-color: rgba(59, 130, 246, 0.3) !important;
  }

  .spinner {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .empty-title {
    margin: 0 0 8px 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--vscode-foreground);
  }

  .empty-description {
    margin: 0 0 20px 0;
    font-size: 13px;
    color: var(--vscode-descriptionForeground);
    max-width: 260px;
    line-height: 1.5;
  }

  .suggestion-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: center;
  }

  /* Results Header */
  .results-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 16px;
    background: var(--vscode-sideBarSectionHeader-background);
  }

  .results-info {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
  }

  .results-info strong {
    color: var(--vscode-foreground);
    font-weight: 600;
  }

  .results-controls {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .sort-control {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
  }

  .sort-select {
    background: var(--vscode-dropdown-background, var(--vscode-editor-background));
    color: var(--vscode-foreground);
    border: 1px solid var(--vscode-dropdown-border);
    border-radius: 4px;
    padding: 4px 8px;
    font-size: 12px;
    cursor: pointer;
    outline: none;
    appearance: none;
    -moz-appearance: none;
    -webkit-appearance: none;
  }

  .sort-select:hover {
    background: var(--vscode-list-hoverBackground);
  }

  .sort-select:focus {
    border-color: var(--vscode-focusBorder);
    background: var(--vscode-dropdown-background, var(--vscode-editor-background));
  }

  .sort-select option {
    background: var(--vscode-dropdown-background, var(--vscode-editor-background));
    color: var(--vscode-foreground);
  }

  .sort-select option:checked {
    background: var(--vscode-list-activeSelectionBackground);
    color: var(--vscode-list-activeSelectionForeground);
  }

  /* Results List */
  .results-list {
    display: flex;
    flex-direction: column;
  }

  /* Loading More */
  .loading-more {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 20px;
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
  }
`;
