import * as vscode from 'vscode';
import type { InstalledPackage, DependencyType, WorkspacePackageScope, NuGetManagementStyle } from '../types/package';
import { getServices } from './index';
import {
  formatDependencySpecDisplay,
  getUpdateType,
  parseDependencySpec,
  type ParsedDependencySpec,
} from '../utils/version-utils';
import { parseCakeDirectives } from '../utils/cake-utils';
import type {
  MonorepoTool,
  WorkspaceAlignmentIssue,
  WorkspaceProjectDependency,
  WorkspaceProjectGraph,
  WorkspaceProjectNode,
} from '../types/workspace';

/**
 * Service for workspace package management
 */
export class WorkspaceService {
  private _onDidChangePackages = new vscode.EventEmitter<WorkspacePackageScope | undefined>();
  readonly onDidChangePackages = this._onDidChangePackages.event;

  private fileWatcher: vscode.FileSystemWatcher | null = null;
  private installedPackagesCache: InstalledPackage[] | null = null;
  private installedPackagesPromise: Promise<InstalledPackage[]> | null = null;

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
      this._onDidChangePackages.fire(scope);
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

    return disposables;
  }

  /**
   * Get all package.json files in workspace
   */
  async getPackageJsonFiles(): Promise<vscode.Uri[]> {
    const discovered = await this.discoverWorkspacePackageJsonFiles();
    if (discovered.length > 0) {
      return discovered;
    }
    return vscode.workspace.findFiles('**/package.json', '**/node_modules/**');
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
    return vscode.workspace.findFiles('**/pom.xml', '**/target/**');
  }

  async getGradleManifestFiles(): Promise<vscode.Uri[]> {
    return vscode.workspace.findFiles('**/{build.gradle,build.gradle.kts}', '**/{build,target,node_modules,.gradle}/**');
  }

  async getComposerManifestFiles(): Promise<vscode.Uri[]> {
    return vscode.workspace.findFiles('**/composer.json', '**/{vendor,node_modules}/**');
  }

  async getRubyManifestFiles(): Promise<vscode.Uri[]> {
    return vscode.workspace.findFiles('**/Gemfile', '**/{vendor,node_modules}/**');
  }

  async getClojureManifestFiles(): Promise<vscode.Uri[]> {
    return vscode.workspace.findFiles('**/{deps.edn,project.clj}', '**/{node_modules,target,.cpcache}/**');
  }

  async getCargoManifestFiles(): Promise<vscode.Uri[]> {
    return vscode.workspace.findFiles('**/Cargo.toml', '**/{target,node_modules,vendor}/**');
  }

  async getGoManifestFiles(): Promise<vscode.Uri[]> {
    return vscode.workspace.findFiles('**/go.mod', '**/{vendor,node_modules}/**');
  }

  async getPerlManifestFiles(): Promise<vscode.Uri[]> {
    return vscode.workspace.findFiles('**/cpanfile', '**/{local,vendor,node_modules}/**');
  }

  async getPubManifestFiles(): Promise<vscode.Uri[]> {
    return vscode.workspace.findFiles('**/pubspec.yaml', '**/{build,.dart_tool,node_modules}/**');
  }

  async getRManifestFiles(): Promise<vscode.Uri[]> {
    return vscode.workspace.findFiles('**/DESCRIPTION', '**/{renv,packrat,node_modules}/**');
  }

  /**
   * Get .NET/NuGet manifest files that list packages (for Installed / Updates views).
   * Returns Directory.Packages.props, paket.dependencies, packages.config,
   * PackageReference project files, and *.cake.
   */
  async getDotNetInstalledManifestFiles(): Promise<vscode.Uri[]> {
    const exclude = '**/node_modules/**,**/bin/**,**/obj/**,**/out/**';
    const [cpmFiles, paketFiles, packagesConfigFiles, csprojFiles, vbprojFiles, fsprojFiles, cakeFiles] = await Promise.all([
      vscode.workspace.findFiles('**/Directory.Packages.props', exclude, 5),
      vscode.workspace.findFiles('**/paket.dependencies', exclude, 10),
      vscode.workspace.findFiles('**/packages.config', exclude, 20),
      vscode.workspace.findFiles('**/*.csproj', exclude, 20),
      vscode.workspace.findFiles('**/*.vbproj', exclude, 10),
      vscode.workspace.findFiles('**/*.fsproj', exclude, 10),
      vscode.workspace.findFiles('**/*.cake', exclude, 20),
    ]);
    return [...cpmFiles, ...paketFiles, ...packagesConfigFiles, ...csprojFiles, ...vbprojFiles, ...fsprojFiles, ...cakeFiles];
  }

  /**
   * Get .NET/NuGet manifest files for install target.
   * Order: Directory.Packages.props (CPM), paket.dependencies (Paket), packages.config (Legacy), then .csproj/.vbproj/.fsproj (PackageReference).
   */
  async getDotNetManifestFiles(): Promise<vscode.Uri[]> {
    const exclude = '**/node_modules/**,**/bin/**,**/obj/**,**/out/**';
    const [cpmFiles, paketFiles, packagesConfigFiles, csprojFiles] = await Promise.all([
      vscode.workspace.findFiles('**/Directory.Packages.props', exclude, 5),
      vscode.workspace.findFiles('**/paket.dependencies', exclude, 10),
      vscode.workspace.findFiles('**/packages.config', exclude, 20),
      vscode.workspace.findFiles('**/*.csproj', exclude, 20),
    ]);
    const vbproj = await vscode.workspace.findFiles('**/*.vbproj', exclude, 10);
    const fsproj = await vscode.workspace.findFiles('**/*.fsproj', exclude, 10);
    const all = [...cpmFiles, ...paketFiles, ...packagesConfigFiles, ...csprojFiles, ...vbproj, ...fsproj];
    return [...new Map(all.map((u) => [u.fsPath, u])).values()];
  }

  /**
   * Check if workspace has Directory.Packages.props (NuGet CPM).
   */
  async hasDirectoryPackagesProps(): Promise<boolean> {
    const files = await vscode.workspace.findFiles('**/Directory.Packages.props', '**/node_modules/**', 1);
    return files.length > 0;
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
    const packageJsonFiles = await this.getPackageJsonFiles();
    const composerManifestFiles = await this.getComposerManifestFiles();
    const rubyManifestFiles = await this.getRubyManifestFiles();
    const clojureManifestFiles = await this.getClojureManifestFiles();
    const cargoManifestFiles = await this.getCargoManifestFiles();
    const goManifestFiles = await this.getGoManifestFiles();
    const perlManifestFiles = await this.getPerlManifestFiles();
    const pubManifestFiles = await this.getPubManifestFiles();
    const rManifestFiles = await this.getRManifestFiles();
    const pomXmlFiles = await this.getPomXmlFiles();
    const gradleManifestFiles = await this.getGradleManifestFiles();
    const dotnetManifestFiles = await this.getDotNetInstalledManifestFiles();
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
    const packageJsonFiles = await this.getPackageJsonFilesForScope(scope);
    const composerManifestFiles = await this.getComposerManifestFilesForScope(scope);
    const rubyManifestFiles = await this.getRubyManifestFilesForScope(scope);
    const clojureManifestFiles = await this.getClojureManifestFilesForScope(scope);
    const cargoManifestFiles = await this.getCargoManifestFilesForScope(scope);
    const goManifestFiles = await this.getGoManifestFilesForScope(scope);
    const perlManifestFiles = await this.getPerlManifestFilesForScope(scope);
    const pubManifestFiles = await this.getPubManifestFilesForScope(scope);
    const rManifestFiles = await this.getRManifestFilesForScope(scope);
    const pomXmlFiles = await this.getPomXmlFilesForScope(scope);
    const gradleManifestFiles = await this.getGradleManifestFilesForScope(scope);
    const dotnetManifestFiles = await this.getDotNetManifestFilesForScope(scope);
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
    if (scope.manifestPath) {
      const p = scope.manifestPath.toLowerCase();
      if (
        p.endsWith('directory.packages.props') ||
        p.endsWith('paket.dependencies') ||
        p.endsWith('packages.config') ||
        p.endsWith('.csproj') ||
        p.endsWith('.vbproj') ||
        p.endsWith('.fsproj') ||
        p.endsWith('.cake')
      ) {
        return [vscode.Uri.file(scope.manifestPath)];
      }
      return [];
    }
    const all = await this.getDotNetInstalledManifestFiles();
    if (!scope.workspaceFolderPath) {
      return all;
    }
    return all.filter(
      (uri) => vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath === scope.workspaceFolderPath
    );
  }

  private async getPackageJsonFilesForScope(scope: WorkspacePackageScope): Promise<vscode.Uri[]> {
    if (scope.manifestPath) {
      return scope.manifestPath.endsWith('package.json') ? [vscode.Uri.file(scope.manifestPath)] : [];
    }

    const packageJsonFiles = await this.getPackageJsonFiles();
    if (!scope.workspaceFolderPath) {
      return packageJsonFiles;
    }

    return packageJsonFiles.filter(
      (uri) => vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath === scope.workspaceFolderPath
    );
  }

  private async getComposerManifestFilesForScope(scope: WorkspacePackageScope): Promise<vscode.Uri[]> {
    if (scope.manifestPath) {
      const lower = scope.manifestPath.toLowerCase();
      if (lower.endsWith('composer.json')) {
        return [vscode.Uri.file(scope.manifestPath)];
      }
      if (lower.endsWith('composer.lock')) {
        return [vscode.Uri.file(scope.manifestPath.replace(/composer\.lock$/i, 'composer.json'))];
      }
      return [];
    }

    const composerManifestFiles = await this.getComposerManifestFiles();
    if (!scope.workspaceFolderPath) {
      return composerManifestFiles;
    }

    return composerManifestFiles.filter(
      (uri) => vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath === scope.workspaceFolderPath
    );
  }

  private async getRubyManifestFilesForScope(scope: WorkspacePackageScope): Promise<vscode.Uri[]> {
    if (scope.manifestPath) {
      const lower = scope.manifestPath.toLowerCase();
      if (lower.endsWith('gemfile')) {
        return [vscode.Uri.file(scope.manifestPath)];
      }
      if (lower.endsWith('gemfile.lock')) {
        return [vscode.Uri.file(scope.manifestPath.replace(/gemfile\.lock$/i, 'Gemfile'))];
      }
      return [];
    }

    const rubyManifestFiles = await this.getRubyManifestFiles();
    if (!scope.workspaceFolderPath) {
      return rubyManifestFiles;
    }

    return rubyManifestFiles.filter(
      (uri) => vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath === scope.workspaceFolderPath
    );
  }

  private async getClojureManifestFilesForScope(scope: WorkspacePackageScope): Promise<vscode.Uri[]> {
    if (scope.manifestPath) {
      const lower = scope.manifestPath.toLowerCase();
      if (lower.endsWith('deps.edn') || lower.endsWith('project.clj')) {
        return [vscode.Uri.file(scope.manifestPath)];
      }
      return [];
    }

    const clojureManifestFiles = await this.getClojureManifestFiles();
    if (!scope.workspaceFolderPath) {
      return clojureManifestFiles;
    }

    return clojureManifestFiles.filter(
      (uri) => vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath === scope.workspaceFolderPath
    );
  }

  private async getCargoManifestFilesForScope(scope: WorkspacePackageScope): Promise<vscode.Uri[]> {
    if (scope.manifestPath) {
      const lower = scope.manifestPath.toLowerCase();
      if (lower.endsWith('cargo.toml')) {
        return [vscode.Uri.file(scope.manifestPath)];
      }
      if (lower.endsWith('cargo.lock')) {
        return [vscode.Uri.file(scope.manifestPath.replace(/cargo\.lock$/i, 'Cargo.toml'))];
      }
      return [];
    }

    const cargoManifestFiles = await this.getCargoManifestFiles();
    if (!scope.workspaceFolderPath) {
      return cargoManifestFiles;
    }

    return cargoManifestFiles.filter(
      (uri) => vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath === scope.workspaceFolderPath
    );
  }

  private async getGoManifestFilesForScope(scope: WorkspacePackageScope): Promise<vscode.Uri[]> {
    if (scope.manifestPath) {
      return scope.manifestPath.toLowerCase().endsWith('go.mod') ? [vscode.Uri.file(scope.manifestPath)] : [];
    }

    const goManifestFiles = await this.getGoManifestFiles();
    if (!scope.workspaceFolderPath) {
      return goManifestFiles;
    }

    return goManifestFiles.filter(
      (uri) => vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath === scope.workspaceFolderPath
    );
  }

  private async getPerlManifestFilesForScope(scope: WorkspacePackageScope): Promise<vscode.Uri[]> {
    if (scope.manifestPath) {
      const lower = scope.manifestPath.toLowerCase();
      if (lower.endsWith('cpanfile')) {
        return [vscode.Uri.file(scope.manifestPath)];
      }
      if (lower.endsWith('cpanfile.snapshot')) {
        return [vscode.Uri.file(scope.manifestPath.replace(/cpanfile\.snapshot$/i, 'cpanfile'))];
      }
      return [];
    }

    const manifestFiles = await this.getPerlManifestFiles();
    if (!scope.workspaceFolderPath) {
      return manifestFiles;
    }

    return manifestFiles.filter(
      (uri) => vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath === scope.workspaceFolderPath
    );
  }

  private async getPubManifestFilesForScope(scope: WorkspacePackageScope): Promise<vscode.Uri[]> {
    if (scope.manifestPath) {
      const lower = scope.manifestPath.toLowerCase();
      if (lower.endsWith('pubspec.yaml')) {
        return [vscode.Uri.file(scope.manifestPath)];
      }
      if (lower.endsWith('pubspec.lock')) {
        return [vscode.Uri.file(scope.manifestPath.replace(/pubspec\.lock$/i, 'pubspec.yaml'))];
      }
      return [];
    }

    const manifestFiles = await this.getPubManifestFiles();
    if (!scope.workspaceFolderPath) {
      return manifestFiles;
    }

    return manifestFiles.filter(
      (uri) => vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath === scope.workspaceFolderPath
    );
  }

  private async getRManifestFilesForScope(scope: WorkspacePackageScope): Promise<vscode.Uri[]> {
    if (scope.manifestPath) {
      return scope.manifestPath.toLowerCase().endsWith('description') ? [vscode.Uri.file(scope.manifestPath)] : [];
    }

    const manifestFiles = await this.getRManifestFiles();
    if (!scope.workspaceFolderPath) {
      return manifestFiles;
    }

    return manifestFiles.filter(
      (uri) => vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath === scope.workspaceFolderPath
    );
  }

  private async getPomXmlFilesForScope(scope: WorkspacePackageScope): Promise<vscode.Uri[]> {
    if (scope.manifestPath) {
      return scope.manifestPath.endsWith('pom.xml') ? [vscode.Uri.file(scope.manifestPath)] : [];
    }

    const pomXmlFiles = await this.getPomXmlFiles();
    if (!scope.workspaceFolderPath) {
      return pomXmlFiles;
    }

    return pomXmlFiles.filter(
      (uri) => vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath === scope.workspaceFolderPath
    );
  }

  private async getGradleManifestFilesForScope(scope: WorkspacePackageScope): Promise<vscode.Uri[]> {
    if (scope.manifestPath) {
      const lower = scope.manifestPath.toLowerCase();
      if (lower.endsWith('build.gradle') || lower.endsWith('build.gradle.kts')) {
        return [vscode.Uri.file(scope.manifestPath)];
      }
      return [];
    }

    const gradleManifestFiles = await this.getGradleManifestFiles();
    if (!scope.workspaceFolderPath) {
      return gradleManifestFiles;
    }

    return gradleManifestFiles.filter(
      (uri) => vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath === scope.workspaceFolderPath
    );
  }

  /**
   * Parse pom.xml file and extract dependencies
   */
  private parsePomXml(xml: string, pomPath: string): InstalledPackage[] {
    const packages: InstalledPackage[] = [];

    try {
      // Simple XML parsing for dependencies
      const extractTag = (tag: string, content: string): string | undefined => {
        const regex = new RegExp(`<${tag}>(.*?)</${tag}>`, 's');
        const match = content.match(regex);
        return match ? match[1].trim() : undefined;
      };

      const properties: Record<string, string> = {};
      const propertiesMatch = xml.match(/<properties>(.*?)<\/properties>/s);
      if (propertiesMatch) {
        const propsContent = propertiesMatch[1];
        const propRegex = /<([\w.-]+)>(.*?)<\/\1>/gs;
        let propMatch: RegExpExecArray | null;
        while ((propMatch = propRegex.exec(propsContent)) !== null) {
          properties[propMatch[1]] = propMatch[2].trim();
        }
      }

      const resolveProperty = (value?: string): string | undefined => {
        if (!value) {
          return value;
        }
        return value.replace(/\$\{([\w.-]+)\}/g, (match, propName) => properties[propName] || match);
      };

      const extractDependencies = (xmlContent: string): Array<{
        groupId?: string;
        artifactId?: string;
        version?: string;
        scope?: string;
        optional?: string;
      }> => {
        const deps: Array<{
          groupId?: string;
          artifactId?: string;
          version?: string;
          scope?: string;
          optional?: string;
        }> = [];

        // Find dependencies section
        const depsMatch = xmlContent.match(/<dependencies>(.*?)<\/dependencies>/s);
        if (!depsMatch) return deps;

        const depsContent = depsMatch[1];
        const depRegex = /<dependency>(.*?)<\/dependency>/gs;
        let depMatch;

        while ((depMatch = depRegex.exec(depsContent)) !== null) {
          const depContent = depMatch[1];
          const groupId = extractTag('groupId', depContent);
          const artifactId = extractTag('artifactId', depContent);
          const version = extractTag('version', depContent);
          const scope = extractTag('scope', depContent) || 'compile';
          const optional = extractTag('optional', depContent);

          if (groupId && artifactId) {
            deps.push({
              groupId,
              artifactId,
              version,
              scope,
              optional,
            });
          }
        }

        return deps;
      };

      const dependencies = extractDependencies(xml);
      const projectArtifactId = extractTag('artifactId', xml);

      for (const dep of dependencies) {
        if (!dep.groupId || !dep.artifactId) continue;

        const coordinate = `${dep.groupId}:${dep.artifactId}`;
        const version = dep.version || '';
        const resolvedVersion = resolveProperty(version);
        const isRegistryResolvable = !!resolvedVersion && !/\$\{.+\}/.test(resolvedVersion);

        // Map Maven scope to DependencyType
        let depType: DependencyType = 'dependencies';
        if (dep.optional === 'true') {
          depType = 'optionalDependencies';
        } else if (dep.scope === 'test') {
          depType = 'devDependencies';
        } else if (dep.scope === 'provided') {
          depType = 'peerDependencies';
        }

        packages.push({
          workspaceFolderPath: vscode.workspace.getWorkspaceFolder(vscode.Uri.file(pomPath))?.uri.fsPath,
          manifestName: projectArtifactId,
          name: coordinate,
          currentVersion: resolvedVersion || version,
          resolvedVersion: isRegistryResolvable ? resolvedVersion : undefined,
          versionSpecifier: version || undefined,
          isRegistryResolvable,
          type: depType,
          hasUpdate: false,
          packageJsonPath: pomPath,
        });
      }
    } catch {
      // Return empty array if parsing fails
    }

    return packages;
  }

  /**
   * Parse Directory.Packages.props and extract PackageVersion entries
   */
  private parseDirectoryPackagesProps(xml: string, manifestPath: string): InstalledPackage[] {
    const packages: InstalledPackage[] = [];
    const re = /<PackageVersion\s+Include="([^"]+)"\s+Version="([^"]+)"\s*\/>|<PackageVersion\s+Version="([^"]+)"\s+Include="([^"]+)"\s*\/>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) !== null) {
      const id = (m[1] ?? m[4])?.trim();
      const version = (m[2] ?? m[3])?.trim();
      if (id && version) {
        packages.push({
          workspaceFolderPath: vscode.workspace.getWorkspaceFolder(vscode.Uri.file(manifestPath))?.uri.fsPath,
          manifestName: 'Directory.Packages.props',
          name: id,
          currentVersion: version,
          resolvedVersion: version,
          versionSpecifier: version,
          isRegistryResolvable: true,
          type: 'dependencies',
          hasUpdate: false,
          packageJsonPath: manifestPath,
        });
      }
    }
    return packages;
  }

  /**
   * Parse paket.dependencies and extract nuget lines
   */
  private parsePaketDependencies(text: string, manifestPath: string): InstalledPackage[] {
    const packages: InstalledPackage[] = [];
    const re = /^\s*nuget\s+([^\s]+)\s+([^\s~]+)/gim;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const id = m[1]?.trim();
      const version = m[2]?.trim();
      if (id && version) {
        packages.push({
          workspaceFolderPath: vscode.workspace.getWorkspaceFolder(vscode.Uri.file(manifestPath))?.uri.fsPath,
          manifestName: 'paket.dependencies',
          name: id,
          currentVersion: version,
          resolvedVersion: version,
          versionSpecifier: version,
          isRegistryResolvable: true,
          type: 'dependencies',
          hasUpdate: false,
          packageJsonPath: manifestPath,
        });
      }
    }
    return packages;
  }

  private parseGradleManifest(text: string, manifestPath: string): InstalledPackage[] {
    const packages: InstalledPackage[] = [];
    const manifestName = this.getFallbackManifestName(manifestPath);
    const dependencyRegex =
      /(?:^|\s)(implementation|testImplementation|compileOnly|runtimeOnly|api|compile)\s*(?:\(\s*)?["']([^:"']+):([^:"']+):([^"')\s]+)["']\s*\)?/gm;

    let match: RegExpExecArray | null;
    while ((match = dependencyRegex.exec(text)) !== null) {
      const [, configuration, groupId, artifactId, versionText] = match;
      const coordinate = `${groupId}:${artifactId}`;
      const resolvedVersion = /[${]/.test(versionText) ? undefined : versionText;

      let depType: DependencyType = 'dependencies';
      if (configuration === 'testImplementation') {
        depType = 'devDependencies';
      } else if (configuration === 'compileOnly') {
        depType = 'peerDependencies';
      }

      packages.push({
        workspaceFolderPath: vscode.workspace.getWorkspaceFolder(vscode.Uri.file(manifestPath))?.uri.fsPath,
        manifestName,
        name: coordinate,
        currentVersion: versionText,
        resolvedVersion,
        versionSpecifier: versionText,
        isRegistryResolvable: !!resolvedVersion,
        type: depType,
        hasUpdate: false,
        packageJsonPath: manifestPath,
      });
    }

    return packages;
  }

  /**
   * Parse packages.config and extract package entries.
   */
  private parsePackagesConfig(xml: string, manifestPath: string): InstalledPackage[] {
    const packages: InstalledPackage[] = [];
    const re = /<package\b([^>]*?)\/?>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) !== null) {
      const attrs = m[1] ?? '';
      const id = this.readXmlAttribute(attrs, 'id');
      const version = this.readXmlAttribute(attrs, 'version');
      if (!id || !version) {
        continue;
      }

      packages.push({
        workspaceFolderPath: vscode.workspace.getWorkspaceFolder(vscode.Uri.file(manifestPath))?.uri.fsPath,
        manifestName: 'packages.config',
        name: id,
        currentVersion: version,
        resolvedVersion: version,
        versionSpecifier: version,
        isRegistryResolvable: true,
        type: 'dependencies',
        hasUpdate: false,
        packageJsonPath: manifestPath,
      });
    }

    return packages;
  }

  /**
   * Parse PackageReference entries from project files.
   * Only versioned entries are update targets; versionless references are managed elsewhere.
   */
  private parseProjectPackageReferences(xml: string, manifestPath: string): InstalledPackage[] {
    const packages: InstalledPackage[] = [];
    const re = /<PackageReference\b([^>]*?)\/>|<PackageReference\b([^>]*?)>([\s\S]*?)<\/PackageReference>/gi;
    let m: RegExpExecArray | null;
    const manifestName = this.getFallbackManifestName(manifestPath);

    while ((m = re.exec(xml)) !== null) {
      const attrs = (m[1] ?? m[2] ?? '').trim();
      const body = m[3] ?? '';
      const id = this.readXmlAttribute(attrs, 'Include') || this.readXmlAttribute(attrs, 'Update');
      const version = this.readXmlAttribute(attrs, 'Version') || this.readXmlElementText(body, 'Version');
      if (!id || !version) {
        continue;
      }

      packages.push({
        workspaceFolderPath: vscode.workspace.getWorkspaceFolder(vscode.Uri.file(manifestPath))?.uri.fsPath,
        manifestName,
        name: id,
        currentVersion: version,
        resolvedVersion: version,
        versionSpecifier: version,
        isRegistryResolvable: true,
        type: 'dependencies',
        hasUpdate: false,
        packageJsonPath: manifestPath,
      });
    }

    return packages;
  }

  /**
   * Parse .cake file and extract #addin / #tool nuget refs with version
   */
  private parseCakePackages(text: string, manifestPath: string): InstalledPackage[] {
    const packages: InstalledPackage[] = [];
    const path = require('path') as typeof import('path');
    const manifestName = path.basename(manifestPath);
    for (const directive of parseCakeDirectives(text)) {
      packages.push({
        workspaceFolderPath: vscode.workspace.getWorkspaceFolder(vscode.Uri.file(manifestPath))?.uri.fsPath,
        manifestName,
        name: directive.packageId,
        currentVersion: directive.version || 'floating',
        resolvedVersion: directive.version,
        versionSpecifier: directive.version,
        isRegistryResolvable: !!directive.version,
        type: 'dependencies',
        hasUpdate: false,
        packageJsonPath: manifestPath,
      });
    }
    return packages;
  }

  private parseComposerManifest(
    composerJson: Record<string, unknown>,
    composerLock: Record<string, unknown> | null,
    manifestPath: string
  ): InstalledPackage[] {
    const workspaceFolderPath = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(manifestPath))?.uri.fsPath;
    const manifestName =
      typeof composerJson.name === 'string' && composerJson.name.trim()
        ? composerJson.name.trim()
        : this.getFallbackManifestName(manifestPath);

    const packages: InstalledPackage[] = [];
    const addPackage = (
      name: string,
      version: string,
      type: DependencyType,
      versionSpecifier?: string
    ) => {
      if (this.isComposerPlatformPackage(name)) {
        return;
      }

      const parsedSpec = parseDependencySpec(versionSpecifier || version);
      packages.push({
        workspaceFolderPath,
        manifestName,
        name,
        currentVersion: version,
        resolvedVersion: version,
        versionSpecifier: versionSpecifier || version,
        specKind: parsedSpec.kind,
        isRegistryResolvable: true,
        type,
        hasUpdate: false,
        packageJsonPath: manifestPath,
      });
    };

    if (composerLock) {
      const requireMap = this.readComposerDependencyMap(composerJson.require);
      const requireDevMap = this.readComposerDependencyMap(composerJson['require-dev']);
      const runtimePackages = Array.isArray(composerLock.packages)
        ? composerLock.packages as Array<Record<string, unknown>>
        : [];
      const devPackages = Array.isArray(composerLock['packages-dev'])
        ? composerLock['packages-dev'] as Array<Record<string, unknown>>
        : [];

      for (const pkg of runtimePackages) {
        const name = typeof pkg.name === 'string' ? pkg.name : undefined;
        const version = typeof pkg.version === 'string' ? pkg.version : undefined;
        if (name && version) {
          addPackage(name, version, 'dependencies', requireMap.get(name) || version);
        }
      }

      for (const pkg of devPackages) {
        const name = typeof pkg.name === 'string' ? pkg.name : undefined;
        const version = typeof pkg.version === 'string' ? pkg.version : undefined;
        if (name && version) {
          addPackage(name, version, 'devDependencies', requireDevMap.get(name) || version);
        }
      }

      return packages;
    }

    const dependencySets: Array<{ deps: Record<string, string>; type: DependencyType }> = [
      { deps: this.readComposerDependencyObject(composerJson.require), type: 'dependencies' },
      { deps: this.readComposerDependencyObject(composerJson['require-dev']), type: 'devDependencies' },
    ];

    for (const dependencySet of dependencySets) {
      for (const [name, versionRange] of Object.entries(dependencySet.deps)) {
        if (this.isComposerPlatformPackage(name)) {
          continue;
        }

        const parsedSpec = parseDependencySpec(versionRange);
        packages.push({
          workspaceFolderPath,
          manifestName,
          name,
          currentVersion: parsedSpec.displayText || versionRange,
          resolvedVersion: parsedSpec.normalizedVersion,
          versionSpecifier: versionRange,
          specKind: parsedSpec.kind,
          isRegistryResolvable: parsedSpec.isRegistryResolvable,
          type: dependencySet.type,
          hasUpdate: false,
          packageJsonPath: manifestPath,
        });
      }
    }

    return packages;
  }

  private parseGemfileManifest(
    gemfileContent: string,
    gemfileLockContent: string | null,
    manifestPath: string
  ): InstalledPackage[] {
    const workspaceFolderPath = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(manifestPath))?.uri.fsPath;
    const manifestName = this.getFallbackManifestName(manifestPath);
    const declaredDependencies = this.parseGemfileDeclarations(gemfileContent);
    const lockedVersions = gemfileLockContent ? this.parseGemfileLockVersions(gemfileLockContent) : new Map<string, string>();
    const packages: InstalledPackage[] = [];

    for (const dependency of declaredDependencies) {
      const resolvedVersion = lockedVersions.get(dependency.name);
      const parsedSpec = parseDependencySpec(dependency.versionSpecifier || resolvedVersion || '');
      packages.push({
        workspaceFolderPath,
        manifestName,
        name: dependency.name,
        currentVersion: resolvedVersion || parsedSpec.displayText || dependency.versionSpecifier || 'latest',
        resolvedVersion,
        versionSpecifier: dependency.versionSpecifier,
        specKind: dependency.versionSpecifier ? parsedSpec.kind : undefined,
        isRegistryResolvable: !!resolvedVersion || !!dependency.versionSpecifier,
        type: dependency.type,
        hasUpdate: false,
        packageJsonPath: manifestPath,
      });
    }

    return packages;
  }

  private parseDepsEdnManifest(content: string, manifestPath: string): InstalledPackage[] {
    const workspaceFolderPath = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(manifestPath))?.uri.fsPath;
    const manifestName = this.getFallbackManifestName(manifestPath);
    const packages: InstalledPackage[] = [];
    const addPackage = (name: string, version: string, type: DependencyType) => {
      packages.push({
        workspaceFolderPath,
        manifestName,
        name,
        currentVersion: version,
        resolvedVersion: version,
        versionSpecifier: version,
        specKind: 'semver',
        isRegistryResolvable: true,
        type,
        hasUpdate: false,
        packageJsonPath: manifestPath,
      });
    };

    for (const match of content.matchAll(/([A-Za-z0-9.\-]+\/[A-Za-z0-9.\-]+)\s+\{[^\}]*:mvn\/version\s+"([^"]+)"/g)) {
      addPackage(match[1], match[2], 'dependencies');
    }

    for (const match of content.matchAll(/:extra-deps\s+\{([\s\S]*?)\}/g)) {
      for (const depMatch of match[1].matchAll(/([A-Za-z0-9.\-]+\/[A-Za-z0-9.\-]+)\s+\{[^\}]*:mvn\/version\s+"([^"]+)"/g)) {
        addPackage(depMatch[1], depMatch[2], 'devDependencies');
      }
    }

    return this.dedupeInstalledPackages(packages);
  }

  private parseLeiningenManifest(content: string, manifestPath: string): InstalledPackage[] {
    const workspaceFolderPath = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(manifestPath))?.uri.fsPath;
    const manifestName = this.getFallbackManifestName(manifestPath);
    const packages: InstalledPackage[] = [];
    const addPackage = (name: string, version: string, type: DependencyType) => {
      packages.push({
        workspaceFolderPath,
        manifestName,
        name,
        currentVersion: version,
        resolvedVersion: version,
        versionSpecifier: version,
        specKind: 'semver',
        isRegistryResolvable: true,
        type,
        hasUpdate: false,
        packageJsonPath: manifestPath,
      });
    };

    for (const match of content.matchAll(/\[([A-Za-z0-9.\-]+\/[A-Za-z0-9.\-]+)\s+"([^"]+)"[^\]]*\]/g)) {
      addPackage(match[1], match[2], 'dependencies');
    }

    for (const match of content.matchAll(/:profiles\s+\{[\s\S]*?:dev\s+\{[\s\S]*?:dependencies\s+\[([\s\S]*?)\][\s\S]*?\}/g)) {
      for (const depMatch of match[1].matchAll(/\[([A-Za-z0-9.\-]+\/[A-Za-z0-9.\-]+)\s+"([^"]+)"[^\]]*\]/g)) {
        addPackage(depMatch[1], depMatch[2], 'devDependencies');
      }
    }

    return this.dedupeInstalledPackages(packages);
  }

  private parseCargoManifest(
    cargoTomlContent: string,
    cargoLockContent: string | null,
    manifestPath: string
  ): InstalledPackage[] {
    const workspaceFolderPath = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(manifestPath))?.uri.fsPath;
    const manifestName = this.extractCargoPackageName(cargoTomlContent) || this.getFallbackManifestName(manifestPath);
    const lockedVersions = cargoLockContent ? this.parseCargoLockVersions(cargoLockContent) : new Map<string, string>();
    const packages: InstalledPackage[] = [];
    let currentSection = '';

    for (const rawLine of cargoTomlContent.split(/\r?\n/)) {
      const line = rawLine.replace(/\s+#.*$/, '').trim();
      if (!line) {
        continue;
      }

      const sectionMatch = line.match(/^\[([^\]]+)\]$/);
      if (sectionMatch) {
        currentSection = sectionMatch[1].trim();
        continue;
      }

      const dependencyType = this.mapCargoSectionToDependencyType(currentSection);
      if (!dependencyType) {
        continue;
      }

      const parsed = this.parseCargoDependencyLine(line);
      if (!parsed) {
        continue;
      }

      const resolvedVersion = lockedVersions.get(parsed.name);
      const displayVersion = resolvedVersion || parsed.versionSpecifier || parsed.displayVersion;
      const parsedSpec = parseDependencySpec(parsed.versionSpecifier || displayVersion || '');
      packages.push({
        workspaceFolderPath,
        manifestName,
        name: parsed.name,
        currentVersion: displayVersion,
        resolvedVersion,
        versionSpecifier: parsed.versionSpecifier,
        specKind: parsed.versionSpecifier ? parsedSpec.kind : undefined,
        isRegistryResolvable: parsed.isRegistryResolvable,
        type: dependencyType,
        hasUpdate: false,
        packageJsonPath: manifestPath,
      });
    }

    return this.dedupeInstalledPackages(packages);
  }

  private parseGoManifest(content: string, manifestPath: string): InstalledPackage[] {
    const workspaceFolderPath = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(manifestPath))?.uri.fsPath;
    const manifestName = this.extractGoModuleName(content) || this.getFallbackManifestName(manifestPath);
    const packages: InstalledPackage[] = [];
    let inRequireBlock = false;

    const addPackage = (line: string, type: DependencyType) => {
      const parsed = this.parseGoDependencyLine(line);
      if (!parsed) {
        return;
      }

      const parsedSpec = parseDependencySpec(parsed.version);
      packages.push({
        workspaceFolderPath,
        manifestName,
        name: parsed.name,
        currentVersion: parsed.version,
        resolvedVersion: parsed.version,
        versionSpecifier: parsed.version,
        specKind: parsedSpec.kind,
        isRegistryResolvable: true,
        type,
        hasUpdate: false,
        packageJsonPath: manifestPath,
      });
    };

    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.replace(/\s*\/\/.*$/, '').trim();
      if (!line) {
        continue;
      }

      if (/^require\s*\($/.test(line)) {
        inRequireBlock = true;
        continue;
      }

      if (inRequireBlock && line === ')') {
        inRequireBlock = false;
        continue;
      }

      if (inRequireBlock) {
        addPackage(line, 'dependencies');
        continue;
      }

      const singleRequire = line.match(/^require\s+(.+)$/);
      if (singleRequire) {
        addPackage(singleRequire[1], 'dependencies');
      }
    }

    return this.dedupeInstalledPackages(packages);
  }

  private extractGoModuleName(content: string): string | undefined {
    const match = content.match(/^\s*module\s+([^\s]+)\s*$/m);
    return match?.[1];
  }

  private parseGoDependencyLine(line: string): { name: string; version: string } | null {
    const match = line.match(/^([^\s]+)\s+(v[^\s]+)$/);
    if (!match) {
      return null;
    }

    return {
      name: match[1],
      version: match[2],
    };
  }

  private extractCargoPackageName(content: string): string | undefined {
    const packageSection = content.match(/\[package\]([\s\S]*?)(?:\n\[|$)/);
    if (!packageSection) {
      return undefined;
    }
    const nameMatch = packageSection[1].match(/^\s*name\s*=\s*"([^"]+)"/m);
    return nameMatch?.[1];
  }

  private parseCargoLockVersions(content: string): Map<string, string> {
    const versions = new Map<string, string>();
    const packageBlocks = content.split(/\[\[package\]\]/g);
    for (const block of packageBlocks) {
      const nameMatch = block.match(/^\s*name\s*=\s*"([^"]+)"/m);
      const versionMatch = block.match(/^\s*version\s*=\s*"([^"]+)"/m);
      if (!nameMatch || !versionMatch) {
        continue;
      }
      versions.set(nameMatch[1], versionMatch[1]);
    }
    return versions;
  }

  private mapCargoSectionToDependencyType(section: string): DependencyType | null {
    if (section === 'dependencies' || section.endsWith('.dependencies')) {
      return 'dependencies';
    }
    if (
      section === 'dev-dependencies' ||
      section === 'build-dependencies' ||
      section.endsWith('.dev-dependencies') ||
      section.endsWith('.build-dependencies')
    ) {
      return 'devDependencies';
    }
    return null;
  }

  private parseCargoDependencyLine(line: string): {
    name: string;
    versionSpecifier?: string;
    displayVersion: string;
    isRegistryResolvable: boolean;
  } | null {
    const stringMatch = line.match(/^([A-Za-z0-9_-]+)\s*=\s*"([^"]+)"/);
    if (stringMatch) {
      return {
        name: stringMatch[1],
        versionSpecifier: stringMatch[2],
        displayVersion: stringMatch[2],
        isRegistryResolvable: true,
      };
    }

    const inlineTableMatch = line.match(/^([A-Za-z0-9_-]+)\s*=\s*\{(.*)\}$/);
    if (!inlineTableMatch) {
      return null;
    }

    const name = inlineTableMatch[1];
    const body = inlineTableMatch[2];
    const versionMatch = body.match(/(?:^|,)\s*version\s*=\s*"([^"]+)"/);
    if (versionMatch) {
      return {
        name,
        versionSpecifier: versionMatch[1],
        displayVersion: versionMatch[1],
        isRegistryResolvable: true,
      };
    }

    if (/\bworkspace\s*=\s*true\b/.test(body)) {
      return {
        name,
        displayVersion: 'workspace',
        isRegistryResolvable: false,
      };
    }

    if (/\bpath\s*=/.test(body)) {
      return {
        name,
        displayVersion: 'path',
        isRegistryResolvable: false,
      };
    }

    if (/\bgit\s*=/.test(body)) {
      return {
        name,
        displayVersion: 'git',
        isRegistryResolvable: false,
      };
    }

    return {
      name,
      displayVersion: 'custom',
      isRegistryResolvable: false,
    };
  }

  private parsePerlManifest(
    cpanfileContent: string,
    snapshotContent: string | null,
    manifestPath: string
  ): InstalledPackage[] {
    const workspaceFolderPath = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(manifestPath))?.uri.fsPath;
    const manifestName = this.getFallbackManifestName(manifestPath);
    const resolvedVersions = snapshotContent ? this.parsePerlSnapshot(snapshotContent) : new Map<string, string>();
    const packages: InstalledPackage[] = [];
    let currentType: DependencyType = 'dependencies';

    for (const rawLine of cpanfileContent.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) {
        continue;
      }

      if (/^on\s+['"](test|develop|configure)['"]/.test(line)) {
        currentType = 'devDependencies';
      }
      if (/^\};?\s*$/.test(line)) {
        currentType = 'dependencies';
      }

      const match = line.match(/(?:requires|recommends|suggests)\s+['"]([^'"]+)['"]\s*(?:,\s*['"]([^'"]+)['"])?/);
      if (!match) {
        continue;
      }

      const name = match[1];
      const versionSpecifier = match[2];
      const resolvedVersion = resolvedVersions.get(name);
      const parsedSpec = parseDependencySpec(versionSpecifier || resolvedVersion || '');
      packages.push({
        workspaceFolderPath,
        manifestName,
        name,
        currentVersion: resolvedVersion || parsedSpec.displayText || versionSpecifier || 'latest',
        resolvedVersion,
        versionSpecifier,
        specKind: versionSpecifier ? parsedSpec.kind : undefined,
        isRegistryResolvable: true,
        type: currentType,
        hasUpdate: false,
        packageJsonPath: manifestPath,
      });
    }

    return this.dedupeInstalledPackages(packages);
  }

  private parsePerlSnapshot(content: string): Map<string, string> {
    const versions = new Map<string, string>();
    for (const match of content.matchAll(/distribution:\s+.+\/([A-Za-z0-9_:.-]+)-([0-9][A-Za-z0-9._-]*)/g)) {
      versions.set(match[1], match[2]);
    }
    return versions;
  }

  private parsePubspecManifest(
    pubspecContent: string,
    lockContent: string | null,
    manifestPath: string
  ): InstalledPackage[] {
    const workspaceFolderPath = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(manifestPath))?.uri.fsPath;
    const manifestName = this.extractPubspecName(pubspecContent) || this.getFallbackManifestName(manifestPath);
    const lockedVersions = lockContent ? this.parsePubspecLockVersions(lockContent) : new Map<string, string>();
    const packages: InstalledPackage[] = [];
    let currentSection = '';

    for (const rawLine of pubspecContent.split(/\r?\n/)) {
      const line = rawLine.replace(/\s+#.*$/, '');
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      const sectionMatch = trimmed.match(/^([A-Za-z_]+):\s*$/);
      if (sectionMatch && trimmed === sectionMatch[0]) {
        currentSection = sectionMatch[1];
        continue;
      }

      const depType = this.mapPubspecSectionToDependencyType(currentSection);
      if (!depType) {
        continue;
      }

      const indent = rawLine.match(/^\s*/)?.[0].length || 0;
      if (indent < 2) {
        continue;
      }

      const packageMatch = trimmed.match(/^([A-Za-z0-9_]+):\s*(.+)?$/);
      if (!packageMatch) {
        continue;
      }

      const name = packageMatch[1];
      const rawSpec = packageMatch[2]?.trim();
      const normalizedSpec = rawSpec && rawSpec !== '' ? rawSpec.replace(/^['"]|['"]$/g, '') : undefined;
      const isRegistryResolvable =
        !!normalizedSpec &&
        !/^sdk:/i.test(normalizedSpec) &&
        !/^path:/i.test(normalizedSpec) &&
        !/^git:/i.test(normalizedSpec) &&
        normalizedSpec !== '{}';
      const resolvedVersion = lockedVersions.get(name);
      const displayVersion = resolvedVersion || normalizedSpec || 'sdk/path/git';
      const parsedSpec = parseDependencySpec(normalizedSpec || '');

      packages.push({
        workspaceFolderPath,
        manifestName,
        name,
        currentVersion: displayVersion,
        resolvedVersion,
        versionSpecifier: normalizedSpec,
        specKind: normalizedSpec ? parsedSpec.kind : undefined,
        isRegistryResolvable,
        type: depType,
        hasUpdate: false,
        packageJsonPath: manifestPath,
      });
    }

    return this.dedupeInstalledPackages(packages);
  }

  private extractPubspecName(content: string): string | undefined {
    return content.match(/^\s*name:\s*([A-Za-z0-9_]+)/m)?.[1];
  }

  private parsePubspecLockVersions(content: string): Map<string, string> {
    const versions = new Map<string, string>();
    const lines = content.split(/\r?\n/);
    let currentPackage: string | null = null;

    for (const line of lines) {
      const packageMatch = line.match(/^  ([A-Za-z0-9_]+):$/);
      if (packageMatch) {
        currentPackage = packageMatch[1];
        continue;
      }
      if (!currentPackage) {
        continue;
      }
      const versionMatch = line.match(/^\s{4}version:\s*"([^"]+)"/);
      if (versionMatch) {
        versions.set(currentPackage, versionMatch[1]);
        currentPackage = null;
      }
    }

    return versions;
  }

  private mapPubspecSectionToDependencyType(section: string): DependencyType | null {
    if (section === 'dependencies') {
      return 'dependencies';
    }
    if (section === 'dev_dependencies') {
      return 'devDependencies';
    }
    return null;
  }

  private parseDescriptionManifest(content: string, manifestPath: string): InstalledPackage[] {
    const workspaceFolderPath = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(manifestPath))?.uri.fsPath;
    const fields = this.parseDcfFields(content);
    const manifestName = fields.Package || this.getFallbackManifestName(manifestPath);
    const packages: InstalledPackage[] = [];
    const addPackages = (fieldName: string, type: DependencyType) => {
      const parsed = this.parseDescriptionDependencyField(fields[fieldName]);
      for (const entry of parsed) {
        packages.push({
          workspaceFolderPath,
          manifestName,
          name: entry.name,
          currentVersion: entry.versionSpecifier || '*',
          resolvedVersion: entry.versionSpecifier,
          versionSpecifier: entry.versionSpecifier,
          specKind: entry.versionSpecifier ? 'semver' : undefined,
          isRegistryResolvable: true,
          type,
          hasUpdate: false,
          packageJsonPath: manifestPath,
        });
      }
    };

    addPackages('Depends', 'dependencies');
    addPackages('Imports', 'dependencies');
    addPackages('LinkingTo', 'dependencies');
    addPackages('Suggests', 'devDependencies');
    addPackages('Enhances', 'devDependencies');
    return this.dedupeInstalledPackages(packages);
  }

  private parseDcfFields(content: string): Record<string, string> {
    const fields: Record<string, string> = {};
    let currentKey: string | null = null;
    for (const rawLine of content.split(/\r?\n/)) {
      if (!rawLine.trim()) {
        currentKey = null;
        continue;
      }
      const fieldMatch = rawLine.match(/^([A-Za-z0-9/._-]+):\s*(.*)$/);
      if (fieldMatch) {
        currentKey = fieldMatch[1];
        fields[currentKey] = fieldMatch[2].trim();
        continue;
      }
      if (currentKey && /^\s+/.test(rawLine)) {
        fields[currentKey] = `${fields[currentKey]} ${rawLine.trim()}`.trim();
      }
    }
    return fields;
  }

  private parseDescriptionDependencyField(field?: string): Array<{ name: string; versionSpecifier?: string }> {
    if (!field) {
      return [];
    }
    return field
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .reduce<Array<{ name: string; versionSpecifier?: string }>>((entries, entry) => {
        const match = entry.match(/^([A-Za-z0-9.]+)\s*(?:\(([^)]+)\))?/);
        if (!match || match[1] === 'R') {
          return entries;
        }
        entries.push({
          name: match[1],
          versionSpecifier: match[2]?.trim(),
        });
        return entries;
      }, []);
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
    const projectInfos = await Promise.all(
      packageJsonFiles.map(async (uri) => {
        const packageJson = await this.getPackageJson(uri);
        if (!packageJson) {
          return null;
        }

        const name =
          typeof packageJson.name === 'string' && packageJson.name.trim()
            ? packageJson.name.trim()
            : this.getFallbackManifestName(uri.fsPath);
        const workspaceFolderPath = vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath;
        const dependencies = this.extractWorkspaceProjectDependencies(packageJson);
        return {
          name,
          manifestPath: uri.fsPath,
          workspaceFolderPath,
          relativePath: vscode.workspace.asRelativePath(uri) || uri.fsPath,
          tool: await this.detectMonorepoTool(uri),
          dependencies,
        };
      })
    );

    const projects = projectInfos.filter(
      (project): project is NonNullable<typeof project> => project !== null
    );
    const projectByName = new Map(projects.map((project) => [project.name, project]));

    for (const project of projects) {
      for (const dependency of project.dependencies) {
        if (!dependency.localProjectPath) {
          if (projectByName.has(dependency.name)) {
            dependency.localProjectPath = projectByName.get(dependency.name)?.manifestPath;
          } else if (dependency.specKind === 'file' || dependency.specKind === 'path') {
            dependency.localProjectPath = await this.resolveWorkspaceLocalManifestPath(
              project.manifestPath,
              dependency.spec
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
      alignmentIssues: this.computeWorkspaceAlignmentIssues(projects),
    };
  }

  async alignWorkspaceDependencyVersions(packageName: string, targetVersion: string): Promise<number> {
    const packageJsonFiles = await this.getPackageJsonFiles();
    let updatedManifests = 0;

    for (const uri of packageJsonFiles) {
      const packageJson = await this.getPackageJson(uri);
      if (!packageJson) {
        continue;
      }

      let changed = false;
      const depTypes: DependencyType[] = [
        'dependencies',
        'devDependencies',
        'peerDependencies',
        'optionalDependencies',
      ];

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
    const fileName = uri.fsPath.split(/[/\\]/).pop()?.toLowerCase();
    if (
      fileName === 'package.json' ||
      fileName === 'composer.json' ||
      fileName === 'gemfile' ||
      fileName === 'deps.edn' ||
      fileName === 'project.clj' ||
      fileName === 'cargo.toml' ||
      fileName === 'go.mod' ||
      fileName === 'cpanfile' ||
      fileName === 'pubspec.yaml' ||
      fileName === 'description' ||
      fileName === 'pom.xml' ||
      fileName === 'build.gradle' ||
      fileName === 'build.gradle.kts' ||
      fileName === 'directory.packages.props' ||
      fileName === 'paket.dependencies' ||
      fileName === 'packages.config' ||
      fileName?.endsWith('.csproj') ||
      fileName?.endsWith('.vbproj') ||
      fileName?.endsWith('.fsproj') ||
      fileName?.endsWith('.cake')
    ) {
      return { manifestPath: uri.fsPath };
    }
    if (fileName === 'composer.lock') {
      return { manifestPath: uri.fsPath.replace(/composer\.lock$/i, 'composer.json') };
    }
    if (fileName === 'gemfile.lock') {
      return { manifestPath: uri.fsPath.replace(/gemfile\.lock$/i, 'Gemfile') };
    }
    if (fileName === 'cargo.lock') {
      return { manifestPath: uri.fsPath.replace(/cargo\.lock$/i, 'Cargo.toml') };
    }
    if (fileName === 'cpanfile.snapshot') {
      return { manifestPath: uri.fsPath.replace(/cpanfile\.snapshot$/i, 'cpanfile') };
    }
    if (fileName === 'pubspec.lock') {
      return { manifestPath: uri.fsPath.replace(/pubspec\.lock$/i, 'pubspec.yaml') };
    }
    if (fileName?.endsWith('.rproj')) {
      const path = require('path') as typeof import('path');
      return { manifestPath: path.join(path.dirname(uri.fsPath), 'DESCRIPTION') };
    }
    return undefined;
  }

  private extractWorkspaceProjectDependencies(
    packageJson: Record<string, unknown>
  ): WorkspaceProjectDependency[] {
    const depTypes: DependencyType[] = [
      'dependencies',
      'devDependencies',
      'peerDependencies',
      'optionalDependencies',
    ];

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
          localProjectPath:
            parsedSpec.kind === 'workspace'
              ? undefined
              : undefined,
        });
      }
    }

    return dependencies.sort((a, b) => a.name.localeCompare(b.name));
  }

  private computeWorkspaceAlignmentIssues(
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

  private async detectMonorepoTool(manifestUri: vscode.Uri): Promise<MonorepoTool> {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(manifestUri);
    if (!workspaceFolder) {
      return 'plain';
    }

    const rootPackageJson = await this.readJsonFile(vscode.Uri.joinPath(workspaceFolder.uri, 'package.json'));
    if (await this.fileExists(vscode.Uri.joinPath(workspaceFolder.uri, 'nx.json'))) {
      return 'nx';
    }
    if (await this.fileExists(vscode.Uri.joinPath(workspaceFolder.uri, 'lerna.json'))) {
      return 'lerna';
    }
    if (await this.fileExists(vscode.Uri.joinPath(workspaceFolder.uri, 'pnpm-workspace.yaml'))) {
      return 'pnpm-workspace';
    }
    if (rootPackageJson?.workspaces) {
      return 'npm-workspaces';
    }
    return 'plain';
  }

  private async resolveWorkspaceLocalManifestPath(
    sourceManifestPath: string,
    rawSpec: string
  ): Promise<string | undefined> {
    try {
      const specPath = rawSpec.replace(/^(file:|link:)/, '');
      const sourceDir = vscode.Uri.joinPath(vscode.Uri.file(sourceManifestPath), '..');
      const targetUri = vscode.Uri.joinPath(sourceDir, specPath, 'package.json');
      if (await this.fileExists(targetUri)) {
        return targetUri.fsPath;
      }
    } catch {
      // Ignore local resolution failures.
    }
    return undefined;
  }

  private getFallbackManifestName(manifestPath: string): string {
    const relativePath = vscode.workspace.asRelativePath(manifestPath) || manifestPath;
    const normalized = relativePath.replace(/\\/g, '/');
    const segments = normalized.split('/').filter(Boolean);
    if (segments.length >= 2) {
      return segments[segments.length - 2];
    }
    return relativePath;
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
    try {
      const content = await vscode.workspace.fs.readFile(uri);
      const packageJson = JSON.parse(content.toString());

      if (!packageJson[depType]) {
        packageJson[depType] = {};
      }

      packageJson[depType][packageName] = version;

      // Sort dependencies alphabetically
      packageJson[depType] = Object.fromEntries(
        Object.entries(packageJson[depType]).sort(([a], [b]) => a.localeCompare(b))
      );

      const newContent = JSON.stringify(packageJson, null, 2) + '\n';
      await vscode.workspace.fs.writeFile(uri, Buffer.from(newContent));
      this.invalidateInstalledPackagesCache();

      return true;
    } catch {
      return false;
    }
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
    try {
      const uri = vscode.Uri.file(pomPath);
      const content = await vscode.workspace.fs.readFile(uri);
      const xml = content.toString();

      // Find and replace the version for the specific dependency
      const dependencyRegex = new RegExp(
        `(<dependency>\\s*<groupId>${this.escapeXml(groupId)}</groupId>\\s*<artifactId>${this.escapeXml(artifactId)}</artifactId>\\s*<version>)([^<]+)(</version>)`,
        's'
      );

      const updatedXml = xml.replace(dependencyRegex, `$1${newVersion}$3`);

      if (updatedXml === xml) {
        return false; // No change made
      }

      await vscode.workspace.fs.writeFile(uri, Buffer.from(updatedXml));
      this.invalidateInstalledPackagesCache();
      return true;
    } catch {
      return false;
    }
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
    try {
      const uri = vscode.Uri.file(gradlePath);
      const content = await vscode.workspace.fs.readFile(uri);
      const text = content.toString();

      // Match Gradle dependency declarations
      // Supports: implementation 'groupId:artifactId:version'
      const escapedGroupId = this.escapeRegex(groupId);
      const escapedArtifactId = this.escapeRegex(artifactId);
      const gradleDepRegex = new RegExp(
        `((?:implementation|testImplementation|compileOnly|runtimeOnly|api|compile)\\s*(?:\\(\\s*)?['"]${escapedGroupId}:${escapedArtifactId}:)([^"'\\)\\s]+)((['"]\\s*\\)?)|['"])`,
        'g'
      );

      const updatedText = text.replace(gradleDepRegex, `$1${newVersion}$3`);

      if (updatedText === text) {
        return false; // No change made
      }

      await vscode.workspace.fs.writeFile(uri, Buffer.from(updatedText));
      this.invalidateInstalledPackagesCache();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Update CPM package version in Directory.Packages.props
   */
  async updateCpmPackage(propsPath: string, packageId: string, newVersion: string): Promise<boolean> {
    try {
      const uri = vscode.Uri.file(propsPath);
      const content = await vscode.workspace.fs.readFile(uri);
      const xml = content.toString();

      // Match <PackageVersion Include="PackageId" Version="current" /> (order of attributes may vary)
      const escapedId = this.escapeRegex(packageId);
      const re = new RegExp(
        `(<PackageVersion\\s+Include="${escapedId}"\\s+Version=")([^"]+)("\\s*/>)`,
        'i'
      );
      const updatedXml = xml.replace(re, `$1${newVersion}$3`);

      if (updatedXml === xml) {
        // Try alternate attribute order: Version before Include
        const re2 = new RegExp(
          `(<PackageVersion\\s+Version=")([^"]+)("\\s+Include="${escapedId}"\\s*/>)`,
          'i'
        );
        const updated2 = xml.replace(re2, `$1${newVersion}$3`);
        if (updated2 === xml) {
          return false;
        }
        await vscode.workspace.fs.writeFile(uri, Buffer.from(updated2));
      } else {
        await vscode.workspace.fs.writeFile(uri, Buffer.from(updatedXml));
      }
      this.invalidateInstalledPackagesCache();
      return true;
    } catch {
      return false;
    }
  }

  async removeCpmPackage(propsPath: string, packageId: string): Promise<boolean> {
    try {
      const uri = vscode.Uri.file(propsPath);
      const content = await vscode.workspace.fs.readFile(uri);
      const xml = content.toString();

      const escapedId = this.escapeRegex(packageId);
      const updatedXml = xml
        .replace(
          new RegExp(`^[ \\t]*<PackageVersion\\s+Include="${escapedId}"\\s+Version="[^"]+"\\s*/>\\s*\\r?\\n?`, 'im'),
          ''
        )
        .replace(
          new RegExp(`^[ \\t]*<PackageVersion\\s+Version="[^"]+"\\s+Include="${escapedId}"\\s*/>\\s*\\r?\\n?`, 'im'),
          ''
        );

      if (updatedXml === xml) {
        return false;
      }

      await vscode.workspace.fs.writeFile(uri, Buffer.from(updatedXml));
      this.invalidateInstalledPackagesCache();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Update Paket dependency version in paket.dependencies
   */
  async updatePaketDependency(depsPath: string, packageId: string, newVersion: string): Promise<boolean> {
    try {
      const uri = vscode.Uri.file(depsPath);
      const content = await vscode.workspace.fs.readFile(uri);
      const text = content.toString();

      // Match "nuget PackageId currentVersion" (line-based, allow optional ~> constraint)
      const escapedId = this.escapeRegex(packageId);
      const re = new RegExp(
        `^(\\s*nuget\\s+${escapedId}\\s+)([^\\s~]+)([^\\n]*)`,
        'im'
      );
      const updatedText = text.replace(re, `$1${newVersion}$3`);

      if (updatedText === text) {
        return false;
      }
      await vscode.workspace.fs.writeFile(uri, Buffer.from(updatedText));
      this.invalidateInstalledPackagesCache();
      return true;
    } catch {
      return false;
    }
  }

  async removePaketDependency(depsPath: string, packageId: string): Promise<boolean> {
    try {
      const uri = vscode.Uri.file(depsPath);
      const content = await vscode.workspace.fs.readFile(uri);
      const text = content.toString();
      const escapedId = this.escapeRegex(packageId);
      const updatedText = text.replace(
        new RegExp(`^\\s*nuget\\s+${escapedId}\\b[^\\n]*\\r?\\n?`, 'im'),
        ''
      );

      if (updatedText === text) {
        return false;
      }
      await vscode.workspace.fs.writeFile(uri, Buffer.from(updatedText));
      this.invalidateInstalledPackagesCache();
      return true;
    } catch {
      return false;
    }
  }

  async updatePackagesConfigPackage(configPath: string, packageId: string, newVersion: string): Promise<boolean> {
    try {
      const uri = vscode.Uri.file(configPath);
      const content = await vscode.workspace.fs.readFile(uri);
      const xml = content.toString();
      let updated = false;

      const updatedXml = xml.replace(/<package\b([^>]*?)\/?>/gi, (full, attrs: string) => {
        const id = this.readXmlAttribute(attrs, 'id');
        const version = this.readXmlAttribute(attrs, 'version');
        if (!id || !version || id.toLowerCase() !== packageId.toLowerCase()) {
          return full;
        }
        updated = true;
        return full.replace(/(\bversion\s*=\s*")([^"]+)(")/i, `$1${newVersion}$3`);
      });

      if (!updated || updatedXml === xml) {
        return false;
      }

      await vscode.workspace.fs.writeFile(uri, Buffer.from(updatedXml));
      this.invalidateInstalledPackagesCache();
      return true;
    } catch {
      return false;
    }
  }

  async removePackagesConfigPackage(configPath: string, packageId: string): Promise<boolean> {
    try {
      const uri = vscode.Uri.file(configPath);
      const content = await vscode.workspace.fs.readFile(uri);
      const xml = content.toString();
      let removed = false;

      const updatedXml = xml.replace(/^[ \t]*<package\b([^>]*?)\/?>\s*\r?\n?/gim, (full, attrs: string) => {
        const id = this.readXmlAttribute(attrs, 'id');
        if (!id || id.toLowerCase() !== packageId.toLowerCase()) {
          return full;
        }
        removed = true;
        return '';
      });

      if (!removed || updatedXml === xml) {
        return false;
      }

      await vscode.workspace.fs.writeFile(uri, Buffer.from(updatedXml));
      this.invalidateInstalledPackagesCache();
      return true;
    } catch {
      return false;
    }
  }

  async updateProjectPackageReference(projectPath: string, packageId: string, newVersion: string): Promise<boolean> {
    try {
      const uri = vscode.Uri.file(projectPath);
      const content = await vscode.workspace.fs.readFile(uri);
      const xml = content.toString();
      let updated = false;

      const updatedXml = xml.replace(
        /<PackageReference\b([^>]*?)\/>|<PackageReference\b([^>]*?)>([\s\S]*?)<\/PackageReference>/gi,
        (full, selfClosingAttrs: string, blockAttrs: string, body: string = '') => {
          const attrs = (selfClosingAttrs ?? blockAttrs ?? '').trim();
          const id = this.readXmlAttribute(attrs, 'Include') || this.readXmlAttribute(attrs, 'Update');
          if (!id || id.toLowerCase() !== packageId.toLowerCase()) {
            return full;
          }

          if (/\bVersion\s*=\s*"[^"]*"/i.test(attrs)) {
            updated = true;
            return full.replace(/(\bVersion\s*=\s*")([^"]+)(")/i, `$1${newVersion}$3`);
          }

          if (/<Version>\s*[^<]*\s*<\/Version>/i.test(body)) {
            updated = true;
            return full.replace(/(<Version>\s*)([^<]*)(\s*<\/Version>)/i, `$1${newVersion}$3`);
          }

          return full;
        }
      );

      if (!updated || updatedXml === xml) {
        return false;
      }

      await vscode.workspace.fs.writeFile(uri, Buffer.from(updatedXml));
      this.invalidateInstalledPackagesCache();
      return true;
    } catch {
      return false;
    }
  }

  async removeProjectPackageReference(projectPath: string, packageId: string): Promise<boolean> {
    try {
      const uri = vscode.Uri.file(projectPath);
      const content = await vscode.workspace.fs.readFile(uri);
      const xml = content.toString();
      let removed = false;

      const updatedXml = xml.replace(
        /^[ \t]*<PackageReference\b([^>]*?)\/>\s*\r?\n?|^[ \t]*<PackageReference\b([^>]*?)>[\s\S]*?<\/PackageReference>\s*\r?\n?/gim,
        (full, selfClosingAttrs: string, blockAttrs: string) => {
          const attrs = (selfClosingAttrs ?? blockAttrs ?? '').trim();
          const id = this.readXmlAttribute(attrs, 'Include') || this.readXmlAttribute(attrs, 'Update');
          if (!id || id.toLowerCase() !== packageId.toLowerCase()) {
            return full;
          }
          removed = true;
          return '';
        }
      );

      if (!removed || updatedXml === xml) {
        return false;
      }

      await vscode.workspace.fs.writeFile(uri, Buffer.from(updatedXml));
      this.invalidateInstalledPackagesCache();
      return true;
    } catch {
      return false;
    }
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
    try {
      const uri = vscode.Uri.file(cakePath);
      const content = await vscode.workspace.fs.readFile(uri);
      const text = content.toString();

      const directive = parseCakeDirectives(text).find(
        (entry) => entry.kind === kind && entry.packageId.toLowerCase() === packageId.toLowerCase()
      );
      if (!directive) {
        return false;
      }

      const updatedText = directive.versionRange
        ? `${text.slice(0, directive.versionRange.start)}${newVersion}${text.slice(directive.versionRange.end)}`
        : `${text.slice(0, directive.end)}&version=${newVersion}${text.slice(directive.end)}`;

      await vscode.workspace.fs.writeFile(uri, Buffer.from(updatedText));
      this.invalidateInstalledPackagesCache();
      return true;
    } catch {
      return false;
    }
  }

  async updateDepsEdnDependency(depsPath: string, packageId: string, newVersion: string): Promise<boolean> {
    try {
      const uri = vscode.Uri.file(depsPath);
      const content = await vscode.workspace.fs.readFile(uri);
      const text = content.toString();

      const escapedId = this.escapeRegex(packageId);
      const re = new RegExp(
        `(${escapedId}\\s+\\{[^\\}]*:mvn/version\\s+")([^"]+)(")`,
        'g'
      );
      const updatedText = text.replace(re, `$1${newVersion}$3`);

      if (updatedText === text) {
        return false;
      }

      await vscode.workspace.fs.writeFile(uri, Buffer.from(updatedText));
      this.invalidateInstalledPackagesCache();
      return true;
    } catch {
      return false;
    }
  }

  async removeCakePackage(cakePath: string, packageId: string): Promise<boolean> {
    try {
      const uri = vscode.Uri.file(cakePath);
      const content = await vscode.workspace.fs.readFile(uri);
      const text = content.toString();

      const directive = parseCakeDirectives(text).find(
        (entry) => entry.packageId.toLowerCase() === packageId.toLowerCase()
      );
      if (!directive) {
        return false;
      }

      const lineStart = text.lastIndexOf('\n', directive.start) + 1;
      const lineEndIndex = text.indexOf('\n', directive.end);
      const lineEnd = lineEndIndex === -1 ? text.length : lineEndIndex + 1;
      const updatedText = `${text.slice(0, lineStart)}${text.slice(lineEnd)}`;

      if (updatedText === text) {
        return false;
      }

      await vscode.workspace.fs.writeFile(uri, Buffer.from(updatedText));
      this.invalidateInstalledPackagesCache();
      return true;
    } catch {
      return false;
    }
  }

  async updateLeiningenDependency(projectPath: string, packageId: string, newVersion: string): Promise<boolean> {
    try {
      const uri = vscode.Uri.file(projectPath);
      const content = await vscode.workspace.fs.readFile(uri);
      const text = content.toString();

      const escapedId = this.escapeRegex(packageId);
      const re = new RegExp(
        `(\\[${escapedId}\\s+")([^"]+)(")`,
        'g'
      );
      const updatedText = text.replace(re, `$1${newVersion}$3`);

      if (updatedText === text) {
        return false;
      }

      await vscode.workspace.fs.writeFile(uri, Buffer.from(updatedText));
      this.invalidateInstalledPackagesCache();
      return true;
    } catch {
      return false;
    }
  }

  async updateCargoDependency(cargoPath: string, packageId: string, newVersion: string): Promise<boolean> {
    try {
      const uri = vscode.Uri.file(cargoPath);
      const content = await vscode.workspace.fs.readFile(uri);
      const text = content.toString();

      const escapedId = this.escapeRegex(packageId);
      let updatedText = text.replace(
        new RegExp(`(^\\s*${escapedId}\\s*=\\s*")([^"]+)(")`, 'gm'),
        `$1${newVersion}$3`
      );
      updatedText = updatedText.replace(
        new RegExp(`(^\\s*${escapedId}\\s*=\\s*\\{[^\\n\\r]*?version\\s*=\\s*")([^"]+)(")`, 'gm'),
        `$1${newVersion}$3`
      );

      if (updatedText === text) {
        return false;
      }

      await vscode.workspace.fs.writeFile(uri, Buffer.from(updatedText));
      this.invalidateInstalledPackagesCache();
      return true;
    } catch {
      return false;
    }
  }

  async updateGoDependency(goModPath: string, packageId: string, newVersion: string): Promise<boolean> {
    try {
      const uri = vscode.Uri.file(goModPath);
      const content = await vscode.workspace.fs.readFile(uri);
      const text = content.toString();
      const escapedId = this.escapeRegex(packageId);
      const updatedText = text.replace(
        new RegExp(`(^\\s*(?:require\\s+)?${escapedId}\\s+)(v[^\\s]+)`, 'gm'),
        `$1${newVersion}`
      );

      if (updatedText === text) {
        return false;
      }

      await vscode.workspace.fs.writeFile(uri, Buffer.from(updatedText));
      this.invalidateInstalledPackagesCache();
      return true;
    } catch {
      return false;
    }
  }

  async updatePerlDependency(cpanfilePath: string, packageId: string, newVersion: string): Promise<boolean> {
    try {
      const uri = vscode.Uri.file(cpanfilePath);
      const content = await vscode.workspace.fs.readFile(uri);
      const text = content.toString();
      const escapedId = this.escapeRegex(packageId);
      let updatedText = text.replace(
        new RegExp(`((?:requires|recommends|suggests)\\s+['"]${escapedId}['"]\\s*,\\s*['"])([^'"]+)(['"])`, 'g'),
        `$1${newVersion}$3`
      );
      if (updatedText === text) {
        updatedText = text.replace(
          new RegExp(`((?:requires|recommends|suggests)\\s+['"]${escapedId}['"])(\\s*;)`, 'g'),
          `$1, '${newVersion}'$2`
        );
      }
      if (updatedText === text) {
        return false;
      }
      await vscode.workspace.fs.writeFile(uri, Buffer.from(updatedText));
      this.invalidateInstalledPackagesCache();
      return true;
    } catch {
      return false;
    }
  }

  async removePerlDependency(cpanfilePath: string, packageId: string): Promise<boolean> {
    try {
      const uri = vscode.Uri.file(cpanfilePath);
      const content = await vscode.workspace.fs.readFile(uri);
      const text = content.toString();
      const escapedId = this.escapeRegex(packageId);
      const updatedText = text.replace(
        new RegExp(`^\\s*(?:requires|recommends|suggests)\\s+['"]${escapedId}['"][^\\n]*\\r?\\n?`, 'gm'),
        ''
      );
      if (updatedText === text) {
        return false;
      }
      await vscode.workspace.fs.writeFile(uri, Buffer.from(updatedText));
      this.invalidateInstalledPackagesCache();
      return true;
    } catch {
      return false;
    }
  }

  async updatePubspecDependency(pubspecPath: string, packageId: string, newVersion: string): Promise<boolean> {
    try {
      const uri = vscode.Uri.file(pubspecPath);
      const content = await vscode.workspace.fs.readFile(uri);
      const text = content.toString();
      const escapedId = this.escapeRegex(packageId);
      let updatedText = text.replace(
        new RegExp(`(^\\s{2}${escapedId}:\\s*)([^#\\n\\r]+)`, 'gm'),
        `$1${newVersion}`
      );
      updatedText = updatedText.replace(
        new RegExp(`(^\\s{2}${escapedId}:\\s*\\{[^\\n\\r]*?version:\\s*)([^,}\\n\\r]+)`, 'gm'),
        `$1${newVersion}`
      );
      if (updatedText === text) {
        return false;
      }
      await vscode.workspace.fs.writeFile(uri, Buffer.from(updatedText));
      this.invalidateInstalledPackagesCache();
      return true;
    } catch {
      return false;
    }
  }

  async updateRDependency(descriptionPath: string, packageId: string, newVersion: string): Promise<boolean> {
    try {
      const uri = vscode.Uri.file(descriptionPath);
      const content = await vscode.workspace.fs.readFile(uri);
      const text = content.toString();
      const updatedText = this.rewriteDescriptionDependencyFields(
        text,
        packageId,
        (entry) => ({ ...entry, versionSpecifier: `>= ${newVersion}` })
      );
      if (updatedText === text) {
        return false;
      }
      await vscode.workspace.fs.writeFile(uri, Buffer.from(updatedText));
      this.invalidateInstalledPackagesCache();
      return true;
    } catch {
      return false;
    }
  }

  async removeRDependency(descriptionPath: string, packageId: string): Promise<boolean> {
    try {
      const uri = vscode.Uri.file(descriptionPath);
      const content = await vscode.workspace.fs.readFile(uri);
      const text = content.toString();
      const updatedText = this.rewriteDescriptionDependencyFields(text, packageId, () => null);
      if (updatedText === text) {
        return false;
      }
      await vscode.workspace.fs.writeFile(uri, Buffer.from(updatedText));
      this.invalidateInstalledPackagesCache();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Escape XML special characters
   */
  private escapeXml(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Escape regex special characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private rewriteDescriptionDependencyFields(
    text: string,
    packageId: string,
    rewriter: (
      entry: { name: string; versionSpecifier?: string }
    ) => { name: string; versionSpecifier?: string } | null
  ): string {
    const fieldPattern = /^(Depends|Imports|LinkingTo|Suggests|Enhances):\s*([^\n]*(?:\n[ \t]+[^\n]*)*)/gim;
    let changed = false;

    const updatedText = text.replace(fieldPattern, (full, fieldName: string, fieldBody: string) => {
      const entries = this.parseDescriptionDependencyField(fieldBody);
      if (entries.length === 0) {
        return full;
      }

      let fieldChanged = false;
      const nextEntries: Array<{ name: string; versionSpecifier?: string }> = [];
      for (const entry of entries) {
        if (entry.name.toLowerCase() !== packageId.toLowerCase()) {
          nextEntries.push(entry);
          continue;
        }

        const rewritten = rewriter(entry);
        if (rewritten) {
          nextEntries.push(rewritten);
        }
        fieldChanged = true;
      }

      if (!fieldChanged) {
        return full;
      }

      changed = true;
      if (nextEntries.length === 0) {
        return '';
      }

      return this.formatDescriptionDependencyField(fieldName, nextEntries);
    });

    if (!changed) {
      return text;
    }

    return updatedText.replace(/\n{3,}/g, '\n\n').trimEnd() + (text.endsWith('\n') ? '\n' : '');
  }

  private formatDescriptionDependencyField(
    fieldName: string,
    entries: Array<{ name: string; versionSpecifier?: string }>
  ): string {
    const formattedEntries = entries.map((entry) => {
      if (!entry.versionSpecifier || entry.versionSpecifier === '*') {
        return entry.name;
      }
      return `${entry.name} (${entry.versionSpecifier})`;
    });

    if (formattedEntries.length === 1) {
      return `${fieldName}: ${formattedEntries[0]}`;
    }

    return `${fieldName}: ${formattedEntries[0]},\n    ${formattedEntries.slice(1).join(',\n    ')}`;
  }

  private readXmlAttribute(attrs: string, name: string): string | undefined {
    const match = attrs.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]+)"`, 'i'));
    return match?.[1]?.trim();
  }

  private readXmlElementText(body: string, elementName: string): string | undefined {
    const match = body.match(new RegExp(`<${elementName}>\\s*([^<]+?)\\s*</${elementName}>`, 'i'));
    return match?.[1]?.trim();
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

  private parseGemfileDeclarations(
    content: string
  ): Array<{ name: string; versionSpecifier?: string; type: DependencyType }> {
    const declarations: Array<{ name: string; versionSpecifier?: string; type: DependencyType }> = [];
    const groupStack: DependencyType[] = ['dependencies'];

    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) {
        continue;
      }

      const groupMatch = line.match(/^group\s+(.+?)\s+do\s*$/);
      if (groupMatch) {
        groupStack.push(this.mapRubyGroupsToDependencyType(groupMatch[1]));
        continue;
      }

      if (line === 'end' && groupStack.length > 1) {
        groupStack.pop();
        continue;
      }

      const gemMatch = rawLine.match(/^\s*gem\s+['"]([^'"]+)['"]\s*(?:,\s*(['"][^'"]+['"]|%q\{[^}]+\}|%Q\{[^}]+\}|[~><=\s\d.,-]+))?(.*)$/);
      if (!gemMatch) {
        continue;
      }

      const name = gemMatch[1]?.trim();
      if (!name) {
        continue;
      }

      const explicitGroupType = this.extractRubyDependencyType(gemMatch[3] || '');
      const versionSpecifier = gemMatch[2]?.trim().replace(/^['"]|['"]$/g, '');

      declarations.push({
        name,
        versionSpecifier,
        type: explicitGroupType || groupStack[groupStack.length - 1] || 'dependencies',
      });
    }

    return declarations;
  }

  private parseGemfileLockVersions(content: string): Map<string, string> {
    const versions = new Map<string, string>();
    let inSpecs = false;

    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.replace(/\r$/, '');
      if (/^\s{2}specs:\s*$/.test(line)) {
        inSpecs = true;
        continue;
      }

      if (inSpecs && /^[A-Z][A-Z\s_-]*$/.test(line.trim())) {
        inSpecs = false;
        continue;
      }

      if (!inSpecs) {
        continue;
      }

      const match = line.match(/^\s{4}([^\s(]+)\s+\(([^)]+)\)/);
      if (match) {
        versions.set(match[1], match[2]);
      }
    }

    return versions;
  }

  private dedupeInstalledPackages(packages: InstalledPackage[]): InstalledPackage[] {
    const seen = new Set<string>();
    return packages.filter((pkg) => {
      const key = `${pkg.packageJsonPath}:${pkg.type}:${pkg.name}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  private extractRubyDependencyType(optionsText: string): DependencyType | null {
    const normalized = optionsText.toLowerCase();
    if (
      /group:\s*:development\b/.test(normalized) ||
      /group:\s*:test\b/.test(normalized) ||
      /groups:\s*\[[^\]]*:(development|test)/.test(normalized)
    ) {
      return 'devDependencies';
    }
    return null;
  }

  private mapRubyGroupsToDependencyType(groupsText: string): DependencyType {
    return /:(development|test)\b/.test(groupsText.toLowerCase()) ? 'devDependencies' : 'dependencies';
  }

  private readComposerDependencyMap(value: unknown): Map<string, string> {
    return new Map(Object.entries(this.readComposerDependencyObject(value)));
  }

  private readComposerDependencyObject(value: unknown): Record<string, string> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, string] => typeof entry[0] === 'string' && typeof entry[1] === 'string'
      )
    );
  }

  private isComposerPlatformPackage(name: string): boolean {
    const normalized = name.toLowerCase();
    return normalized === 'php' ||
      normalized.startsWith('ext-') ||
      normalized.startsWith('lib-') ||
      normalized === 'composer-plugin-api' ||
      normalized === 'composer-runtime-api' ||
      normalized === 'composer-api';
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.fileWatcher?.dispose();
    this._onDidChangePackages.dispose();
  }
}
