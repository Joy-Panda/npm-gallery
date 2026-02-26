import type { SearchSortBy } from '../types/package';
import type { ProjectType, SourceType } from '../types/project';

/**
 * Configuration for a specific source
 */
export interface SourceConfig {
  primary: SourceType;           // Primary source identifier
  fallbacks: SourceType[];       // Fallback sources in order of priority
  sortOptions: SearchSortBy[];   // Supported sort options
  filters: string[];             // Supported filter fields
}

/**
 * Default source configurations for each project type
 */
export const DEFAULT_SOURCE_CONFIG: Record<ProjectType, SourceConfig> = {
  npm: {
    primary: 'npm-registry',
    fallbacks: ['npms-io'],
    sortOptions: ['relevance', 'popularity', 'quality', 'maintenance', 'name'],
    filters: ['author', 'maintainer', 'scope', 'keywords'],
  },
  maven: {
    primary: 'sonatype',
    fallbacks: [],
    sortOptions: ['relevance', 'popularity'],
    filters: ['groupId'],
  },
  go: {
    primary: 'pkg-go-dev',
    fallbacks: [],
    sortOptions: ['relevance', 'popularity'],
    filters: [],
  },
  unknown: {
    primary: 'npm-registry',
    fallbacks: ['npms-io'],
    sortOptions: ['relevance', 'popularity', 'quality', 'maintenance', 'name'],
    filters: ['author', 'maintainer', 'scope', 'keywords'],
  },
};

/**
 * Source configuration manager
 * Manages source configurations with support for user overrides
 */
export class SourceConfigManager {
  private configs: Record<ProjectType, SourceConfig>;

  constructor(userConfigs?: Partial<Record<ProjectType, Partial<SourceConfig>>>) {
    // Start with default configs
    this.configs = { ...DEFAULT_SOURCE_CONFIG };

    // Apply user overrides if provided
    if (userConfigs) {
      for (const [projectType, userConfig] of Object.entries(userConfigs)) {
        if (userConfig) {
          this.configs[projectType as ProjectType] = {
            ...this.configs[projectType as ProjectType],
            ...userConfig,
          };
        }
      }
    }
  }

  /**
   * Get configuration for a project type
   */
  getConfig(projectType: ProjectType): SourceConfig {
    return this.configs[projectType] || this.configs.unknown;
  }

  /**
   * Get primary source for a project type
   */
  getPrimarySource(projectType: ProjectType): SourceType {
    return this.getConfig(projectType).primary;
  }

  /**
   * Get fallback sources for a project type
   */
  getFallbackSources(projectType: ProjectType): SourceType[] {
    return this.getConfig(projectType).fallbacks;
  }

  /**
   * Get all sources (primary + fallbacks) for a project type
   */
  getAllSources(projectType: ProjectType): SourceType[] {
    const config = this.getConfig(projectType);
    return [config.primary, ...config.fallbacks];
  }

  /**
   * Get supported sort options for a project type
   */
  getSortOptions(projectType: ProjectType): SearchSortBy[] {
    return this.getConfig(projectType).sortOptions;
  }

  /**
   * Get supported filters for a project type
   */
  getFilters(projectType: ProjectType): string[] {
    return this.getConfig(projectType).filters;
  }

  /**
   * Update configuration for a project type
   */
  updateConfig(projectType: ProjectType, config: Partial<SourceConfig>): void {
    this.configs[projectType] = {
      ...this.configs[projectType],
      ...config,
    };
  }
}

// Default singleton instance
let configManager: SourceConfigManager | null = null;

/**
 * Get the source config manager instance
 */
export function getSourceConfigManager(): SourceConfigManager {
  if (!configManager) {
    configManager = new SourceConfigManager();
  }
  return configManager;
}

/**
 * Initialize source config manager with user configurations
 */
export function initSourceConfigManager(
  userConfigs?: Partial<Record<ProjectType, Partial<SourceConfig>>>
): SourceConfigManager {
  configManager = new SourceConfigManager(userConfigs);
  return configManager;
}
