import type { DependencyType, DependencySpecKind } from './package';

export type MonorepoTool = 'plain' | 'npm-workspaces' | 'pnpm-workspace' | 'lerna' | 'nx';

export interface WorkspaceProjectDependency {
  name: string;
  spec: string;
  type: DependencyType;
  specKind: DependencySpecKind;
  localProjectPath?: string;
}

export interface WorkspaceProjectNode {
  name: string;
  manifestPath: string;
  workspaceFolderPath?: string;
  relativePath: string;
  tool: MonorepoTool;
  dependencies: WorkspaceProjectDependency[];
  localDependencies: string[];
  localDependents: string[];
}

export interface WorkspaceDependencyConsumer {
  manifestPath: string;
  manifestName: string;
  relativePath: string;
  type: DependencyType;
  spec: string;
}

export interface WorkspaceAlignmentIssue {
  packageName: string;
  specs: string[];
  consumers: WorkspaceDependencyConsumer[];
}

export interface WorkspaceProjectGraph {
  tools: MonorepoTool[];
  projects: WorkspaceProjectNode[];
  alignmentIssues: WorkspaceAlignmentIssue[];
}
