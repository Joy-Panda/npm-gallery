import * as vscode from 'vscode';
import { getServices } from '../services';
import type { InstalledPackage } from '../types/package';

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

/**
 * Tree data provider for packages with updates
 */
export class UpdatesProvider implements vscode.TreeDataProvider<UpdateTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<UpdateTreeItem | undefined>();
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

  getTreeItem(element: UpdateTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: UpdateTreeItem): Promise<UpdateTreeItem[]> {
    if (element) {
      return [];
    }

    if (this.isLoading) {
      return [];
    }

    // Sort by update type (major first, then minor, then patch)
    const sorted = [...this.packages].sort((a, b) => {
      const order = { major: 0, minor: 1, patch: 2, prerelease: 3 };
      return (order[a.updateType || 'patch'] || 3) - (order[b.updateType || 'patch'] || 3);
    });

    return sorted.map((pkg) => new UpdateTreeItem(pkg));
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
}
