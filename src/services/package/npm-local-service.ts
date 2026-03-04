import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type {
  DependencyType,
  PackageManager,
  WorkspacePackageScope,
} from '../../types/package';
import type {
  DependencyAnalyzerData,
  DependencyAnalyzerNode,
  DependencyConflict,
} from '../../types/analyzer';
import { parseDependencySpec } from '../../utils/version-utils';

const execFileAsync = promisify(execFile);

interface LocalDependencyNode {
  name: string;
  version?: string;
  dependencies?: Record<string, string>;
}

interface PackageTreeNode {
  name: string;
  version?: string;
  dependencies?: Record<string, PackageTreeNode> | PackageTreeNode[];
  children?: PackageTreeNode[];
}

type PackageJsonManifest = {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

export class NpmLocalService {
  private localDependencyTreeCache = new Map<string, Map<string, Record<string, string> | null> | null>();
  private localDependencyTreePromises = new Map<
    string,
    Promise<Map<string, Record<string, string> | null> | null>
  >();

  invalidateLocalDependencyTreeCache(scope?: WorkspacePackageScope | string): void {
    if (!scope) {
      this.localDependencyTreeCache.clear();
      this.localDependencyTreePromises.clear();
      return;
    }

    const path = require('path') as typeof import('path');
    if (typeof scope === 'string') {
      const projectPath = scope.endsWith('package.json') ? path.dirname(scope) : scope;
      this.localDependencyTreeCache.delete(projectPath);
      this.localDependencyTreePromises.delete(projectPath);
      return;
    }

    if (scope.manifestPath) {
      const projectPath = path.dirname(scope.manifestPath);
      this.localDependencyTreeCache.delete(projectPath);
      this.localDependencyTreePromises.delete(projectPath);
      return;
    }

    if (scope.workspaceFolderPath) {
      for (const key of [...this.localDependencyTreeCache.keys()]) {
        if (key.startsWith(scope.workspaceFolderPath)) {
          this.localDependencyTreeCache.delete(key);
          this.localDependencyTreePromises.delete(key);
        }
      }
    }
  }

  async getLocalPackageDependencies(
    name: string,
    version: string | undefined,
    targetPath: string | undefined,
    currentProjectType: string | null
  ): Promise<Record<string, string> | null> {
    const tree = await this.getLocalDependencyTree(targetPath, currentProjectType);
    if (!tree) {
      return null;
    }

    if (version) {
      const exactMatch = tree.get(`${name}@${version}`);
      if (exactMatch !== undefined) {
        return exactMatch;
      }
    }

    const byName = tree.get(name);
    return byName !== undefined ? byName : null;
  }

  async getDependencyAnalyzerData(
    manifestPath: string,
    getPackageDependencies: (name: string, version?: string, targetPath?: string) => Promise<Record<string, string> | null>
  ): Promise<DependencyAnalyzerData | null> {
    const localProject = await this.resolveLocalProjectContext(manifestPath);
    if (!localProject) {
      return null;
    }

    const path = require('path') as typeof import('path');
    const fs = require('fs/promises') as typeof import('fs/promises');
    const manifestDir = path.dirname(manifestPath);

    try {
      const raw = await fs.readFile(manifestPath, 'utf8');
      const packageJson = JSON.parse(raw) as PackageJsonManifest;
      const manifestName =
        typeof packageJson.name === 'string' && packageJson.name.trim()
          ? packageJson.name.trim()
          : path.basename(manifestDir);

      let nodes: DependencyAnalyzerNode[] = [];
      switch (localProject.packageManager) {
        case 'pnpm':
          nodes = await this.loadPnpmDependencyTree(manifestDir);
          break;
        case 'yarn':
          nodes = await this.loadYarnDependencyTree(manifestDir);
          break;
        case 'bun':
          nodes = await this.loadBunDependencyTree(manifestDir);
          break;
        case 'npm':
        default:
          nodes = await this.loadNpmDependencyTree(manifestDir);
          break;
      }

      if (nodes.length === 0 || nodes.every((node) => node.children.length === 0)) {
        const recursiveNodes = await this.buildRecursiveDependencyAnalyzerNodes(
          packageJson,
          manifestPath,
          getPackageDependencies
        );
        if (recursiveNodes.length > 0) {
          nodes = recursiveNodes;
        } else if (nodes.length === 0) {
          nodes = this.buildDirectDependencyAnalyzerNodes(packageJson);
        }
      }

      const conflicts = this.collectDependencyConflicts(nodes);
      this.applyDirectDependencyTypes(nodes, packageJson);
      if (conflicts.length > 0) {
        const conflictingNames = new Set(conflicts.map((conflict) => conflict.name));
        this.markConflictNodes(nodes, conflictingNames);
      }

      return {
        manifestPath,
        manifestName,
        packageManager: localProject.packageManager || 'unknown',
        nodes,
        conflicts,
      };
    } catch {
      return null;
    }
  }

  private async getLocalDependencyTree(
    targetPath: string | undefined,
    currentProjectType: string | null
  ): Promise<Map<string, Record<string, string> | null> | null> {
    if (currentProjectType !== 'npm') {
      return null;
    }

    const localProject = await this.resolveLocalProjectContext(targetPath);
    if (!localProject) {
      return null;
    }
    const cacheKey = localProject.projectPath;

    if (this.localDependencyTreeCache.has(cacheKey)) {
      return this.localDependencyTreeCache.get(cacheKey) ?? null;
    }

    const pending = this.localDependencyTreePromises.get(cacheKey);
    if (pending) {
      return pending;
    }

    const promise = this.loadLocalDependencyTree(localProject);
    this.localDependencyTreePromises.set(cacheKey, promise);

    try {
      const tree = await promise;
      this.localDependencyTreeCache.set(cacheKey, tree);
      return tree;
    } finally {
      this.localDependencyTreePromises.delete(cacheKey);
    }
  }

  private async loadLocalDependencyTree(
    localProject: { workspaceFolder: vscode.WorkspaceFolder; projectPath: string; packageManager: PackageManager | null }
  ): Promise<Map<string, Record<string, string> | null> | null> {
    const packageManager = localProject.packageManager;
    if (!packageManager) {
      return null;
    }

    if (packageManager === 'bun') {
      return this.buildDependencyIndexFromNodeModules(localProject.projectPath);
    }

    const command = this.getDependencyTreeCommand(packageManager);
    if (!command) {
      return null;
    }

    try {
      const { stdout } = await execFileAsync(command.file, command.args, {
        cwd: localProject.projectPath,
        encoding: 'utf8',
        timeout: 15000,
        maxBuffer: 20 * 1024 * 1024,
      });
      return this.parseDependencyTreeOutput(packageManager, stdout);
    } catch {
      return null;
    }
  }

  private async detectLocalPackageManager(
    startPath: string,
    workspacePath: string
  ): Promise<PackageManager | null> {
    try {
      const fs = require('fs') as typeof import('fs');
      const path = require('path') as typeof import('path');

      const lockFiles: Array<{ file: string; manager: PackageManager }> = [
        { file: 'bun.lock', manager: 'bun' },
        { file: 'bun.lockb', manager: 'bun' },
        { file: 'pnpm-lock.yaml', manager: 'pnpm' },
        { file: 'yarn.lock', manager: 'yarn' },
        { file: 'package-lock.json', manager: 'npm' },
      ];

      let currentPath = startPath;
      while (currentPath.startsWith(workspacePath)) {
        for (const { file, manager } of lockFiles) {
          if (fs.existsSync(path.join(currentPath, file))) {
            return manager;
          }
        }

        if (currentPath === workspacePath) {
          break;
        }

        const parentPath = path.dirname(currentPath);
        if (parentPath === currentPath) {
          break;
        }
        currentPath = parentPath;
      }
    } catch {
      return null;
    }

    return null;
  }

  private resolveWorkspaceFolder(targetPath?: string): vscode.WorkspaceFolder | undefined {
    if (targetPath) {
      return vscode.workspace.getWorkspaceFolder(vscode.Uri.file(targetPath));
    }

    return vscode.window.activeTextEditor
      ? vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri)
      : vscode.workspace.workspaceFolders?.[0];
  }

  private async resolveLocalProjectContext(
    targetPath?: string
  ): Promise<{ workspaceFolder: vscode.WorkspaceFolder; projectPath: string; packageManager: PackageManager | null } | null> {
    const workspaceFolder = this.resolveWorkspaceFolder(targetPath);
    if (!workspaceFolder) {
      return null;
    }

    const path = require('path') as typeof import('path');
    const projectPath = targetPath ? path.dirname(targetPath) : workspaceFolder.uri.fsPath;
    const packageManager = await this.detectLocalPackageManager(projectPath, workspaceFolder.uri.fsPath);

    return {
      workspaceFolder,
      projectPath,
      packageManager,
    };
  }

  private getDependencyTreeCommand(
    packageManager: PackageManager | null
  ): { file: string; args: string[] } | null {
    switch (packageManager) {
      case 'npm':
        return { file: 'npm', args: ['ls', '--all', '--json'] };
      case 'pnpm':
        return { file: 'pnpm', args: ['list', '--depth', 'Infinity', '--json'] };
      case 'yarn':
        return { file: 'yarn', args: ['list', '--json'] };
      default:
        return null;
    }
  }

  private parseDependencyTreeOutput(
    packageManager: PackageManager,
    stdout: string
  ): Map<string, Record<string, string> | null> {
    switch (packageManager) {
      case 'pnpm':
        return this.buildDependencyIndexFromPnpm(stdout);
      case 'yarn':
        return this.buildDependencyIndexFromYarn(stdout);
      case 'npm':
      default:
        return this.buildDependencyIndexFromNpm(stdout);
    }
  }

  private async buildDependencyIndexFromNodeModules(
    workspacePath: string
  ): Promise<Map<string, Record<string, string> | null> | null> {
    try {
      const fs = require('fs') as typeof import('fs');
      const path = require('path') as typeof import('path');
      const nodeModulesPath = path.join(workspacePath, 'node_modules');

      if (!fs.existsSync(nodeModulesPath)) {
        return null;
      }

      const index = new Map<string, Record<string, string> | null>();
      const visited = new Set<string>();
      const packageDirs = await this.listNodeModulesPackageDirs(nodeModulesPath);

      for (const packageDir of packageDirs) {
        await this.collectNodeModulesDependencyNode(packageDir, workspacePath, index, visited);
      }

      return index;
    } catch {
      return null;
    }
  }

  private async listNodeModulesPackageDirs(nodeModulesPath: string): Promise<string[]> {
    const fs = require('fs/promises') as typeof import('fs/promises');
    const path = require('path') as typeof import('path');

    const entries = await fs.readdir(nodeModulesPath, { withFileTypes: true });
    const packageDirs: string[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) {
        continue;
      }

      if (entry.name.startsWith('@')) {
        const scopePath = path.join(nodeModulesPath, entry.name);
        const scopedEntries = await fs.readdir(scopePath, { withFileTypes: true });
        for (const scopedEntry of scopedEntries) {
          if (scopedEntry.isDirectory()) {
            packageDirs.push(path.join(scopePath, scopedEntry.name));
          }
        }
        continue;
      }

      packageDirs.push(path.join(nodeModulesPath, entry.name));
    }

    return packageDirs;
  }

  private async collectNodeModulesDependencyNode(
    packageDir: string,
    workspacePath: string,
    index: Map<string, Record<string, string> | null>,
    visited: Set<string>
  ): Promise<void> {
    const fs = require('fs/promises') as typeof import('fs/promises');

    let realPackageDir: string;
    try {
      realPackageDir = await fs.realpath(packageDir);
    } catch {
      realPackageDir = packageDir;
    }

    if (visited.has(realPackageDir)) {
      return;
    }
    visited.add(realPackageDir);

    const manifest = await this.readInstalledPackageManifest(realPackageDir);
    if (!manifest?.name) {
      return;
    }

    const childDependencies = this.mergeInstalledDependencyFields(manifest);
    const childEntries = Object.keys(childDependencies).length > 0 ? childDependencies : null;

    if (!index.has(manifest.name)) {
      index.set(manifest.name, childEntries);
    }
    if (manifest.version) {
      index.set(`${manifest.name}@${manifest.version}`, childEntries);
    }

    for (const dependencyName of Object.keys(childDependencies)) {
      const childDir = await this.resolveInstalledDependencyDir(realPackageDir, workspacePath, dependencyName);
      if (childDir) {
        await this.collectNodeModulesDependencyNode(childDir, workspacePath, index, visited);
      }
    }
  }

  private async resolveInstalledDependencyDir(
    packageDir: string,
    workspacePath: string,
    dependencyName: string
  ): Promise<string | null> {
    const fs = require('fs/promises') as typeof import('fs/promises');
    const path = require('path') as typeof import('path');
    const candidates = [
      path.join(packageDir, 'node_modules', dependencyName),
      path.join(workspacePath, 'node_modules', dependencyName),
    ];

    for (const candidate of candidates) {
      try {
        const stat = await fs.stat(candidate);
        if (stat.isDirectory()) {
          return candidate;
        }
      } catch {
        // Try next path.
      }
    }

    return null;
  }

  private async readInstalledPackageManifest(packageDir: string): Promise<{
    name?: string;
    version?: string;
    dependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
  } | null> {
    const fs = require('fs/promises') as typeof import('fs/promises');
    const path = require('path') as typeof import('path');

    try {
      const raw = await fs.readFile(path.join(packageDir, 'package.json'), 'utf8');
      return JSON.parse(raw) as {
        name?: string;
        version?: string;
        dependencies?: Record<string, string>;
        optionalDependencies?: Record<string, string>;
        peerDependencies?: Record<string, string>;
      };
    } catch {
      return null;
    }
  }

  private mergeInstalledDependencyFields(manifest: {
    dependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
  }): Record<string, string> {
    return {
      ...(manifest.dependencies || {}),
      ...(manifest.peerDependencies || {}),
      ...(manifest.optionalDependencies || {}),
    };
  }

  private buildDependencyIndexFromNpm(stdout: string): Map<string, Record<string, string> | null> {
    const parsed = JSON.parse(stdout) as {
      dependencies?: Record<string, LocalDependencyNode & { dependencies?: Record<string, LocalDependencyNode> }>;
    };

    const index = new Map<string, Record<string, string> | null>();
    this.collectNpmDependencyNodes(parsed.dependencies || {}, index);
    return index;
  }

  private collectNpmDependencyNodes(
    dependencies: Record<string, LocalDependencyNode & { dependencies?: Record<string, LocalDependencyNode> }>,
    index: Map<string, Record<string, string> | null>
  ): void {
    for (const [name, node] of Object.entries(dependencies)) {
      const childDependencies = node.dependencies
        ? Object.fromEntries(
            Object.entries(node.dependencies).map(([childName, childNode]) => [childName, childNode.version || ''])
          )
        : null;

      if (!index.has(name)) {
        index.set(name, childDependencies);
      }
      if (node.version) {
        index.set(`${name}@${node.version}`, childDependencies);
      }

      if (node.dependencies) {
        this.collectNpmDependencyNodes(
          node.dependencies as Record<string, LocalDependencyNode & { dependencies?: Record<string, LocalDependencyNode> }>,
          index
        );
      }
    }
  }

  private buildDependencyIndexFromPnpm(stdout: string): Map<string, Record<string, string> | null> {
    const parsed = JSON.parse(stdout) as Array<{
      dependencies?: Array<{
        name?: string;
        version?: string;
        dependencies?: Array<{ name?: string; version?: string; dependencies?: unknown }>;
      }>;
    }>;

    const index = new Map<string, Record<string, string> | null>();
    for (const root of parsed) {
      this.collectPnpmDependencyNodes(root.dependencies || [], index);
    }
    return index;
  }

  private collectPnpmDependencyNodes(
    dependencies: Array<{ name?: string; version?: string; dependencies?: unknown }>,
    index: Map<string, Record<string, string> | null>
  ): void {
    for (const node of dependencies) {
      if (!node.name) {
        continue;
      }

      const childList = Array.isArray(node.dependencies)
        ? node.dependencies as Array<{ name?: string; version?: string; dependencies?: unknown }>
        : [];

      const childDependencies = childList.length > 0
        ? Object.fromEntries(
            childList
              .filter((child) => child.name)
              .map((child) => [child.name as string, child.version || ''])
          )
        : null;

      if (!index.has(node.name)) {
        index.set(node.name, childDependencies);
      }
      if (node.version) {
        index.set(`${node.name}@${node.version}`, childDependencies);
      }

      if (childList.length > 0) {
        this.collectPnpmDependencyNodes(childList, index);
      }
    }
  }

  private buildDependencyIndexFromYarn(stdout: string): Map<string, Record<string, string> | null> {
    const lines = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const treeLine = lines
      .map((line) => {
        try {
          return JSON.parse(line) as { type?: string; data?: unknown };
        } catch {
          return null;
        }
      })
      .find((entry) => entry?.type === 'tree');

    const index = new Map<string, Record<string, string> | null>();
    const trees = (treeLine?.data as { trees?: Array<{ name: string; children?: Array<{ name: string; children?: unknown[] }> }> } | undefined)?.trees || [];
    this.collectYarnDependencyNodes(trees, index);
    return index;
  }

  private collectYarnDependencyNodes(
    nodes: Array<{ name: string; children?: Array<{ name: string; children?: unknown[] }> }>,
    index: Map<string, Record<string, string> | null>
  ): void {
    for (const node of nodes) {
      const parsed = this.parseYarnTreeName(node.name);
      if (!parsed) {
        continue;
      }

      const children = Array.isArray(node.children) ? node.children : [];
      const childDependencies = children.length > 0
        ? Object.fromEntries(
            children
              .map((child) => this.parseYarnTreeName(child.name))
              .filter((child): child is { name: string; version: string } => !!child)
              .map((child) => [child.name, child.version])
          )
        : null;

      if (!index.has(parsed.name)) {
        index.set(parsed.name, childDependencies);
      }
      index.set(`${parsed.name}@${parsed.version}`, childDependencies);

      if (children.length > 0) {
        this.collectYarnDependencyNodes(
          children as Array<{ name: string; children?: Array<{ name: string; children?: unknown[] }> }>,
          index
        );
      }
    }
  }

  private parseYarnTreeName(value: string): { name: string; version: string } | null {
    const normalized = value.replace(/^[^@]*@npm:/, '');
    const lastAt = normalized.lastIndexOf('@');
    if (lastAt <= 0) {
      return null;
    }

    return {
      name: normalized.slice(0, lastAt),
      version: normalized.slice(lastAt + 1),
    };
  }

  private async loadNpmDependencyTree(manifestDir: string): Promise<DependencyAnalyzerNode[]> {
    try {
      const { stdout } = await execFileAsync('npm', ['ls', '--all', '--json'], {
        cwd: manifestDir,
        encoding: 'utf8',
        timeout: 15000,
        maxBuffer: 20 * 1024 * 1024,
      });
      const parsed = JSON.parse(stdout) as { dependencies?: Record<string, PackageTreeNode> };
      return this.convertDependencyMapToAnalyzerNodes(parsed.dependencies || {});
    } catch {
      return [];
    }
  }

  private async loadPnpmDependencyTree(manifestDir: string): Promise<DependencyAnalyzerNode[]> {
    try {
      const { stdout } = await execFileAsync('pnpm', ['list', '--depth', 'Infinity', '--json'], {
        cwd: manifestDir,
        encoding: 'utf8',
        timeout: 15000,
        maxBuffer: 20 * 1024 * 1024,
      });
      const parsed = JSON.parse(stdout) as Array<{ dependencies?: PackageTreeNode[] }>;
      const root = parsed[0];
      return this.convertDependencyArrayToAnalyzerNodes(root?.dependencies || []);
    } catch {
      return [];
    }
  }

  private async loadYarnDependencyTree(manifestDir: string): Promise<DependencyAnalyzerNode[]> {
    try {
      const { stdout } = await execFileAsync('yarn', ['list', '--json'], {
        cwd: manifestDir,
        encoding: 'utf8',
        timeout: 15000,
        maxBuffer: 20 * 1024 * 1024,
      });
      const parsedLine = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          try {
            return JSON.parse(line) as { type?: string; data?: { trees?: Array<{ name: string; children?: Array<{ name: string; children?: unknown[] }> }> } };
          } catch {
            return null;
          }
        })
        .find((entry) => entry?.type === 'tree');

      const trees = parsedLine?.data?.trees || [];
      return trees.map((tree) => this.convertYarnNodeToAnalyzerNode(tree));
    } catch {
      return [];
    }
  }

  private async loadBunDependencyTree(manifestDir: string): Promise<DependencyAnalyzerNode[]> {
    const path = require('path') as typeof import('path');
    const fs = require('fs/promises') as typeof import('fs/promises');

    try {
      const raw = await fs.readFile(path.join(manifestDir, 'package.json'), 'utf8');
      const packageJson = JSON.parse(raw) as PackageJsonManifest;
      const directDependencies = {
        ...(packageJson.dependencies || {}),
        ...(packageJson.devDependencies || {}),
        ...(packageJson.peerDependencies || {}),
        ...(packageJson.optionalDependencies || {}),
      };

      const visited = new Set<string>();
      const nodes = await Promise.all(
        Object.keys(directDependencies).sort((a, b) => a.localeCompare(b)).map(async (dependencyName) => {
          const dependencyDir = await this.resolveInstalledDependencyDir(manifestDir, manifestDir, dependencyName);
          if (!dependencyDir) {
            return {
              id: dependencyName,
              name: dependencyName,
              version: directDependencies[dependencyName],
              children: [],
            } satisfies DependencyAnalyzerNode;
          }

          return this.buildAnalyzerNodeFromNodeModules(dependencyDir, manifestDir, visited);
        })
      );

      return nodes.filter((node): node is DependencyAnalyzerNode => node !== null);
    } catch {
      return [];
    }
  }

  private convertDependencyMapToAnalyzerNodes(
    dependencies: Record<string, PackageTreeNode>
  ): DependencyAnalyzerNode[] {
    return Object.entries(dependencies)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, node]) => this.convertPackageTreeNodeToAnalyzerNode(name, node));
  }

  private convertDependencyArrayToAnalyzerNodes(dependencies: PackageTreeNode[]): DependencyAnalyzerNode[] {
    return dependencies
      .filter((node): node is PackageTreeNode & { name: string } => !!node?.name)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((node) => this.convertPackageTreeNodeToAnalyzerNode(node.name, node));
  }

  private convertPackageTreeNodeToAnalyzerNode(name: string, node: PackageTreeNode): DependencyAnalyzerNode {
    const childrenSource = Array.isArray(node.dependencies)
      ? node.dependencies
      : node.children
        ? node.children
        : node.dependencies
          ? Object.entries(node.dependencies).map(([childName, childNode]) => ({ ...childNode, name: childName }))
          : [];

    const children = childrenSource
      .filter((child): child is PackageTreeNode & { name: string } => !!child?.name)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((child) => this.convertPackageTreeNodeToAnalyzerNode(child.name, child));

    return {
      id: `${name}@${node.version || 'unknown'}`,
      name,
      version: node.version || 'unknown',
      children,
    };
  }

  private convertYarnNodeToAnalyzerNode(node: { name: string; children?: unknown[] }): DependencyAnalyzerNode {
    const parsed = this.parseYarnNodeNameForAnalyzer(node.name);
    return {
      id: `${parsed.name}@${parsed.version}`,
      name: parsed.name,
      version: parsed.version,
      children: (node.children || [])
        .filter(
          (child): child is { name: string; children?: unknown[] } =>
            !!child && typeof child === 'object' && typeof (child as { name?: unknown }).name === 'string'
        )
        .map((child) => this.convertYarnNodeToAnalyzerNode(child)),
    };
  }

  private parseYarnNodeNameForAnalyzer(rawName: string): { name: string; version: string } {
    const atIndex = rawName.lastIndexOf('@');
    if (atIndex <= 0) {
      return { name: rawName, version: 'unknown' };
    }
    return {
      name: rawName.slice(0, atIndex),
      version: rawName.slice(atIndex + 1) || 'unknown',
    };
  }

  private async buildAnalyzerNodeFromNodeModules(
    packageDir: string,
    workspacePath: string,
    visited: Set<string>
  ): Promise<DependencyAnalyzerNode | null> {
    const fs = require('fs/promises') as typeof import('fs/promises');

    let realPackageDir: string;
    try {
      realPackageDir = await fs.realpath(packageDir);
    } catch {
      realPackageDir = packageDir;
    }

    if (visited.has(realPackageDir)) {
      const manifest = await this.readInstalledPackageManifest(realPackageDir);
      if (!manifest?.name) {
        return null;
      }
      return {
        id: `${manifest.name}@${manifest.version || 'unknown'}`,
        name: manifest.name,
        version: manifest.version || 'unknown',
        children: [],
      };
    }
    visited.add(realPackageDir);

    const manifest = await this.readInstalledPackageManifest(realPackageDir);
    if (!manifest?.name) {
      return null;
    }

    const childDependencies = this.mergeInstalledDependencyFields(manifest);
    const children: DependencyAnalyzerNode[] = [];
    for (const dependencyName of Object.keys(childDependencies).sort((a, b) => a.localeCompare(b))) {
      const childDir = await this.resolveInstalledDependencyDir(realPackageDir, workspacePath, dependencyName);
      if (!childDir) {
        children.push({
          id: `${dependencyName}@${childDependencies[dependencyName]}`,
          name: dependencyName,
          version: childDependencies[dependencyName],
          children: [],
        });
        continue;
      }
      const child = await this.buildAnalyzerNodeFromNodeModules(childDir, workspacePath, visited);
      if (child) {
        children.push(child);
      }
    }

    return {
      id: `${manifest.name}@${manifest.version || 'unknown'}`,
      name: manifest.name,
      version: manifest.version || 'unknown',
      children,
    };
  }

  private collectDependencyConflicts(nodes: DependencyAnalyzerNode[]): DependencyConflict[] {
    const occurrences = new Map<string, Array<{ version: string; path: string[] }>>();

    const visit = (node: DependencyAnalyzerNode, parents: string[]) => {
      const currentPath = [...parents, `${node.name}@${node.version}`];
      const bucket = occurrences.get(node.name) || [];
      bucket.push({ version: node.version, path: currentPath });
      occurrences.set(node.name, bucket);

      for (const child of node.children) {
        visit(child, currentPath);
      }
    };

    for (const node of nodes) {
      visit(node, []);
    }

    return [...occurrences.entries()]
      .map(([name, items]) => {
        const versions = [...new Set(items.map((item) => item.version))].sort((a, b) => a.localeCompare(b));
        if (versions.length <= 1) {
          return null;
        }
        return {
          name,
          versions,
          occurrences: items,
        } satisfies DependencyConflict;
      })
      .filter((conflict): conflict is DependencyConflict => conflict !== null)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  private applyDirectDependencyTypes(nodes: DependencyAnalyzerNode[], packageJson: PackageJsonManifest): void {
    const typeMap = new Map<string, DependencyType>();
    const entries: Array<[DependencyType, Record<string, string> | undefined]> = [
      ['dependencies', packageJson.dependencies],
      ['devDependencies', packageJson.devDependencies],
      ['peerDependencies', packageJson.peerDependencies],
      ['optionalDependencies', packageJson.optionalDependencies],
    ];

    for (const [type, deps] of entries) {
      for (const name of Object.keys(deps || {})) {
        if (!typeMap.has(name)) {
          typeMap.set(name, type);
        }
      }
    }

    for (const node of nodes) {
      const dependencyType = typeMap.get(node.name);
      if (dependencyType) {
        node.dependencyType = dependencyType;
      }
    }
  }

  private buildDirectDependencyAnalyzerNodes(packageJson: PackageJsonManifest): DependencyAnalyzerNode[] {
    const seen = new Set<string>();
    const nodes: DependencyAnalyzerNode[] = [];
    const entries: Array<[DependencyType, Record<string, string> | undefined]> = [
      ['dependencies', packageJson.dependencies],
      ['devDependencies', packageJson.devDependencies],
      ['peerDependencies', packageJson.peerDependencies],
      ['optionalDependencies', packageJson.optionalDependencies],
    ];

    for (const [type, deps] of entries) {
      for (const [name, version] of Object.entries(deps || {})) {
        const id = `${name}@${version}`;
        if (seen.has(id)) {
          continue;
        }
        seen.add(id);
        nodes.push({ id, name, version, dependencyType: type, children: [] });
      }
    }

    return nodes.sort((a, b) => a.name.localeCompare(b.name));
  }

  private async buildRecursiveDependencyAnalyzerNodes(
    packageJson: PackageJsonManifest,
    manifestPath: string,
    getPackageDependencies: (name: string, version?: string, targetPath?: string) => Promise<Record<string, string> | null>
  ): Promise<DependencyAnalyzerNode[]> {
    const entries: Array<[DependencyType, Record<string, string> | undefined]> = [
      ['dependencies', packageJson.dependencies],
      ['devDependencies', packageJson.devDependencies],
      ['peerDependencies', packageJson.peerDependencies],
      ['optionalDependencies', packageJson.optionalDependencies],
    ];

    const visited = new Set<string>();
    const nodes: DependencyAnalyzerNode[] = [];

    for (const [type, deps] of entries) {
      for (const [name, spec] of Object.entries(deps || {})) {
        const parsedSpec = parseDependencySpec(spec);
        const node = await this.buildRecursiveDependencyAnalyzerNode(
          name,
          parsedSpec.normalizedVersion || parsedSpec.displayText,
          manifestPath,
          visited,
          getPackageDependencies
        );
        if (node) {
          node.dependencyType = type;
          nodes.push(node);
        }
      }
    }

    return nodes.sort((a, b) => a.name.localeCompare(b.name));
  }

  private async buildRecursiveDependencyAnalyzerNode(
    name: string,
    version: string,
    manifestPath: string,
    visited: Set<string>,
    getPackageDependencies: (name: string, version?: string, targetPath?: string) => Promise<Record<string, string> | null>
  ): Promise<DependencyAnalyzerNode | null> {
    const nodeId = `${name}@${version}`;
    if (visited.has(nodeId)) {
      return { id: nodeId, name, version, children: [] };
    }

    visited.add(nodeId);
    const dependencies = await getPackageDependencies(name, version, manifestPath);
    const children: DependencyAnalyzerNode[] = [];

    for (const [childName, childVersionSpec] of Object.entries(dependencies || {}).sort(([a], [b]) => a.localeCompare(b))) {
      const parsedSpec = parseDependencySpec(childVersionSpec);
      const childVersion = parsedSpec.normalizedVersion || parsedSpec.displayText;
      const childNode = await this.buildRecursiveDependencyAnalyzerNode(
        childName,
        childVersion,
        manifestPath,
        visited,
        getPackageDependencies
      );
      if (childNode) {
        children.push(childNode);
      }
    }

    visited.delete(nodeId);
    return { id: nodeId, name, version, children };
  }

  private markConflictNodes(nodes: DependencyAnalyzerNode[], conflictingNames: Set<string>): void {
    const visit = (node: DependencyAnalyzerNode) => {
      node.isConflict = conflictingNames.has(node.name);
      for (const child of node.children) {
        visit(child);
      }
    };

    for (const node of nodes) {
      visit(node);
    }
  }
}
