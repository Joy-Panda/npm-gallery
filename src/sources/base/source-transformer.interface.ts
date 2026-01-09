import type {
  PackageInfo,
  PackageDetails,
  VersionInfo,
  SearchResult,
} from '../../types/package';

/**
 * Interface for source result transformers
 * Transforms raw API responses to unified data models
 * 
 * @template TSearchRaw - Raw search response type from the source API
 * @template TPackageRaw - Raw package response type from the source API
 */
export interface ISourceTransformer<TSearchRaw = unknown, TPackageRaw = unknown> {
  /**
   * Transform raw search response to unified SearchResult
   */
  transformSearchResult(raw: TSearchRaw): SearchResult;

  /**
   * Transform raw package response to unified PackageInfo
   */
  transformPackageInfo(raw: TPackageRaw): PackageInfo;

  /**
   * Transform raw package response to unified PackageDetails
   */
  transformPackageDetails(raw: TPackageRaw): PackageDetails;

  /**
   * Transform raw package response to unified VersionInfo array
   */
  transformVersions(raw: TPackageRaw): VersionInfo[];
}
