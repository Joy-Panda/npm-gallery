import type {
  PackageInfo,
  PackageDetails,
  VersionInfo,
  BundleSize,
  SecurityInfo,
} from '../types/package';
import type { SourceSelector } from '../registry/source-selector';
import { SourceCapability, CapabilityNotSupportedError, type CapabilitySupport } from '../sources/base/capabilities';

/**
 * Service for package information
 * Uses source selector for multi-source support
 */
export class PackageService {
  constructor(private sourceSelector?: SourceSelector) {}

  /**
   * Set the source selector (for late initialization)
   */
  setSourceSelector(selector: SourceSelector): void {
    this.sourceSelector = selector;
  }

  /**
   * Get basic package info
   */
  async getPackageInfo(name: string): Promise<PackageInfo> {
    if (!this.sourceSelector) {
      throw new Error('PackageService not initialized: SourceSelector is required');
    }

    return this.sourceSelector.executeWithFallback(
      adapter => adapter.getPackageInfo(name)
    );
  }

  /**
   * Get detailed package info
   */
  async getPackageDetails(name: string): Promise<PackageDetails> {
    if (!this.sourceSelector) {
      throw new Error('PackageService not initialized: SourceSelector is required');
    }

    return this.sourceSelector.executeWithFallback(
      adapter => adapter.getPackageDetails(name)
    );
  }

  /**
   * Get bundle size for a package (only if capability is supported)
   */
  async getBundleSize(name: string, version?: string): Promise<BundleSize | null> {
    if (!this.sourceSelector) {
      throw new Error('PackageService not initialized: SourceSelector is required');
    }

    const adapter = this.sourceSelector.selectSource();

    // Check capability support - don't query if not supported
    if (!adapter.supportsCapability(SourceCapability.BUNDLE_SIZE)) {
      return null; // Explicitly return null, don't query
    }

    if (adapter.getBundleSize) {
      try {
        return await adapter.getBundleSize(name, version);
      } catch (error) {
        if (error instanceof CapabilityNotSupportedError) {
          return null;
        }
        throw error;
      }
    }

    return null;
  }

  /**
   * Get security info for a package (only if capability is supported)
   */
  async getSecurityInfo(name: string, version: string): Promise<SecurityInfo | null> {
    if (!this.sourceSelector) {
      throw new Error('PackageService not initialized: SourceSelector is required');
    }

    const adapter = this.sourceSelector.selectSource();

    // Check capability support - don't query if not supported
    if (!adapter.supportsCapability(SourceCapability.SECURITY)) {
      return null; // Explicitly return null, don't query
    }

    if (adapter.getSecurityInfo) {
      try {
        return await adapter.getSecurityInfo(name, version);
      } catch (error) {
        if (error instanceof CapabilityNotSupportedError) {
          return null;
        }
        throw error;
      }
    }

    return null;
  }

  /**
   * Get capability support information
   */
  getCapabilitySupport(capability: SourceCapability): CapabilitySupport | null {
    if (!this.sourceSelector) {
      return null;
    }

    try {
      const adapter = this.sourceSelector.selectSource();
      return adapter.getCapabilitySupport(capability);
    } catch {
      return null;
    }
  }

  /**
   * Get all supported capabilities
   */
  getSupportedCapabilities(): SourceCapability[] {
    if (!this.sourceSelector) {
      return [];
    }

    try {
      const adapter = this.sourceSelector.selectSource();
      return adapter.getSupportedCapabilities();
    } catch {
      return [];
    }
  }

  /**
   * Check if a capability is supported
   */
  supportsCapability(capability: SourceCapability): boolean {
    if (!this.sourceSelector) {
      return false;
    }

    try {
      const adapter = this.sourceSelector.selectSource();
      return adapter.supportsCapability(capability);
    } catch {
      return false;
    }
  }

  /**
   * Get all versions of a package
   */
  async getVersions(name: string): Promise<VersionInfo[]> {
    if (!this.sourceSelector) {
      throw new Error('PackageService not initialized: SourceSelector is required');
    }

    return this.sourceSelector.executeWithFallback(
      adapter => adapter.getVersions(name)
    );
  }

  /**
   * Get latest version of a package
   */
  async getLatestVersion(name: string): Promise<string | null> {
    try {
      const info = await this.getPackageInfo(name);
      return info.version || null;
    } catch {
      return null;
    }
  }

  /**
   * Get package dependencies for a specific version
   * Returns all dependencies merged together (for dependency tree support)
   */
  async getPackageDependencies(
    name: string,
    version?: string
  ): Promise<Record<string, string> | null> {
    try {
      if (!this.sourceSelector) {
        throw new Error('PackageService not initialized: SourceSelector is required');
      }

      // Get package details for the specific version
      const adapter = this.sourceSelector.selectSource();
      
      // For sonatype and libraries-io adapters, getPackageDetails supports optional version parameter
      // For other adapters, we'll get latest version details
      let details: PackageDetails;
      if (version && (adapter.sourceType === 'sonatype' || adapter.sourceType === 'libraries-io')) {
        // Sonatype and Libraries.io adapters support version parameter
        const adapterWithVersion = adapter as any;
        try {
          details = await adapterWithVersion.getPackageDetails(name, version);
        } catch {
          // Fallback to getting latest version details
          details = await adapter.getPackageDetails(name);
        }
      } else {
        details = await adapter.getPackageDetails(name);
      }
      
      // Merge all dependency types for dependency tree support
      const allDependencies: Record<string, string> = {};
      
      if (details.dependencies) {
        Object.assign(allDependencies, details.dependencies);
      }
      if (details.devDependencies) {
        Object.assign(allDependencies, details.devDependencies);
      }
      if (details.peerDependencies) {
        Object.assign(allDependencies, details.peerDependencies);
      }
      if (details.optionalDependencies) {
        Object.assign(allDependencies, details.optionalDependencies);
      }
      
      return Object.keys(allDependencies).length > 0 ? allDependencies : null;
    } catch {
      return null;
    }
  }

  /**
   * Get package abbreviated info (lightweight version info)
   * Returns basic info including latest version and dependencies for a specific version
   */
  async getPackageAbbreviated(
    name: string,
    _version?: string
  ): Promise<{
    name: string;
    'dist-tags': { latest: string };
    versions: Record<string, { version: string; dependencies?: Record<string, string> }>;
  } | null> {
    try {
      const details = await this.getPackageDetails(name);
      const versions = details.versions || [];
      
      // Build versions map
      const versionsMap: Record<string, { version: string; dependencies?: Record<string, string> }> = {};
      for (const v of versions) {
        versionsMap[v.version] = {
          version: v.version,
          // Note: We don't have per-version dependencies in current structure
          // This is a limitation - we'd need to fetch each version separately
        };
      }
      
      // If we have the latest version's dependencies, add them to the latest version entry
      if (details.version && details.dependencies) {
        versionsMap[details.version] = {
          version: details.version,
          dependencies: details.dependencies,
        };
      }
      
      return {
        name: details.name,
        'dist-tags': {
          latest: details.version,
        },
        versions: versionsMap,
      };
    } catch {
      return null;
    }
  }
}
