import type { PackageManager } from './package';

/**
 * Extension configuration
 */
export interface ExtensionConfig {
  defaultRegistry: string;
  packageManager: PackageManager;
  showBundleSize: boolean;
  showSecurityInfo: boolean;
  autoCheckUpdates: boolean;
  licenseWhitelist: string[];
  bundleSizeWarningThreshold: number;
  cacheTimeout: number;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: ExtensionConfig = {
  defaultRegistry: 'https://registry.npmjs.org',
  packageManager: 'npm',
  showBundleSize: true,
  showSecurityInfo: true,
  autoCheckUpdates: true,
  licenseWhitelist: ['MIT', 'Apache-2.0', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause'],
  bundleSizeWarningThreshold: 100,
  cacheTimeout: 3600,
};

/**
 * API endpoints
 */
export const API_ENDPOINTS = {
  NPM_REGISTRY: 'https://registry.npmjs.org',
  NPM_API: 'https://api.npmjs.org',
  NPMS_API: 'https://api.npms.io/v2',
  BUNDLEPHOBIA: 'https://bundlephobia.com/api',
  GITHUB_API: 'https://api.github.com',
  OSV_API: 'https://api.osv.dev',
} as const;

/**
 * Cache TTL values in milliseconds
 */
export const CACHE_TTL = {
  SEARCH_RESULTS: 5 * 60 * 1000, // 5 minutes
  PACKAGE_INFO: 60 * 60 * 1000, // 1 hour
  PACKAGE_VERSIONS: 30 * 60 * 1000, // 30 minutes
  BUNDLE_SIZE: 24 * 60 * 60 * 1000, // 24 hours
  DOWNLOAD_STATS: 60 * 60 * 1000, // 1 hour
  SECURITY_AUDIT: 15 * 60 * 1000, // 15 minutes
} as const;
