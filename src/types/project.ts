/**
 * Project types supported by the extension
 */
export type ProjectType = 'npm' | 'maven' | 'go' | 'dotnet' | 'php' | 'ruby' | 'clojure' | 'rust' | 'perl' | 'dart' | 'flutter' | 'r' | 'unknown';

/**
 * Source types available for package management
 */
export type SourceType = 
  | 'npm-registry' 
  | 'npms-io'
  | 'sonatype'
  | 'libraries-io'
  | 'pkg-go-dev'
  | 'nuget'
  | 'packagist'
  | 'rubygems'
  | 'clojars'
  | 'crates-io'
  | 'metacpan'
  | 'pub-dev'
  | 'cran';

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
  php: ['packagist'],
  ruby: ['rubygems'],
  clojure: ['clojars'],
  rust: ['crates-io'],
  perl: ['metacpan'],
  dart: ['pub-dev'],
  flutter: ['pub-dev'],
  r: ['cran'],
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
  php: ['composer.json'],
  ruby: ['Gemfile'],
  clojure: ['deps.edn', 'project.clj'],
  rust: ['Cargo.toml'],
  perl: ['cpanfile'],
  dart: ['pubspec.yaml'],
  flutter: ['pubspec.yaml'],
  r: ['DESCRIPTION', '*.Rproj'],
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
  php: 'PHP',
  ruby: 'Ruby',
  clojure: 'Clojure',
  rust: 'Rust',
  perl: 'Perl',
  dart: 'Dart',
  flutter: 'Flutter',
  r: 'R',
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
  'packagist': 'Packagist',
  'rubygems': 'RubyGems',
  'clojars': 'Clojars',
  'crates-io': 'crates.io',
  'metacpan': 'MetaCPAN',
  'pub-dev': 'pub.dev',
  'cran': 'CRAN',
};

/**
 * Check if a project type requires copy functionality instead of install
 * Maven/Gradle/SBT use copy snippets; .NET supports both copy (PackageReference, CPM, Paket, Cake, PMC) and CLI install
 */
export function requiresCopy(projectType: ProjectType): boolean {
  return projectType === 'maven' || projectType === 'dotnet' || projectType === 'clojure' || projectType === 'r';
}
