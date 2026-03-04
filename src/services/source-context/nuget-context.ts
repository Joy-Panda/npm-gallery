import type { NuGetManagementStyle } from '../../types/package';
import type { ProjectType, SourceType } from '../../types/project';

export interface NuGetContextInput {
  projectType: ProjectType;
  currentSource: SourceType;
  detectNuGetManagementStyle(activePath?: string): NuGetManagementStyle | undefined;
}

export function buildNuGetContext(input: NuGetContextInput, activePath?: string): {
  detectedNuGetStyle?: NuGetManagementStyle;
} {
  const isDotNet = input.projectType === 'dotnet' || input.currentSource === 'nuget';

  return {
    detectedNuGetStyle: isDotNet ? input.detectNuGetManagementStyle(activePath) : undefined,
  };
}
