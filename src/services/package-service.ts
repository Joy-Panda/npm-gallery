import { getApiClients } from '../api/clients';
import type {
  PackageInfo,
  PackageDetails,
  VersionInfo,
  BundleSize,
  SecurityInfo,
} from '../types/package';
import type { NpmMaintainer } from '../types/api';

/**
 * Service for package information
 */
export class PackageService {
  /**
   * Get basic package info
   */
  async getPackageInfo(name: string): Promise<PackageInfo> {
    const clients = getApiClients();

    try {
      // Try npms.io first for enhanced data
      const analysis = await clients.npms.getPackageAnalysis(name);
      const downloads = await clients.npmRegistry.getDownloads(name);

      return {
        name: analysis.collected.metadata.name,
        version: analysis.collected.metadata.version,
        description: analysis.collected.metadata.description,
        keywords: analysis.collected.metadata.keywords,
        license: analysis.collected.metadata.license,
        repository: analysis.collected.metadata.repository,
        downloads: downloads.downloads,
        score: analysis.score,
      };
    } catch {
      // Fallback to npm registry
      const pkg = await clients.npmRegistry.getPackage(name);
      const latestVersion = pkg['dist-tags'].latest;
      const versionData = pkg.versions[latestVersion];

      return {
        name: pkg.name,
        version: latestVersion,
        description: pkg.description,
        keywords: pkg.keywords,
        license: versionData?.license || pkg.license,
        author: pkg.author,
        repository: pkg.repository,
      };
    }
  }

  /**
   * Get detailed package info
   */
  async getPackageDetails(name: string): Promise<PackageDetails> {
    const clients = getApiClients();
    const pkg = await clients.npmRegistry.getPackage(name);
    const latestVersion = pkg['dist-tags'].latest;
    const latestData = pkg.versions[latestVersion];

    // Get additional data in parallel
    const [downloads, analysis, bundleSize, security] = await Promise.all([
      clients.npmRegistry.getDownloads(name).catch(() => ({ downloads: 0 })),
      clients.npms.getPackageAnalysis(name).catch(() => null),
      clients.bundlephobia.getSize(name, latestVersion).catch(() => null),
      clients.audit.checkPackage(name, latestVersion).catch(() => null),
    ]);

    const versions = this.extractVersions(pkg);

    return {
      name: pkg.name,
      version: latestVersion,
      description: pkg.description,
      keywords: pkg.keywords,
      license: latestData?.license || pkg.license,
      author: pkg.author,
      publisher: latestData ? { username: pkg.maintainers?.[0]?.name || '' } : undefined,
      repository: pkg.repository,
      homepage: pkg.homepage,
      downloads: downloads.downloads,
      score: analysis?.score,
      bundleSize: bundleSize || undefined,
      readme: pkg.readme,
      versions,
      dependencies: latestData?.dependencies,
      devDependencies: latestData?.devDependencies,
      peerDependencies: latestData?.peerDependencies,
      maintainers: pkg.maintainers?.map((m: NpmMaintainer) => ({ name: m.name, email: m.email })),
      time: pkg.time,
      distTags: pkg['dist-tags'],
      bugs: pkg.bugs,
      security: security || undefined,
    };
  }

  /**
   * Get bundle size for a package
   */
  async getBundleSize(name: string, version?: string): Promise<BundleSize | null> {
    const clients = getApiClients();
    try {
      return await clients.bundlephobia.getSize(name, version);
    } catch {
      return null;
    }
  }

  /**
   * Get security info for a package
   */
  async getSecurityInfo(name: string, version: string): Promise<SecurityInfo | null> {
    const clients = getApiClients();
    try {
      return await clients.audit.checkPackage(name, version);
    } catch {
      return null;
    }
  }

  /**
   * Get all versions of a package
   */
  async getVersions(name: string): Promise<VersionInfo[]> {
    const clients = getApiClients();
    const pkg = await clients.npmRegistry.getPackage(name);
    return this.extractVersions(pkg);
  }

  /**
   * Extract versions from npm package data
   */
  private extractVersions(pkg: {
    'dist-tags': Record<string, string>;
    versions: Record<string, { version: string; deprecated?: string; dist?: { unpackedSize?: number } }>;
    time?: Record<string, string>;
  }): VersionInfo[] {
    const distTags = pkg['dist-tags'];

    return Object.entries(pkg.versions)
      .map(([version, data]) => ({
        version,
        publishedAt: pkg.time?.[version],
        deprecated: data.deprecated,
        tag: Object.entries(distTags).find(([, v]) => v === version)?.[0],
        dist: data.dist,
      }))
      .sort((a, b) => {
        // Sort by publish date descending
        if (a.publishedAt && b.publishedAt) {
          return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
        }
        return 0;
      });
  }
}
