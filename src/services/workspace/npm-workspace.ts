import * as vscode from 'vscode';
import type { DependencyType } from '../../types/package';
import type {
  MonorepoTool,
  WorkspaceAlignmentIssue,
  WorkspaceProjectDependency,
  WorkspaceProjectGraph,
  WorkspaceProjectNode,
} from '../../types/workspace';
import { parseDependencySpec } from '../../utils/version-utils';
import { getFallbackManifestName } from './parsers/shared';

type ReadJsonFile = (uri: vscode.Uri) => Promise<Record<string, unknown> | null>;
type FileExists = (uri: vscode.Uri) => Promise<boolean>;

export async function buildWorkspaceProjectGraph(
  packageJsonFiles: vscode.Uri[],
  getPackageJson: (uri: vscode.Uri) => Promise<Record<string, unknown> | null>,
  readJsonFile: ReadJsonFile,
  fileExists: FileExists
): Promise<WorkspaceProjectGraph> {
  const projectInfos = await Promise.all(
    packageJsonFiles.map(async (uri) => {
      const packageJson = await getPackageJson(uri);
      if (!packageJson) {
        return null;
      }

      const name =
        typeof packageJson.name === 'string' && packageJson.name.trim()
          ? packageJson.name.trim()
          : getFallbackManifestName(uri.fsPath);
      const workspaceFolderPath = vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath;
      const dependencies = extractWorkspaceProjectDependencies(packageJson);
      return {
        name,
        manifestPath: uri.fsPath,
        workspaceFolderPath,
        relativePath: vscode.workspace.asRelativePath(uri) || uri.fsPath,
        tool: await detectMonorepoTool(uri, readJsonFile, fileExists),
        dependencies,
      };
    })
  );

  const projects = projectInfos.filter((project): project is NonNullable<typeof project> => project !== null);
  const projectByName = new Map(projects.map((project) => [project.name, project]));

  for (const project of projects) {
    for (const dependency of project.dependencies) {
      if (!dependency.localProjectPath) {
        if (projectByName.has(dependency.name)) {
          dependency.localProjectPath = projectByName.get(dependency.name)?.manifestPath;
        } else if (dependency.specKind === 'file' || dependency.specKind === 'path') {
          dependency.localProjectPath = await resolveWorkspaceLocalManifestPath(
            project.manifestPath,
            dependency.spec,
            fileExists
          );
        }
      }
    }
  }

  const dependentsMap = new Map<string, string[]>();
  for (const project of projects) {
    for (const dependency of project.dependencies) {
      if (!dependency.localProjectPath) {
        continue;
      }
      const dependents = dependentsMap.get(dependency.localProjectPath) || [];
      dependents.push(project.manifestPath);
      dependentsMap.set(dependency.localProjectPath, dependents);
    }
  }

  const nodes: WorkspaceProjectNode[] = projects.map((project) => ({
    name: project.name,
    manifestPath: project.manifestPath,
    workspaceFolderPath: project.workspaceFolderPath,
    relativePath: project.relativePath,
    tool: project.tool,
    dependencies: project.dependencies,
    localDependencies: [...new Set(project.dependencies.map((dep) => dep.localProjectPath).filter(Boolean) as string[])],
    localDependents: [...new Set(dependentsMap.get(project.manifestPath) || [])],
  }));

  return {
    tools: [...new Set(nodes.map((node) => node.tool))],
    projects: nodes.sort((a, b) => a.relativePath.localeCompare(b.relativePath)),
    alignmentIssues: computeWorkspaceAlignmentIssues(projects),
  };
}

export async function alignWorkspaceDependencyVersions(
  packageJsonFiles: vscode.Uri[],
  getPackageJson: (uri: vscode.Uri) => Promise<Record<string, unknown> | null>,
  packageName: string,
  targetVersion: string
): Promise<number> {
  let updatedManifests = 0;

  for (const uri of packageJsonFiles) {
    const packageJson = await getPackageJson(uri);
    if (!packageJson) {
      continue;
    }

    let changed = false;
    const depTypes: DependencyType[] = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

    for (const depType of depTypes) {
      const deps = packageJson[depType];
      if (!deps || typeof deps !== 'object' || Array.isArray(deps)) {
        continue;
      }

      const currentSpec = (deps as Record<string, unknown>)[packageName];
      if (typeof currentSpec !== 'string') {
        continue;
      }

      const parsedSpec = parseDependencySpec(currentSpec);
      if (!parsedSpec.isRegistryResolvable) {
        continue;
      }

      if (currentSpec !== targetVersion) {
        (deps as Record<string, string>)[packageName] = targetVersion;
        changed = true;
      }
    }

    if (!changed) {
      continue;
    }

    const newContent = JSON.stringify(packageJson, null, 2) + '\n';
    await vscode.workspace.fs.writeFile(uri, Buffer.from(newContent));
    updatedManifests++;
  }

  return updatedManifests;
}

export async function updatePackageJsonDependency(
  uri: vscode.Uri,
  packageName: string,
  version: string,
  depType: DependencyType
): Promise<boolean> {
  try {
    const content = await vscode.workspace.fs.readFile(uri);
    const packageJson = JSON.parse(content.toString());

    if (!packageJson[depType]) {
      packageJson[depType] = {};
    }

    packageJson[depType][packageName] = version;
    packageJson[depType] = Object.fromEntries(
      Object.entries(packageJson[depType]).sort(([a], [b]) => a.localeCompare(b))
    );

    const newContent = JSON.stringify(packageJson, null, 2) + '\n';
    await vscode.workspace.fs.writeFile(uri, Buffer.from(newContent));
    return true;
  } catch {
    return false;
  }
}

function extractWorkspaceProjectDependencies(packageJson: Record<string, unknown>): WorkspaceProjectDependency[] {
  const depTypes: DependencyType[] = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

  const dependencies: WorkspaceProjectDependency[] = [];
  for (const depType of depTypes) {
    const deps = packageJson[depType];
    if (!deps || typeof deps !== 'object' || Array.isArray(deps)) {
      continue;
    }

    for (const [name, spec] of Object.entries(deps as Record<string, string>)) {
      const parsedSpec = parseDependencySpec(spec);
      dependencies.push({
        name,
        spec,
        type: depType,
        specKind: parsedSpec.kind,
        localProjectPath: parsedSpec.kind === 'workspace' ? undefined : undefined,
      });
    }
  }

  return dependencies.sort((a, b) => a.name.localeCompare(b.name));
}

function computeWorkspaceAlignmentIssues(
  projects: Array<{
    name: string;
    manifestPath: string;
    relativePath: string;
    dependencies: WorkspaceProjectDependency[];
  }>
): WorkspaceAlignmentIssue[] {
  const packageConsumers = new Map<string, WorkspaceAlignmentIssue['consumers']>();

  for (const project of projects) {
    for (const dependency of project.dependencies) {
      if (!dependency.localProjectPath && dependency.specKind !== 'workspace' && dependency.specKind !== 'file' && dependency.specKind !== 'path' && dependency.specKind !== 'git') {
        const consumers = packageConsumers.get(dependency.name) || [];
        consumers.push({
          manifestPath: project.manifestPath,
          manifestName: project.name,
          relativePath: project.relativePath,
          type: dependency.type,
          spec: dependency.spec,
        });
        packageConsumers.set(dependency.name, consumers);
      }
    }
  }

  const issues: WorkspaceAlignmentIssue[] = [];
  for (const [packageName, consumers] of packageConsumers.entries()) {
    const specs = [...new Set(consumers.map((consumer) => consumer.spec))];
    if (specs.length > 1) {
      issues.push({
        packageName,
        specs: specs.sort((a, b) => a.localeCompare(b)),
        consumers: consumers.sort((a, b) => a.relativePath.localeCompare(b.relativePath)),
      });
    }
  }

  return issues.sort((a, b) => a.packageName.localeCompare(b.packageName));
}

async function detectMonorepoTool(
  manifestUri: vscode.Uri,
  readJsonFile: ReadJsonFile,
  fileExists: FileExists
): Promise<MonorepoTool> {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(manifestUri);
  if (!workspaceFolder) {
    return 'plain';
  }

  const rootPackageJson = await readJsonFile(vscode.Uri.joinPath(workspaceFolder.uri, 'package.json'));
  if (await fileExists(vscode.Uri.joinPath(workspaceFolder.uri, 'nx.json'))) {
    return 'nx';
  }
  if (await fileExists(vscode.Uri.joinPath(workspaceFolder.uri, 'lerna.json'))) {
    return 'lerna';
  }
  if (await fileExists(vscode.Uri.joinPath(workspaceFolder.uri, 'pnpm-workspace.yaml'))) {
    return 'pnpm-workspace';
  }
  if (rootPackageJson?.workspaces) {
    return 'npm-workspaces';
  }
  return 'plain';
}

async function resolveWorkspaceLocalManifestPath(
  sourceManifestPath: string,
  rawSpec: string,
  fileExists: FileExists
): Promise<string | undefined> {
  try {
    const specPath = rawSpec.replace(/^(file:|link:)/, '');
    const sourceDir = vscode.Uri.joinPath(vscode.Uri.file(sourceManifestPath), '..');
    const targetUri = vscode.Uri.joinPath(sourceDir, specPath, 'package.json');
    if (await fileExists(targetUri)) {
      return targetUri.fsPath;
    }
  } catch {
    return undefined;
  }
  return undefined;
}
