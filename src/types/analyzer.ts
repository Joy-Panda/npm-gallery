import type { DependencyType } from './package';
import type { WorkspaceProjectGraph } from './workspace';

export interface DependencyAnalyzerNode {
  id: string;
  name: string;
  version: string;
  dependencyType?: DependencyType;
  isConflict?: boolean;
  children: DependencyAnalyzerNode[];
}

export interface DependencyConflictOccurrence {
  version: string;
  path: string[];
}

export interface DependencyConflict {
  name: string;
  versions: string[];
  occurrences: DependencyConflictOccurrence[];
}

export interface DependencyAnalyzerData {
  manifestPath: string;
  manifestName: string;
  packageManager: string;
  nodes: DependencyAnalyzerNode[];
  conflicts: DependencyConflict[];
}

export interface DependencyAnalyzerPayload {
  workspaceGraph: WorkspaceProjectGraph;
  dependencyAnalyzer?: DependencyAnalyzerData | null;
  activeManifestPath?: string;
  manifestText?: string;
  initialMode: 'workspace' | 'manifest';
  initialEditorTab?: 'text' | 'analyzer';
}
