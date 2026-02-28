/**
 * Project types supported by the extension
 */
export type ProjectType = 'npm' | 'maven' | 'go' | 'dotnet' | 'unknown';

/**
 * Source types available for package management
 */
export type SourceType = 
  | 'npm-registry' 
  | 'npms-io'
  | 'sonatype'
  | 'libraries-io'
  | 'pkg-go-dev'
  | 'nuget';

/**
 * Information about a detected project
 */
export interface ProjectInfo {
  type: ProjectType;
  configFile: string;      // package.json / pom.xml / go.mod
  workspacePath: string;
}

/**
 * Result of project detection (workspace-style: multiple project types can coexist)
 */
export interface DetectedProjects {
  projects: ProjectInfo[];
  /** Default project type when opening (first in display order among detected) */
  primary: ProjectType;
  /** All project types present in workspace (e.g. [npm, dotnet]) for multi-selector */
  detectedTypes: ProjectType[];
}

/**
 * Mapping from project type to supported source types
 * Note: libraries-io can be used as both a standalone source and as a fallback
 */
export const PROJECT_SOURCE_MAP: Record<ProjectType, SourceType[]> = {
  npm: ['npm-registry', 'libraries-io'],
  maven: ['sonatype', 'libraries-io'],
  go: ['pkg-go-dev'],
  dotnet: ['nuget'],
  unknown: ['npm-registry'], // Default to npm
};

/**
 * Config file patterns for project detection
 * .NET: .csproj, .vbproj, .fsproj, packages.config, Directory.Packages.props, paket.dependencies
 */
export const PROJECT_CONFIG_FILES: Record<ProjectType, string[]> = {
  npm: ['package.json'],
  maven: ['pom.xml'],
  go: ['go.mod'],
  dotnet: ['.csproj', '.vbproj', '.fsproj', 'packages.config', 'Directory.Packages.props', 'paket.dependencies'],
  unknown: [],
};

/**
 * Display names for project types
 */
export const PROJECT_DISPLAY_NAMES: Record<ProjectType, string> = {
  npm: 'npm',
  maven: 'Maven',
  go: 'Go',
  dotnet: '.NET',
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
  'nuget': 'NuGet',
};

/**
 * Check if a project type requires copy functionality instead of install
 * Maven/Gradle/SBT use copy snippets; .NET supports both copy (PackageReference, CPM, Paket, Cake, PMC) and CLI install
 */
export function requiresCopy(projectType: ProjectType): boolean {
  return projectType === 'maven' || projectType === 'dotnet';
}