import React from 'react';
import { Search, X, Loader2, Filter } from 'lucide-react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { SourceSelector } from './SourceSelector';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSearch?: () => void;
  isLoading?: boolean;
  onAdvancedSearchToggle?: () => void;
  isAdvancedSearchOpen?: boolean;
  showSourceSelector?: boolean;
}

export const SearchBar: React.FC<SearchBarProps> = ({ 
  value, 
  onChange, 
  onSearch,
  isLoading, 
  onAdvancedSearchToggle,
  isAdvancedSearchOpen = false,
  showSourceSelector = true
}) => {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && onSearch) {
      e.preventDefault();
      onSearch();
    }
  };

  return (
    <div className="search-container">
      {showSourceSelector && (
        <div className="search-header">
          <SourceSelector compact />
        </div>
      )}
      <div className="search-wrapper">
        <div className="search-icon">
          {isLoading ? (
            <Loader2 className="spinner" size={16} />
          ) : (
            <Search size={16} />
          )}
        </div>
        <Input
          type="text"
          placeholder="Search packages... (Press Enter to search)"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          className="search-input"
          autoFocus
        />
        <div className="search-actions">
          {value && (
            <Button
              variant="ghost"
              size="icon"
              className="clear-btn"
              onClick={() => onChange('')}
            >
              <X size={14} />
            </Button>
          )}
          {onAdvancedSearchToggle && (
            <Button
              variant="ghost"
              size="icon"
              className={`advanced-btn ${isAdvancedSearchOpen ? 'active' : ''}`}
              onClick={onAdvancedSearchToggle}
              title="Advanced Search"
            >
              <Filter size={16} />
            </Button>
          )}
        </div>
      </div>

      <style>{`
        .search-container {
          padding: 12px 16px 16px;
          position: sticky;
          top: 0;
          background: var(--vscode-sideBar-background);
          z-index: 100;
          border-bottom: 1px solid var(--vscode-widget-border);
        }

        .search-header {
          display: flex;
          justify-content: flex-end;
          margin-bottom: 8px;
        }

        .search-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }

        .search-icon {
          position: absolute;
          left: 12px;
          z-index: 1;
          display: flex;
          align-items: center;
          color: var(--vscode-input-placeholderForeground);
        }

        .search-icon .spinner {
          animation: spin 1s linear infinite;
          color: var(--vscode-button-background);
        }

        .search-input {
          padding-left: 38px !important;
          padding-right: 80px !important;
          height: 40px !important;
          border-radius: 10px !important;
          font-size: 13px !important;
        }

        .search-actions {
          position: absolute;
          right: 6px;
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .clear-btn, .advanced-btn {
          width: 26px !important;
          height: 26px !important;
          min-width: 26px !important;
          border-radius: 50% !important;
          padding: 0 !important;
        }

        .advanced-btn.active {
          background: var(--vscode-button-secondaryBackground);
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
