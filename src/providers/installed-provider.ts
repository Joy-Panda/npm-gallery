import * as vscode from 'vscode';
import { getServices } from '../services';
import type { InstalledPackage } from '../types/package';

/**
 * Tree item for installed package
 */
class PackageTreeItem extends vscode.TreeItem {
  constructor(public readonly pkg: InstalledPackage) {
    super(pkg.name, vscode.TreeItemCollapsibleState.None);

    this.description = pkg.currentVersion;
    this.tooltip = `${pkg.name}@${pkg.currentVersion}\n${pkg.type}`;
    this.contextValue = 'installedPackage';

    // Set icon based on dependency type
    const iconMap: Record<string, string> = {
      dependencies: 'package',
      devDependencies: 'tools',
      peerDependencies: 'link',
      optionalDependencies: 'question',
    };

    this.iconPath = new vscode.ThemeIcon(iconMap[pkg.type] || 'package');
  }
}

/**
 * Tree data provider for installed packages
 */
export class InstalledPackagesProvider implements vscode.TreeDataProvider<PackageTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<PackageTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private packages: InstalledPackage[] = [];

  constructor() {
    this.refresh();
  }

  /**
   * Refresh the tree view
   */
  async refresh(): Promise<void> {
    const services = getServices();
    this.packages = await services.workspace.getInstalledPackages();
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: PackageTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: PackageTreeItem): Promise<PackageTreeItem[]> {
    if (element) {
      return [];
    }

    // Flatten packages into items
    return this.packages.map((pkg) => new PackageTreeItem(pkg));
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }
}
