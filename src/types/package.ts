/**
 * Basic package information displayed in search results
 */
export interface PackageInfo {
  name: string;
  version: string;
  description?: string;
  exactMatch?: boolean;
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

/** NuGet: dependency group per target framework */
export interface NuGetDependencyGroup {
  targetFramework: string;
  dependencies: Array<{ id: string; range: string }>;
}

/** NuGet: used-by section – top NuGet packages and GitHub repos */
export interface NuGetDependentsInfo {
  totalNuGet?: number;
  totalGitHub?: number;
  nugetPackages: Array<{
    name: string;
    description?: string;
    downloads?: number;
  }>;
  githubRepos?: Array<{
    name: string;
    fullName?: string;
    description?: string;
    stars?: number;
    url?: string;
  }>;
  webUrl?: string;
}

/** NuGet: one target framework version line (compatible or computed) */
export interface NuGetFrameworkVersion {
  version: string;
  status: 'compatible' | 'computed';
}

/** NuGet: product (e.g. .NET, .NET Framework) and its versions */
export interface NuGetFrameworkProduct {
  product: string;
  versions: NuGetFrameworkVersion[];
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
  /** NuGet: dependencies grouped by target framework */
  nugetDependencyGroups?: NuGetDependencyGroup[];
  /** NuGet: used-by (top NuGet packages + GitHub repos) */
  nugetDependents?: NuGetDependentsInfo;
  /** NuGet: supported target frameworks by product */
  nugetFrameworks?: NuGetFrameworkProduct[];
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
  workspaceFolderPath?: string;
  manifestName?: string;
  name: string;
  currentVersion: string;
  resolvedVersion?: string;
  versionSpecifier?: string;
  specKind?: DependencySpecKind;
  isRegistryResolvable?: boolean;
  latestVersion?: string;
  wantedVersion?: string;
  type: DependencyType;
  hasUpdate: boolean;
  updateType?: UpdateType;
  packageJsonPath: string;
}

export interface WorkspacePackageScope {
  workspaceFolderPath?: string;
  manifestPath?: string;
}

export type DependencySpecKind =
  | 'semver'
  | 'workspace'
  | 'file'
  | 'path'
  | 'git'
  | 'tag'
  | 'unknown';

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
/**
 * Build tool types for Java/Scala projects
 * All of these build tools require copy functionality instead of direct installation
 */
export type BuildTool = 'maven' | 'gradle' | 'sbt' | 'mill' | 'ivy' | 'grape' | 'leiningen' | 'buildr';

/**
 * Check if a build tool requires copy functionality
 * All Java/Scala build tools require copying snippets to build files
 * @param buildTool The build tool to check
 * @returns true if the build tool requires copy, false otherwise
 */
export function buildToolRequiresCopy(buildTool: BuildTool | null): boolean {
  // All build tools in the BuildTool type require copy
  return buildTool !== null;
}

/** NuGet copy/run format: PackageReference, .NET CLI, CPM, Paket, Cake, PMC, Script, etc. */
export type NuGetCopyFormat =
  | 'packagereference'   // Copy to .csproj
  | 'dotnet-cli'        // Run in terminal
  | 'cpm'               // Copy to Directory.Packages.props (PackageVersion)
  | 'cpm-project'       // Copy to .csproj when using CPM (PackageReference without version)
  | 'paket'             // Run in terminal (paket add)
  | 'paket-deps'        // Copy to paket.dependencies
  | 'cake'              // Copy: Cake Addin (#addin)
  | 'cake-tool'         // Copy: Cake Tool (#tool)
  | 'pmc'               // Copy then run in PMC (Install-Package)
  | 'script'            // Copy: Script & Interactive (#r "nuget: ...")
  | 'file-based';       // Copy: File-based Apps (#:package ...)

/** How to apply this format: run in terminal, copy to PMC, or copy to file */
export type NuGetFormatRunType = 'terminal' | 'pmc' | 'copy';

/** Which formats are runnable in terminal vs need copy */
export const NUGET_FORMAT_RUN_TYPE: Record<NuGetCopyFormat, NuGetFormatRunType> = {
  packagereference: 'copy',
  'dotnet-cli': 'terminal',
  cpm: 'copy',
  'cpm-project': 'copy',
  paket: 'terminal',
  'paket-deps': 'copy',
  cake: 'copy',
  'cake-tool': 'copy',
  pmc: 'pmc',
  script: 'copy',
  'file-based': 'copy',
};

/** Short label for UI: "Run in terminal" / "Run in PMC" / "Copy" */
export const NUGET_FORMAT_RUN_LABELS: Record<NuGetFormatRunType, string> = {
  terminal: 'Run in terminal',
  pmc: 'Run in PMC',
  copy: 'Copy to clipboard',
};

/** Display names for NuGet copy/run formats */
export const NUGET_COPY_FORMAT_LABELS: Record<NuGetCopyFormat, string> = {
  packagereference: 'PackageReference (.csproj)',
  'dotnet-cli': '.NET CLI (terminal)',
  cpm: 'CPM - Directory.Packages.props',
  'cpm-project': 'CPM - Project file (PackageReference)',
  paket: 'Paket CLI (terminal)',
  'paket-deps': 'Paket (paket.dependencies)',
  cake: 'Cake Addin (#addin)',
  'cake-tool': 'Cake Tool (#tool)',
  pmc: 'PMC (Install-Package)',
  script: 'Script & Interactive (#r nuget:)',
  'file-based': 'File-based (#:package)',
};

/**
 * .NET/NuGet management style (detected from workspace, like npm/yarn/pnpm/bun).
 * - packagereference: .csproj with PackageReference (or SDK-style)
 * - cpm: Central Package Management (Directory.Packages.props)
 * - paket: Paket CLI (paket.dependencies)
 * - packages.config: Legacy file-based (packages.config)
 * - cake: Cake build scripts (.cake)
 */
export type NuGetManagementStyle = 'packagereference' | 'cpm' | 'paket' | 'packages.config' | 'cake';

/** Map NuGet management style to default copy/run format */
export const NUGET_STYLE_TO_COPY_FORMAT: Record<NuGetManagementStyle, NuGetCopyFormat> = {
  packagereference: 'packagereference',
  cpm: 'cpm',
  paket: 'paket',
  'packages.config': 'pmc',
  cake: 'cake',
};

/** Display names for NuGet management styles */
export const NUGET_MANAGEMENT_STYLE_LABELS: Record<NuGetManagementStyle, string> = {
  packagereference: 'PackageReference (.NET CLI)',
  cpm: 'Central Package Management (CPM)',
  paket: 'Paket CLI',
  'packages.config': 'packages.config (Legacy)',
  cake: 'Cake',
};

export interface CopyOptions {
  version?: string;
  scope?: 'compile' | 'test' | 'runtime' | 'provided';
  format?: 'xml' | 'gradle' | 'sbt' | 'grape' | 'other' | NuGetCopyFormat;
  buildTool?: BuildTool; // Auto-detect if not provided
}

/**
 * Package manager type
 */
export type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'bun' | 'dotnet' | 'paket';

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
  exactName?: string;
  from?: number;
  size?: number;
  sortBy?: SearchSortBy;
  filters?: SearchFilters;
  signal?: AbortSignal;
}

/**
 * Sort option with display label and actual value
 */
export interface SortOption {
  value: string;
  label: string;
}

/**
 * Search sorting option - can be a string (for backward compatibility) or SortOption
 * When used as string, it represents the value directly
 * When used as SortOption, it provides both display label and value
 */
export type SearchSortBy = string | SortOption;

/**
 * Helper function to get the sort value from SearchSortBy
 */
export function getSortValue(sortBy: SearchSortBy): string {
  if (typeof sortBy === 'string') {
    return sortBy;
  }
  return sortBy.value;
}

/**
 * Helper function to get the sort label from SearchSortBy
 */
export function getSortLabel(sortBy: SearchSortBy): string {
  if (typeof sortBy === 'string') {
    // Default labels for common sort options
    const labels: Record<string, string> = {
      relevance: 'Relevance',
      popularity: 'Popularity',
      quality: 'Quality',
      maintenance: 'Maintenance',
      name: 'Name',
      score: 'Score',
      timestamp: 'Timestamp',
      groupId: 'Group ID',
      artifactId: 'Artifact ID',
    };
    return labels[sortBy] || sortBy.charAt(0).toUpperCase() + sortBy.slice(1);
  }
  return sortBy.label;
}

/**
 * Helper function to create a SortOption from a string (for backward compatibility)
 */
export function createSortOption(value: string, label?: string): SortOption {
  return {
    value,
    label: label || getSortLabel(value),
  };
}

/**
 * Filter option with display label, placeholder, and actual value
 */
export interface FilterOption {
  value: string;
  label: string;
  placeholder?: string;
}

/**
 * Search filter option - can be a string (for backward compatibility) or FilterOption
 * When used as string, it represents the value directly
 * When used as FilterOption, it provides display label, placeholder, and value
 */
export type SearchFilter = string | FilterOption;

/**
 * Helper function to get the filter value from SearchFilter
 */
export function getFilterValue(filter: SearchFilter): string {
  if (typeof filter === 'string') {
    return filter;
  }
  return filter.value;
}

/**
 * Helper function to get the filter label from SearchFilter
 */
export function getFilterLabel(filter: SearchFilter): string {
  if (typeof filter === 'string') {
    // Default labels for common filter options
    const labels: Record<string, string> = {
      author: 'Author',
      maintainer: 'Maintainer',
      scope: 'Scope',
      keywords: 'Keywords',
      groupId: 'Group ID',
      artifactId: 'Artifact ID',
      version: 'Version',
      tags: 'Tags',
      languages: 'Languages',
      licenses: 'Licenses',
      platforms: 'Platforms',
    };
    return labels[filter] || filter.charAt(0).toUpperCase() + filter.slice(1);
  }
  return filter.label;
}

/**
 * Helper function to get the filter placeholder from SearchFilter
 */
export function getFilterPlaceholder(filter: SearchFilter): string {
  if (typeof filter === 'string') {
    // Default placeholders for common filter options
    const placeholders: Record<string, string> = {
      author: 'author username',
      maintainer: 'maintainer username',
      scope: 'scope (e.g., @foo/bar)',
      keywords: 'keywords: Use + for AND, , for OR, - to exclude',
      groupId: 'groupId (e.g., com.google.inject)',
      artifactId: 'artifactId (e.g., guice)',
      version: 'version (e.g., 1.0.0)',
      tags: 'tags (comma-separated)',
      languages: 'languages (comma-separated, e.g., Java,JavaScript)',
      licenses: 'licenses (comma-separated, e.g., MIT,Apache-2.0)',
      platforms: 'platforms (comma-separated, e.g., Maven,NPM)',
    };
    return placeholders[filter] || `Enter ${filter}`;
  }
  return filter.placeholder || `Enter ${filter.label}`;
}

/**
 * Helper function to create a FilterOption from a string (for backward compatibility)
 */
export function createFilterOption(value: string, label?: string, placeholder?: string): FilterOption {
  return {
    value,
    label: label || getFilterLabel(value),
    placeholder: placeholder || getFilterPlaceholder(value),
  };
}

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

export type EcosystemName = 'npm' | 'maven' | 'go' | 'nuget' | 'unknown';

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
