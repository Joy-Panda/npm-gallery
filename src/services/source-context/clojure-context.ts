import type { ProjectType, SourceType } from '../../types/project';

export interface ClojureContextInput {
  projectType: ProjectType;
  currentSource: SourceType;
  effectiveManager: string;
  canUseNeil(activePath?: string): Promise<boolean>;
}

export interface ClojureContextResult {
  neilEnabled: boolean;
  adjustCapability(capability: string, supported: boolean): boolean;
}

export async function buildClojureContext(input: ClojureContextInput, activePath?: string): Promise<ClojureContextResult> {
  const isClojureContext = input.projectType === 'clojure' || input.currentSource === 'clojars';
  const neilEnabled = isClojureContext ? await input.canUseNeil(activePath) : false;

  return {
    neilEnabled,
    adjustCapability(capability, supported) {
      if (!isClojureContext) {
        return supported;
      }

      if (capability === 'installation') {
        return neilEnabled;
      }

      if (capability === 'copy') {
        return !neilEnabled || input.effectiveManager === 'leiningen';
      }

      return supported;
    },
  };
}
