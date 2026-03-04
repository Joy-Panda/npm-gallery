import * as vscode from 'vscode';
import type { InstalledPackage, DependencyType, WorkspacePackageScope, NuGetManagementStyle } from '../types/package';
import { getServices } from './index';
import {
  formatDependencySpecDisplay,
  getUpdateType,
  parseDependencySpec,
  type ParsedDependencySpec,
} from '../utils/version-utils';
import { WorkspaceManifestDiscovery } from './workspace/manifest-discovery';
import { resolveWorkspacePackageScope } from './workspace/scope-resolver';
import {
  removeCakePackageText,
  removeCpmPackageText,
  removePackagesConfigText,
  removePaketDependencyText,
  removePerlDependencyText,
  removeProjectPackageReferenceText,
  removeRDependencyText,
  updateCakePackageText,
  updateCargoDependencyText,
  updateCpmPackageText,
  updateDepsEdnDependencyText,
  updateGoDependencyText,
  updateGradleDependencyText,
  updateLeiningenDependencyText,
  updateMavenDependencyText,
  updatePackagesConfigText,
  updatePaketDependencyText,
  updatePerlDependencyText,
  updateProjectPackageReferenceText,
  updatePubspecDependencyText,
  updateRDependencyText,
} from './workspace/editors/manifest-editors';
import {
  alignWorkspaceDependencyVersions as alignNpmWorkspaceDependencyVersions,
  buildWorkspaceProjectGraph,
  updatePackageJsonDependency,
} from './workspace/npm-workspace';
import { parsePomXml, parseGradleManifest } from './workspace/parsers/java-parsers';
import {
  parseDirectoryPackagesProps,
  parsePaketDependencies,
  parsePackagesConfig,
  parseProjectPackageReferences,
  parseCakePackages,
} from './workspace/parsers/dotnet-parsers';
import { parseComposerManifest } from './workspace/parsers/composer-parser';
import { parseGemfileManifest } from './workspace/parsers/ruby-parser';
import { parseDepsEdnManifest, parseLeiningenManifest } from './workspace/parsers/clojure-parser';
import { parseCargoManifest, parseGoManifest } from './workspace/parsers/cargo-go-parsers';
import { parsePerlManifest, parsePubspecManifest } from './workspace/parsers/perl-pub-parsers';
import { parseDescriptionManifest } from './workspace/parsers/r-parser';
import { getFallbackManifestName } from './workspace/parsers/shared';
import type {
  WorkspaceProjectGraph,
} from '../types/workspace';

/**
 * Service for workspace package management
 */
export class WorkspaceService {
  private static readonly PACKAGE_CHANGE_DEBOUNCE_MS = 200;

  private _onDidChangePackages = new vscode.EventEmitter<WorkspacePackageScope | undefined>();
  readonly onDidChangePackages = this._onDidChangePackages.event;

  private fileWatcher: vscode.FileSystemWatcher | null = null;
  private installedPackagesCache: InstalledPackage[] | null = null;
  private installedPackagesPromise: Promise<InstalledPackage[]> | null = null;
  private pendingPackageChangeTimer?: ReturnType<typeof setTimeout>;
  private pendingPackageChangeScopes = new Map<string, WorkspacePackageScope | undefined>();
  private manifestDiscovery = new WorkspaceManifestDiscovery(() => this.discoverWorkspacePackageJsonFiles());

  /**
   * Initialize workspace service
   */
  initialize(): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = [];

    // Watch for package manifests and monorepo config changes
    this.fileWatcher = vscode.workspace.createFileSystemWatcher(
      '**/{package.json,composer.json,composer.lock,Gemfile,Gemfile.lock,deps.edn,project.clj,Cargo.toml,Cargo.lock,go.mod,cpanfile,cpanfile.snapshot,pubspec.yaml,pubspec.lock,DESCRIPTION,*.Rproj,pom.xml,build.gradle,build.gradle.kts,lerna.json,nx.json,workspace.json,pnpm-workspace.yaml,Directory.Packages.props,paket.dependencies,packages.config,*.csproj,*.vbproj,*.fsproj,*.cake}'
    );

    const invalidateAndNotify = (uri?: vscode.Uri) => {
      const scope = uri ? this.getScopeForUri(uri) : undefined;
      if (!scope) {
        this.invalidateInstalledPackagesCache();
      }
      this.queuePackageChange(scope);
    };

    this.fileWatcher.onDidChange((uri) => invalidateAndNotify(uri));
    this.fileWatcher.onDidCreate((uri) => invalidateAndNotify(uri));
    this.fileWatcher.onDidDelete((uri) => invalidateAndNotify(uri));
    disposables.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        invalidateAndNotify();
      })
    );

    disposables.push(this.fileWatcher);
    disposables.push(this._onDidChangePackages);
    disposables.push(
      new vscode.Disposable(() => {
        if (this.pendingPackageChangeTimer) {
          clearTimeout(this.pendingPackageChangeTimer);
          this.pendingPackageChangeTimer = undefined;
        }
        this.pendingPackageChangeScopes.clear();
      })
    );

    return disposables;
  }

  private queuePackageChange(scope?: WorkspacePackageScope): void {
    const key = this.getPackageChangeScopeKey(scope);
    this.pendingPackageChangeScopes.set(key, scope);

    if (this.pendingPackageChangeTimer) {
      clearTimeout(this.pendingPackageChangeTimer);
    }

    this.pendingPackageChangeTimer = setTimeout(() => {
      this.pendingPackageChangeTimer = undefined;
      const scopes = [...this.pendingPackageChangeScopes.values()];
      this.pendingPackageChangeScopes.clear();

      if (scopes.some((item) => !item)) {
        this._onDidChangePackages.fire(undefined);
        return;
      }

      for (const item of scopes) {
        this._onDidChangePackages.fire(item);
      }
    }, WorkspaceService.PACKAGE_CHANGE_DEBOUNCE_MS);
  }

  private getPackageChangeScopeKey(scope?: WorkspacePackageScope): string {
    if (!scope) {
      return 'all';
    }

    return scope.manifestPath || `workspace:${scope.workspaceFolderPath || ''}`;
  }

  /**
   * Get all package.json files in workspace
   */
  async getPackageJsonFiles(): Promise<vscode.Uri[]> {
    return this.manifestDiscovery.getPackageJsonFiles();
  }

  async getManifestInfos(): Promise<Array<{ path: string; name: string; workspaceFolderPath?: string }>> {
    const installedPackages = await this.getInstalledPackages();
    const manifestMap = new Map<string, { path: string; name: string; workspaceFolderPath?: string }>();
    for (const pkg of installedPackages) {
      if (!manifestMap.has(pkg.packageJsonPath)) {
        manifestMap.set(pkg.packageJsonPath, {
          path: pkg.packageJsonPath,
          name: pkg.manifestName?.trim() || this.getFallbackManifestName(pkg.packageJsonPath),
          workspaceFolderPath: pkg.workspaceFolderPath,
        });
      }
    }
    return [...manifestMap.values()].sort((a, b) => a.path.localeCompare(b.path));
  }

  /**
   * Get all pom.xml files in workspace
   */
  async getPomXmlFiles(): Promise<vscode.Uri[]> {
    return this.manifestDiscovery.getPomXmlFiles();
  }

  async getGradleManifestFiles(): Promise<vscode.Uri[]> {
    return this.manifestDiscovery.getGradleManifestFiles();
  }

  async getComposerManifestFiles(): Promise<vscode.Uri[]> {
    return this.manifestDiscovery.getComposerManifestFiles();
  }

  async getRubyManifestFiles(): Promise<vscode.Uri[]> {
    return this.manifestDiscovery.getRubyManifestFiles();
  }

  async getClojureManifestFiles(): Promise<vscode.Uri[]> {
    return this.manifestDiscovery.getClojureManifestFiles();
  }

  async getCargoManifestFiles(): Promise<vscode.Uri[]> {
    return this.manifestDiscovery.getCargoManifestFiles();
  }

  async getGoManifestFiles(): Promise<vscode.Uri[]> {
    return this.manifestDiscovery.getGoManifestFiles();
  }

  async getPerlManifestFiles(): Promise<vscode.Uri[]> {
    return this.manifestDiscovery.getPerlManifestFiles();
  }

  async getPubManifestFiles(): Promise<vscode.Uri[]> {
    return this.manifestDiscovery.getPubManifestFiles();
  }

  async getRManifestFiles(): Promise<vscode.Uri[]> {
    return this.manifestDiscovery.getRManifestFiles();
  }

  /**
   * Get .NET/NuGet manifest files that list packages (for Installed / Updates views).
   * Returns Directory.Packages.props, paket.dependencies, packages.config,
   * PackageReference project files, and *.cake.
   */
  async getDotNetInstalledManifestFiles(): Promise<vscode.Uri[]> {
    return this.manifestDiscovery.getDotNetInstalledManifestFiles();
  }

  /**
   * Get .NET/NuGet manifest files for install target.
   * Order: Directory.Packages.props (CPM), paket.dependencies (Paket), packages.config (Legacy), then .csproj/.vbproj/.fsproj (PackageReference).
   */
  async getDotNetManifestFiles(): Promise<vscode.Uri[]> {
    return this.manifestDiscovery.getDotNetManifestFiles();
  }

  /**
   * Check if workspace has Directory.Packages.props (NuGet CPM).
   */
  async hasDirectoryPackagesProps(): Promise<boolean> {
    return this.manifestDiscovery.hasDirectoryPackagesProps();
  }

  /**
   * Detect .NET/NuGet management style from a path (walk up dirs, like npm/yarn/pnpm/bun detection).
   * Priority: Paket > CPM > packages.config > Cake (current or parent dir) > PackageReference.
   */
  detectNuGetManagementStyle(startPath?: string): NuGetManagementStyle {
    const path = require('path') as typeof import('path');
    const fs = require('fs') as typeof import('fs');
    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length) {
      return 'packagereference';
    }
    const rootPaths = folders.map((f) => f.uri.fsPath);
    let currentDir: string;
    try {
      if (startPath && fs.existsSync(startPath)) {
        currentDir = fs.statSync(startPath).isFile() ? path.dirname(startPath) : startPath;
      } else {
        const active = vscode.window.activeTextEditor?.document.uri.fsPath;
        currentDir = active ? path.dirname(active) : rootPaths[0];
      }
    } catch {
      const active = vscode.window.activeTextEditor?.document.uri.fsPath;
      currentDir = active ? path.dirname(active) : rootPaths[0];
    }
    const isInWorkspace = (p: string) => rootPaths.some((r) => p === r || p.startsWith(r + path.sep));
    while (currentDir && isInWorkspace(currentDir)) {
      if (fs.existsSync(path.join(currentDir, 'paket.dependencies'))) {
        return 'paket';
      }
      if (fs.existsSync(path.join(currentDir, 'Directory.Packages.props'))) {
        return 'cpm';
      }
      if (fs.existsSync(path.join(currentDir, 'packages.config'))) {
        return 'packages.config';
      }
      try {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        if (entries.some((e) => e.isFile() && e.name.toLowerCase().endsWith('.cake'))) {
          return 'cake';
        }
      } catch {
        // ignore
      }
      const parent = path.dirname(currentDir);
      if (parent === currentDir) {
        break;
      }
      currentDir = parent;
    }
    return 'packagereference';
  }

  private async discoverWorkspacePackageJsonFiles(): Promise<vscode.Uri[]> {
    const workspaceFolders = vscode.workspace.workspaceFolders || [];
    if (workspaceFolders.length === 0) {
      return [];
    }

    const manifestMap = new Map<string, vscode.Uri>();
    let hasExplicitWorkspaceConfig = false;

    for (const workspaceFolder of workspaceFolders) {
      const rootPackageJsonUri = vscode.Uri.joinPath(workspaceFolder.uri, 'package.json');
      const rootPackageJson = await this.readJsonFile(rootPackageJsonUri);

      if (rootPackageJson) {
        manifestMap.set(rootPackageJsonUri.fsPath, rootPackageJsonUri);
      }

      const workspacePatterns = new Set<string>();

      this.collectNpmWorkspacePatterns(rootPackageJson, workspacePatterns);
      await this.collectPnpmWorkspacePatterns(workspaceFolder, workspacePatterns);
      await this.collectLernaWorkspacePatterns(workspaceFolder, workspacePatterns);
      if (workspacePatterns.size > 0) {
        hasExplicitWorkspaceConfig = true;
      }

      const nxProjectFiles = await this.collectNxProjectPackageJsonFiles(workspaceFolder);
      if (nxProjectFiles.length > 0) {
        hasExplicitWorkspaceConfig = true;
      }
      for (const uri of nxProjectFiles) {
        manifestMap.set(uri.fsPath, uri);
      }

      const matchedFromPatterns = await this.findPackageJsonsFromPatterns(workspaceFolder, [...workspacePatterns]);
      for (const uri of matchedFromPatterns) {
        manifestMap.set(uri.fsPath, uri);
      }
    }

    if (!hasExplicitWorkspaceConfig) {
      return [];
    }

    return [...manifestMap.values()].sort((a, b) => a.fsPath.localeCompare(b.fsPath));
  }

  private collectNpmWorkspacePatterns(
    rootPackageJson: Record<string, unknown> | null,
    patterns: Set<string>
  ): void {
    if (!rootPackageJson) {
      return;
    }

    const workspaces = rootPackageJson.workspaces;
    if (Array.isArray(workspaces)) {
      for (const pattern of workspaces) {
        if (typeof pattern === 'string') {
          patterns.add(pattern);
        }
      }
      return;
    }

    if (
      workspaces &&
      typeof workspaces === 'object' &&
      !Array.isArray(workspaces) &&
      Array.isArray((workspaces as { packages?: unknown }).packages)
    ) {
      for (const pattern of (workspaces as { packages: unknown[] }).packages) {
        if (typeof pattern === 'string') {
          patterns.add(pattern);
        }
      }
    }
  }

  private async collectPnpmWorkspacePatterns(
    workspaceFolder: vscode.WorkspaceFolder,
    patterns: Set<string>
  ): Promise<void> {
    const pnpmWorkspaceUri = vscode.Uri.joinPath(workspaceFolder.uri, 'pnpm-workspace.yaml');
    const text = await this.readTextFile(pnpmWorkspaceUri);
    if (!text) {
      return;
    }

    let inPackagesBlock = false;
    for (const line of text.split(/\r?\n/)) {
      if (/^\s*packages\s*:/.test(line)) {
        inPackagesBlock = true;
        continue;
      }

      if (inPackagesBlock) {
        const itemMatch = line.match(/^\s*-\s*['"]?(.+?)['"]?\s*$/);
        if (itemMatch) {
          patterns.add(itemMatch[1]);
          continue;
        }

        if (line.trim() && !line.startsWith(' ')) {
          break;
        }
      }
    }
  }

  private async collectLernaWorkspacePatterns(
    workspaceFolder: vscode.WorkspaceFolder,
    patterns: Set<string>
  ): Promise<void> {
    const lernaJsonUri = vscode.Uri.joinPath(workspaceFolder.uri, 'lerna.json');
    const lernaJson = await this.readJsonFile(lernaJsonUri);
    if (!lernaJson || !Array.isArray(lernaJson.packages)) {
      return;
    }

    for (const pattern of lernaJson.packages) {
      if (typeof pattern === 'string') {
        patterns.add(pattern);
      }
    }
  }

  private async collectNxProjectPackageJsonFiles(
    workspaceFolder: vscode.WorkspaceFolder
  ): Promise<vscode.Uri[]> {
    const nxJsonUri = vscode.Uri.joinPath(workspaceFolder.uri, 'nx.json');
    const nxJson = await this.readJsonFile(nxJsonUri);
    if (!nxJson) {
      return [];
    }

    const manifests = new Map<string, vscode.Uri>();
    const projectFiles = await vscode.workspace.findFiles(
      new vscode.RelativePattern(workspaceFolder, '**/project.json'),
      new vscode.RelativePattern(workspaceFolder, '**/{node_modules,dist,build,tmp,.next,.turbo}/**')
    );

    for (const projectFile of projectFiles) {
      const packageJsonUri = vscode.Uri.joinPath(projectFile, '..', 'package.json');
      if (await this.fileExists(packageJsonUri)) {
        manifests.set(packageJsonUri.fsPath, packageJsonUri);
      }
    }

    const workspaceJsonUri = vscode.Uri.joinPath(workspaceFolder.uri, 'workspace.json');
    const workspaceJson = await this.readJsonFile(workspaceJsonUri);
    if (workspaceJson && workspaceJson.projects && typeof workspaceJson.projects === 'object') {
      for (const value of Object.values(workspaceJson.projects as Record<string, unknown>)) {
        const root =
          typeof value === 'string'
            ? value
            : value && typeof value === 'object' && typeof (value as { root?: unknown }).root === 'string'
              ? (value as { root: string }).root
              : undefined;
        if (root) {
          const packageJsonUri = vscode.Uri.joinPath(workspaceFolder.uri, this.normalizeWorkspacePattern(root), 'package.json');
          if (await this.fileExists(packageJsonUri)) {
            manifests.set(packageJsonUri.fsPath, packageJsonUri);
          }
        }
      }
    }

    return [...manifests.values()];
  }

  private async findPackageJsonsFromPatterns(
    workspaceFolder: vscode.WorkspaceFolder,
    patterns: string[]
  ): Promise<vscode.Uri[]> {
    const includePatterns = patterns.filter((pattern) => pattern && !pattern.startsWith('!'));
    const excludePatterns = patterns
      .filter((pattern) => pattern.startsWith('!'))
      .map((pattern) => this.toManifestGlob(pattern.slice(1)));

    const manifests = new Map<string, vscode.Uri>();
    const excluded = new Set<string>();

    for (const excludePattern of excludePatterns) {
      const matches = await vscode.workspace.findFiles(
        new vscode.RelativePattern(workspaceFolder, excludePattern),
        new vscode.RelativePattern(workspaceFolder, '**/{node_modules,dist,build,tmp,.next,.turbo}/**')
      );
      for (const match of matches) {
        excluded.add(match.fsPath);
      }
    }

    for (const pattern of includePatterns) {
      const matches = await vscode.workspace.findFiles(
        new vscode.RelativePattern(workspaceFolder, this.toManifestGlob(pattern)),
        new vscode.RelativePattern(workspaceFolder, '**/{node_modules,dist,build,tmp,.next,.turbo}/**')
      );
      for (const match of matches) {
        if (!excluded.has(match.fsPath)) {
          manifests.set(match.fsPath, match);
        }
      }
    }

    return [...manifests.values()];
  }

  private toManifestGlob(pattern: string): string {
    const normalized = this.normalizeWorkspacePattern(pattern);
    if (normalized.endsWith('package.json')) {
      return normalized;
    }
    if (!normalized || normalized === '.') {
      return 'package.json';
    }
    return `${normalized.replace(/\/+$/, '')}/package.json`;
  }

  private normalizeWorkspacePattern(pattern: string): string {
    return pattern.replace(/^\.\/+/, '').replace(/\\/g, '/');
  }

  private async readJsonFile(uri: vscode.Uri): Promise<Record<string, unknown> | null> {
    try {
      const content = await vscode.workspace.fs.readFile(uri);
      return JSON.parse(content.toString()) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  private async readTextFile(uri: vscode.Uri): Promise<string | null> {
    try {
      const content = await vscode.workspace.fs.readFile(uri);
      return content.toString();
    } catch {
      return null;
    }
  }

  private async fileExists(uri: vscode.Uri): Promise<boolean> {
    try {
      await vscode.workspace.fs.stat(uri);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get installed packages from workspace (supports both npm and Maven)
   */
  async getInstalledPackages(): Promise<InstalledPackage[]> {
    if (this.installedPackagesCache) {
      return this.installedPackagesCache;
    }

    if (this.installedPackagesPromise) {
      return this.installedPackagesPromise;
    }

    this.installedPackagesPromise = this.loadInstalledPackages();

    try {
      const packages = await this.installedPackagesPromise;
      this.installedPackagesCache = packages;
      return packages;
    } finally {
      this.installedPackagesPromise = null;
    }
  }

  async getInstalledPackagesForScope(scope: WorkspacePackageScope): Promise<InstalledPackage[]> {
    const installedPackages = await this.getInstalledPackages();
    return this.filterPackagesByScope(installedPackages, scope);
  }

  async refreshInstalledPackages(scope?: WorkspacePackageScope): Promise<InstalledPackage[]> {
    if (!scope?.workspaceFolderPath && !scope?.manifestPath) {
      this.invalidateInstalledPackagesCache();
      return this.getInstalledPackages();
    }

    if (!this.installedPackagesCache) {
      await this.getInstalledPackages();
    }

    const scopedPackages = await this.loadInstalledPackagesForScope(scope);
    const remainingPackages = (this.installedPackagesCache || []).filter(
      (pkg) => !this.matchesScope(pkg, scope)
    );

    this.installedPackagesCache = [...remainingPackages, ...scopedPackages];
    this.installedPackagesPromise = null;
    return scopedPackages;
  }

  private async loadInstalledPackages(): Promise<InstalledPackage[]> {
    const [
      packageJsonFiles,
      composerManifestFiles,
      rubyManifestFiles,
      clojureManifestFiles,
      cargoManifestFiles,
      goManifestFiles,
      perlManifestFiles,
      pubManifestFiles,
      rManifestFiles,
      pomXmlFiles,
      gradleManifestFiles,
      dotnetManifestFiles,
    ] = await Promise.all([
      this.getPackageJsonFiles(),
      this.getComposerManifestFiles(),
      this.getRubyManifestFiles(),
      this.getClojureManifestFiles(),
      this.getCargoManifestFiles(),
      this.getGoManifestFiles(),
      this.getPerlManifestFiles(),
      this.getPubManifestFiles(),
      this.getRManifestFiles(),
      this.getPomXmlFiles(),
      this.getGradleManifestFiles(),
      this.getDotNetInstalledManifestFiles(),
    ]);
    return this.loadInstalledPackagesForUris(
      packageJsonFiles,
      composerManifestFiles,
      rubyManifestFiles,
      clojureManifestFiles,
      cargoManifestFiles,
      goManifestFiles,
      perlManifestFiles,
      pubManifestFiles,
      rManifestFiles,
      pomXmlFiles,
      gradleManifestFiles,
      dotnetManifestFiles
    );
  }

  private async loadInstalledPackagesForScope(scope: WorkspacePackageScope): Promise<InstalledPackage[]> {
    const [
      packageJsonFiles,
      composerManifestFiles,
      rubyManifestFiles,
      clojureManifestFiles,
      cargoManifestFiles,
      goManifestFiles,
      perlManifestFiles,
      pubManifestFiles,
      rManifestFiles,
      pomXmlFiles,
      gradleManifestFiles,
      dotnetManifestFiles,
    ] = await Promise.all([
      this.getPackageJsonFilesForScope(scope),
      this.getComposerManifestFilesForScope(scope),
      this.getRubyManifestFilesForScope(scope),
      this.getClojureManifestFilesForScope(scope),
      this.getCargoManifestFilesForScope(scope),
      this.getGoManifestFilesForScope(scope),
      this.getPerlManifestFilesForScope(scope),
      this.getPubManifestFilesForScope(scope),
      this.getRManifestFilesForScope(scope),
      this.getPomXmlFilesForScope(scope),
      this.getGradleManifestFilesForScope(scope),
      this.getDotNetManifestFilesForScope(scope),
    ]);
    return this.loadInstalledPackagesForUris(
      packageJsonFiles,
      composerManifestFiles,
      rubyManifestFiles,
      clojureManifestFiles,
      cargoManifestFiles,
      goManifestFiles,
      perlManifestFiles,
      pubManifestFiles,
      rManifestFiles,
      pomXmlFiles,
      gradleManifestFiles,
      dotnetManifestFiles
    );
  }

  private async loadInstalledPackagesForUris(
    packageJsonFiles: vscode.Uri[],
    composerManifestFiles: vscode.Uri[],
    rubyManifestFiles: vscode.Uri[],
    clojureManifestFiles: vscode.Uri[],
    cargoManifestFiles: vscode.Uri[],
    goManifestFiles: vscode.Uri[],
    perlManifestFiles: vscode.Uri[],
    pubManifestFiles: vscode.Uri[],
    rManifestFiles: vscode.Uri[],
    pomXmlFiles: vscode.Uri[],
    gradleManifestFiles: vscode.Uri[],
    dotnetManifestFiles: vscode.Uri[] = []
  ): Promise<InstalledPackage[]> {
    const installedPackages: InstalledPackage[] = [];
    type PackageJsonInfo = {
      uri: vscode.Uri;
      packageJson: Record<string, unknown>;
      name: string | undefined;
    };

    const rawPackageJsonInfos: Array<PackageJsonInfo | null> = await Promise.all(
      packageJsonFiles.map(async (uri) => {
        try {
          const content = await vscode.workspace.fs.readFile(uri);
          const packageJson = JSON.parse(content.toString()) as Record<string, unknown>;
          return {
            uri,
            packageJson,
            name: typeof packageJson.name === 'string' ? packageJson.name : undefined,
          };
        } catch {
          return null;
        }
      })
    );
    const packageJsonInfos: PackageJsonInfo[] = rawPackageJsonInfos.filter(
      (info): info is PackageJsonInfo => info !== null
    );
    const workspacePackageNameSet = new Set(
      packageJsonInfos.map((info) => info.name).filter((name): name is string => !!name)
    );
    const rootPackageName =
      packageJsonInfos.find((info) => info.uri.path === vscode.workspace.workspaceFolders?.[0]?.uri.path + '/package.json')
        ?.name || packageJsonInfos[0]?.name;
    for (const info of packageJsonInfos) {
      try {
        const { uri, packageJson } = info;

        const depTypes: DependencyType[] = [
          'dependencies',
          'devDependencies',
          'peerDependencies',
          'optionalDependencies',
        ];

        for (const depType of depTypes) {
          const deps = packageJson[depType];
          if (deps && typeof deps === 'object') {
            for (const [name, versionRange] of Object.entries(deps)) {
              const parsedSpec = parseDependencySpec(versionRange as string);
              const displayVersion = await this.getDisplayVersionForSpec(
                name,
                parsedSpec,
                uri,
                workspacePackageNameSet,
                rootPackageName
              );
              installedPackages.push({
                workspaceFolderPath: vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath,
                manifestName: info.name,
                name,
                currentVersion: displayVersion,
                resolvedVersion: parsedSpec.normalizedVersion,
                versionSpecifier: parsedSpec.raw,
                specKind: parsedSpec.kind,
                isRegistryResolvable: parsedSpec.isRegistryResolvable,
                type: depType,
                hasUpdate: false,
                packageJsonPath: uri.fsPath,
              });
            }
          }
        }
      } catch {
        // Skip invalid package.json files
      }
    }

    for (const uri of composerManifestFiles) {
      try {
        const [composerJsonContent, composerLockContent] = await Promise.all([
          vscode.workspace.fs.readFile(uri),
          this.readOptionalFile(vscode.Uri.joinPath(uri, '..', 'composer.lock')),
        ]);
        const composerJson = JSON.parse(composerJsonContent.toString()) as Record<string, unknown>;
        const composerLock = composerLockContent
          ? JSON.parse(composerLockContent.toString()) as Record<string, unknown>
          : null;
        installedPackages.push(...this.parseComposerManifest(composerJson, composerLock, uri.fsPath));
      } catch {
        // Skip invalid composer manifests
      }
    }

    for (const uri of rubyManifestFiles) {
      try {
        const [gemfileContent, gemfileLockContent] = await Promise.all([
          vscode.workspace.fs.readFile(uri),
          this.readOptionalFile(vscode.Uri.joinPath(uri, '..', 'Gemfile.lock')),
        ]);
        installedPackages.push(
          ...this.parseGemfileManifest(
            gemfileContent.toString(),
            gemfileLockContent ? gemfileLockContent.toString() : null,
            uri.fsPath
          )
        );
      } catch {
        // Skip invalid Gemfile manifests
      }
    }

    for (const uri of clojureManifestFiles) {
      try {
        const content = await vscode.workspace.fs.readFile(uri);
        const text = content.toString();
        const lower = uri.fsPath.toLowerCase();
        const clojurePackages = lower.endsWith('deps.edn')
          ? this.parseDepsEdnManifest(text, uri.fsPath)
          : this.parseLeiningenManifest(text, uri.fsPath);
        installedPackages.push(...clojurePackages);
      } catch {
        // Skip invalid Clojure manifests
      }
    }

    for (const uri of cargoManifestFiles) {
      try {
        const [cargoTomlContent, cargoLockContent] = await Promise.all([
          vscode.workspace.fs.readFile(uri),
          this.readOptionalFile(vscode.Uri.joinPath(uri, '..', 'Cargo.lock')),
        ]);
        installedPackages.push(
          ...this.parseCargoManifest(
            cargoTomlContent.toString(),
            cargoLockContent ? cargoLockContent.toString() : null,
            uri.fsPath
          )
        );
      } catch {
        // Skip invalid cargo manifests
      }
    }

    for (const uri of goManifestFiles) {
      try {
        const content = await vscode.workspace.fs.readFile(uri);
        installedPackages.push(...this.parseGoManifest(content.toString(), uri.fsPath));
      } catch {
        // Skip invalid go manifests
      }
    }

    for (const uri of perlManifestFiles) {
      try {
        const [cpanfileContent, snapshotContent] = await Promise.all([
          vscode.workspace.fs.readFile(uri),
          this.readOptionalFile(vscode.Uri.joinPath(uri, '..', 'cpanfile.snapshot')),
        ]);
        installedPackages.push(
          ...this.parsePerlManifest(
            cpanfileContent.toString(),
            snapshotContent ? snapshotContent.toString() : null,
            uri.fsPath
          )
        );
      } catch {
        // Skip invalid cpanfile manifests
      }
    }

    for (const uri of pubManifestFiles) {
      try {
        const [pubspecContent, lockContent] = await Promise.all([
          vscode.workspace.fs.readFile(uri),
          this.readOptionalFile(vscode.Uri.joinPath(uri, '..', 'pubspec.lock')),
        ]);
        installedPackages.push(
          ...this.parsePubspecManifest(
            pubspecContent.toString(),
            lockContent ? lockContent.toString() : null,
            uri.fsPath
          )
        );
      } catch {
        // Skip invalid pubspec manifests
      }
    }

    for (const uri of rManifestFiles) {
      try {
        const content = await vscode.workspace.fs.readFile(uri);
        installedPackages.push(...this.parseDescriptionManifest(content.toString(), uri.fsPath));
      } catch {
        // Skip invalid DESCRIPTION files
      }
    }

    // Get Maven packages
    for (const uri of pomXmlFiles) {
      try {
        const content = await vscode.workspace.fs.readFile(uri);
        const pomXml = content.toString();
        const mavenPackages = this.parsePomXml(pomXml, uri.fsPath);
        installedPackages.push(...mavenPackages);
      } catch {
        // Skip invalid pom.xml files
      }
    }

    for (const uri of gradleManifestFiles) {
      try {
        const content = await vscode.workspace.fs.readFile(uri);
        installedPackages.push(...this.parseGradleManifest(content.toString(), uri.fsPath));
      } catch {
        // Skip invalid Gradle manifests
      }
    }

    // Get .NET/NuGet packages (CPM, Paket, packages.config, PackageReference, Cake)
    for (const uri of dotnetManifestFiles) {
      try {
        const content = await vscode.workspace.fs.readFile(uri);
        const text = content.toString();
        const pathLower = uri.fsPath.toLowerCase();
        let dotnetPackages: InstalledPackage[] = [];
        if (pathLower.endsWith('directory.packages.props')) {
          dotnetPackages = this.parseDirectoryPackagesProps(text, uri.fsPath);
        } else if (pathLower.endsWith('paket.dependencies')) {
          dotnetPackages = this.parsePaketDependencies(text, uri.fsPath);
        } else if (pathLower.endsWith('packages.config')) {
          dotnetPackages = this.parsePackagesConfig(text, uri.fsPath);
        } else if (
          pathLower.endsWith('.csproj') ||
          pathLower.endsWith('.vbproj') ||
          pathLower.endsWith('.fsproj')
        ) {
          dotnetPackages = this.parseProjectPackageReferences(text, uri.fsPath);
        } else if (pathLower.endsWith('.cake')) {
          dotnetPackages = this.parseCakePackages(text, uri.fsPath);
        }
        installedPackages.push(...dotnetPackages);
      } catch {
        // Skip invalid manifest files
      }
    }

    return installedPackages;
  }

  private async getDotNetManifestFilesForScope(scope: WorkspacePackageScope): Promise<vscode.Uri[]> {
    return this.manifestDiscovery.getDotNetManifestFilesForScope(scope);
  }

  private async getPackageJsonFilesForScope(scope: WorkspacePackageScope): Promise<vscode.Uri[]> {
    return this.manifestDiscovery.getPackageJsonFilesForScope(scope);
  }

  private async getComposerManifestFilesForScope(scope: WorkspacePackageScope): Promise<vscode.Uri[]> {
    return this.manifestDiscovery.getComposerManifestFilesForScope(scope);
  }

  private async getRubyManifestFilesForScope(scope: WorkspacePackageScope): Promise<vscode.Uri[]> {
    return this.manifestDiscovery.getRubyManifestFilesForScope(scope);
  }

  private async getClojureManifestFilesForScope(scope: WorkspacePackageScope): Promise<vscode.Uri[]> {
    return this.manifestDiscovery.getClojureManifestFilesForScope(scope);
  }

  private async getCargoManifestFilesForScope(scope: WorkspacePackageScope): Promise<vscode.Uri[]> {
    return this.manifestDiscovery.getCargoManifestFilesForScope(scope);
  }

  private async getGoManifestFilesForScope(scope: WorkspacePackageScope): Promise<vscode.Uri[]> {
    return this.manifestDiscovery.getGoManifestFilesForScope(scope);
  }

  private async getPerlManifestFilesForScope(scope: WorkspacePackageScope): Promise<vscode.Uri[]> {
    return this.manifestDiscovery.getPerlManifestFilesForScope(scope);
  }

  private async getPubManifestFilesForScope(scope: WorkspacePackageScope): Promise<vscode.Uri[]> {
    return this.manifestDiscovery.getPubManifestFilesForScope(scope);
  }

  private async getRManifestFilesForScope(scope: WorkspacePackageScope): Promise<vscode.Uri[]> {
    return this.manifestDiscovery.getRManifestFilesForScope(scope);
  }

  private async getPomXmlFilesForScope(scope: WorkspacePackageScope): Promise<vscode.Uri[]> {
    return this.manifestDiscovery.getPomXmlFilesForScope(scope);
  }

  private async getGradleManifestFilesForScope(scope: WorkspacePackageScope): Promise<vscode.Uri[]> {
    return this.manifestDiscovery.getGradleManifestFilesForScope(scope);
  }

  /**
   * Parse pom.xml file and extract dependencies
   */
  private parsePomXml(xml: string, pomPath: string): InstalledPackage[] {
    return parsePomXml(xml, pomPath);
  }

  /**
   * Parse Directory.Packages.props and extract PackageVersion entries
   */
  private parseDirectoryPackagesProps(xml: string, manifestPath: string): InstalledPackage[] {
    return parseDirectoryPackagesProps(xml, manifestPath);
  }

  /**
   * Parse paket.dependencies and extract nuget lines
   */
  private parsePaketDependencies(text: string, manifestPath: string): InstalledPackage[] {
    return parsePaketDependencies(text, manifestPath);
  }

  private parseGradleManifest(text: string, manifestPath: string): InstalledPackage[] {
    return parseGradleManifest(text, manifestPath);
  }

  /**
   * Parse packages.config and extract package entries.
   */
  private parsePackagesConfig(xml: string, manifestPath: string): InstalledPackage[] {
    return parsePackagesConfig(xml, manifestPath);
  }

  /**
   * Parse PackageReference entries from project files.
   * Only versioned entries are update targets; versionless references are managed elsewhere.
   */
  private parseProjectPackageReferences(xml: string, manifestPath: string): InstalledPackage[] {
    return parseProjectPackageReferences(xml, manifestPath);
  }

  /**
   * Parse .cake file and extract #addin / #tool nuget refs with version
   */
  private parseCakePackages(text: string, manifestPath: string): InstalledPackage[] {
    return parseCakePackages(text, manifestPath);
  }

  private parseComposerManifest(
    composerJson: Record<string, unknown>,
    composerLock: Record<string, unknown> | null,
    manifestPath: string
  ): InstalledPackage[] {
    return parseComposerManifest(composerJson, composerLock, manifestPath);
  }

  private parseGemfileManifest(
    gemfileContent: string,
    gemfileLockContent: string | null,
    manifestPath: string
  ): InstalledPackage[] {
    return parseGemfileManifest(gemfileContent, gemfileLockContent, manifestPath);
  }

  private parseDepsEdnManifest(content: string, manifestPath: string): InstalledPackage[] {
    return parseDepsEdnManifest(content, manifestPath);
  }

  private parseLeiningenManifest(content: string, manifestPath: string): InstalledPackage[] {
    return parseLeiningenManifest(content, manifestPath);
  }

  private parseCargoManifest(
    cargoTomlContent: string,
    cargoLockContent: string | null,
    manifestPath: string
  ): InstalledPackage[] {
    return parseCargoManifest(cargoTomlContent, cargoLockContent, manifestPath);
  }

  private parseGoManifest(content: string, manifestPath: string): InstalledPackage[] {
    return parseGoManifest(content, manifestPath);
  }

  private parsePerlManifest(
    cpanfileContent: string,
    snapshotContent: string | null,
    manifestPath: string
  ): InstalledPackage[] {
    return parsePerlManifest(cpanfileContent, snapshotContent, manifestPath);
  }

  private parsePubspecManifest(
    pubspecContent: string,
    lockContent: string | null,
    manifestPath: string
  ): InstalledPackage[] {
    return parsePubspecManifest(pubspecContent, lockContent, manifestPath);
  }

  private parseDescriptionManifest(content: string, manifestPath: string): InstalledPackage[] {
    return parseDescriptionManifest(content, manifestPath);
  }

  /**
   * Get packages with available updates
   */
  async getUpdatablePackages(scope?: WorkspacePackageScope): Promise<InstalledPackage[]> {
    const installedPackages = scope
      ? await this.getInstalledPackagesForScope(scope)
      : await this.getInstalledPackages();
    const services = getServices();
    const resolvablePackages = installedPackages.filter(
      (pkg) => pkg.isRegistryResolvable !== false && !!pkg.resolvedVersion
    );

    // Get unique package names
    const uniqueNames = [...new Set(resolvablePackages.map((p) => p.name))];

    // Fetch latest versions in batches
    const latestVersions = new Map<string, string>();
    const concurrency = 8;

    for (let index = 0; index < uniqueNames.length; index += concurrency) {
      const batch = uniqueNames.slice(index, index + concurrency);
      const batchResults = await Promise.all(
        batch.map(async (name) => {
          try {
            const latestVersion = await services.package.getLatestVersion(name);
            return latestVersion ? [name, latestVersion] as const : null;
          } catch {
            return null;
          }
        })
      );

      for (const result of batchResults) {
        if (result) {
          latestVersions.set(result[0], result[1]);
        }
      }
    }

    // Update packages with latest version info
    return resolvablePackages
      .map((pkg) => {
        const latestVersion = latestVersions.get(pkg.name);
        if (latestVersion && pkg.resolvedVersion) {
          const updateType = getUpdateType(pkg.resolvedVersion, latestVersion);
          return {
            ...pkg,
            latestVersion,
            hasUpdate: updateType !== null,
            updateType: updateType || undefined,
          };
        }
        return pkg;
      })
      .filter((pkg) => pkg.hasUpdate);
  }

  async getWorkspaceProjectGraph(): Promise<WorkspaceProjectGraph> {
    const packageJsonFiles = await this.getPackageJsonFiles();
    return buildWorkspaceProjectGraph(
      packageJsonFiles,
      (uri) => this.getPackageJson(uri),
      (uri) => this.readJsonFile(uri),
      (uri) => this.fileExists(uri)
    );
  }

  async alignWorkspaceDependencyVersions(packageName: string, targetVersion: string): Promise<number> {
    const packageJsonFiles = await this.getPackageJsonFiles();
    const updatedManifests = await alignNpmWorkspaceDependencyVersions(
      packageJsonFiles,
      (uri) => this.getPackageJson(uri),
      packageName,
      targetVersion
    );

    if (updatedManifests > 0) {
      this.invalidateInstalledPackagesCache();
    }

    return updatedManifests;
  }

  private filterPackagesByScope(
    packages: InstalledPackage[],
    scope?: WorkspacePackageScope
  ): InstalledPackage[] {
    if (!scope?.workspaceFolderPath && !scope?.manifestPath) {
      return packages;
    }

    return packages.filter((pkg) => this.matchesScope(pkg, scope));
  }

  private matchesScope(pkg: InstalledPackage, scope?: WorkspacePackageScope): boolean {
    if (!scope) {
      return true;
    }

    if (scope.manifestPath) {
      return pkg.packageJsonPath === scope.manifestPath;
    }

    if (scope.workspaceFolderPath) {
      return pkg.workspaceFolderPath === scope.workspaceFolderPath;
    }

    return true;
  }

  private getScopeForUri(uri: vscode.Uri): WorkspacePackageScope | undefined {
    return resolveWorkspacePackageScope(uri);
  }

  private getFallbackManifestName(manifestPath: string): string {
    return getFallbackManifestName(manifestPath);
  }

  /**
   * Get package.json content
   */
  async getPackageJson(uri: vscode.Uri): Promise<Record<string, unknown> | null> {
    try {
      const content = await vscode.workspace.fs.readFile(uri);
      return JSON.parse(content.toString());
    } catch {
      return null;
    }
  }

  /**
   * Update package.json with new dependency
   */
  async updatePackageJson(
    uri: vscode.Uri,
    packageName: string,
    version: string,
    depType: DependencyType
  ): Promise<boolean> {
    const updated = await updatePackageJsonDependency(uri, packageName, version, depType);
    if (updated) {
      this.invalidateInstalledPackagesCache();
    }
    return updated;
  }

  /**
   * Update Maven dependency in pom.xml
   */
  async updateMavenDependency(
    pomPath: string,
    groupId: string,
    artifactId: string,
    newVersion: string
  ): Promise<boolean> {
    return this.applyTextManifestUpdate(pomPath, (xml) =>
      updateMavenDependencyText(xml, groupId, artifactId, newVersion)
    );
  }

  /**
   * Update Gradle dependency in build.gradle or build.gradle.kts
   */
  async updateGradleDependency(
    gradlePath: string,
    groupId: string,
    artifactId: string,
    newVersion: string
  ): Promise<boolean> {
    return this.applyTextManifestUpdate(gradlePath, (text) =>
      updateGradleDependencyText(text, groupId, artifactId, newVersion)
    );
  }

  /**
   * Update CPM package version in Directory.Packages.props
   */
  async updateCpmPackage(propsPath: string, packageId: string, newVersion: string): Promise<boolean> {
    return this.applyTextManifestUpdate(propsPath, (xml) => updateCpmPackageText(xml, packageId, newVersion));
  }

  async removeCpmPackage(propsPath: string, packageId: string): Promise<boolean> {
    return this.applyTextManifestUpdate(propsPath, (xml) => removeCpmPackageText(xml, packageId));
  }

  /**
   * Update Paket dependency version in paket.dependencies
   */
  async updatePaketDependency(depsPath: string, packageId: string, newVersion: string): Promise<boolean> {
    return this.applyTextManifestUpdate(depsPath, (text) => updatePaketDependencyText(text, packageId, newVersion));
  }

  async removePaketDependency(depsPath: string, packageId: string): Promise<boolean> {
    return this.applyTextManifestUpdate(depsPath, (text) => removePaketDependencyText(text, packageId));
  }

  async updatePackagesConfigPackage(configPath: string, packageId: string, newVersion: string): Promise<boolean> {
    return this.applyTextManifestUpdate(configPath, (xml) => updatePackagesConfigText(xml, packageId, newVersion));
  }

  async removePackagesConfigPackage(configPath: string, packageId: string): Promise<boolean> {
    return this.applyTextManifestUpdate(configPath, (xml) => removePackagesConfigText(xml, packageId));
  }

  async updateProjectPackageReference(projectPath: string, packageId: string, newVersion: string): Promise<boolean> {
    return this.applyTextManifestUpdate(projectPath, (xml) =>
      updateProjectPackageReferenceText(xml, packageId, newVersion)
    );
  }

  async removeProjectPackageReference(projectPath: string, packageId: string): Promise<boolean> {
    return this.applyTextManifestUpdate(projectPath, (xml) => removeProjectPackageReferenceText(xml, packageId));
  }

  /**
   * Update Cake addin/tool version in .cake file (#addin nuget:?package=Id&version=x or #tool ...)
   */
  async updateCakePackage(
    cakePath: string,
    packageId: string,
    newVersion: string,
    kind: 'addin' | 'tool'
  ): Promise<boolean> {
    return this.applyTextManifestUpdate(cakePath, (text) => updateCakePackageText(text, packageId, newVersion, kind));
  }

  async updateDepsEdnDependency(depsPath: string, packageId: string, newVersion: string): Promise<boolean> {
    return this.applyTextManifestUpdate(depsPath, (text) => updateDepsEdnDependencyText(text, packageId, newVersion));
  }

  async removeCakePackage(cakePath: string, packageId: string): Promise<boolean> {
    return this.applyTextManifestUpdate(cakePath, (text) => removeCakePackageText(text, packageId));
  }

  async updateLeiningenDependency(projectPath: string, packageId: string, newVersion: string): Promise<boolean> {
    return this.applyTextManifestUpdate(projectPath, (text) =>
      updateLeiningenDependencyText(text, packageId, newVersion)
    );
  }

  async updateCargoDependency(cargoPath: string, packageId: string, newVersion: string): Promise<boolean> {
    return this.applyTextManifestUpdate(cargoPath, (text) => updateCargoDependencyText(text, packageId, newVersion));
  }

  async updateGoDependency(goModPath: string, packageId: string, newVersion: string): Promise<boolean> {
    return this.applyTextManifestUpdate(goModPath, (text) => updateGoDependencyText(text, packageId, newVersion));
  }

  async updatePerlDependency(cpanfilePath: string, packageId: string, newVersion: string): Promise<boolean> {
    return this.applyTextManifestUpdate(cpanfilePath, (text) => updatePerlDependencyText(text, packageId, newVersion));
  }

  async removePerlDependency(cpanfilePath: string, packageId: string): Promise<boolean> {
    return this.applyTextManifestUpdate(cpanfilePath, (text) => removePerlDependencyText(text, packageId));
  }

  async updatePubspecDependency(pubspecPath: string, packageId: string, newVersion: string): Promise<boolean> {
    return this.applyTextManifestUpdate(pubspecPath, (text) => updatePubspecDependencyText(text, packageId, newVersion));
  }

  async updateRDependency(descriptionPath: string, packageId: string, newVersion: string): Promise<boolean> {
    return this.applyTextManifestUpdate(descriptionPath, (text) => updateRDependencyText(text, packageId, newVersion));
  }

  async removeRDependency(descriptionPath: string, packageId: string): Promise<boolean> {
    return this.applyTextManifestUpdate(descriptionPath, (text) => removeRDependencyText(text, packageId));
  }

  private async applyTextManifestUpdate(
    manifestPath: string,
    updateText: (currentText: string) => string
  ): Promise<boolean> {
    try {
      const uri = vscode.Uri.file(manifestPath);
      const content = await vscode.workspace.fs.readFile(uri);
      const currentText = content.toString();
      const updatedText = updateText(currentText);

      if (updatedText === currentText) {
        return false;
      }

      await vscode.workspace.fs.writeFile(uri, Buffer.from(updatedText));
      this.invalidateInstalledPackagesCache();
      return true;
    } catch {
      return false;
    }
  }

  private invalidateInstalledPackagesCache(): void {
    this.installedPackagesCache = null;
    this.installedPackagesPromise = null;
  }

  private async getDisplayVersionForSpec(
    dependencyName: string,
    parsedSpec: ParsedDependencySpec,
    manifestUri: vscode.Uri,
    workspacePackageNameSet: Set<string>,
    rootPackageName?: string
  ): Promise<string> {
    if (parsedSpec.kind === 'semver' || parsedSpec.kind === 'tag') {
      return parsedSpec.displayText;
    }

    const workspaceLocalByName = workspacePackageNameSet.has(dependencyName);
    const workspaceSelfByName = !!rootPackageName && dependencyName === rootPackageName;

    if (parsedSpec.kind === 'workspace') {
      return formatDependencySpecDisplay(parsedSpec, {
        workspaceLocal: workspaceLocalByName,
        workspaceSelf: workspaceSelfByName,
      });
    }

    if (parsedSpec.kind === 'file' || parsedSpec.kind === 'path') {
      const resolvedPackageName = await this.resolveLocalDependencyPackageName(manifestUri, parsedSpec.raw);
      const workspaceLocal = resolvedPackageName === dependencyName || workspaceLocalByName;
      const workspaceSelf =
        !!rootPackageName && resolvedPackageName === dependencyName && dependencyName === rootPackageName;

      return formatDependencySpecDisplay(parsedSpec, {
        workspaceLocal,
        workspaceSelf,
      });
    }

    return formatDependencySpecDisplay(parsedSpec);
  }

  private async resolveLocalDependencyPackageName(
    manifestUri: vscode.Uri,
    rawSpec: string
  ): Promise<string | null> {
    try {
      const specPath = rawSpec.replace(/^(file:|link:)/, '');
      const manifestDir = vscode.Uri.joinPath(manifestUri, '..');
      const targetDir = vscode.Uri.joinPath(manifestDir, specPath);
      const targetPackageJson = vscode.Uri.joinPath(targetDir, 'package.json');
      const content = await vscode.workspace.fs.readFile(targetPackageJson);
      const packageJson = JSON.parse(content.toString()) as Record<string, unknown>;
      return typeof packageJson.name === 'string' ? packageJson.name : null;
    } catch {
      return null;
    }
  }

  private async readOptionalFile(uri: vscode.Uri): Promise<Uint8Array | null> {
    try {
      return await vscode.workspace.fs.readFile(uri);
    } catch {
      return null;
    }
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.fileWatcher?.dispose();
    this._onDidChangePackages.dispose();
  }
}
