/**
 * Basic package information displayed in search results
 */
export interface PackageInfo {
  name: string;
  version: string;
  description?: string;
  keywords?: string[];
  license?: string;
  author?: PackageAuthor;
  publisher?: PackagePublisher;
  repository?: PackageRepository;
  homepage?: string;
  downloads?: number;
  score?: PackageScore;
  bundleSize?: BundleSize;
  deprecated?: string;
}

/**
 * Detailed package information
 */
export interface PackageDetails extends PackageInfo {
  readme?: string;
  versions: VersionInfo[];
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  dependents?: DependentsInfo;
  requirements?: RequirementsInfo;
  maintainers?: PackageMaintainer[];
  time?: Record<string, string>;
  distTags?: Record<string, string>;
  bugs?: { url?: string; email?: string };
  security?: SecurityInfo;
}

/**
 * Version information
 */
export interface VersionInfo {
  version: string;
  publishedAt?: string;
  deprecated?: string;
  tag?: string;
  dist?: {
    shasum?: string;
    tarball?: string;
    unpackedSize?: number;
  };
}

/**
 * Package author
 */
export interface PackageAuthor {
  name?: string;
  email?: string;
  url?: string;
}

/**
 * Package publisher
 */
export interface PackagePublisher {
  username: string;
  email?: string;
}

/**
 * Package maintainer
 */
export interface PackageMaintainer {
  name?: string;
  username?: string;
  email?: string;
}

/**
 * Package repository
 */
export interface PackageRepository {
  type?: string;
  url?: string;
  directory?: string;
}

/**
 * Package quality scores from npms.io
 */
export interface PackageScore {
  final: number;
  detail?: {
    quality: number;
    popularity: number;
    maintenance: number;
  };
}

/**
 * Bundle size information from bundlephobia
 */
export interface BundleSize {
  size: number; // minified size in bytes
  gzip: number; // gzipped size in bytes
  dependencyCount?: number;
  hasJSModule?: boolean;
  hasSideEffects?: boolean;
}

/**
 * Security vulnerability information
 */
export interface SecurityInfo {
  vulnerabilities: Vulnerability[];
  summary: VulnerabilitySummary;
}

/**
 * Individual vulnerability
 */
export interface Vulnerability {
  id: number;
  title: string;
  severity: VulnerabilitySeverity;
  url?: string;
  vulnerableVersions?: string;
  patchedVersions?: string;
  recommendation?: string;
  cwe?: string[];
  cvss?: {
    score: number;
    vectorString?: string;
  };
  published?: string;
  details?: string;
}

/**
 * Vulnerability severity levels
 */
export type VulnerabilitySeverity = 'critical' | 'high' | 'moderate' | 'low' | 'info';

/**
 * Vulnerability summary counts
 */
export interface VulnerabilitySummary {
  total: number;
  critical: number;
  high: number;
  moderate: number;
  low: number;
  info: number;
}

/**
 * Installed package in workspace
 */
export interface InstalledPackage {
  name: string;
  currentVersion: string;
  latestVersion?: string;
  wantedVersion?: string;
  type: DependencyType;
  hasUpdate: boolean;
  updateType?: UpdateType;
  packageJsonPath: string;
}

/**
 * Dependency type in package.json
 */
export type DependencyType =
  | 'dependencies'
  | 'devDependencies'
  | 'peerDependencies'
  | 'optionalDependencies';

/**
 * Type of version update
 */
export type UpdateType = 'major' | 'minor' | 'patch' | 'prerelease';

/**
 * Installation options
 */
export interface InstallOptions {
  version?: string;
  type: DependencyType;
  packageManager?: PackageManager;
  exact?: boolean;
}

/**
 * Copy options for package managers that require copying snippets (Maven, Gradle, etc.)
 */
export interface CopyOptions {
  version?: string;
  scope?: 'compile' | 'test' | 'runtime' | 'provided';
  format?: 'xml' | 'gradle' | 'sbt' | 'other';
}

/**
 * Package manager type
 */
export type PackageManager = 'npm' | 'yarn' | 'pnpm';

/**
 * Search result from APIs
 */
export interface SearchResult {
  packages: PackageInfo[];
  total: number;
  hasMore: boolean;
}

/**
 * Search options
 */
export interface SearchOptions {
  query: string;
  from?: number;
  size?: number;
  sortBy?: SearchSortBy;
  filters?: SearchFilters;
}

/**
 * Search sorting options
 */
export type SearchSortBy =
  | 'relevance'
  | 'popularity'
  | 'quality'
  | 'maintenance'
  | 'name';

/**
 * Search filters
 */
export interface SearchFilters {
  scope?: string;
  author?: string;
  keywords?: string[];
  minDownloads?: number;
  maxBundleSize?: number;
  excludeDeprecated?: boolean;
  license?: string[];
}

export type EcosystemName = 'npm' | 'maven' | 'go' | 'unknown';

export interface DependentPackageRef {
  system: string;
  name: string;
}

export interface DependentSampleItem {
  package: DependentPackageRef;
  version: string;
}

export interface DependentsInfo {
  package: DependentPackageRef;
  version: string;
  totalCount: number;
  directCount: number;
  indirectCount: number;
  directSample: DependentSampleItem[];
  indirectSample: DependentSampleItem[];
  webUrl?: string;
}

export interface RequirementItem {
  name: string;
  requirement?: string;
  version?: string;
  scope?: string;
  optional?: boolean;
  classifier?: string;
  type?: string;
  exclusions?: string[];
}

export interface RequirementSection {
  id: string;
  title: string;
  items: RequirementItem[];
}

export interface RequirementsInfo {
  system: string;
  package: string;
  version: string;
  sections: RequirementSection[];
  webUrl?: string;
}
