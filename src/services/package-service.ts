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
} from '../types/package';
import type { SourceSelector } from '../registry/source-selector';
import { SourceCapability, CapabilityNotSupportedError, type CapabilitySupport } from '../sources/base/capabilities';

const execFileAsync = promisify(execFile);

interface LocalDependencyNode {
  name: string;
  version?: string;
  dependencies?: Record<string, string>;
}

/**
 * Service for package information
 * Uses source selector for multi-source support
 */
export class PackageService {
  private localDependencyTreeCache: Map<string, Record<string, string> | null> | null = null;
  private localDependencyTreePromise: Promise<Map<string, Record<string, string> | null> | null> | null = null;
  private latestVersionCache = new Map<string, string | null>();
  private latestVersionPromises = new Map<string, Promise<string | null>>();

  constructor(private sourceSelector?: SourceSelector) {}

  /**
   * Set the source selector (for late initialization)
   */
  setSourceSelector(selector: SourceSelector): void {
    this.sourceSelector = selector;
  }

  invalidateLocalDependencyTreeCache(): void {
    this.localDependencyTreeCache = null;
    this.localDependencyTreePromise = null;
  }

  invalidateLatestVersionCache(): void {
    this.latestVersionCache.clear();
    this.latestVersionPromises.clear();
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
  async getPackageDetails(name: string): Promise<PackageDetails> {
    if (!this.sourceSelector) {
      throw new Error('PackageService not initialized: SourceSelector is required');
    }

    return this.sourceSelector.executeWithFallback(
      adapter => adapter.getPackageDetails(name)
    );
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

  /**
   * Get package dependencies for a specific version
   * Returns all dependencies merged together (for dependency tree support)
   */
  async getPackageDependencies(
    name: string,
    version?: string
  ): Promise<Record<string, string> | null> {
    const localDependencies = await this.getLocalPackageDependencies(name, version);
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

  async hasPackageDependencies(name: string, version?: string): Promise<boolean | null> {
    const localDependencies = await this.getLocalPackageDependencies(name, version);
    if (localDependencies !== null) {
      return Object.keys(localDependencies).length > 0;
    }

    return null;
  }

  private async getLocalPackageDependencies(
    name: string,
    version?: string
  ): Promise<Record<string, string> | null> {
    const tree = await this.getLocalDependencyTree();
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

  private async getLocalDependencyTree(): Promise<Map<string, Record<string, string> | null> | null> {
    if (this.sourceSelector?.getCurrentProjectType() !== 'npm') {
      return null;
    }

    if (this.localDependencyTreeCache) {
      return this.localDependencyTreeCache;
    }

    if (this.localDependencyTreePromise) {
      return this.localDependencyTreePromise;
    }

    this.localDependencyTreePromise = this.loadLocalDependencyTree();

    try {
      const tree = await this.localDependencyTreePromise;
      this.localDependencyTreeCache = tree;
      return tree;
    } finally {
      this.localDependencyTreePromise = null;
    }
  }

  private async loadLocalDependencyTree(): Promise<Map<string, Record<string, string> | null> | null> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return null;
    }

    const packageManager = await this.detectLocalPackageManager(workspaceFolder.uri.fsPath);
    if (!packageManager) {
      return null;
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
