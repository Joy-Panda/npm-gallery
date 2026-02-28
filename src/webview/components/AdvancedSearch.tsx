import React from 'react';
import { Input } from './ui/input';
import type { SearchOptions } from '../../types/package';

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

interface AdvancedSearchProps {
  isOpen: boolean;
  onApply: (options: SearchOptions) => void;
  currentOptions?: SearchOptions;
  filters: FilterState; // Controlled from parent
  onFilterChange: (filters: FilterState) => void; // Callback to parent
  supportedFilters?: string[];
}

export const AdvancedSearch: React.FC<AdvancedSearchProps> = ({
  isOpen,
  filters,
  onFilterChange,
  supportedFilters = [],
}) => {
  if (!isOpen) return null;

  // Helper function: update a single field in filters
  const updateField = (field: keyof FilterState, value: any) => {
    onFilterChange({ ...filters, [field]: value });
  };

  const supportsFilter = (filter: string): boolean => supportedFilters.includes(filter);

  return (
    <div className="advanced-search-panel">
      <div className="advanced-search-content">
        {/* Special Qualifiers */}
        <div className="search-section">
          <h4>Filters</h4>

          {supportsFilter('author') && (
            <div className="search-field">
              <Input
                placeholder="author username"
                value={filters.author}
                onChange={(e) => updateField('author', e.target.value)}
                className="advanced-input"
              />
            </div>
          )}

          {supportsFilter('maintainer') && (
            <div className="search-field">
              <Input
                placeholder="maintainer username"
                value={filters.maintainer}
                onChange={(e) => updateField('maintainer', e.target.value)}
                className="advanced-input"
              />
            </div>
          )}

          {supportsFilter('scope') && (
            <div className="search-field">
              <Input
                placeholder="scope (e.g., @foo/bar)"
                value={filters.scope}
                onChange={(e) => updateField('scope', e.target.value)}
                className="advanced-input"
              />
            </div>
          )}

          {supportsFilter('keywords') && (
            <div className="search-field">
              <Input
                placeholder="keywords: Use + for AND, , for OR, - to exclude (e.g., react,redux | comment+json | -eslint)"
                value={filters.keywords}
                onChange={(e) => updateField('keywords', e.target.value)}
                className="advanced-input"
              />
            </div>
          )}
        </div>

        {/* Package Status */}
        {(supportsFilter('deprecated') || supportsFilter('unstable')) && (
          <div className="search-section">
            <h4>Package Status</h4>

            <div className="checkbox-group">
              {supportsFilter('deprecated') && (
                <>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={filters.excludeDeprecated}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        updateField('excludeDeprecated', checked);
                        if (checked) {
                          updateField('includeDeprecated', false);
                        }
                      }}
                    />
                    <span>Exclude deprecated packages</span>
                  </label>

                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={filters.includeDeprecated}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        updateField('includeDeprecated', checked);
                        if (checked) {
                          updateField('excludeDeprecated', false);
                        }
                      }}
                    />
                    <span>Show only deprecated packages</span>
                  </label>
                </>
              )}

              {supportsFilter('unstable') && (
                <>
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
                </>
              )}
            </div>
          </div>
        )}

        {supportsFilter('insecure') && (
          <div className="search-section">
            <h4>Security</h4>

            <div className="checkbox-group">
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

        .search-field label {
          font-size: 12px;
          color: var(--vscode-descriptionForeground);
          font-weight: 500;
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
