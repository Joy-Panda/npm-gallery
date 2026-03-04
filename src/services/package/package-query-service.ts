import type {
  BundleSize,
  DependentsInfo,
  PackageDetails,
  PackageInfo,
  RequirementsInfo,
  SecurityInfo,
  VersionInfo,
} from '../../types/package';
import type { SourceSelector } from '../../registry/source-selector';
import type { SourceType } from '../../types/project';
import {
  CapabilityNotSupportedError,
  type CapabilitySupport,
  SourceCapability,
} from '../../sources/base/capabilities';

export class PackageQueryService {
  private latestVersionCache = new Map<string, string | null>();
  private latestVersionPromises = new Map<string, Promise<string | null>>();

  constructor(private sourceSelector?: SourceSelector) {}

  setSourceSelector(selector: SourceSelector): void {
    this.sourceSelector = selector;
  }

  getCurrentSourceType(): SourceType | null {
    return this.sourceSelector?.getCurrentSourceType() ?? null;
  }

  invalidateLatestVersionCache(packageNames?: string[]): void {
    if (!packageNames || packageNames.length === 0) {
      this.latestVersionCache.clear();
      this.latestVersionPromises.clear();
      return;
    }

    for (const packageName of packageNames) {
      this.latestVersionCache.delete(packageName);
      this.latestVersionPromises.delete(packageName);
    }
  }

  async getPackageInfo(name: string): Promise<PackageInfo> {
    const selector = this.requireSourceSelector();
    return selector.executeWithFallback((adapter) => adapter.getPackageInfo(name));
  }

  async getPackageDetails(name: string, version?: string): Promise<PackageDetails> {
    const selector = this.requireSourceSelector();
    return selector.executeWithFallback((adapter) => adapter.getPackageDetails(name, version));
  }

  async getVersions(name: string): Promise<VersionInfo[]> {
    const selector = this.requireSourceSelector();
    return selector.executeWithFallback((adapter) => adapter.getVersions(name));
  }

  async getLatestVersion(name: string): Promise<string | null> {
    if (this.latestVersionCache.has(name)) {
      return this.latestVersionCache.get(name) ?? null;
    }

    const pending = this.latestVersionPromises.get(name);
    if (pending) {
      return pending;
    }

    const promise = this.resolveLatestVersion(name);
    this.latestVersionPromises.set(name, promise);

    try {
      const version = await promise;
      this.latestVersionCache.set(name, version);
      return version;
    } finally {
      this.latestVersionPromises.delete(name);
    }
  }

  async getBundleSize(name: string, version?: string): Promise<BundleSize | null> {
    const adapter = this.requireSourceSelector().selectSource();
    if (!adapter.supportsCapability(SourceCapability.BUNDLE_SIZE)) {
      return null;
    }

    if (!adapter.getBundleSize) {
      return null;
    }

    try {
      return await adapter.getBundleSize(name, version);
    } catch (error) {
      if (error instanceof CapabilityNotSupportedError) {
        return null;
      }
      throw error;
    }
  }

  async getSecurityInfo(name: string, version: string): Promise<SecurityInfo | null> {
    const adapter = this.requireSourceSelector().selectSource();
    if (!adapter.supportsCapability(SourceCapability.SECURITY) || !adapter.getSecurityInfo) {
      return null;
    }

    try {
      return await adapter.getSecurityInfo(name, version);
    } catch (error) {
      if (error instanceof CapabilityNotSupportedError) {
        return null;
      }
      throw error;
    }
  }

  async getSecurityInfoBulk(
    packages: Array<{ name: string; version: string }>
  ): Promise<Record<string, SecurityInfo | null>> {
    const result: Record<string, SecurityInfo | null> = {};
    if (packages.length === 0) {
      return result;
    }

    const adapter = this.requireSourceSelector().selectSource();
    if (!adapter.supportsCapability(SourceCapability.SECURITY)) {
      return result;
    }

    if (adapter.getSecurityInfoBulk) {
      try {
        return await adapter.getSecurityInfoBulk(packages);
      } catch (error) {
        if (!(error instanceof CapabilityNotSupportedError)) {
          // Fall through to per-package fallback.
        }
      }
    }

    if (adapter.getSecurityInfo) {
      await Promise.all(
        packages.map(async ({ name, version }) => {
          const key = `${name}@${version}`;
          try {
            result[key] = await adapter.getSecurityInfo!(name, version);
          } catch {
            result[key] = null;
          }
        })
      );
    }

    return result;
  }

  getCapabilitySupport(capability: SourceCapability): CapabilitySupport | null {
    if (!this.sourceSelector) {
      return null;
    }

    try {
      return this.sourceSelector.selectSource().getCapabilitySupport(capability);
    } catch {
      return null;
    }
  }

  getSupportedCapabilities(): SourceCapability[] {
    if (!this.sourceSelector) {
      return [];
    }

    try {
      return this.sourceSelector.selectSource().getSupportedCapabilities();
    } catch {
      return [];
    }
  }

  supportsCapability(capability: SourceCapability): boolean {
    if (!this.sourceSelector) {
      return false;
    }

    try {
      return this.sourceSelector.selectSource().supportsCapability(capability);
    } catch {
      return false;
    }
  }

  async getDependents(
    name: string,
    version: string,
    options?: { pageUrl?: string }
  ): Promise<DependentsInfo | null> {
    const adapter = this.requireSourceSelector().selectSource();
    if (!adapter.supportsCapability(SourceCapability.DEPENDENTS) || !adapter.getDependents) {
      return null;
    }

    try {
      return await adapter.getDependents(name, version, options);
    } catch (error) {
      if (error instanceof CapabilityNotSupportedError) {
        return null;
      }
      throw error;
    }
  }

  async getRequirements(name: string, version: string): Promise<RequirementsInfo | null> {
    const adapter = this.requireSourceSelector().selectSource();
    if (!adapter.supportsCapability(SourceCapability.REQUIREMENTS) || !adapter.getRequirements) {
      return null;
    }

    try {
      return await adapter.getRequirements(name, version);
    } catch (error) {
      if (error instanceof CapabilityNotSupportedError) {
        return null;
      }
      throw error;
    }
  }

  async getRemotePackageDependencies(name: string, version?: string): Promise<Record<string, string> | null> {
    const adapter = this.requireSourceSelector().selectSource();

    try {
      let details: PackageDetails;
      if (version && (adapter.sourceType === 'sonatype' || adapter.sourceType === 'libraries-io' || adapter.sourceType === 'pkg-go-dev')) {
        const adapterWithVersion = adapter as typeof adapter & {
          getPackageDetails(packageName: string, packageVersion?: string): Promise<PackageDetails>;
        };
        try {
          details = await adapterWithVersion.getPackageDetails(name, version);
        } catch {
          details = await adapter.getPackageDetails(name);
        }
      } else {
        details = await adapter.getPackageDetails(name);
      }

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

  private async resolveLatestVersion(name: string): Promise<string | null> {
    try {
      const info = await this.getPackageInfo(name);
      return info.version || null;
    } catch {
      return null;
    }
  }

  private requireSourceSelector(): SourceSelector {
    if (!this.sourceSelector) {
      throw new Error('PackageService not initialized: SourceSelector is required');
    }

    return this.sourceSelector;
  }
}
