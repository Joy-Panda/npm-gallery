import * as vscode from 'vscode';
import { getServices } from '../services';
import type { InstalledPackage, DependencyType } from '../types/package';

/**
 * Tree item for dependency category (dependencies, devDependencies, etc.)
 */
class CategoryTreeItem extends vscode.TreeItem {
  constructor(public readonly category: DependencyType, public readonly count: number) {
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
type TreeItem = CategoryTreeItem | PackageTreeItem;

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

  getTreeItem(element: TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: TreeItem): Promise<TreeItem[]> {
    // Root level: return category items
    if (!element) {
      const categories: DependencyType[] = [
        'dependencies',
        'devDependencies',
        'peerDependencies',
        'optionalDependencies',
      ];

      return categories
        .map((category) => {
          const count = this.packages.filter((pkg) => pkg.type === category).length;
          return count > 0 ? new CategoryTreeItem(category, count) : null;
        })
        .filter((item): item is CategoryTreeItem => item !== null);
    }

    // Category level: return packages in this category
    if (element instanceof CategoryTreeItem) {
      const categoryPackages = this.packages
        .filter((pkg) => pkg.type === element.category)
        .sort((a, b) => a.name.localeCompare(b.name));

      const services = getServices();
      const packageItems = await Promise.all(
        categoryPackages.map(async (pkg) => {
          const cacheKey = `${pkg.name}@${pkg.currentVersion}`;
          let cached = this.dependencyCache.get(cacheKey);

          if (!cached) {
            const hasDependencies = await services.package.hasPackageDependencies(
              pkg.name,
              pkg.currentVersion
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
      const cacheKey = `${element.pkg.name}@${element.pkg.currentVersion}`;
      let cached = this.dependencyCache.get(cacheKey);

      if (!cached || !cached.loaded) {
        try {
          const services = getServices();
          const dependencies = await services.package.getPackageDependencies(
            element.pkg.name,
            element.pkg.currentVersion
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
          const version = depVersion.replace(/^[\^~>=<]+/, '');
          const dependencyCacheKey = `${depName}@${version}`;
          let childCached = this.dependencyCache.get(dependencyCacheKey);

          if (!childCached) {
            const hasDependencies = await services.package.hasPackageDependencies(depName, version);
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

  dispose(): void {
    this._onDidChangeTreeData.dispose();
    this.dependencyCache.clear();
  }
}
