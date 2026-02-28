import * as vscode from 'vscode';
import { getServices } from '../services';
import type { InstalledPackage, DependencyType, WorkspacePackageScope } from '../types/package';
import { parseDependencySpec } from '../utils/version-utils';

class WorkspaceTreeItem extends vscode.TreeItem {
  constructor(public readonly workspaceFolderPath: string, label: string, public readonly count: number) {
    super(label, vscode.TreeItemCollapsibleState.Collapsed);

    this.description = `${count} package${count !== 1 ? 's' : ''}`;
    this.tooltip = workspaceFolderPath;
    this.contextValue = 'workspaceGroup';
    this.iconPath = new vscode.ThemeIcon('root-folder');
  }
}

class ManifestTreeItem extends vscode.TreeItem {
  constructor(public readonly manifestPath: string, label: string, public readonly count: number) {
    super(label, vscode.TreeItemCollapsibleState.Collapsed);

    this.description = `${count} package${count !== 1 ? 's' : ''}`;
    this.tooltip = vscode.workspace.asRelativePath(manifestPath) || manifestPath;
    this.contextValue = 'manifestGroup';
    this.iconPath = new vscode.ThemeIcon('folder-library');
  }
}

/**
 * Tree item for dependency category (dependencies, devDependencies, etc.)
 */
class CategoryTreeItem extends vscode.TreeItem {
  constructor(
    public readonly category: DependencyType,
    public readonly count: number,
    public readonly manifestPath?: string
  ) {
    super(category, vscode.TreeItemCollapsibleState.Collapsed);

    this.description = `${count} package${count !== 1 ? 's' : ''}`;
    this.tooltip = `${category}: ${count} package${count !== 1 ? 's' : ''}`;
    this.contextValue = 'dependencyCategory';

    // Set icon based on dependency type
    const iconMap: Record<DependencyType, string> = {
      dependencies: 'package',
      devDependencies: 'tools',
      peerDependencies: 'link',
      optionalDependencies: 'question',
    };

    this.iconPath = new vscode.ThemeIcon(iconMap[category] || 'package');
  }
}

/**
 * Tree item for installed package with dependency support
 */
class PackageTreeItem extends vscode.TreeItem {
  constructor(
    public readonly pkg: InstalledPackage,
    public readonly hasDependencies: boolean = true,
    public readonly dependenciesLoaded: boolean = false,
    public readonly dependencies?: Record<string, string>
  ) {
    // Set collapsible state: Collapsed if has dependencies, None if not
    // VS Code will automatically align items, but we use resourceUri for consistent spacing
    super(
      pkg.name,
      hasDependencies ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
    );

    this.description = pkg.currentVersion;
    this.tooltip = `${pkg.name}@${pkg.currentVersion}\n${pkg.type}${hasDependencies ? '\nHas dependencies' : ''}`;
    this.contextValue = 'installedPackage';

    // Use resourceUri to ensure consistent spacing for alignment
    // This helps maintain alignment even when some items have expand icons and others don't
    this.resourceUri = vscode.Uri.parse(`npm-package://${pkg.name}@${pkg.currentVersion}`);

    // Set icon based on dependency type
    const iconMap: Record<DependencyType, string> = {
      dependencies: 'package',
      devDependencies: 'tools',
      peerDependencies: 'link',
      optionalDependencies: 'question',
    };

    this.iconPath = new vscode.ThemeIcon(iconMap[pkg.type] || 'package');
  }
}

/**
 * Union type for tree items
 */
type TreeItem = WorkspaceTreeItem | ManifestTreeItem | CategoryTreeItem | PackageTreeItem;

interface DependencyCacheEntry {
  dependencies?: Record<string, string>;
  hasDependencies: boolean;
  loaded: boolean;
}

/**
 * Tree data provider for installed packages
 */
export class InstalledPackagesProvider implements vscode.TreeDataProvider<TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private packages: InstalledPackage[] = [];
  private dependencyCache = new Map<string, DependencyCacheEntry>();

  constructor() {
    this.refresh();
  }

  /**
   * Refresh the tree view
   */
  async refresh(): Promise<void> {
    const services = getServices();
    this.packages = await services.workspace.getInstalledPackages();
    this.dependencyCache.clear(); // Clear cache on refresh
    this._onDidChangeTreeData.fire(undefined);
  }

  async refreshScope(scope: WorkspacePackageScope, skipWorkspaceRefresh = false): Promise<void> {
    const services = getServices();
    const scopedPackages = skipWorkspaceRefresh
      ? await services.workspace.getInstalledPackagesForScope(scope)
      : await services.workspace.refreshInstalledPackages(scope);
    const remainingPackages = this.packages.filter((pkg) => !this.matchesScope(pkg, scope));
    this.packages = [...remainingPackages, ...scopedPackages];
    this.dependencyCache.clear();
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: TreeItem): Promise<TreeItem[]> {
    // Root level: return category items
    if (!element) {
      if (this.shouldGroupByWorkspace()) {
        return this.getWorkspaceItems();
      }

      if (this.shouldGroupByManifest()) {
        return this.getManifestItems();
      }

      return this.getCategoryItems(this.packages);
    }

    if (element instanceof WorkspaceTreeItem) {
      const workspacePackages = this.packages.filter(
        (pkg) => pkg.workspaceFolderPath === element.workspaceFolderPath
      );

      if (this.shouldGroupByManifest(workspacePackages)) {
        return this.getManifestItems(workspacePackages);
      }

      return this.getCategoryItems(workspacePackages);
    }

    if (element instanceof ManifestTreeItem) {
      return this.getCategoryItems(
        this.packages.filter((pkg) => pkg.packageJsonPath === element.manifestPath),
        element.manifestPath
      );
    }

    // Category level: return packages in this category
    if (element instanceof CategoryTreeItem) {
      const sourcePackages = element.manifestPath
        ? this.packages.filter(
            (pkg) => pkg.type === element.category && pkg.packageJsonPath === element.manifestPath
          )
        : this.packages.filter((pkg) => pkg.type === element.category);

      const categoryPackages = sourcePackages.sort((a, b) => a.name.localeCompare(b.name));

      const services = getServices();
      const packageItems = await Promise.all(
        categoryPackages.map(async (pkg) => {
          const packageVersion = pkg.resolvedVersion || pkg.currentVersion;
          const cacheKey = `${pkg.name}@${packageVersion}`;
          let cached = this.dependencyCache.get(cacheKey);

          if (!cached) {
            const hasDependencies = await services.package.hasPackageDependencies(
              pkg.name,
              pkg.resolvedVersion,
              pkg.packageJsonPath
            );

            if (hasDependencies !== null) {
              cached = {
                hasDependencies,
                loaded: false,
              };
              this.dependencyCache.set(cacheKey, cached);
            }
          }

          return new PackageTreeItem(
            pkg,
            cached?.hasDependencies ?? true,
            cached?.loaded ?? false,
            cached?.dependencies
          );
        })
      );

      return packageItems;
    }

    // Package level: return sub-dependencies
    if (element instanceof PackageTreeItem) {
      const packageVersion = element.pkg.resolvedVersion || element.pkg.currentVersion;
      const cacheKey = `${element.pkg.name}@${packageVersion}`;
      let cached = this.dependencyCache.get(cacheKey);

      if (!cached || !cached.loaded) {
        try {
          const services = getServices();
          const dependencies = await services.package.getPackageDependencies(
            element.pkg.name,
            element.pkg.resolvedVersion,
            element.pkg.packageJsonPath
          );
          const hasDependencies = !!dependencies && Object.keys(dependencies).length > 0;

          cached = {
            dependencies: dependencies || undefined,
            hasDependencies,
            loaded: true,
          };
        } catch {
          cached = {
            hasDependencies: false,
            loaded: true,
          };
        }

        this.dependencyCache.set(cacheKey, cached);
        this._onDidChangeTreeData.fire(element);
      }

      if (!cached.hasDependencies || !cached.dependencies) {
        return [];
      }

      const services = getServices();
      const children = await Promise.all(
        Object.entries(cached.dependencies).map(async ([depName, depVersion]) => {
          const parsedSpec = parseDependencySpec(depVersion);
          const version = parsedSpec.normalizedVersion || parsedSpec.displayText;
          const dependencyCacheKey = `${depName}@${version}`;
          let childCached = this.dependencyCache.get(dependencyCacheKey);

          if (!childCached) {
            const hasDependencies = await services.package.hasPackageDependencies(
              depName,
              parsedSpec.normalizedVersion,
              element.pkg.packageJsonPath
            );
            if (hasDependencies !== null) {
              childCached = {
                hasDependencies,
                loaded: false,
              };
              this.dependencyCache.set(dependencyCacheKey, childCached);
            }
          }

          const subPkg: InstalledPackage = {
            name: depName,
            currentVersion: version,
            resolvedVersion: parsedSpec.normalizedVersion,
            versionSpecifier: parsedSpec.raw,
            specKind: parsedSpec.kind,
            isRegistryResolvable: parsedSpec.isRegistryResolvable,
            type: 'dependencies',
            hasUpdate: false,
            packageJsonPath: element.pkg.packageJsonPath,
          };

          return new PackageTreeItem(
            subPkg,
            childCached?.hasDependencies ?? true,
            childCached?.loaded ?? false,
            childCached?.dependencies
          );
        })
      );

      return children.sort((a, b) => a.pkg.name.localeCompare(b.pkg.name));
    }

    // No children
    return [];
  }

  private shouldGroupByWorkspace(): boolean {
    return new Set(this.packages.map((pkg) => pkg.workspaceFolderPath).filter(Boolean)).size > 1;
  }

  private shouldGroupByManifest(packages: InstalledPackage[] = this.packages): boolean {
    return new Set(packages.map((pkg) => pkg.packageJsonPath)).size > 1;
  }

  private getWorkspaceItems(): WorkspaceTreeItem[] {
    const counts = new Map<string, number>();
    for (const pkg of this.packages) {
      if (!pkg.workspaceFolderPath) {
        continue;
      }
      counts.set(pkg.workspaceFolderPath, (counts.get(pkg.workspaceFolderPath) || 0) + 1);
    }

    const preferredLabels = new Map<string, string>();
    for (const workspaceFolderPath of counts.keys()) {
      preferredLabels.set(workspaceFolderPath, this.getPreferredWorkspaceLabel(workspaceFolderPath));
    }

    const duplicateLabels = new Set<string>();
    const labelCounts = new Map<string, number>();
    for (const label of preferredLabels.values()) {
      labelCounts.set(label, (labelCounts.get(label) || 0) + 1);
    }
    for (const [label, count] of labelCounts.entries()) {
      if (count > 1) {
        duplicateLabels.add(label);
      }
    }

    return [...counts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([workspaceFolderPath, count]) => {
        const preferredLabel = preferredLabels.get(workspaceFolderPath) || workspaceFolderPath;
        const label = duplicateLabels.has(preferredLabel)
          ? (vscode.workspace.asRelativePath(workspaceFolderPath, false) || workspaceFolderPath)
          : preferredLabel;
        return new WorkspaceTreeItem(workspaceFolderPath, label, count);
      });
  }

  private getPreferredWorkspaceLabel(workspaceFolderPath: string): string {
    const normalized = workspaceFolderPath.replace(/\\/g, '/');
    const segments = normalized.split('/').filter(Boolean);
    return segments[segments.length - 1] || workspaceFolderPath;
  }

  private getManifestItems(packages: InstalledPackage[] = this.packages): ManifestTreeItem[] {
    const counts = new Map<string, number>();
    const preferredLabels = new Map<string, string>();
    for (const pkg of packages) {
      counts.set(pkg.packageJsonPath, (counts.get(pkg.packageJsonPath) || 0) + 1);
      if (!preferredLabels.has(pkg.packageJsonPath)) {
        preferredLabels.set(pkg.packageJsonPath, this.getPreferredManifestLabel(pkg));
      }
    }

    const duplicateLabels = new Set<string>();
    const labelCounts = new Map<string, number>();
    for (const label of preferredLabels.values()) {
      labelCounts.set(label, (labelCounts.get(label) || 0) + 1);
    }
    for (const [label, count] of labelCounts.entries()) {
      if (count > 1) {
        duplicateLabels.add(label);
      }
    }

    return [...counts.entries()]
      .sort(([a], [b]) => (vscode.workspace.asRelativePath(a) || a).localeCompare(vscode.workspace.asRelativePath(b) || b))
      .map(([manifestPath, count]) => {
        const preferredLabel = preferredLabels.get(manifestPath) || (vscode.workspace.asRelativePath(manifestPath) || manifestPath);
        const label = duplicateLabels.has(preferredLabel)
          ? (vscode.workspace.asRelativePath(manifestPath) || manifestPath)
          : preferredLabel;
        return new ManifestTreeItem(manifestPath, label, count);
      });
  }

  private getPreferredManifestLabel(pkg: InstalledPackage): string {
    if (pkg.manifestName?.trim()) {
      return pkg.manifestName.trim();
    }

    const relativePath = vscode.workspace.asRelativePath(pkg.packageJsonPath) || pkg.packageJsonPath;
    const normalized = relativePath.replace(/\\/g, '/');
    const segments = normalized.split('/').filter(Boolean);
    if (segments.length >= 2) {
      return segments[segments.length - 2];
    }
    return relativePath;
  }

  private getCategoryItems(packages: InstalledPackage[], manifestPath?: string): CategoryTreeItem[] {
      const categories: DependencyType[] = [
        'dependencies',
        'devDependencies',
        'peerDependencies',
        'optionalDependencies',
      ];

      return categories
        .map((category) => {
          const count = packages.filter((pkg) => pkg.type === category).length;
          return count > 0 ? new CategoryTreeItem(category, count, manifestPath) : null;
        })
        .filter((item): item is CategoryTreeItem => item !== null);
  }

  private matchesScope(pkg: InstalledPackage, scope: WorkspacePackageScope): boolean {
    if (scope.manifestPath) {
      return pkg.packageJsonPath === scope.manifestPath;
    }

    if (scope.workspaceFolderPath) {
      return pkg.workspaceFolderPath === scope.workspaceFolderPath;
    }

    return true;
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
    this.dependencyCache.clear();
  }
}
