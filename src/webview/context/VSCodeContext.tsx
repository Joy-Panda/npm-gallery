import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import type { ExtensionToWebviewMessage, WebviewToExtensionMessage } from '../../types/messages';
import type { DependencyType, PackageManager, SearchResult, NuGetManagementStyle } from '../../types/package';
import { NUGET_MANAGEMENT_STYLE_LABELS } from '../../types/package';
import type { ProjectType, SourceType } from '../../types/project';
import { SOURCE_DISPLAY_NAMES, PROJECT_DISPLAY_NAMES } from '../../types/project';

interface VSCodeAPI {
  postMessage: (message: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
}

/** Persisted search state so sidebar keeps search when closed/reopened */
export interface PersistedSearchState {
  searchQuery?: string;
  filters?: Record<string, unknown>;
  sortBy?: string;
  searchResults?: SearchResult | null;
}

export interface SourceInfo {
  currentProjectType: ProjectType;
  detectedPackageManager: PackageManager;
  /** When NuGet: detected management style (Paket, CPM, etc.) */
  detectedNuGetStyle?: NuGetManagementStyle;
  installTarget?: {
    manifestPath: string;
    label: string;
    description: string;
    packageManager: string;
  };
  currentSource: SourceType;
  /** Workspace-style: project types in workspace (e.g. [npm, dotnet]) */
  detectedProjectTypes?: ProjectType[];
  availableSources: SourceType[];
  supportedSortOptions: string[]; // For backward compatibility
  supportedSortOptionsWithLabels?: Array<{ value: string; label: string }>; // Full sort options with labels
  supportedFilters: string[]; // For backward compatibility
  supportedFiltersWithLabels?: Array<{ value: string; label: string; placeholder?: string }>; // Full filter options with labels and placeholders
  supportedCapabilities: string[]; // SourceCapability enum values as strings
  capabilitySupport: Record<string, {
    capability: string;
    supported: boolean;
    reason?: string;
  }>;
}

interface VSCodeContextValue {
  // State
  isLoading: boolean;
  error: string | null;
  searchResults: SearchResult | null;
  /** Restored from getState() on mount; used to init search/filters/sort/results */
  persistedSearchState: PersistedSearchState | null;
  persistSearchState: (state: PersistedSearchState) => void;

  // Source information
  sourceInfo: SourceInfo;

  // Actions
  search: (
    query: string,
    from?: number,
    size?: number,
    sortBy?: string | { value: string; label: string } | 'relevance' | 'popularity' | 'quality' | 'maintenance' | 'name',
    exactName?: string
  ) => void;
  getPackageDetails?: (packageName: string) => void;
  installPackage: (packageName: string, options: { type: DependencyType | string; version?: string }) => void;
  openExternal: (url: string) => void;
  copyToClipboard: (text: string) => void;
  postMessage: (message: unknown) => void;
  
  // Source actions
  changeSource: (source: SourceType) => void;
  changeProjectType: (projectType: ProjectType) => void;
  refreshSourceInfo: () => void;
  
  // Helpers
  getSourceDisplayName: (source: SourceType) => string;
  getProjectTypeDisplayName: (type: ProjectType) => string;
  getDetectedNuGetStyleLabel: (style: NuGetManagementStyle | undefined) => string;
}

const defaultSourceInfo: SourceInfo = {
  currentProjectType: 'npm',
  detectedPackageManager: 'npm',
  installTarget: undefined,
  currentSource: 'npm-registry',
  availableSources: ['npm-registry'],
  supportedSortOptions: ['relevance', 'popularity', 'quality', 'maintenance', 'name'],
  supportedFilters: ['author', 'maintainer', 'scope', 'keywords'],
  supportedCapabilities: [],
  capabilitySupport: {},
};

const VSCodeContext = createContext<VSCodeContextValue | null>(null);

interface VSCodeProviderProps {
  vscode: VSCodeAPI;
  children: ReactNode;
}

function getInitialPersistedState(vscode: VSCodeAPI): PersistedSearchState | null {
  try {
    const raw = vscode.getState();
    if (raw && typeof raw === 'object' && 'search' in raw) {
      return (raw as { search: PersistedSearchState }).search;
    }
  } catch {
    // ignore
  }
  return null;
}

export const VSCodeProvider: React.FC<VSCodeProviderProps> = ({ vscode, children }) => {
  const [persistedSearchState] = useState<PersistedSearchState | null>(() => getInitialPersistedState(vscode));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResult | null>(() => {
    const init = getInitialPersistedState(vscode);
    return (init?.searchResults ?? null) as SearchResult | null;
  });
  const [sourceInfo, setSourceInfo] = useState<SourceInfo>(defaultSourceInfo);

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
        case 'installSuccess':
          // Could show a toast notification
          break;
        case 'installError':
          setError(message.error);
          break;
        case 'sourceInfo':
          setSourceInfo(message.data);
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    
    // Request source info on mount
    vscode.postMessage({ type: 'getSourceInfo' });
    
    return () => window.removeEventListener('message', handleMessage);
  }, [vscode]);

  // Post message helper
  const postMessage = useCallback(
    (message: WebviewToExtensionMessage) => {
      vscode.postMessage(message);
    },
    [vscode]
  );

  // Actions
  const search = useCallback(
    (
      query: string,
      from = 0,
      size = 20,
      sortBy?: string | { value: string; label: string } | 'relevance' | 'popularity' | 'quality' | 'maintenance' | 'name',
      exactName?: string
    ) => {
      setError(null);
      // Extract sort value from SearchSortBy (can be string or SortOption)
      const sortValue = typeof sortBy === 'string' ? sortBy : (typeof sortBy === 'object' ? sortBy?.value : sortBy);
      postMessage({ type: 'search', query, exactName, from, size, sortBy: sortValue });
    },
    [postMessage]
  );

  const getPackageDetails = useCallback(
    (packageName: string) => {
      setError(null);
      postMessage({ type: 'openPackageDetails', packageName });
    },
    [postMessage]
  );

  const installPackage = useCallback(
    (packageName: string, options: { type: DependencyType | string; version?: string }) => {
      postMessage({
        type: 'install',
        packageName,
        options: {
          type: options.type as DependencyType,
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

  // Source actions
  const changeSource = useCallback(
    (source: SourceType) => {
      postMessage({ type: 'changeSource', source });
    },
    [postMessage]
  );

  const refreshSourceInfo = useCallback(() => {
    postMessage({ type: 'getSourceInfo' });
  }, [postMessage]);

  const changeProjectType = useCallback(
    (projectType: ProjectType) => {
      postMessage({ type: 'changeProjectType', projectType });
    },
    [postMessage]
  );

  const persistSearchState = useCallback(
    (state: PersistedSearchState) => {
      try {
        const current = (vscode.getState() as Record<string, unknown>) ?? {};
        vscode.setState({ ...current, search: state });
      } catch {
        // ignore
      }
    },
    [vscode]
  );

  // Helpers
  const getSourceDisplayName = useCallback((source: SourceType): string => {
    return SOURCE_DISPLAY_NAMES[source] || source;
  }, []);

  const getProjectTypeDisplayName = useCallback((type: ProjectType): string => {
    return PROJECT_DISPLAY_NAMES[type] || type;
  }, []);

  const getDetectedNuGetStyleLabel = useCallback((style: NuGetManagementStyle | undefined): string => {
    return style ? (NUGET_MANAGEMENT_STYLE_LABELS[style] || style) : '';
  }, []);

  const value: VSCodeContextValue = {
    isLoading,
    error,
    searchResults,
    persistedSearchState,
    persistSearchState,
    sourceInfo,
    search,
    getPackageDetails,
    installPackage,
    openExternal,
    copyToClipboard,
    postMessage: (message: unknown) => vscode.postMessage(message),
    changeSource,
    changeProjectType,
    refreshSourceInfo,
    getSourceDisplayName,
    getProjectTypeDisplayName,
    getDetectedNuGetStyleLabel,
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
