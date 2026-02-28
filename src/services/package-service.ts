import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type {
  PackageInfo,
  PackageDetails,
  VersionInfo,
  BundleSize,
  SecurityInfo,
  PackageManager,
  DependencyType,
  DependentsInfo,
  RequirementsInfo,
  WorkspacePackageScope,
} from '../types/package';
import type {
  DependencyAnalyzerData,
  DependencyAnalyzerNode,
  DependencyConflict,
} from '../types/analyzer';
import type { SourceSelector } from '../registry/source-selector';
import { SourceCapability, CapabilityNotSupportedError, type CapabilitySupport } from '../sources/base/capabilities';

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

/**
 * Service for package information
 * Uses source selector for multi-source support
 */
export class PackageService {
  private localDependencyTreeCache = new Map<string, Map<string, Record<string, string> | null> | null>();
  private localDependencyTreePromises = new Map<
    string,
    Promise<Map<string, Record<string, string> | null> | null>
  >();
  private latestVersionCache = new Map<string, string | null>();
  private latestVersionPromises = new Map<string, Promise<string | null>>();

  constructor(private sourceSelector?: SourceSelector) {}

  /**
   * Set the source selector (for late initialization)
   */
  setSourceSelector(selector: SourceSelector): void {
    this.sourceSelector = selector;
  }

  invalidateLocalDependencyTreeCache(scope?: WorkspacePackageScope | string): void {
    if (!scope) {
      this.localDependencyTreeCache.clear();
      this.localDependencyTreePromises.clear();
      return;
    }

    const workspacePath = this.resolveWorkspacePathFromScope(scope);
    if (!workspacePath) {
      this.localDependencyTreeCache.clear();
      this.localDependencyTreePromises.clear();
      return;
    }

    this.localDependencyTreeCache.delete(workspacePath);
    this.localDependencyTreePromises.delete(workspacePath);
  }

  invalidateLatestVersionCache(packageNames?: string[]): void {
    if (!packageNames || packageNames.length === 0) {
      this.latestVersionCache.clear();
      this.latestVersionPromises.clear();
      return;
    }

    for (const packageName of packageNames) {
      this.latestVersionCache.delete(packageName);
      this.latestVersionPromises.delete(packageName);
    }
  }

  /**
   * Get basic package info
   */
  async getPackageInfo(name: string): Promise<PackageInfo> {
    if (!this.sourceSelector) {
      throw new Error('PackageService not initialized: SourceSelector is required');
    }

    return this.sourceSelector.executeWithFallback(
      adapter => adapter.getPackageInfo(name)
    );
  }

  /**
   * Get detailed package info
   */
  async getPackageDetails(name: string, version?: string): Promise<PackageDetails> {
    if (!this.sourceSelector) {
      throw new Error('PackageService not initialized: SourceSelector is required');
    }

    return this.sourceSelector.executeWithFallback(
      adapter => adapter.getPackageDetails(name, version)
    );
  }

  async getEnrichedPackageDetails(
    name: string,
    options?: { installedVersion?: string }
  ): Promise<PackageDetails> {
    const details = await this.getPackageDetails(name, options?.installedVersion);
    const [dependents, requirements, installedVersionSecurity] = await Promise.all([
      this.getDependents(name, details.version),
      this.getRequirements(name, details.version),
      options?.installedVersion ? this.getSecurityInfo(name, details.version) : Promise.resolve(null),
    ]);

    if (dependents) {
      details.dependents = dependents;
    }

    if (requirements) {
      details.requirements = requirements;
    }

    if (installedVersionSecurity) {
      details.security = installedVersionSecurity;
    }

    return details;
  }

  /**
   * Get bundle size for a package (only if capability is supported)
   */
  async getBundleSize(name: string, version?: string): Promise<BundleSize | null> {
    if (!this.sourceSelector) {
      throw new Error('PackageService not initialized: SourceSelector is required');
    }

    const adapter = this.sourceSelector.selectSource();

    // Check capability support - don't query if not supported
    if (!adapter.supportsCapability(SourceCapability.BUNDLE_SIZE)) {
      return null; // Explicitly return null, don't query
    }

    if (adapter.getBundleSize) {
      try {
        return await adapter.getBundleSize(name, version);
      } catch (error) {
        if (error instanceof CapabilityNotSupportedError) {
          return null;
        }
        throw error;
      }
    }

    return null;
  }

  /**
   * Get security info for a package (only if capability is supported)
   */
  async getSecurityInfo(name: string, version: string): Promise<SecurityInfo | null> {
    if (!this.sourceSelector) {
      throw new Error('PackageService not initialized: SourceSelector is required');
    }

    const adapter = this.sourceSelector.selectSource();

    // Check capability support - don't query if not supported
    if (!adapter.supportsCapability(SourceCapability.SECURITY)) {
      return null; // Explicitly return null, don't query
    }

    if (adapter.getSecurityInfo) {
      try {
        return await adapter.getSecurityInfo(name, version);
      } catch (error) {
        if (error instanceof CapabilityNotSupportedError) {
          return null;
        }
        throw error;
      }
    }

    return null;
  }

  /**
   * Get security info for multiple packages in batch (only if capability is supported)
   * Adapters can implement getSecurityInfoBulk using OSV /v1/querybatch.
   * Falls back to individual getSecurityInfo calls when bulk is not available.
   */
  async getSecurityInfoBulk(
    packages: Array<{ name: string; version: string }>
  ): Promise<Record<string, SecurityInfo | null>> {
    if (!this.sourceSelector) {
      throw new Error('PackageService not initialized: SourceSelector is required');
    }

    const result: Record<string, SecurityInfo | null> = {};
    if (packages.length === 0) {
      return result;
    }

    const adapter = this.sourceSelector.selectSource();

    if (!adapter.supportsCapability(SourceCapability.SECURITY)) {
      return result;
    }

    // Prefer adapter-level bulk implementation if available
    if (adapter.getSecurityInfoBulk) {
      try {
        const bulk = await adapter.getSecurityInfoBulk(packages);
        return bulk;
      } catch (error) {
        if (!(error instanceof CapabilityNotSupportedError)) {
          // For other errors, fall through to per-package fallback
        }
      }
    }

    // Fallback: call getSecurityInfo for each package
    if (adapter.getSecurityInfo) {
      await Promise.all(
        packages.map(async ({ name, version }) => {
          const key = `${name}@${version}`;
          try {
            result[key] = await adapter.getSecurityInfo!(name, version);
          } catch (error) {
            if (error instanceof CapabilityNotSupportedError) {
              result[key] = null;
            } else {
              result[key] = null;
            }
          }
        })
      );
    }

    return result;
  }

  /**
   * Get capability support information
   */
  getCapabilitySupport(capability: SourceCapability): CapabilitySupport | null {
    if (!this.sourceSelector) {
      return null;
    }

    try {
      const adapter = this.sourceSelector.selectSource();
      return adapter.getCapabilitySupport(capability);
    } catch {
      return null;
    }
  }

  /**
   * Get all supported capabilities
   */
  getSupportedCapabilities(): SourceCapability[] {
    if (!this.sourceSelector) {
      return [];
    }

    try {
      const adapter = this.sourceSelector.selectSource();
      return adapter.getSupportedCapabilities();
    } catch {
      return [];
    }
  }

  /**
   * Check if a capability is supported
   */
  supportsCapability(capability: SourceCapability): boolean {
    if (!this.sourceSelector) {
      return false;
    }

    try {
      const adapter = this.sourceSelector.selectSource();
      return adapter.supportsCapability(capability);
    } catch {
      return false;
    }
  }

  /**
   * Get all versions of a package
   */
  async getVersions(name: string): Promise<VersionInfo[]> {
    if (!this.sourceSelector) {
      throw new Error('PackageService not initialized: SourceSelector is required');
    }

    return this.sourceSelector.executeWithFallback(
      adapter => adapter.getVersions(name)
    );
  }

  /**
   * Get latest version of a package
   */
  async getLatestVersion(name: string): Promise<string | null> {
    if (this.latestVersionCache.has(name)) {
      return this.latestVersionCache.get(name) ?? null;
    }

    const pending = this.latestVersionPromises.get(name);
    if (pending) {
      return pending;
    }

    const promise = this.resolveLatestVersion(name);
    this.latestVersionPromises.set(name, promise);

    try {
      const version = await promise;
      this.latestVersionCache.set(name, version);
      return version;
    } finally {
      this.latestVersionPromises.delete(name);
    }
  }

  private async resolveLatestVersion(name: string): Promise<string | null> {
    try {
      const info = await this.getPackageInfo(name);
      return info.version || null;
    } catch {
      return null;
    }
  }

  async getDependencyAnalyzerData(manifestPath: string): Promise<DependencyAnalyzerData | null> {
    const workspaceFolder = this.resolveWorkspaceFolder(manifestPath);
    if (!workspaceFolder) {
      return null;
    }

    const path = require('path') as typeof import('path');
    const fs = require('fs/promises') as typeof import('fs/promises');
    const packageManager = await this.detectLocalPackageManager(workspaceFolder.uri.fsPath);
    const manifestDir = path.dirname(manifestPath);

    try {
      const raw = await fs.readFile(manifestPath, 'utf8');
      const packageJson = JSON.parse(raw) as {
        name?: string;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        peerDependencies?: Record<string, string>;
        optionalDependencies?: Record<string, string>;
      };
      const manifestName =
        typeof packageJson.name === 'string' && packageJson.name.trim()
          ? packageJson.name.trim()
          : path.basename(manifestDir);

      let nodes: DependencyAnalyzerNode[] = [];
      switch (packageManager) {
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

      if (nodes.length === 0) {
        nodes = this.buildDirectDependencyAnalyzerNodes(packageJson);
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
        packageManager: packageManager || 'unknown',
        nodes,
        conflicts,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get package dependencies for a specific version
   * Returns all dependencies merged together (for dependency tree support)
   */
  async getPackageDependencies(
    name: string,
    version?: string,
    targetPath?: string
  ): Promise<Record<string, string> | null> {
    const localDependencies = await this.getLocalPackageDependencies(name, version, targetPath);
    if (localDependencies) {
      return localDependencies;
    }

    try {
      const details = await this.getPackageDetails(name);
      
      // If version is specified, try to get that version's dependencies
      if (version && details.versions) {
        const versionInfo = details.versions.find(v => v.version === version);
        if (versionInfo) {
          // For now, return latest version's dependencies
          // In the future, we might need to fetch specific version details
        }
      }
      
      // Merge all dependency types for dependency tree support
      const allDependencies: Record<string, string> = {};
      
      if (details.dependencies) {
        Object.assign(allDependencies, details.dependencies);
      }
      if (details.devDependencies) {
        Object.assign(allDependencies, details.devDependencies);
      }
      if (details.peerDependencies) {
        Object.assign(allDependencies, details.peerDependencies);
      }
      if (details.optionalDependencies) {
        Object.assign(allDependencies, details.optionalDependencies);
      }
      
      return Object.keys(allDependencies).length > 0 ? allDependencies : null;
    } catch {
      return null;
    }
  }

  async hasPackageDependencies(name: string, version?: string, targetPath?: string): Promise<boolean | null> {
    const localDependencies = await this.getLocalPackageDependencies(name, version, targetPath);
    if (localDependencies !== null) {
      return Object.keys(localDependencies).length > 0;
    }

    return null;
  }

  async getDependents(name: string, version: string): Promise<DependentsInfo | null> {
    if (!this.sourceSelector) {
      throw new Error('PackageService not initialized: SourceSelector is required');
    }

    const adapter = this.sourceSelector.selectSource();
    if (!adapter.supportsCapability(SourceCapability.DEPENDENTS) || !adapter.getDependents) {
      return null;
    }

    try {
      return await adapter.getDependents(name, version);
    } catch (error) {
      if (error instanceof CapabilityNotSupportedError) {
        return null;
      }
      throw error;
    }
  }

  async getRequirements(name: string, version: string): Promise<RequirementsInfo | null> {
    if (!this.sourceSelector) {
      throw new Error('PackageService not initialized: SourceSelector is required');
    }

    const adapter = this.sourceSelector.selectSource();
    if (!adapter.supportsCapability(SourceCapability.REQUIREMENTS) || !adapter.getRequirements) {
      return null;
    }

    try {
      return await adapter.getRequirements(name, version);
    } catch (error) {
      if (error instanceof CapabilityNotSupportedError) {
        return null;
      }
      throw error;
    }
  }

  private async getLocalPackageDependencies(
    name: string,
    version?: string,
    targetPath?: string
  ): Promise<Record<string, string> | null> {
    const tree = await this.getLocalDependencyTree(targetPath);
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

  private async getLocalDependencyTree(
    targetPath?: string
  ): Promise<Map<string, Record<string, string> | null> | null> {
    if (this.sourceSelector?.getCurrentProjectType() !== 'npm') {
      return null;
    }

    const workspaceFolder = this.resolveWorkspaceFolder(targetPath);
    if (!workspaceFolder) {
      return null;
    }
    const workspacePath = workspaceFolder.uri.fsPath;

    if (this.localDependencyTreeCache.has(workspacePath)) {
      return this.localDependencyTreeCache.get(workspacePath) ?? null;
    }

    const pending = this.localDependencyTreePromises.get(workspacePath);
    if (pending) {
      return pending;
    }

    const promise = this.loadLocalDependencyTree(workspaceFolder);
    this.localDependencyTreePromises.set(workspacePath, promise);

    try {
      const tree = await promise;
      this.localDependencyTreeCache.set(workspacePath, tree);
      return tree;
    } finally {
      this.localDependencyTreePromises.delete(workspacePath);
    }
  }

  private async loadLocalDependencyTree(
    workspaceFolder: vscode.WorkspaceFolder
  ): Promise<Map<string, Record<string, string> | null> | null> {
    const packageManager = await this.detectLocalPackageManager(workspaceFolder.uri.fsPath);
    if (!packageManager) {
      return null;
    }

    if (packageManager === 'bun') {
      return this.buildDependencyIndexFromNodeModules(workspaceFolder.uri.fsPath);
    }

    const command = this.getDependencyTreeCommand(packageManager);
    if (!command) {
      return null;
    }

    try {
      const { stdout } = await execFileAsync(command.file, command.args, {
        cwd: workspaceFolder.uri.fsPath,
        encoding: 'utf8',
        timeout: 15000,
        maxBuffer: 20 * 1024 * 1024,
      });
      return this.parseDependencyTreeOutput(packageManager, stdout);
    } catch {
      return null;
    }
  }

  private async detectLocalPackageManager(workspacePath: string): Promise<PackageManager | null> {
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

      for (const { file, manager } of lockFiles) {
        if (fs.existsSync(path.join(workspacePath, file))) {
          return manager;
        }
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

  private resolveWorkspacePathFromScope(scope: WorkspacePackageScope | string): string | undefined {
    if (typeof scope === 'string') {
      return this.resolveWorkspaceFolder(scope)?.uri.fsPath;
    }

    if (scope.workspaceFolderPath) {
      return scope.workspaceFolderPath;
    }

    if (scope.manifestPath) {
      return this.resolveWorkspaceFolder(scope.manifestPath)?.uri.fsPath;
    }

    return undefined;
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
      if (!entry.isDirectory()) {
        continue;
      }

      if (entry.name.startsWith('.')) {
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
      const childDir = await this.resolveInstalledDependencyDir(
        realPackageDir,
        workspacePath,
        dependencyName
      );
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
        // Try next path
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
      dependencies?: Record<string, LocalDependencyNode & {
        dependencies?: Record<string, LocalDependencyNode>;
      }>;
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
            Object.entries(node.dependencies).map(([childName, childNode]) => [
              childName,
              childNode.version || '',
            ])
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
      const packageJson = JSON.parse(raw) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        peerDependencies?: Record<string, string>;
        optionalDependencies?: Record<string, string>;
      };
      const directDependencies = {
        ...(packageJson.dependencies || {}),
        ...(packageJson.devDependencies || {}),
        ...(packageJson.peerDependencies || {}),
        ...(packageJson.optionalDependencies || {}),
      };

      const visited = new Set<string>();
      const nodes = await Promise.all(
        Object.keys(directDependencies).sort((a, b) => a.localeCompare(b)).map(async (dependencyName) => {
          const dependencyDir = await this.resolveInstalledDependencyDir(
            manifestDir,
            manifestDir,
            dependencyName
          );
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
          ? Object.entries(node.dependencies).map(([childName, childNode]) => ({
              ...childNode,
              name: childName,
            }))
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
    const parsed = this.parseYarnNodeName(node.name);
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

  private parseYarnNodeName(rawName: string): { name: string; version: string } {
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
      bucket.push({
        version: node.version,
        path: currentPath,
      });
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

  private applyDirectDependencyTypes(
    nodes: DependencyAnalyzerNode[],
    packageJson: {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    }
  ): void {
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

  private buildDirectDependencyAnalyzerNodes(packageJson: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
  }): DependencyAnalyzerNode[] {
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
        nodes.push({
          id,
          name,
          version,
          dependencyType: type,
          children: [],
        });
      }
    }

    return nodes.sort((a, b) => a.name.localeCompare(b.name));
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

  /**
   * Get package abbreviated info (lightweight version info)
   * Returns basic info including latest version and dependencies for a specific version
   */
  async getPackageAbbreviated(
    name: string,
    _version?: string
  ): Promise<{
    name: string;
    'dist-tags': { latest: string };
    versions: Record<string, { version: string; dependencies?: Record<string, string> }>;
  } | null> {
    try {
      const details = await this.getPackageDetails(name);
      const versions = details.versions || [];
      
      // Build versions map
      const versionsMap: Record<string, { version: string; dependencies?: Record<string, string> }> = {};
      for (const v of versions) {
        versionsMap[v.version] = {
          version: v.version,
          // Note: We don't have per-version dependencies in current structure
          // This is a limitation - we'd need to fetch each version separately
        };
      }
      
      // If we have the latest version's dependencies, add them to the latest version entry
      if (details.version && details.dependencies) {
        versionsMap[details.version] = {
          version: details.version,
          dependencies: details.dependencies,
        };
      }
      
      return {
        name: details.name,
        'dist-tags': {
          latest: details.version,
        },
        versions: versionsMap,
      };
    } catch {
      return null;
    }
  }
}
