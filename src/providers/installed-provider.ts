import * as vscode from 'vscode';
import { getServices } from '../services';
import { getApiClients } from '../api';
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
    public readonly hasDependencies: boolean = false,
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

/**
 * Tree data provider for installed packages
 */
export class InstalledPackagesProvider implements vscode.TreeDataProvider<TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private packages: InstalledPackage[] = [];
  private dependencyCache = new Map<string, { dependencies?: Record<string, string>; hasDependencies: boolean }>();

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

      // Pre-check which packages have dependencies (for UI alignment)
      const packageItems = await Promise.all(
        categoryPackages.map(async (pkg) => {
          const cacheKey = `${pkg.name}@${pkg.currentVersion}`;
          let cached = this.dependencyCache.get(cacheKey);

          if (!cached) {
            // Quick check if package has dependencies without full fetch
            try {
              const clients = getApiClients();
              const pkgData = await clients.npmRegistry.getPackageAbbreviated(pkg.name);
              const versionData = pkgData.versions?.[pkg.currentVersion] || pkgData.versions?.[pkgData['dist-tags']?.latest];
              const dependencies = versionData?.dependencies;
              const hasDependencies = dependencies && Object.keys(dependencies).length > 0;

              cached = { dependencies, hasDependencies: !!hasDependencies };
              this.dependencyCache.set(cacheKey, cached);
            } catch {
              cached = { hasDependencies: false };
              this.dependencyCache.set(cacheKey, cached);
            }
          }

          return new PackageTreeItem(pkg, cached.hasDependencies, cached.dependencies);
        })
      );

      return packageItems;
    }

    // Package level: return sub-dependencies
    if (element instanceof PackageTreeItem && element.hasDependencies && element.dependencies) {
      const subDependencies: PackageTreeItem[] = [];

      for (const [depName, depVersion] of Object.entries(element.dependencies)) {
        // Extract version from range (remove ^, ~, etc.)
        const version = depVersion.replace(/^[\^~>=<]+/, '');

        // Check if this dependency has sub-dependencies
        const cacheKey = `${depName}@${version}`;
        let cached = this.dependencyCache.get(cacheKey);

        if (!cached) {
          try {
            const clients = getApiClients();
            const pkgData = await clients.npmRegistry.getPackageAbbreviated(depName);
            const versionData = pkgData.versions?.[version] || pkgData.versions?.[pkgData['dist-tags']?.latest];
            const dependencies = versionData?.dependencies;
            const hasDependencies = dependencies && Object.keys(dependencies).length > 0;

            cached = { dependencies, hasDependencies: !!hasDependencies };
            this.dependencyCache.set(cacheKey, cached);
          } catch {
            cached = { hasDependencies: false };
            this.dependencyCache.set(cacheKey, cached);
          }
        }

        // Create a temporary InstalledPackage-like object for the sub-dependency
        const subPkg: InstalledPackage = {
          name: depName,
          currentVersion: version,
          type: 'dependencies', // Sub-dependencies are always regular dependencies
          hasUpdate: false,
          packageJsonPath: element.pkg.packageJsonPath,
        };

        subDependencies.push(
          new PackageTreeItem(subPkg, cached.hasDependencies, cached.dependencies)
        );
      }

      return subDependencies.sort((a, b) => a.pkg.name.localeCompare(b.pkg.name));
    }

    // No children
    return [];
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
    this.dependencyCache.clear();
  }
}
