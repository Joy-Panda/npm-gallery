import * as vscode from 'vscode';
import type { InstalledPackage, DependencyType, WorkspacePackageScope, NuGetManagementStyle } from '../types/package';
import { getServices } from './index';
import {
  formatDependencySpecDisplay,
  getUpdateType,
  parseDependencySpec,
  type ParsedDependencySpec,
} from '../utils/version-utils';
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
      '**/{package.json,pom.xml,lerna.json,nx.json,workspace.json,pnpm-workspace.yaml,Directory.Packages.props,paket.dependencies,*.cake}'
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

  /**
   * Get .NET/NuGet manifest files that list packages (for Installed / Updates views).
   * Returns Directory.Packages.props, paket.dependencies, and *.cake.
   */
  async getDotNetInstalledManifestFiles(): Promise<vscode.Uri[]> {
    const exclude = '**/node_modules/**,**/bin/**,**/obj/**,**/out/**';
    const [cpmFiles, paketFiles, cakeFiles] = await Promise.all([
      vscode.workspace.findFiles('**/Directory.Packages.props', exclude, 5),
      vscode.workspace.findFiles('**/paket.dependencies', exclude, 10),
      vscode.workspace.findFiles('**/*.cake', exclude, 20),
    ]);
    return [...cpmFiles, ...paketFiles, ...cakeFiles];
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
    const pomXmlFiles = await this.getPomXmlFiles();
    const dotnetManifestFiles = await this.getDotNetInstalledManifestFiles();
    return this.loadInstalledPackagesForUris(packageJsonFiles, pomXmlFiles, dotnetManifestFiles);
  }

  private async loadInstalledPackagesForScope(scope: WorkspacePackageScope): Promise<InstalledPackage[]> {
    const packageJsonFiles = await this.getPackageJsonFilesForScope(scope);
    const pomXmlFiles = await this.getPomXmlFilesForScope(scope);
    const dotnetManifestFiles = await this.getDotNetManifestFilesForScope(scope);
    return this.loadInstalledPackagesForUris(packageJsonFiles, pomXmlFiles, dotnetManifestFiles);
  }

  private async loadInstalledPackagesForUris(
    packageJsonFiles: vscode.Uri[],
    pomXmlFiles: vscode.Uri[],
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

    // Get .NET/NuGet packages (CPM, Paket, Cake)
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
          currentVersion: version,
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

  /**
   * Parse .cake file and extract #addin / #tool nuget refs with version
   */
  private parseCakePackages(text: string, manifestPath: string): InstalledPackage[] {
    const packages: InstalledPackage[] = [];
    const re = /#(addin|tool)\s+nuget:\?package=([^&\s]+)(?:&version=([^\s&]+))?/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const id = m[2]?.trim();
      const version = m[3]?.trim();
      if (!id) continue;
      // Only include lines that pin a version (so they appear in installed/updates)
      if (!version) continue;
      const kind = (m[1] ?? 'addin').toLowerCase();
      packages.push({
        workspaceFolderPath: vscode.workspace.getWorkspaceFolder(vscode.Uri.file(manifestPath))?.uri.fsPath,
        manifestName: kind === 'tool' ? 'Cake (tool)' : 'Cake (addin)',
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
      fileName === 'pom.xml' ||
      fileName === 'directory.packages.props' ||
      fileName === 'paket.dependencies' ||
      fileName?.endsWith('.cake')
    ) {
      return { manifestPath: uri.fsPath };
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
        `((?:implementation|testImplementation|compileOnly|runtimeOnly|api|compile)\\s+['"]${escapedGroupId}:${escapedArtifactId}:)([^'"]+)(['"])`,
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

      const escapedId = this.escapeRegex(packageId);
      // Match #addin or #tool line with package=Id and optional &version=current
      const re = new RegExp(
        `(#${kind}\\s+nuget:\\?package=${escapedId})(?:&version=[^\\s&]+)?([^\\n]*)`,
        'im'
      );
      const updatedText = text.replace(re, `$1&version=${newVersion}$2`);

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

  /**
   * Dispose resources
   */
  dispose(): void {
    this.fileWatcher?.dispose();
    this._onDidChangePackages.dispose();
  }
}
