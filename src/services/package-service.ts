import type {
  PackageInfo,
  PackageDetails,
  VersionInfo,
  BundleSize,
  SecurityInfo,
  DependentsInfo,
  RequirementsInfo,
  WorkspacePackageScope,
} from '../types/package';
import type { DependencyAnalyzerData } from '../types/analyzer';
import type { SourceSelector } from '../registry/source-selector';
import type { SourceType } from '../types/project';
import { SourceCapability, type CapabilitySupport } from '../sources/base/capabilities';
import { NpmLocalService } from './package/npm-local-service';
import { PackageQueryService } from './package/package-query-service';

/**
 * Service for package information
 * Uses source selector for multi-source support
 */
export class PackageService {
  private npmLocalService = new NpmLocalService();
  private queryService: PackageQueryService;

  constructor(private sourceSelector?: SourceSelector) {
    this.queryService = new PackageQueryService(sourceSelector);
  }

  /**
   * Set the source selector (for late initialization)
   */
  setSourceSelector(selector: SourceSelector): void {
    this.sourceSelector = selector;
    this.queryService.setSourceSelector(selector);
  }

  getCurrentSourceType(): SourceType | null {
    return this.queryService.getCurrentSourceType();
  }

  invalidateLocalDependencyTreeCache(scope?: WorkspacePackageScope | string): void {
    this.npmLocalService.invalidateLocalDependencyTreeCache(scope);
  }

  invalidateLatestVersionCache(packageNames?: string[]): void {
    this.queryService.invalidateLatestVersionCache(packageNames);
  }

  /**
   * Get basic package info
   */
  async getPackageInfo(name: string): Promise<PackageInfo> {
    return this.queryService.getPackageInfo(name);
  }

  /**
   * Get detailed package info
   */
  async getPackageDetails(name: string, version?: string): Promise<PackageDetails> {
    return this.queryService.getPackageDetails(name, version);
  }

  async getEnrichedPackageDetails(
    name: string,
    options?: { installedVersion?: string }
  ): Promise<PackageDetails> {
    const details = await this.getPackageDetails(name, options?.installedVersion);
    const [dependents, requirements, installedVersionSecurity] = await Promise.all([
      this.getDependents(name, details.version),
      this.getRequirements(name, details.version),
      options?.installedVersion ? this.getSecurityInfo(name, details.version) : Promise.resolve(null),
    ]);

    if (dependents) {
      details.dependents = dependents;
    }

    if (requirements) {
      details.requirements = requirements;
    }

    if (installedVersionSecurity) {
      details.security = installedVersionSecurity;
    }

    return details;
  }

  /**
   * Get bundle size for a package (only if capability is supported)
   */
  async getBundleSize(name: string, version?: string): Promise<BundleSize | null> {
    return this.queryService.getBundleSize(name, version);
  }

  /**
   * Get security info for a package (only if capability is supported)
   */
  async getSecurityInfo(name: string, version: string): Promise<SecurityInfo | null> {
    return this.queryService.getSecurityInfo(name, version);
  }

  /**
   * Get security info for multiple packages in batch (only if capability is supported)
   * Adapters can implement getSecurityInfoBulk using OSV /v1/querybatch.
   * Falls back to individual getSecurityInfo calls when bulk is not available.
   */
  async getSecurityInfoBulk(
    packages: Array<{ name: string; version: string }>
  ): Promise<Record<string, SecurityInfo | null>> {
    return this.queryService.getSecurityInfoBulk(packages);
  }

  /**
   * Get capability support information
   */
  getCapabilitySupport(capability: SourceCapability): CapabilitySupport | null {
    return this.queryService.getCapabilitySupport(capability);
  }

  /**
   * Get all supported capabilities
   */
  getSupportedCapabilities(): SourceCapability[] {
    return this.queryService.getSupportedCapabilities();
  }

  /**
   * Check if a capability is supported
   */
  supportsCapability(capability: SourceCapability): boolean {
    return this.queryService.supportsCapability(capability);
  }

  /**
   * Get all versions of a package
   */
  async getVersions(name: string): Promise<VersionInfo[]> {
    return this.queryService.getVersions(name);
  }

  /**
   * Get latest version of a package
   */
  async getLatestVersion(name: string): Promise<string | null> {
    return this.queryService.getLatestVersion(name);
  }

  async getDependencyAnalyzerData(manifestPath: string): Promise<DependencyAnalyzerData | null> {
    return this.npmLocalService.getDependencyAnalyzerData(
      manifestPath,
      (name, version, targetPath) => this.getPackageDependencies(name, version, targetPath)
    );
  }

  /**
   * Get package dependencies for a specific version
   * Returns all dependencies merged together (for dependency tree support)
   */
  async getPackageDependencies(
    name: string,
    version?: string,
    targetPath?: string
  ): Promise<Record<string, string> | null> {
    const localDependencies = await this.getLocalPackageDependencies(name, version, targetPath);
    if (localDependencies) {
      return localDependencies;
    }

    try {
      return this.queryService.getRemotePackageDependencies(name, version);
    } catch {
      return null;
    }
  }

  async hasPackageDependencies(name: string, version?: string, targetPath?: string): Promise<boolean | null> {
    const localDependencies = await this.getLocalPackageDependencies(name, version, targetPath);
    if (localDependencies !== null) {
      return Object.keys(localDependencies).length > 0;
    }

    return null;
  }

  async getDependents(
    name: string,
    version: string,
    options?: { pageUrl?: string }
  ): Promise<DependentsInfo | null> {
    return this.queryService.getDependents(name, version, options);
  }

  async getRequirements(name: string, version: string): Promise<RequirementsInfo | null> {
    return this.queryService.getRequirements(name, version);
  }

  private async getLocalPackageDependencies(
    name: string,
    version?: string,
    targetPath?: string
  ): Promise<Record<string, string> | null> {
    return this.npmLocalService.getLocalPackageDependencies(
      name,
      version,
      targetPath,
      this.sourceSelector?.getCurrentProjectType() ?? null
    );
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
