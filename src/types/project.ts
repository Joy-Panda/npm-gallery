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
  | 'sonatype'
  | 'libraries-io'
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
 * Note: libraries-io can be used as both a standalone source and as a fallback
 */
export const PROJECT_SOURCE_MAP: Record<ProjectType, SourceType[]> = {
  npm: ['npm-registry', 'libraries-io'],
  maven: ['sonatype', 'libraries-io'],
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
  npm: 'npm',
  maven: 'Maven',
  go: 'Go',
  unknown: 'Unknown',
};

/**
 * Display names for source types
 */
export const SOURCE_DISPLAY_NAMES: Record<SourceType, string> = {
  'npm-registry': 'npm Registry',
  'npms-io': 'npms.io',
  'sonatype': 'Sonatype Central',
  'libraries-io': 'Libraries.io',
  'pkg-go-dev': 'pkg.go.dev',
};

/**
 * Check if a project type requires copy functionality instead of install
 * All Java/Scala build tools (maven, gradle, sbt, etc.) require copy
 * Only npm/go projects support direct installation
 */
export function requiresCopy(projectType: ProjectType): boolean {
  return projectType === 'maven';
}