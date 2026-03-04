import type { BuildTool } from '../../types/package';
import type { ProjectType, SourceType } from '../../types/project';

const BUILD_TOOL_LABELS: Record<BuildTool, string> = {
  maven: 'Maven',
  gradle: 'Gradle',
  sbt: 'SBT',
  mill: 'Mill',
  ivy: 'Ivy',
  grape: 'Grape',
  leiningen: 'Leiningen',
  buildr: 'Buildr',
};

export interface SonatypeContextInput {
  projectType: ProjectType;
  currentSource: SourceType;
  detectBuildTool(activePath?: string): Promise<BuildTool | null>;
}

export async function buildSonatypeContext(input: SonatypeContextInput, activePath?: string): Promise<{
  detectedBuildTool?: BuildTool;
  detectedCopyFormatLabel?: string;
}> {
  const isSonatype = input.projectType === 'maven' || input.currentSource === 'sonatype';
  const detectedBuildTool = isSonatype ? (await input.detectBuildTool(activePath)) || undefined : undefined;

  return {
    detectedBuildTool,
    detectedCopyFormatLabel: detectedBuildTool ? BUILD_TOOL_LABELS[detectedBuildTool] : undefined,
  };
}
