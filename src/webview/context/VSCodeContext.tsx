import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import type { ExtensionToWebviewMessage, WebviewToExtensionMessage } from '../../types/messages';
import type { SearchResult, PackageDetails } from '../../types/package';

interface VSCodeAPI {
  postMessage: (message: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
}

interface VSCodeContextValue {
  // State
  isLoading: boolean;
  error: string | null;
  searchResults: SearchResult | null;
  packageDetails: PackageDetails | null;

  // Actions
  search: (query: string, from?: number, size?: number, sortBy?: 'relevance' | 'popularity' | 'quality' | 'maintenance' | 'name') => void;
  getPackageDetails: (packageName: string) => void;
  installPackage: (packageName: string, options: { type: string; version?: string }) => void;
  openExternal: (url: string) => void;
  copyToClipboard: (text: string) => void;
  postMessage: (message: unknown) => void;
}

const VSCodeContext = createContext<VSCodeContextValue | null>(null);

interface VSCodeProviderProps {
  vscode: VSCodeAPI;
  children: ReactNode;
}

export const VSCodeProvider: React.FC<VSCodeProviderProps> = ({ vscode, children }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResult | null>(null);
  const [packageDetails, setPackageDetails] = useState<PackageDetails | null>(null);

  // Handle messages from extension
  useEffect(() => {
    const handleMessage = (event: MessageEvent<ExtensionToWebviewMessage>) => {
      const message = event.data;

      switch (message.type) {
        case 'loading':
          setIsLoading(message.isLoading);
          break;
        case 'error':
          setError(message.message);
          setIsLoading(false);
          break;
        case 'searchResults':
          setSearchResults(message.data);
          setError(null);
          break;
        case 'packageDetails':
          setPackageDetails(message.data);
          setError(null);
          break;
        case 'installSuccess':
          // Could show a toast notification
          break;
        case 'installError':
          setError(message.error);
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Post message helper
  const postMessage = useCallback(
    (message: WebviewToExtensionMessage) => {
      vscode.postMessage(message);
    },
    [vscode]
  );

  // Actions
  const search = useCallback(
    (query: string, from = 0, size = 20, sortBy?: 'relevance' | 'popularity' | 'quality' | 'maintenance' | 'name') => {
      setError(null);
      postMessage({ type: 'search', query, from, size, sortBy });
    },
    [postMessage]
  );

  const getPackageDetails = useCallback(
    (packageName: string) => {
      setError(null);
      setPackageDetails(null);
      postMessage({ type: 'getPackageDetails', packageName });
    },
    [postMessage]
  );

  const installPackage = useCallback(
    (packageName: string, options: { type: string; version?: string }) => {
      postMessage({
        type: 'install',
        packageName,
        options: {
          type: options.type as 'dependencies' | 'devDependencies' | 'peerDependencies',
          version: options.version,
        },
      });
    },
    [postMessage]
  );

  const openExternal = useCallback(
    (url: string) => {
      postMessage({ type: 'openExternal', url });
    },
    [postMessage]
  );

  const copyToClipboard = useCallback(
    (text: string) => {
      postMessage({ type: 'copyToClipboard', text });
    },
    [postMessage]
  );

  const value: VSCodeContextValue = {
    isLoading,
    error,
    searchResults,
    packageDetails,
    search,
    getPackageDetails,
    installPackage,
    openExternal,
    copyToClipboard,
    postMessage: (message: unknown) => vscode.postMessage(message),
  };

  return <VSCodeContext.Provider value={value}>{children}</VSCodeContext.Provider>;
};

export const useVSCode = (): VSCodeContextValue => {
  const context = useContext(VSCodeContext);
  if (!context) {
    throw new Error('useVSCode must be used within a VSCodeProvider');
  }
  return context;
};
