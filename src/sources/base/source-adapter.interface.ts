import type {
  PackageInfo,
  PackageDetails,
  VersionInfo,
  SearchResult,
  SearchOptions,
  SearchSortBy,
  InstallOptions,
  CopyOptions,
  BundleSize,
  SecurityInfo,
  DependentsInfo,
  RequirementsInfo,
} from '../../types/package';
import type { DepsDevClient } from '../../api/deps-dev';
import type { SourceType, ProjectType } from '../../types/project';
import { SourceCapability, type CapabilitySupport, CapabilityNotSupportedError } from './capabilities';

/**
 * Interface for source adapters
 * All package sources must implement this interface
 */
export interface ISourceAdapter {
  // Metadata
  readonly sourceType: SourceType;
  readonly displayName: string;
  readonly projectType: ProjectType;
  readonly supportedSortOptions: SearchSortBy[];
  readonly supportedFilters: string[];

  /**
   * Optional ecosystem identifier (language/packaging ecosystem)
   * e.g. npm, Maven, Go, PyPI
   */
  getEcosystem?(): string | undefined;

  /**
   * Get list of supported capabilities
   * This is the core method for declaring which capabilities this source supports
   */
  getSupportedCapabilities(): SourceCapability[];

  /**
   * Check if a capability is supported
   */
  supportsCapability(capability: SourceCapability): boolean;

  /**
   * Get capability support details
   */
  getCapabilitySupport(capability: SourceCapability): CapabilitySupport;

  // === Core capabilities (must implement) ===

  /**
   * Search for packages
   */
  search(options: SearchOptions): Promise<SearchResult>;

  /**
   * Get basic package info
   */
  getPackageInfo(name: string): Promise<PackageInfo>;

  /**
   * Get detailed package info
   * Note: Only returns data for supported capabilities, unsupported parts are undefined
   */
  getPackageDetails(name: string, version?: string): Promise<PackageDetails>;

  /**
   * Get version list
   */
  getVersions(name: string): Promise<VersionInfo[]>;

  // === Optional capabilities (implement as needed) ===

  /**
   * Generate install command (optional)
   * For package managers that support direct installation (npm, go, etc.)
   * Should throw CapabilityNotSupportedError if INSTALLATION capability is not supported
   */
  getInstallCommand?(packageName: string, options: InstallOptions): string;

  /**
   * Generate update command (optional)
   * For package managers that support direct installation
   * Should throw CapabilityNotSupportedError if INSTALLATION capability is not supported
   */
  getUpdateCommand?(packageName: string, version?: string): string;

  /**
   * Generate remove/uninstall command (optional)
   * For package managers that support direct installation
   * Should throw CapabilityNotSupportedError if INSTALLATION capability is not supported
   */
  getRemoveCommand?(packageName: string): string;

  /**
   * Generate copy snippet (optional)
   * For package managers that require copying snippets (Maven, Gradle, etc.)
   * Returns the content to be copied to clipboard, not an executable command
   * Should throw CapabilityNotSupportedError if COPY capability is not supported
   */
  getCopySnippet?(packageName: string, options: CopyOptions): string;

  /**
   * Get search suggestions (optional)
   */
  getSuggestions?(query: string, limit?: number): Promise<PackageInfo[]>;

  /**
   * Get security info (optional)
   * Should throw CapabilityNotSupportedError if not supported
   */
  getSecurityInfo?(name: string, version: string): Promise<SecurityInfo | null>;

  /**
   * Get security info for multiple packages (optional)
   * Implementations can use OSV /v1/querybatch or similar batch APIs.
   */
  getSecurityInfoBulk?(
    packages: Array<{ name: string; version: string }>
  ): Promise<Record<string, SecurityInfo | null>>;

  /**
   * Get dependents info (optional)
   */
  getDependents?(name: string, version: string): Promise<DependentsInfo | null>;

  /**
   * Get requirements info (optional)
   */
  getRequirements?(name: string, version: string): Promise<RequirementsInfo | null>;

  /**
   * Get bundle size (optional)
   * Should throw CapabilityNotSupportedError if not supported
   */
  getBundleSize?(name: string, version?: string): Promise<BundleSize | null>;
}

/**
 * Base abstract class for source adapters
 * Provides common functionality and default implementations
 */
export abstract class BaseSourceAdapter implements ISourceAdapter {
  abstract readonly sourceType: SourceType;
  abstract readonly displayName: string;
  abstract readonly projectType: ProjectType;
  abstract readonly supportedSortOptions: SearchSortBy[];
  abstract readonly supportedFilters: string[];

  constructor(protected depsDevClient?: DepsDevClient) {}

  getEcosystem?(): string | undefined {
    return undefined;
  }

  /**
   * Subclasses must declare supported capabilities
   */
  abstract getSupportedCapabilities(): SourceCapability[];

  /**
   * Check if a capability is supported
   */
  supportsCapability(capability: SourceCapability): boolean {
    return this.getSupportedCapabilities().includes(capability);
  }

  /**
   * Get capability support details
   */
  getCapabilitySupport(capability: SourceCapability): CapabilitySupport {
    const supported = this.supportsCapability(capability);
    return {
      capability,
      supported,
      reason: supported ? undefined : this.getCapabilityNotSupportedReason(capability),
    };
  }

  /**
   * Subclasses can override this to provide reasons for unsupported capabilities
   */
  protected getCapabilityNotSupportedReason(capability: SourceCapability): string | undefined {
    return `Source '${this.sourceType}' does not support '${capability}'`;
  }

  // Core capabilities (must implement)
  abstract search(options: SearchOptions): Promise<SearchResult>;
  abstract getPackageInfo(name: string): Promise<PackageInfo>;
  abstract getPackageDetails(name: string, version?: string): Promise<PackageDetails>;
  abstract getVersions(name: string): Promise<VersionInfo[]>;

  // Optional capabilities (default implementations throw errors)
  
  getInstallCommand?(_packageName: string, _options: InstallOptions): string {
    throw new CapabilityNotSupportedError(SourceCapability.INSTALLATION, this.sourceType);
  }

  getUpdateCommand?(_packageName: string, _version?: string): string {
    throw new CapabilityNotSupportedError(SourceCapability.INSTALLATION, this.sourceType);
  }

  getRemoveCommand?(_packageName: string): string {
    throw new CapabilityNotSupportedError(SourceCapability.INSTALLATION, this.sourceType);
  }

  getCopySnippet?(_packageName: string, _options: CopyOptions): string {
    throw new CapabilityNotSupportedError(SourceCapability.COPY, this.sourceType);
  }
  async getSuggestions?(_query: string, _limit?: number): Promise<PackageInfo[]> {
    if (!this.supportsCapability(SourceCapability.SUGGESTIONS)) {
      throw new CapabilityNotSupportedError(SourceCapability.SUGGESTIONS, this.sourceType);
    }
    // Default: use search with small limit
    const result = await this.search({ query: _query || '', size: _limit || 10 });
    return result.packages;
  }

  async getBundleSize?(_name: string, _version?: string): Promise<BundleSize | null> {
    throw new CapabilityNotSupportedError(SourceCapability.BUNDLE_SIZE, this.sourceType);
  }

  async getSecurityInfo?(_name: string, _version: string): Promise<SecurityInfo | null> {
    throw new CapabilityNotSupportedError(SourceCapability.SECURITY, this.sourceType);
  }

  async getSecurityInfoBulk?(
    _packages: Array<{ name: string; version: string }>
  ): Promise<Record<string, SecurityInfo | null>> {
    throw new CapabilityNotSupportedError(SourceCapability.SECURITY, this.sourceType);
  }

  async getDependents?(_name: string, _version: string): Promise<DependentsInfo | null> {
    if (!this.supportsCapability(SourceCapability.DEPENDENTS)) {
      throw new CapabilityNotSupportedError(SourceCapability.DEPENDENTS, this.sourceType);
    }

    if (!this.depsDevClient || !this.getEcosystem) {
      return null;
    }

    const ecosystem = this.getEcosystem();
    if (!ecosystem || ecosystem === 'unknown') {
      return null;
    }

    return this.depsDevClient.getDependents(ecosystem as 'npm' | 'maven' | 'go', _name, _version);
  }

  async getRequirements?(_name: string, _version: string): Promise<RequirementsInfo | null> {
    if (!this.supportsCapability(SourceCapability.REQUIREMENTS)) {
      throw new CapabilityNotSupportedError(SourceCapability.REQUIREMENTS, this.sourceType);
    }

    if (!this.depsDevClient || !this.getEcosystem) {
      return null;
    }

    const ecosystem = this.getEcosystem();
    if (!ecosystem || ecosystem === 'unknown') {
      return null;
    }

    return this.depsDevClient.getRequirements(ecosystem as 'npm' | 'maven' | 'go', _name, _version);
  }
}
