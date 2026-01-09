import type { ISourceAdapter } from '../sources/base/source-adapter.interface';
import type { SourceType, ProjectType } from '../types/project';
import type { SourceRegistry } from './source-registry';
import type { ProjectDetector } from './project-detector';
import type { SourceConfigManager } from '../config/source-config';

/**
 * Source selector
 * Handles source selection based on project type and user preferences
 */
export class SourceSelector {
  private currentProjectType: ProjectType = 'unknown';
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
   * Detect and set the current project type
   */
  private async detectAndSetProjectType(): Promise<void> {
    try {
      const detected = await this.detector.detectProjects();
      this.currentProjectType = detected.primary;
    } catch {
      this.currentProjectType = 'unknown';
    }
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

    // If user has selected a specific source, use it
    if (effectiveSelection) {
      const adapter = this.registry.getAdapter(effectiveSelection);
      if (adapter) {
        return adapter;
      }
    }

    // Get primary source for current project type
    const primarySource = this.configManager.getPrimarySource(this.currentProjectType);
    const primaryAdapter = this.registry.getAdapter(primarySource);
    if (primaryAdapter) {
      return primaryAdapter;
    }

    // Try fallback sources
    const fallbacks = this.configManager.getFallbackSources(this.currentProjectType);
    for (const fallback of fallbacks) {
      const adapter = this.registry.getAdapter(fallback);
      if (adapter) {
        return adapter;
      }
    }

    // Last resort: return any available adapter
    const allAdapters = this.registry.getAllAdapters();
    if (allAdapters.length > 0) {
      return allAdapters[0];
    }

    throw new Error('No source adapter available');
  }

  /**
   * Get available sources for the current project type
   */
  getAvailableSources(): SourceType[] {
    return this.configManager.getAllSources(this.currentProjectType);
  }

  /**
   * Get the currently active source type
   */
  getCurrentSourceType(): SourceType {
    if (this.userSelectedSource) {
      return this.userSelectedSource;
    }
    return this.configManager.getPrimarySource(this.currentProjectType);
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

    for (const sourceType of sourcesToTry) {
      const adapter = this.registry.getAdapter(sourceType);
      if (!adapter) {
        continue;
      }

      try {
        return await operation(adapter);
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
        // Continue to next source
      }
    }

    // All sources failed
    if (errors.length > 0) {
      throw new Error(
        `All sources failed. Errors: ${errors.map(e => e.message).join('; ')}`
      );
    }

    throw new Error('No source adapter available');
  }

  /**
   * Get supported sort options for the current source
   */
  getSupportedSortOptions(): string[] {
    try {
      const adapter = this.selectSource();
      return adapter.supportedSortOptions;
    } catch {
      return this.configManager.getSortOptions(this.currentProjectType);
    }
  }

  /**
   * Get supported filters for the current source
   */
  getSupportedFilters(): string[] {
    try {
      const adapter = this.selectSource();
      return adapter.supportedFilters;
    } catch {
      return this.configManager.getFilters(this.currentProjectType);
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
