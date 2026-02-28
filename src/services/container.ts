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
import { LibrariesIoSourceAdapter } from '../sources/libraries-io';
import { NuGetSourceAdapter } from '../sources/nuget';
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
    this.workspace = new WorkspaceService();
    this.package = new PackageService(this.sourceSelector);
    this.search = new SearchService(this.sourceSelector);
    this.install = new InstallService(this.sourceSelector, this.workspace);

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
   * Note: libraries-io is also registered as a standalone source for direct use
   */
  private registerAdapters(): void {
    const clients = getApiClients();

    // Register npm registry adapter (with libraries-io as internal fallback)
    const npmAdapter = new NpmRegistrySourceAdapter(
      clients.npmRegistry,
      clients.bundlephobia,
      clients.audit,
      clients.librariesIo, // Pass libraries-io client for fallback
      clients.depsDev // Pass deps.dev client for requirements and dependents
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

    // Register Sonatype Central adapter for Maven/Gradle (with libraries-io as internal fallback)
    const sonatypeAdapter = new SonatypeSourceAdapter(clients.sonatype, clients.audit, clients.librariesIo, clients.depsDev);
    this.sourceRegistry.register('sonatype', sonatypeAdapter);

    // Register Libraries.io as a standalone source adapter
    // It can be used directly or as a fallback for other sources
    // Pass sourceSelector so it can determine the correct platform based on current project type
    const librariesIoAdapter = new LibrariesIoSourceAdapter(clients.librariesIo, clients.audit, this.sourceSelector);
    this.sourceRegistry.register('libraries-io', librariesIoAdapter);

    // Register NuGet adapter for .NET (PackageReference, CPM, Paket, Cake, PMC, .NET CLI)
    const nugetAdapter = new NuGetSourceAdapter(clients.nuget, clients.audit, clients.depsDev);
    this.sourceRegistry.register('nuget', nugetAdapter);
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
   * Get available sources for current context (workspace-style: only for detected types)
   */
  getAvailableSources(): SourceType[] {
    return this.sourceSelector.getAvailableSources();
  }

  /**
   * Get project types detected in workspace (for multi-selector, e.g. [npm, dotnet])
   */
  getDetectedProjectTypes(): ProjectType[] {
    return this.sourceSelector.getDetectedProjectTypes();
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
