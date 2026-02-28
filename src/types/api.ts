/**
 * npm Registry API response types
 */

/**
 * npm registry package response
 */
export interface NpmRegistryPackage {
  _id: string;
  _rev?: string;
  name: string;
  description?: string;
  'dist-tags': Record<string, string>;
  versions: Record<string, NpmPackageVersion>;
  maintainers?: NpmMaintainer[];
  time?: Record<string, string>;
  repository?: {
    type?: string;
    url?: string;
    directory?: string;
  };
  readme?: string;
  readmeFilename?: string;
  license?: string;
  keywords?: string[];
  homepage?: string;
  bugs?: {
    url?: string;
    email?: string;
  };
  author?: NpmAuthor;
}

/**
 * npm package version info
 */
export interface NpmPackageVersion {
  name: string;
  version: string;
  description?: string;
  main?: string;
  types?: string;
  typings?: string;
  module?: string;
  exports?: Record<string, unknown>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  deprecated?: string;
  license?: string;
  repository?: {
    type?: string;
    url?: string;
    directory?: string;
  };
  dist: NpmDist;
}

/**
 * npm distribution info
 */
export interface NpmDist {
  shasum: string;
  tarball: string;
  integrity?: string;
  fileCount?: number;
  unpackedSize?: number;
  signatures?: Array<{
    keyid: string;
    sig: string;
  }>;
}

/**
 * npm maintainer
 */
export interface NpmMaintainer {
  name?: string;
  email?: string;
}

/**
 * npm author
 */
export interface NpmAuthor {
  name?: string;
  email?: string;
  url?: string;
}

/**
 * npm search response
 */
export interface NpmSearchResponse {
  objects: NpmSearchObject[];
  total: number;
  time: string;
}

/**
 * npm search result object
 */
export interface NpmSearchObject {
  package: NpmSearchPackage;
  score: {
    final: number;
    detail: {
      quality: number;
      popularity: number;
      maintenance: number;
    };
  };
  downloads: {
    weekly: number;
  };
  searchScore: number;
}

/**
 * npm search package info
 */
export interface NpmSearchPackage {
  name: string;
  scope: string;
  version: string;
  description?: string;
  keywords?: string[];
  date: string;
  links: {
    npm?: string;
    homepage?: string;
    repository?: string;
    bugs?: string;
  };
  author?: NpmAuthor;
  publisher: {
    username: string;
    email?: string;
  };
  maintainers: NpmMaintainer[];
}

/**
 * npm downloads response
 */
export interface NpmDownloadsResponse {
  downloads: number;
  start: string;
  end: string;
  package: string;
}

/**
 * npms.io API response types
 */

/**
 * npms.io search response
 */
export interface NpmsSearchResponse {
  total: number;
  results: NpmsSearchResult[];
}

/**
 * npms.io search result
 */
export interface NpmsSearchResult {
  package: NpmsPackage;
  score: {
    final: number;
    detail: {
      quality: number;
      popularity: number;
      maintenance: number;
    };
  };
  searchScore: number;
  highlight?: string;
}

/**
 * npms.io package info
 */
export interface NpmsPackage {
  name: string;
  scope?: string;
  version: string;
  description?: string;
  keywords?: string[];
  date: string;
  links: {
    npm?: string;
    homepage?: string;
    repository?: string;
    bugs?: string;
  };
  author?: {
    name?: string;
    email?: string;
    url?: string;
  };
  publisher: {
    username: string;
    email?: string;
  };
  maintainers: Array<{
    username: string;
    email?: string;
  }>;
}

/**
 * npms.io package analysis
 */
export interface NpmsPackageAnalysis {
  analyzedAt: string;
  collected: {
    metadata: NpmsMetadata;
    npm: NpmsNpmInfo;
    github?: NpmsGithubInfo;
    source?: NpmsSourceInfo;
  };
  evaluation: {
    quality: NpmsQualityEvaluation;
    popularity: NpmsPopularityEvaluation;
    maintenance: NpmsMaintenanceEvaluation;
  };
  score: {
    final: number;
    detail: {
      quality: number;
      popularity: number;
      maintenance: number;
    };
  };
}

export interface NpmsMetadata {
  name: string;
  scope?: string;
  version: string;
  description?: string;
  keywords?: string[];
  date: string;
  publisher: { username: string };
  maintainers: Array<{ username: string }>;
  repository?: { type: string; url: string };
  links: Record<string, string>;
  license?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  releases: Array<{ from: string; to: string; count: number }>;
}

export interface NpmsNpmInfo {
  downloads: Array<{ from: string; to: string; count: number }>;
  starsCount?: number;
}

export interface NpmsGithubInfo {
  starsCount: number;
  forksCount: number;
  subscribersCount: number;
  issues: {
    count: number;
    openCount: number;
    isDisabled: boolean;
  };
  contributors: Array<{ username: string; commitsCount: number }>;
}

export interface NpmsSourceInfo {
  files: {
    readmeSize: number;
    testsSize?: number;
    hasChangelog: boolean;
  };
  coverage?: number;
}

export interface NpmsQualityEvaluation {
  carefulness: number;
  tests: number;
  health: number;
  branding: number;
}

export interface NpmsPopularityEvaluation {
  communityInterest: number;
  downloadsCount: number;
  downloadsAcceleration: number;
  dependentsCount: number;
}

export interface NpmsMaintenanceEvaluation {
  releasesFrequency: number;
  commitsFrequency: number;
  openIssues: number;
  issuesDistribution: number;
}

/**
 * Bundlephobia API response types
 */

/**
 * Bundlephobia size response
 */
export interface BundlephobiaResponse {
  name: string;
  version: string;
  description?: string;
  size: number;
  gzip: number;
  dependencyCount: number;
  dependencySizes: Array<{
    name: string;
    approximateSize: number;
  }>;
  hasJSModule: boolean;
  hasJSNext: boolean;
  hasSideEffects: boolean;
  scoped: boolean;
  repository?: string;
}

/**
 * npm audit API response types
 */

/**
 * Bulk audit response
 */
export interface NpmAuditBulkResponse {
  [packageName: string]: NpmAdvisory[];
}

/**
 * npm advisory
 */
export interface NpmAdvisory {
  id: number;
  url: string;
  title: string;
  severity: 'critical' | 'high' | 'moderate' | 'low' | 'info';
  vulnerable_versions: string;
  patched_versions?: string;
  recommendation?: string;
  cwe?: string[];
  cvss?: {
    score: number;
    vectorString?: string;
  };
}

/**
 * Full audit response
 */
export interface NpmAuditResponse {
  actions: NpmAuditAction[];
  advisories: Record<string, NpmAuditAdvisory>;
  metadata: {
    vulnerabilities: {
      info: number;
      low: number;
      moderate: number;
      high: number;
      critical: number;
    };
    dependencies: number;
    devDependencies: number;
    totalDependencies: number;
  };
}

export interface NpmAuditAction {
  action: string;
  module: string;
  target: string;
  resolves: Array<{ id: number; path: string }>;
}

export interface NpmAuditAdvisory {
  id: number;
  title: string;
  module_name: string;
  severity: string;
  url: string;
  findings: Array<{ version: string; paths: string[] }>;
  recommendation: string;
}
