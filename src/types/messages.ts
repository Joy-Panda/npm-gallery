import type {
  PackageInfo,
  PackageDetails,
  SearchResult,
  InstallOptions,
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
    supportedSortOptions: string[];
    supportedFilters: string[];
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
  sortBy?: 'relevance' | 'popularity' | 'quality' | 'maintenance' | 'name';
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
