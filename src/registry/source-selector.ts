import type { ISourceAdapter } from '../sources/base/source-adapter.interface';
import type { SourceType, ProjectType } from '../types/project';
import { PROJECT_SOURCE_MAP } from '../types/project';
import type { SourceRegistry } from './source-registry';
import type { ProjectDetector } from './project-detector';
import type { SourceConfigManager } from '../config/source-config';
import type { SearchSortBy, SearchFilter } from '../types/package';
import { createSortOption, createFilterOption, getFilterValue } from '../types/package';

/**
 * Source selector
 * Handles source selection based on project type and user preferences.
 * Workspace-style: multiple project types (npm, dotnet) can coexist; user switches context.
 */
export class SourceSelector {
  private currentProjectType: ProjectType = 'unknown';
  /** Project types detected in workspace (e.g. [npm, dotnet]) for multi-selector */
  private detectedTypes: ProjectType[] = [];
  private userSelectedSource: SourceType | null = null;
  private detectionPromise: Promise<void> | null = null;

  constructor(
    private registry: SourceRegistry,
    private detector: ProjectDetector,
    private configManager: SourceConfigManager
  ) {}

  /**
   * Initialize by detecting project type
   */
  async initialize(): Promise<void> {
    if (this.detectionPromise) {
      return this.detectionPromise;
    }

    this.detectionPromise = this.detectAndSetProjectType();
    await this.detectionPromise;
  }

  /**
   * Detect and set the current project type + detected types (workspace-style)
   */
  private async detectAndSetProjectType(): Promise<void> {
    try {
      const detected = await this.detector.detectProjects();
      this.detectedTypes = detected.detectedTypes ?? [];
      this.currentProjectType = detected.primary;
    } catch {
      this.currentProjectType = 'unknown';
      this.detectedTypes = [];
    }
  }

  /**
   * Get all project types detected in workspace (for multi-selector UI)
   */
  getDetectedProjectTypes(): ProjectType[] {
    return this.detectedTypes.length > 0 ? [...this.detectedTypes] : [this.currentProjectType].filter(t => t !== 'unknown');
  }

  /**
   * Get the current project type
   */
  getCurrentProjectType(): ProjectType {
    return this.currentProjectType;
  }

  /**
   * Set project type manually
   */
  setProjectType(type: ProjectType): void {
    this.currentProjectType = type;
    // Clear user selection when project type changes
    this.userSelectedSource = null;
  }

  /**
   * Set user-selected source
   */
  setUserSelectedSource(source: SourceType | null): void {
    this.userSelectedSource = source;
  }

  /**
   * Get user-selected source
   */
  getUserSelectedSource(): SourceType | null {
    return this.userSelectedSource;
  }

  /**
   * Select and get a source adapter
   * Priority: user selection > primary source > fallbacks
   */
  selectSource(userSelection?: SourceType): ISourceAdapter {
    const effectiveSelection = userSelection || this.userSelectedSource;
    console.log(`[SourceSelector] selectSource called, userSelection: ${userSelection}, userSelectedSource: ${this.userSelectedSource}, effectiveSelection: ${effectiveSelection}`);

    // If user has selected a specific source, use it
    if (effectiveSelection) {
      const adapter = this.registry.getAdapter(effectiveSelection);
      if (adapter) {
        console.log(`[SourceSelector] Using user-selected source: ${effectiveSelection}, adapter: ${adapter.displayName}`);
        return adapter;
      } else {
        console.log(`[SourceSelector] User-selected source ${effectiveSelection} not found in registry`);
      }
    }

    // Get primary source for current project type
    const primarySource = this.configManager.getPrimarySource(this.currentProjectType);
    console.log(`[SourceSelector] Current project type: ${this.currentProjectType}, primary source: ${primarySource}`);
    const primaryAdapter = this.registry.getAdapter(primarySource);
    if (primaryAdapter) {
      console.log(`[SourceSelector] Using primary source: ${primarySource}, adapter: ${primaryAdapter.displayName}`);
      return primaryAdapter;
    }

    // Try fallback sources
    const fallbacks = this.configManager.getFallbackSources(this.currentProjectType);
    console.log(`[SourceSelector] Fallback sources: ${fallbacks.join(', ')}`);
    for (const fallback of fallbacks) {
      const adapter = this.registry.getAdapter(fallback);
      if (adapter) {
        console.log(`[SourceSelector] Using fallback source: ${fallback}, adapter: ${adapter.displayName}`);
        return adapter;
      }
    }

    // Last resort: return any available adapter
    const allAdapters = this.registry.getAllAdapters();
    if (allAdapters.length > 0) {
      console.log(`[SourceSelector] Using first available adapter: ${allAdapters[0].sourceType}, adapter: ${allAdapters[0].displayName}`);
      return allAdapters[0];
    }

    throw new Error('No source adapter available');
  }

  /**
   * Get available sources for the current context.
   * Workspace-style: when multiple project types exist, return sources for detected types only
   * (so user can switch between npm and nuget etc. without seeing irrelevant sources).
   * When dotnet is detected or current, NuGet is the only search source (like npm for Node, Maven for Java).
   */
  getAvailableSources(): SourceType[] {
    const types = this.detectedTypes.length > 0 ? this.detectedTypes : [this.currentProjectType];
    const sourceSet = new Set<SourceType>();
    for (const t of types) {
      const sources = PROJECT_SOURCE_MAP[t] ?? PROJECT_SOURCE_MAP.unknown;
      sources.forEach(s => sourceSet.add(s));
    }
    const registryTypes = this.registry.getRegisteredTypes();
    let result = registryTypes.filter(s => sourceSet.has(s));
    // Ensure dotnet workspace always has NuGet as available source (e.g. detection race or only CPM/Paket/Cake)
    if (result.length === 0 && (this.currentProjectType === 'dotnet' || types.includes('dotnet'))) {
      result = registryTypes.includes('nuget') ? ['nuget'] : result;
    }
    return result;
  }

  /**
   * Get the currently active source type
   * Returns the actual source being used, not just the configured primary
   */
  getCurrentSourceType(): SourceType {
    if (this.userSelectedSource) {
      return this.userSelectedSource;
    }
    
    // Try to get the primary source adapter
    const primarySource = this.configManager.getPrimarySource(this.currentProjectType);
    if (this.registry.getAdapter(primarySource)) {
      return primarySource;
    }
    
    // If primary is not available, get the first available adapter
    const adapters = this.registry.getAdaptersForProject(this.currentProjectType);
    if (adapters.length > 0) {
      return adapters[0].sourceType;
    }
    
    // Fallback to primary source from config (even if not registered)
    return primarySource;
  }

  /**
   * Execute an operation with fallback support
   * If primary source fails, tries fallback sources
   */
  async executeWithFallback<T>(
    operation: (adapter: ISourceAdapter) => Promise<T>
  ): Promise<T> {
    const errors: Error[] = [];

    // Get all sources to try (primary + fallbacks)
    const sourcesToTry = this.userSelectedSource
      ? [this.userSelectedSource]
      : this.configManager.getAllSources(this.currentProjectType);

    console.log(`[SourceSelector] executeWithFallback, sourcesToTry: ${sourcesToTry.join(', ')}, userSelectedSource: ${this.userSelectedSource}`);

    for (const sourceType of sourcesToTry) {
      const adapter = this.registry.getAdapter(sourceType);
      if (!adapter) {
        console.log(`[SourceSelector] Adapter not found for source: ${sourceType}`);
        continue;
      }

      console.log(`[SourceSelector] Trying source: ${sourceType}, adapter: ${adapter.displayName}`);
      try {
        const result = await operation(adapter);
        console.log(`[SourceSelector] Operation succeeded with source: ${sourceType}`);
        return result;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`[SourceSelector] Operation failed with source ${sourceType}: ${errorMsg}`);
        errors.push(error instanceof Error ? error : new Error(String(error)));
        // Continue to next source
      }
    }

    // All sources failed
    if (errors.length > 0) {
      const errorMsg = `All sources failed. Errors: ${errors.map(e => e.message).join('; ')}`;
      console.error(`[SourceSelector] ${errorMsg}`);
      throw new Error(errorMsg);
    }

    throw new Error('No source adapter available');
  }

  /**
   * Get supported sort options for the current source
   */
  getSupportedSortOptions(): string[] {
    try {
      const adapter = this.selectSource();
      // Convert SearchSortBy[] to string[] for backward compatibility
      return adapter.supportedSortOptions.map(opt => {
        if (typeof opt === 'string') {
          return opt;
        }
        return opt.value;
      });
    } catch {
      // Convert SearchSortBy[] to string[] for backward compatibility
      const options = this.configManager.getSortOptions(this.currentProjectType);
      return options.map(opt => {
        if (typeof opt === 'string') {
          return opt;
        }
        return opt.value;
      });
    }
  }

  /**
   * Get supported sort options as SearchSortBy[] (with labels)
   */
  getSupportedSortOptionsWithLabels(): SearchSortBy[] {
    try {
      const adapter = this.selectSource();
      return adapter.supportedSortOptions;
    } catch {
      // Convert SearchSortBy[] to SearchSortBy[] with labels
      const options = this.configManager.getSortOptions(this.currentProjectType);
      return options.map(opt => {
        if (typeof opt === 'string') {
          return createSortOption(opt);
        }
        return opt; // Already a SortOption
      });
    }
  }

  /**
   * Get supported filters for the current source (as strings for backward compatibility)
   */
  getSupportedFilters(): string[] {
    try {
      const adapter = this.selectSource();
      // Convert SearchFilter[] to string[] for backward compatibility
      return adapter.supportedFilters.map(filter => {
        if (typeof filter === 'string') {
          return filter;
        }
        return filter.value;
      });
    } catch {
      // Convert SearchFilter[] to string[] for backward compatibility
      const filters = this.configManager.getFilters(this.currentProjectType);
      return filters.map(filter => {
        if (typeof filter === 'string') {
          return filter;
        }
        return getFilterValue(filter);
      });
    }
  }

  /**
   * Get supported filters as SearchFilter[] (with labels and placeholders)
   */
  getSupportedFiltersWithLabels(): SearchFilter[] {
    try {
      const adapter = this.selectSource();
      return adapter.supportedFilters;
    } catch {
      // Convert string[] to SearchFilter[] for backward compatibility
      const filters = this.configManager.getFilters(this.currentProjectType);
      return filters.map(filter => {
        if (typeof filter === 'string') {
          return createFilterOption(filter);
        }
        return filter; // Already a FilterOption
      });
    }
  }
}

// Singleton instance
let sourceSelector: SourceSelector | null = null;

/**
 * Initialize the source selector
 */
export function initSourceSelector(
  registry: SourceRegistry,
  detector: ProjectDetector,
  configManager: SourceConfigManager
): SourceSelector {
  sourceSelector = new SourceSelector(registry, detector, configManager);
  return sourceSelector;
}

/**
 * Get the source selector instance
 */
export function getSourceSelector(): SourceSelector {
  if (!sourceSelector) {
    throw new Error('SourceSelector not initialized. Call initSourceSelector first.');
  }
  return sourceSelector;
}
