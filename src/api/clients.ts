import { NpmRegistryClient } from './npm-registry';
import { NpmsApiClient } from './npms-api';
import { BundlephobiaClient } from './bundlephobia';
import { NpmAuditClient } from './npm-audit';

/**
 * All API clients
 */
export interface ApiClients {
  npmRegistry: NpmRegistryClient;
  npms: NpmsApiClient;
  bundlephobia: BundlephobiaClient;
  audit: NpmAuditClient;
}

// Singleton instances
let apiClients: ApiClients | null = null;

/**
 * Create all API clients (singleton)
 */
export function createApiClients(): ApiClients {
  if (!apiClients) {
    apiClients = {
      npmRegistry: new NpmRegistryClient(),
      npms: new NpmsApiClient(),
      bundlephobia: new BundlephobiaClient(),
      audit: new NpmAuditClient(),
    };
  }
  return apiClients;
}

/**
 * Get API clients instance
 */
export function getApiClients(): ApiClients {
  if (!apiClients) {
    return createApiClients();
  }
  return apiClients;
}
