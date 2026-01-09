import { NpmRegistryClient } from './npm-registry';
import { NpmsApiClient } from './npms-api';
import { BundlephobiaClient } from './bundlephobia';
import { OSVClient } from './osv';
import { SonatypeApiClient } from './sonatype-api';

/**
 * All API clients
 */
export interface ApiClients {
  npmRegistry: NpmRegistryClient;
  npms: NpmsApiClient;
  bundlephobia: BundlephobiaClient;
  audit: OSVClient;
  sonatype: SonatypeApiClient;
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
      audit: new OSVClient(),
      sonatype: new SonatypeApiClient(),
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
