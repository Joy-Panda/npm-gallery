import { PackageService } from './package-service';
import { SearchService } from './search-service';
import { InstallService } from './install-service';
import { WorkspaceService } from './workspace-service';
import { SourceRegistry, initSourceRegistry } from '../registry/source-registry';
import { ProjectDetector, getProjectDetector } from '../registry/project-detector';
import { SourceSelector, initSourceSelector } from '../registry/source-selector';
import { SourceConfigManager, initSourceConfigManager } from '../config/source-config';
import { NpmRegistrySourceAdapter } from '../sources/npm/npm-adapter';
import { NpmsSourceAdapter } from '../sources/npm/npms-adapter';
import { SonatypeSourceAdapter } from '../sources/sonatype/sonatype-adapter';
import { getApiClients } from '../api/clients';
import type { ProjectType, SourceType } from '../types/project';

/**
 * Service container
 * Manages all services and source adapters
 */
export class ServiceContainer {
  readonly package: PackageService;
  readonly search: SearchService;
  readonly install: InstallService;
  readonly workspace: WorkspaceService;
  
  // Source infrastructure
  readonly sourceRegistry: SourceRegistry;
  readonly projectDetector: ProjectDetector;
  readonly sourceSelector: SourceSelector;
  readonly configManager: SourceConfigManager;

  private initialized = false;

  constructor() {
    // Initialize source infrastructure
    this.configManager = initSourceConfigManager();
    this.sourceRegistry = initSourceRegistry();
    this.projectDetector = getProjectDetector();
    
    // Create source selector (will be initialized later)
    this.sourceSelector = initSourceSelector(
      this.sourceRegistry,
      this.projectDetector,
      this.configManager
    );

    // Initialize services with source selector
    this.package = new PackageService(this.sourceSelector);
    this.search = new SearchService(this.sourceSelector);
    this.install = new InstallService(this.sourceSelector);
    this.workspace = new WorkspaceService();

    // Register source adapters
    this.registerAdapters();
  }

  /**
   * Initialize the container (async operations)
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Initialize source selector (detects project type)
    await this.sourceSelector.initialize();
    this.initialized = true;
  }

  /**
   * Register all source adapters
   */
  private registerAdapters(): void {
    const clients = getApiClients();

    // Register npm registry adapter
    const npmAdapter = new NpmRegistrySourceAdapter(
      clients.npmRegistry,
      clients.bundlephobia,
      clients.audit,
      clients.depsDev
    );
    this.sourceRegistry.register('npm-registry', npmAdapter);

    // Register npms.io adapter as fallback
    const npmsAdapter = new NpmsSourceAdapter(
      clients.npms,
      clients.npmRegistry,
      clients.bundlephobia,
      clients.audit,
      clients.depsDev
    );
    this.sourceRegistry.register('npms-io', npmsAdapter);

    // Register Sonatype Central adapter for Maven/Gradle
    const sonatypeAdapter = new SonatypeSourceAdapter(clients.sonatype, clients.depsDev);
    this.sourceRegistry.register('sonatype', sonatypeAdapter);
  }

  /**
   * Get the current project type
   */
  getCurrentProjectType(): ProjectType {
    return this.sourceSelector.getCurrentProjectType();
  }

  /**
   * Set the project type manually
   */
  setProjectType(type: ProjectType): void {
    this.sourceSelector.setProjectType(type);
  }

  /**
   * Get the current source type
   */
  getCurrentSourceType(): SourceType {
    return this.sourceSelector.getCurrentSourceType();
  }

  /**
   * Set user-selected source
   */
  setSelectedSource(source: SourceType | null): void {
    this.sourceSelector.setUserSelectedSource(source);
  }

  /**
   * Get available sources for current project type
   */
  getAvailableSources(): SourceType[] {
    return this.sourceSelector.getAvailableSources();
  }

  /**
   * Get supported sort options for current source
   */
  getSupportedSortOptions(): string[] {
    return this.sourceSelector.getSupportedSortOptions();
  }

  /**
   * Get supported filters for current source
   */
  getSupportedFilters(): string[] {
    return this.sourceSelector.getSupportedFilters();
  }
}

// Singleton instance
let services: ServiceContainer | null = null;

/**
 * Get services instance
 */
export function getServices(): ServiceContainer {
  if (!services) {
    services = new ServiceContainer();
  }
  return services;
}

/**
 * Initialize services (call once at extension activation)
 */
export async function initServices(): Promise<ServiceContainer> {
  const container = getServices();
  await container.initialize();
  return container;
}

/**
 * Reset services (for testing)
 */
export function resetServices(): void {
  services = null;
}
