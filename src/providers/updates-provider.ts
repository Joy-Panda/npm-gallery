import * as vscode from 'vscode';
import { getServices } from '../services';
import type { InstalledPackage, DependencyType } from '../types/package';

class UpdateCategoryTreeItem extends vscode.TreeItem {
  constructor(public readonly category: DependencyType, public readonly count: number) {
    super(category, vscode.TreeItemCollapsibleState.Collapsed);

    this.description = `${count} package${count !== 1 ? 's' : ''}`;
    this.tooltip = `${category}: ${count} update${count !== 1 ? 's' : ''}`;
    this.contextValue = 'updateCategory';

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
 * Tree item for updatable package
 */
class UpdateTreeItem extends vscode.TreeItem {
  constructor(public readonly pkg: InstalledPackage) {
    super(pkg.name, vscode.TreeItemCollapsibleState.None);

    this.description = `${pkg.currentVersion} → ${pkg.latestVersion}`;
    this.tooltip = `Update ${pkg.name}\nCurrent: ${pkg.currentVersion}\nLatest: ${pkg.latestVersion}\nType: ${pkg.updateType}`;
    this.contextValue = 'updatablePackage';

    // Set icon based on update type
    const iconMap: Record<string, vscode.ThemeIcon> = {
      major: new vscode.ThemeIcon('warning', new vscode.ThemeColor('editorWarning.foreground')),
      minor: new vscode.ThemeIcon('arrow-up', new vscode.ThemeColor('editorInfo.foreground')),
      patch: new vscode.ThemeIcon('arrow-small-up'),
    };

    this.iconPath = iconMap[pkg.updateType || 'patch'] || new vscode.ThemeIcon('arrow-up');
  }
}

type TreeItem = UpdateCategoryTreeItem | UpdateTreeItem;

/**
 * Tree data provider for packages with updates
 */
export class UpdatesProvider implements vscode.TreeDataProvider<TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private packages: InstalledPackage[] = [];
  private isLoading = false;

  constructor() {
    // Initial load
    this.refresh();
  }

  /**
   * Refresh the tree view
   */
  async refresh(): Promise<void> {
    if (this.isLoading) return;

    this.isLoading = true;

    try {
      const services = getServices();
      this.packages = await services.workspace.getUpdatablePackages();
    } catch {
      this.packages = [];
    } finally {
      this.isLoading = false;
      this._onDidChangeTreeData.fire(undefined);
    }
  }

  getTreeItem(element: TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: TreeItem): Promise<TreeItem[]> {
    if (this.isLoading) {
      return [];
    }

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
          return count > 0 ? new UpdateCategoryTreeItem(category, count) : null;
        })
        .filter((item): item is UpdateCategoryTreeItem => item !== null);
    }

    if (element instanceof UpdateCategoryTreeItem) {
      const sorted = this.sortPackages(
        this.packages.filter((pkg) => pkg.type === element.category)
      );
      return sorted.map((pkg) => new UpdateTreeItem(pkg));
    }

    return [];
  }

  /**
   * Get count of available updates
   */
  getUpdateCount(): number {
    return this.packages.length;
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }

  private sortPackages(packages: InstalledPackage[]): InstalledPackage[] {
    return [...packages].sort((a, b) => {
      const order = { patch: 0, minor: 1, major: 2, prerelease: 3 };
      const updateOrderDiff =
        (order[a.updateType || 'patch'] ?? 3) - (order[b.updateType || 'patch'] ?? 3);

      if (updateOrderDiff !== 0) {
        return updateOrderDiff;
      }

      return a.name.localeCompare(b.name);
    });
  }
}
