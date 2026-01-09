import type { ISourceAdapter } from '../sources/base/source-adapter.interface';
import type { SourceType, ProjectType } from '../types/project';
import { PROJECT_SOURCE_MAP } from '../types/project';

/**
 * Source registry
 * Manages registration and retrieval of source adapters
 */
export class SourceRegistry {
  private adapters: Map<SourceType, ISourceAdapter> = new Map();

  /**
   * Register a source adapter
   */
  register(type: SourceType, adapter: ISourceAdapter): void {
    this.adapters.set(type, adapter);
  }

  /**
   * Unregister a source adapter
   */
  unregister(type: SourceType): boolean {
    return this.adapters.delete(type);
  }

  /**
   * Get a source adapter by type
   */
  getAdapter(type: SourceType): ISourceAdapter | undefined {
    return this.adapters.get(type);
  }

  /**
   * Check if an adapter is registered
   */
  hasAdapter(type: SourceType): boolean {
    return this.adapters.has(type);
  }

  /**
   * Get all adapters for a project type
   */
  getAdaptersForProject(projectType: ProjectType): ISourceAdapter[] {
    const sourceTypes = PROJECT_SOURCE_MAP[projectType] || PROJECT_SOURCE_MAP.unknown;
    const adapters: ISourceAdapter[] = [];

    for (const sourceType of sourceTypes) {
      const adapter = this.adapters.get(sourceType);
      if (adapter) {
        adapters.push(adapter);
      }
    }

    return adapters;
  }

  /**
   * Get all registered source types
   */
  getRegisteredTypes(): SourceType[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Get all registered adapters
   */
  getAllAdapters(): ISourceAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Get the first available adapter for a project type
   */
  getDefaultAdapter(projectType: ProjectType): ISourceAdapter | undefined {
    const adapters = this.getAdaptersForProject(projectType);
    return adapters[0];
  }

  /**
   * Clear all registered adapters
   */
  clear(): void {
    this.adapters.clear();
  }
}

// Singleton instance
let sourceRegistry: SourceRegistry | null = null;

/**
 * Get the source registry instance
 */
export function getSourceRegistry(): SourceRegistry {
  if (!sourceRegistry) {
    sourceRegistry = new SourceRegistry();
  }
  return sourceRegistry;
}

/**
 * Initialize a new source registry (replaces existing)
 */
export function initSourceRegistry(): SourceRegistry {
  sourceRegistry = new SourceRegistry();
  return sourceRegistry;
}
