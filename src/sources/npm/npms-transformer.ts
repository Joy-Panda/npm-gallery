import type { ISourceTransformer } from '../base/source-transformer.interface';
import type {
  PackageInfo,
  PackageDetails,
  VersionInfo,
  SearchResult,
} from '../../types/package';
import type {
  NpmsSearchResponse,
  NpmsPackageAnalysis,
  NpmsSearchResult,
} from '../../types/api';

/**
 * Transformer for npms.io API responses
 * Converts raw npms.io API responses to unified data models
 */
export class NpmsTransformer implements ISourceTransformer<NpmsSearchResponse, NpmsPackageAnalysis> {
  /**
   * Transform npms.io search response to unified SearchResult
   */
  transformSearchResult(raw: NpmsSearchResponse, from: number = 0, size: number = 20): SearchResult {
    const packages: PackageInfo[] = raw.results.map((result: NpmsSearchResult) =>
      this.transformSearchResult_Single(result)
    );

    return {
      packages,
      total: raw.total,
      hasMore: from + size < raw.total,
    };
  }

  /**
   * Transform a single npms.io search result to PackageInfo
   */
  private transformSearchResult_Single(result: NpmsSearchResult): PackageInfo {
    return {
      name: result.package.name,
      version: result.package.version,
      description: result.package.description,
      keywords: result.package.keywords,
      author: result.package.author,
      publisher: result.package.publisher,
      repository: result.package.links?.repository
        ? { url: result.package.links.repository }
        : undefined,
      homepage: result.package.links?.homepage,
      score: result.score,
    };
  }

  /**
   * Transform npms.io package analysis to unified PackageInfo
   */
  transformPackageInfo(raw: NpmsPackageAnalysis): PackageInfo {
    const metadata = raw.collected.metadata;
    const downloads = raw.collected.npm?.downloads?.[0]?.count;

    return {
      name: metadata.name,
      version: metadata.version,
      description: metadata.description,
      keywords: metadata.keywords,
      license: metadata.license,
      repository: metadata.repository,
      downloads,
      score: raw.score,
    };
  }

  /**
   * Transform npms.io package analysis to unified PackageDetails
   * Note: npms.io doesn't provide full package details like readme
   */
  transformPackageDetails(raw: NpmsPackageAnalysis): PackageDetails {
    const metadata = raw.collected.metadata;
    const downloads = raw.collected.npm?.downloads?.[0]?.count;

    return {
      name: metadata.name,
      version: metadata.version,
      description: metadata.description,
      keywords: metadata.keywords,
      license: metadata.license,
      publisher: metadata.publisher 
        ? { username: metadata.publisher.username }
        : undefined,
      repository: metadata.repository,
      downloads,
      score: raw.score,
      versions: [], // npms.io doesn't provide version list
      dependencies: metadata.dependencies,
      devDependencies: metadata.devDependencies,
      maintainers: metadata.maintainers?.map(m => ({ 
        username: m.username,
        name: m.username,
      })),
    };
  }

  /**
   * Transform to VersionInfo array
   * Note: npms.io doesn't provide version history, returns empty array
   */
  transformVersions(_raw: NpmsPackageAnalysis): VersionInfo[] {
    // npms.io doesn't provide version list
    return [];
  }
}
