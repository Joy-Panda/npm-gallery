import type { ISourceTransformer } from '../base/source-transformer.interface';
import type {
  PackageInfo,
  PackageDetails,
  VersionInfo,
  SearchResult,
} from '../../types/package';
import type {
  NpmSearchResponse,
  NpmRegistryPackage,
  NpmSearchObject,
  NpmMaintainer,
} from '../../types/api';

/**
 * Transformer for npm registry API responses
 * Converts raw npm API responses to unified data models
 */
export class NpmTransformer implements ISourceTransformer<NpmSearchResponse, NpmRegistryPackage> {
  /**
   * Transform npm search response to unified SearchResult
   */
  transformSearchResult(raw: NpmSearchResponse, from: number = 0, size: number = 20): SearchResult {
    const packages: PackageInfo[] = raw.objects.map((obj: NpmSearchObject) => 
      this.transformSearchObject(obj)
    );

    return {
      packages,
      total: raw.total,
      hasMore: from + size < raw.total,
    };
  }

  /**
   * Transform a single search object to PackageInfo
   */
  private transformSearchObject(obj: NpmSearchObject): PackageInfo {
    return {
      name: obj.package.name,
      version: obj.package.version,
      description: obj.package.description,
      keywords: obj.package.keywords,
      author: obj.package.author,
      publisher: obj.package.publisher,
      repository: obj.package.links?.repository
        ? { url: obj.package.links.repository }
        : undefined,
      homepage: obj.package.links?.homepage,
      score: obj.score,
      downloads: obj.downloads?.weekly,
    };
  }

  /**
   * Transform npm registry package to unified PackageInfo
   */
  transformPackageInfo(raw: NpmRegistryPackage): PackageInfo {
    const latestVersion = raw['dist-tags']?.latest;
    const versionData = latestVersion ? raw.versions[latestVersion] : undefined;

    return {
      name: raw.name,
      version: latestVersion || Object.keys(raw.versions)[0] || '0.0.0',
      description: raw.description,
      keywords: raw.keywords,
      license: versionData?.license || raw.license,
      author: raw.author,
      repository: raw.repository,
      homepage: raw.homepage,
    };
  }

  /**
   * Transform npm registry package to unified PackageDetails
   */
  transformPackageDetails(raw: NpmRegistryPackage): PackageDetails {
    const latestVersion = raw['dist-tags']?.latest;
    const latestData = latestVersion ? raw.versions[latestVersion] : undefined;
    const versions = this.transformVersions(raw);

    return {
      name: raw.name,
      version: latestVersion || Object.keys(raw.versions)[0] || '0.0.0',
      description: raw.description,
      keywords: raw.keywords,
      license: latestData?.license || raw.license,
      author: raw.author,
      publisher: raw.maintainers?.[0] 
        ? { username: raw.maintainers[0].name || '' }
        : undefined,
      repository: raw.repository,
      homepage: raw.homepage,
      readme: raw.readme,
      versions,
      dependencies: latestData?.dependencies,
      devDependencies: latestData?.devDependencies,
      peerDependencies: latestData?.peerDependencies,
      maintainers: raw.maintainers?.map((m: NpmMaintainer) => ({
        name: m.name,
        email: m.email,
      })),
      time: raw.time,
      distTags: raw['dist-tags'],
      bugs: raw.bugs,
    };
  }

  /**
   * Transform npm registry package to unified VersionInfo array
   */
  transformVersions(raw: NpmRegistryPackage): VersionInfo[] {
    const distTags = raw['dist-tags'] || {};

    return Object.entries(raw.versions || {})
      .map(([version, data]) => ({
        version,
        publishedAt: raw.time?.[version],
        deprecated: data.deprecated,
        tag: Object.entries(distTags).find(([, v]) => v === version)?.[0],
        dist: data.dist ? {
          shasum: data.dist.shasum,
          tarball: data.dist.tarball,
          unpackedSize: data.dist.unpackedSize,
        } : undefined,
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
