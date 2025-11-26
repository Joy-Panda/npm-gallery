import type {
  PackageInfo,
  PackageDetails,
  SearchResult,
  InstallOptions,
} from './package';

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
  | ConfigUpdateMessage;

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

/**
 * Messages sent from webview to extension
 */
export type WebviewToExtensionMessage =
  | SearchMessage
  | GetPackageDetailsMessage
  | InstallPackageMessage
  | OpenExternalMessage
  | CopyToClipboardMessage
  | RefreshMessage
  | OpenPackageDetailsMessage
  | ReadyMessage;

export interface SearchMessage {
  type: 'search';
  query: string;
  from?: number;
  size?: number;
}

export interface GetPackageDetailsMessage {
  type: 'getPackageDetails';
  packageName: string;
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
}
