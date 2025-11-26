import React from 'react';
import { SearchBar } from './components/SearchBar';
import { SearchResults } from './components/SearchResults';
import { useSearch } from './hooks/useSearch';
import { useVSCode } from './context/VSCodeContext';
import type { PackageInfo } from '../types/package';

export const App: React.FC = () => {
  const { searchQuery, setSearchQuery, searchResults, isLoading, error } = useSearch();
  const { installPackage, postMessage } = useVSCode();

  const handlePackageSelect = (pkg: PackageInfo) => {
    // Send message to extension to open package details in editor panel
    postMessage({ type: 'openPackageDetails', packageName: pkg.name });
  };

  const handleInstall = (pkg: PackageInfo, type: 'dependencies' | 'devDependencies') => {
    installPackage(pkg.name, { type, version: pkg.version });
  };

  return (
    <div className="app">
      <SearchBar
        value={searchQuery}
        onChange={setSearchQuery}
        isLoading={isLoading}
      />
      {error && <div className="error-message">{error}</div>}
      <SearchResults
        packages={searchResults?.packages || []}
        total={searchResults?.total || 0}
        isLoading={isLoading}
        onPackageSelect={handlePackageSelect}
        onInstall={handleInstall}
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
