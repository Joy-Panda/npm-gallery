/**
 * Project types supported by the extension
 */
export type ProjectType = 'npm' | 'maven' | 'go' | 'unknown';

/**
 * Source types available for package management
 */
export type SourceType = 
  | 'npm-registry' 
  | 'npms-io' 
  | 'maven-central' 
  | 'sonatype'
  | 'pkg-go-dev';

/**
 * Information about a detected project
 */
export interface ProjectInfo {
  type: ProjectType;
  configFile: string;      // package.json / pom.xml / go.mod
  workspacePath: string;
}

/**
 * Result of project detection
 */
export interface DetectedProjects {
  projects: ProjectInfo[];
  primary: ProjectType;    // Primary/preferred project type
}

/**
 * Mapping from project type to supported source types
 */
export const PROJECT_SOURCE_MAP: Record<ProjectType, SourceType[]> = {
  npm: ['npm-registry', 'npms-io'],
  maven: ['sonatype', 'maven-central'],
  go: ['pkg-go-dev'],
  unknown: ['npm-registry'], // Default to npm
};

/**
 * Config file patterns for project detection
 */
export const PROJECT_CONFIG_FILES: Record<ProjectType, string[]> = {
  npm: ['package.json'],
  maven: ['pom.xml'],
  go: ['go.mod'],
  unknown: [],
};

/**
 * Display names for project types
 */
export const PROJECT_DISPLAY_NAMES: Record<ProjectType, string> = {
  npm: 'Node.js / npm',
  maven: 'Java / Maven',
  go: 'Go',
  unknown: 'Unknown',
};

/**
 * Display names for source types
 */
export const SOURCE_DISPLAY_NAMES: Record<SourceType, string> = {
  'npm-registry': 'npm Registry',
  'npms-io': 'npms.io',
  'maven-central': 'Maven Central',
  'sonatype': 'Sonatype Central',
  'pkg-go-dev': 'pkg.go.dev',
};
