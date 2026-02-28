import { NpmRegistryClient } from './npm-registry';
import { NpmsApiClient } from './npms-api';
import { BundlephobiaClient } from './bundlephobia';
import { OSVClient } from './osv';
import { SonatypeApiClient } from './sonatype-api';
import { LibrariesIoClient } from './libraries-io';
import { DepsDevClient } from './deps-dev';

/**
 * All API clients
 */
export interface ApiClients {
  npmRegistry: NpmRegistryClient;
  npms: NpmsApiClient;
  bundlephobia: BundlephobiaClient;
  audit: OSVClient;
  sonatype: SonatypeApiClient;
  librariesIo: LibrariesIoClient;
  depsDev: DepsDevClient;
}

// Singleton instances
let apiClients: ApiClients | null = null;

/**
 * Create all API clients (singleton)
 */
export function createApiClients(): ApiClients {
  if (!apiClients) {
    const librariesIoClient = new LibrariesIoClient();
    // Set Libraries.io API key for higher rate limits
    librariesIoClient.setApiKey('572b1d7e7c4872a420238d09fa3d4773');
    
    apiClients = {
      npmRegistry: new NpmRegistryClient(),
      npms: new NpmsApiClient(),
      bundlephobia: new BundlephobiaClient(),
      audit: new OSVClient(),
      sonatype: new SonatypeApiClient(),
      librariesIo: librariesIoClient,
      depsDev: new DepsDevClient(),
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
