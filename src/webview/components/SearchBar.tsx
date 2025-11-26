import React from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { Input } from './ui/input';
import { Button } from './ui/button';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  isLoading?: boolean;
}

export const SearchBar: React.FC<SearchBarProps> = ({ value, onChange, isLoading }) => {
  return (
    <div className="search-container">
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
          placeholder="Search npm packages..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="search-input"
          autoFocus
        />
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
      </div>

      <style>{`
        .search-container {
          padding: 16px;
          position: sticky;
          top: 0;
          background: var(--vscode-sideBar-background);
          z-index: 100;
          border-bottom: 1px solid var(--vscode-widget-border);
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
          padding-right: 40px !important;
          height: 40px !important;
          border-radius: 10px !important;
          font-size: 13px !important;
        }

        .clear-btn {
          position: absolute;
          right: 6px;
          width: 26px !important;
          height: 26px !important;
          min-width: 26px !important;
          border-radius: 50% !important;
          padding: 0 !important;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
