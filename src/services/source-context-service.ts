import type { InstallService } from './install-service';
import type { PackageService } from './package-service';
import type { SearchService } from './search-service';
import type { WorkspaceService } from './workspace-service';
import { getInstallTargetSummary } from '../utils/install-target';
import type { ProjectType, SourceType } from '../types/project';
import type { SourceInfoMessage } from '../types/messages';
import { buildClojureContext } from './source-context/clojure-context';
import { buildNuGetContext } from './source-context/nuget-context';
import { buildSonatypeContext } from './source-context/sonatype-context';

export interface SourceContextDeps {
  workspace: WorkspaceService;
  install: InstallService;
  package: PackageService;
  search: SearchService;
  getCurrentProjectType(): ProjectType;
  getCurrentSourceType(): SourceType;
  getDetectedProjectTypes(): ProjectType[];
  getAvailableSources(): SourceType[];
  getSupportedSortOptions(): string[];
  getSupportedFilters(): string[];
}

export class SourceContextService {
  constructor(private deps: SourceContextDeps) {}

  async buildSourceInfoMessage(activePath?: string): Promise<SourceInfoMessage> {
    const projectType = this.deps.getCurrentProjectType();
    const currentSource = this.deps.getCurrentSourceType();
    const detectedPackageManager = await this.deps.install.detectPackageManager(activePath);
    const installTarget = await getInstallTargetSummary(
      this.deps.workspace,
      this.deps.install,
      activePath,
      projectType,
      currentSource
    );

    const effectiveManager = (installTarget?.packageManager || detectedPackageManager).toLowerCase();
    const contextPath = installTarget?.manifestPath || activePath;
    const clojureContext = await buildClojureContext(
      {
        projectType,
        currentSource,
        effectiveManager,
        canUseNeil: (path) => this.deps.install.canUseNeil(path),
      },
      contextPath
    );

    const supportedCapabilities = this.deps.package.getSupportedCapabilities().filter((cap) => {
      return clojureContext.adjustCapability(cap, true);
    });

    const capabilitySupport: Record<string, { capability: string; supported: boolean; reason?: string }> = {};
    for (const cap of supportedCapabilities) {
      const support = this.deps.package.getCapabilitySupport(cap);
      if (!support) {
        continue;
      }

      const adjustedSupported = clojureContext.adjustCapability(cap, support.supported);

      capabilitySupport[cap] = {
        capability: cap,
        supported: adjustedSupported,
        reason: adjustedSupported ? undefined : support.reason,
      };
    }

    const sortOptionsWithLabels = this.deps.search.getSupportedSortOptionsWithLabels();
    const filterOptionsWithLabels = this.deps.search.getSupportedFiltersWithLabels();
    const { detectedNuGetStyle } = buildNuGetContext(
      {
        projectType,
        currentSource,
        detectNuGetManagementStyle: (path) => this.deps.install.detectNuGetManagementStyle(path),
      },
      activePath
    );
    const { detectedBuildTool, detectedCopyFormatLabel } = await buildSonatypeContext(
      {
        projectType,
        currentSource,
        detectBuildTool: (path) => this.deps.install.detectBuildTool(path),
      },
      contextPath
    );

    return {
      type: 'sourceInfo',
      data: {
        currentProjectType: projectType,
        detectedPackageManager,
        detectedBuildTool,
        detectedCopyFormatLabel,
        detectedNuGetStyle,
        installTarget: installTarget || undefined,
        currentSource,
        detectedProjectTypes: this.deps.getDetectedProjectTypes(),
        availableSources: this.deps.getAvailableSources(),
        supportedSortOptions: this.deps.getSupportedSortOptions(),
        supportedSortOptionsWithLabels: sortOptionsWithLabels.map((opt) =>
          typeof opt === 'string'
            ? { value: opt, label: opt.charAt(0).toUpperCase() + opt.slice(1) }
            : { value: opt.value, label: opt.label }
        ),
        supportedFilters: this.deps.getSupportedFilters(),
        supportedFiltersWithLabels: filterOptionsWithLabels.map((filter) =>
          typeof filter === 'string'
            ? { value: filter, label: filter.charAt(0).toUpperCase() + filter.slice(1) }
            : { value: filter.value, label: filter.label, placeholder: filter.placeholder }
        ),
        supportedCapabilities: supportedCapabilities.map((cap) => cap.toString()),
        capabilitySupport,
      },
    };
  }
}
