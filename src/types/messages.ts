import type {
  PackageInfo,
  PackageDetails,
  SearchResult,
  InstallOptions,
  CopyOptions,
  PackageManager,
} from './package';
import type { ProjectType, SourceType } from './project';

/**
 * Messages sent from extension to webview
 */
export type ExtensionToWebviewMessage =
  | SearchResultsMessage
  | PackageDetailsMessage
  | InstallSuccessMessage
  | InstallErrorMessage
  | CopySuccessMessage
  | CopyErrorMessage
  | LoadingMessage
  | ErrorMessage
  | ConfigUpdateMessage
  | SourceInfoMessage;

export interface SearchResultsMessage {
  type: 'searchResults';
  data: SearchResult;
}

export interface PackageDetailsMessage {
  type: 'packageDetails';
  data: PackageDetails;
}

export interface InstallSuccessMessage {
  type: 'installSuccess';
  packageName: string;
  version: string;
}

export interface InstallErrorMessage {
  type: 'installError';
  packageName: string;
  error: string;
}

export interface CopySuccessMessage {
  type: 'copySuccess';
  packageName: string;
  message: string;
}

export interface CopyErrorMessage {
  type: 'copyError';
  packageName: string;
  error: string;
}

export interface LoadingMessage {
  type: 'loading';
  isLoading: boolean;
  message?: string;
}

export interface ErrorMessage {
  type: 'error';
  message: string;
  code?: string;
}

export interface ConfigUpdateMessage {
  type: 'configUpdate';
  config: {
    showBundleSize: boolean;
    showSecurityInfo: boolean;
    licenseWhitelist: string[];
    bundleSizeWarningThreshold: number;
  };
}

export interface SourceInfoMessage {
  type: 'sourceInfo';
  data: {
    currentProjectType: ProjectType;
    detectedPackageManager: PackageManager;
    installTarget?: {
      manifestPath: string;
      label: string;
      description: string;
      packageManager: string;
    };
    currentSource: SourceType;
    availableSources: SourceType[];
    supportedSortOptions: string[]; // For backward compatibility, contains values
    supportedSortOptionsWithLabels?: Array<{ value: string; label: string }>; // Full sort options with labels
    supportedFilters: string[]; // For backward compatibility, contains values
    supportedFiltersWithLabels?: Array<{ value: string; label: string; placeholder?: string }>; // Full filter options with labels and placeholders
    supportedCapabilities: string[]; // SourceCapability enum values as strings
    capabilitySupport: Record<string, {
      capability: string;
      supported: boolean;
      reason?: string;
    }>;
  };
}

/**
 * Messages sent from webview to extension
 */
export type WebviewToExtensionMessage =
  | SearchMessage
  | InstallPackageMessage
  | OpenExternalMessage
  | CopyToClipboardMessage
  | CopySnippetMessage
  | RefreshMessage
  | OpenPackageDetailsMessage
  | ReadyMessage
  | ChangeSourceMessage
  | GetSourceInfoMessage;

export interface SearchMessage {
  type: 'search';
  query: string;
  exactName?: string;
  from?: number;
  size?: number;
  sortBy?: string; // Sort value as string (extracted from SearchSortBy)
}

export interface InstallPackageMessage {
  type: 'install';
  packageName: string;
  options: InstallOptions;
}

export interface OpenExternalMessage {
  type: 'openExternal';
  url: string;
}

export interface CopyToClipboardMessage {
  type: 'copyToClipboard';
  text: string;
}

export interface CopySnippetMessage {
  type: 'copySnippet';
  packageName: string;
  options: CopyOptions;
}

export interface RefreshMessage {
  type: 'refresh';
}

export interface OpenPackageDetailsMessage {
  type: 'openPackageDetails';
  packageName: string;
}

export interface ReadyMessage {
  type: 'ready';
}

export interface ChangeSourceMessage {
  type: 'changeSource';
  source: SourceType;
}

export interface GetSourceInfoMessage {
  type: 'getSourceInfo';
}

/**
 * State for the webview
 */
export interface WebviewState {
  searchQuery: string;
  searchResults: PackageInfo[];
  selectedPackage: PackageDetails | null;
  isLoading: boolean;
  error: string | null;
  view: 'search' | 'details';
  // Source information
  currentProjectType: ProjectType;
  detectedPackageManager: PackageManager;
  currentSource: SourceType;
  availableSources: SourceType[];
  supportedSortOptions: string[];
  supportedFilters: string[];
}
