import React from 'react';
import { Input } from './ui/input';
import type { SearchOptions, SearchFilter } from '../../types/package';
import { getFilterValue, getFilterLabel, getFilterPlaceholder } from '../../types/package';

// FilterState should match the one in App.tsx
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

interface AdvancedSearchProps {
  isOpen: boolean;
  onApply: (options: SearchOptions) => void;
  currentOptions?: SearchOptions;
  filters: FilterState; // Controlled from parent
  onFilterChange: (filters: FilterState) => void; // Callback to parent
  supportedFilters?: SearchFilter[]; // Supported filters from source
  currentSource?: string; // Current source type to determine if Package Status should be shown
  onReset?: () => void; // Callback to reset filters
  onApplyFilters?: () => void; // Callback to apply filters and close panel
  onClose?: () => void; // Callback to close the panel
}

export const AdvancedSearch: React.FC<AdvancedSearchProps> = ({
  isOpen,
  filters,
  onFilterChange,
  supportedFilters = [],
  currentSource,
  onReset,
  onApplyFilters,
  onClose,
}) => {
  if (!isOpen) return null;

  // Check if current source is npm (npm-registry or npms-io)
  const isNpmSource = currentSource === 'npm-registry';

  // Helper function: update a single field in filters
  const updateField = (field: keyof FilterState, value: any) => {
    onFilterChange({ ...filters, [field]: value });
  };

  // Get filter field value from FilterState
  const getFilterFieldValue = (filterValue: string): string => {
    // Direct mapping: filter value matches FilterState field name
    const field = filterValue as keyof FilterState;
    if (field && field in filters) {
      const value = filters[field];
      // Only return string values, convert boolean to empty string
      return typeof value === 'string' ? value : '';
    }
    return '';
  };

  // Set filter field value in FilterState
  const setFilterFieldValue = (filterValue: string, value: string) => {
    // Direct mapping: filter value matches FilterState field name
    const field = filterValue as keyof FilterState;
    if (field && field in filters) {
      updateField(field, value);
    }
  };

  return (
    <div className="advanced-search-panel">
      <div className="advanced-search-content">
        {/* Dynamic Filters based on source */}
        {supportedFilters.length > 0 && (
          <div className="search-section">
            <h4>Filters</h4>
            
            {supportedFilters.map((filter) => {
              const filterValue = getFilterValue(filter);
              const label = getFilterLabel(filter);
              const placeholder = getFilterPlaceholder(filter);
              const fieldValue = getFilterFieldValue(filterValue);

              return (
                <div key={filterValue} className="search-field">
                  <label className="field-label">{label}</label>
                  <Input
                    placeholder={placeholder}
                    value={fieldValue}
                    onChange={(e) => setFilterFieldValue(filterValue, e.target.value)}
                    className="advanced-input"
                  />
                </div>
              );
            })}
          </div>
        )}

        {/* Fallback: Show default filters if no supportedFilters provided */}
        {supportedFilters.length === 0 && (
          <div className="search-section">
            <h4>Filters</h4>
            
            <div className="search-field">
              <label className="field-label">Author</label>
              <Input
                placeholder="author username"
                value={filters.author}
                onChange={(e) => updateField('author', e.target.value)}
                className="advanced-input"
              />
            </div>

            <div className="search-field">
              <label className="field-label">Maintainer</label>
              <Input
                placeholder="maintainer username"
                value={filters.maintainer}
                onChange={(e) => updateField('maintainer', e.target.value)}
                className="advanced-input"
              />
            </div>

            <div className="search-field">
              <label className="field-label">Scope</label>
              <Input
                placeholder="scope (e.g., @foo/bar)"
                value={filters.scope}
                onChange={(e) => updateField('scope', e.target.value)}
                className="advanced-input"
              />
            </div>

            <div className="search-field">
              <label className="field-label">Keywords</label>
              <Input
                placeholder="keywords: Use + for AND, , for OR, - to exclude"
                value={filters.keywords}
                onChange={(e) => updateField('keywords', e.target.value)}
                className="advanced-input"
              />
            </div>
          </div>
        )}

        {/* Package Status - Only show for npm sources */}
        {isNpmSource && (
          <div className="search-section">
            <h4>Package Status</h4>
          
          <div className="checkbox-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={filters.excludeUnstable}
                onChange={(e) => {
                  const checked = e.target.checked;
                  updateField('excludeUnstable', checked);
                  if (checked) {
                    updateField('includeUnstable', false);
                  }
                }}
              />
              <span>Exclude unstable (&lt; 1.0.0)</span>
            </label>

            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={filters.excludeInsecure}
                onChange={(e) => {
                  const checked = e.target.checked;
                  updateField('excludeInsecure', checked);
                  if (checked) {
                    updateField('includeInsecure', false);
                  }
                }}
              />
              <span>Exclude insecure packages</span>
            </label>

            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={filters.includeUnstable}
                onChange={(e) => {
                  const checked = e.target.checked;
                  updateField('includeUnstable', checked);
                  if (checked) {
                    updateField('excludeUnstable', false);
                  }
                }}
              />
              <span>Show only unstable (&lt; 1.0.0)</span>
            </label>

            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={filters.includeInsecure}
                onChange={(e) => {
                  const checked = e.target.checked;
                  updateField('includeInsecure', checked);
                  if (checked) {
                    updateField('excludeInsecure', false);
                  }
                }}
              />
              <span>Show only insecure packages</span>
            </label>
          </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="search-actions">
          <button
            type="button"
            className="action-button reset-button"
            onClick={() => {
              if (onReset) {
                onReset();
              }
            }}
          >
            Reset
          </button>
          <button
            type="button"
            className="action-button apply-button"
            onClick={() => {
              if (onApplyFilters) {
                onApplyFilters();
              }
              if (onClose) {
                onClose();
              }
            }}
          >
            Apply
          </button>
        </div>
      </div>

      <style>{`
        .advanced-search-panel {
          background: var(--vscode-sideBar-background);
          border-top: 1px solid var(--vscode-widget-border);
          border-bottom: 1px solid var(--vscode-widget-border);
          animation: slideDown 0.2s ease-out;
        }

        .advanced-search-content {
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .search-section {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .search-section h4 {
          margin: 0;
          font-size: 12px;
          font-weight: 600;
          color: var(--vscode-foreground);
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .search-field {
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .search-field label,
        .field-label {
          font-size: 12px;
          color: var(--vscode-descriptionForeground);
          font-weight: 500;
          margin-bottom: 4px;
        }

        .field-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .helper-trigger {
          cursor: help;
          background: var(--vscode-badge-background);
          color: var(--vscode-badge-foreground);
          width: 14px;
          height: 14px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
        }

        .field-hint {
          font-size: 11px;
          color: var(--vscode-descriptionForeground);
          opacity: 0.8;
        }

        .advanced-input {
          width: 100%;
          padding-left: 12px !important;
          padding-right: 80px !important;
          height: 40px !important;
          border-radius: 10px !important;
          font-size: 13px !important;
          box-sizing: border-box;
        }

        .search-field small {
          font-size: 11px;
          color: var(--vscode-descriptionForeground);
          margin-top: -4px;
        }

        .checkbox-group, .radio-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .checkbox-label, .radio-label {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          font-size: 12px;
          color: var(--vscode-foreground);
        }

        .checkbox-label input[type="checkbox"],
        .radio-label input[type="radio"] {
          cursor: pointer;
        }

        .search-actions {
          display: flex;
          gap: 8px;
          justify-content: flex-end;
          padding-top: 8px;
          border-top: 1px solid var(--vscode-widget-border);
        }

        .action-button {
          padding: 8px 16px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          border: 1px solid var(--vscode-button-border, transparent);
          transition: all 0.15s ease;
        }

        .reset-button {
          background: var(--vscode-button-secondaryBackground);
          color: var(--vscode-button-secondaryForeground);
        }

        .reset-button:hover {
          background: var(--vscode-button-secondaryHoverBackground);
        }

        .apply-button {
          background: var(--vscode-button-background);
          color: var(--vscode-button-foreground);
        }

        .apply-button:hover {
          background: var(--vscode-button-hoverBackground);
        }

        @keyframes slideDown {
          from {
            opacity: 0;
            max-height: 0;
          }
          to {
            opacity: 1;
            max-height: 1000px;
          }
        }
      `}</style>
    </div>
  );
};
