import { PackageService } from './package-service';
import { SearchService } from './search-service';
import { InstallService } from './install-service';
import { WorkspaceService } from './workspace-service';

/**
 * Service container
 */
export class ServiceContainer {
  readonly package: PackageService;
  readonly search: SearchService;
  readonly install: InstallService;
  readonly workspace: WorkspaceService;

  constructor() {
    this.package = new PackageService();
    this.search = new SearchService();
    this.install = new InstallService();
    this.workspace = new WorkspaceService();
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
