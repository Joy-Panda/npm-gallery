import * as vscode from 'vscode';
import { getServices } from '../services';
import type { InstalledPackage, DependencyType, WorkspacePackageScope } from '../types/package';

class UpdateWorkspaceTreeItem extends vscode.TreeItem {
  constructor(public readonly workspaceFolderPath: string, label: string, public readonly count: number) {
    super(label, vscode.TreeItemCollapsibleState.Collapsed);

    this.description = `${count} update${count !== 1 ? 's' : ''}`;
    this.tooltip = workspaceFolderPath;
    this.contextValue = 'updateWorkspaceGroup';
    this.iconPath = new vscode.ThemeIcon('root-folder');
  }
}

class UpdateManifestTreeItem extends vscode.TreeItem {
  constructor(public readonly manifestPath: string, label: string, public readonly count: number) {
    super(label, vscode.TreeItemCollapsibleState.Collapsed);

    this.description = `${count} update${count !== 1 ? 's' : ''}`;
    this.tooltip = vscode.workspace.asRelativePath(manifestPath) || manifestPath;
    this.contextValue = 'updateManifestGroup';
    this.iconPath = new vscode.ThemeIcon('folder-library');
  }
}

class UpdateCategoryTreeItem extends vscode.TreeItem {
  constructor(
    public readonly category: DependencyType,
    public readonly count: number,
    public readonly manifestPath?: string
  ) {
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

type TreeItem = UpdateWorkspaceTreeItem | UpdateManifestTreeItem | UpdateCategoryTreeItem | UpdateTreeItem;

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

  async refreshScope(scope: WorkspacePackageScope, skipWorkspaceRefresh = false): Promise<void> {
    if (this.isLoading) return;

    this.isLoading = true;

    try {
      const services = getServices();
      if (!skipWorkspaceRefresh) {
        await services.workspace.refreshInstalledPackages(scope);
      }
      const scopedPackages = await services.workspace.getUpdatablePackages(scope);
      const remainingPackages = this.packages.filter((pkg) => !this.matchesScope(pkg, scope));
      this.packages = [...remainingPackages, ...scopedPackages];
    } catch {
      this.packages = this.packages.filter((pkg) => !this.matchesScope(pkg, scope));
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
      if (this.shouldGroupByWorkspace()) {
        return this.getWorkspaceItems();
      }

      if (this.shouldGroupByManifest()) {
        return this.getManifestItems();
      }

      return this.getCategoryItems(this.packages);
    }

    if (element instanceof UpdateWorkspaceTreeItem) {
      const workspacePackages = this.packages.filter(
        (pkg) => pkg.workspaceFolderPath === element.workspaceFolderPath
      );

      if (this.shouldGroupByManifestForPackages(workspacePackages)) {
        return this.getManifestItems(workspacePackages);
      }

      return this.getCategoryItems(workspacePackages);
    }

    if (element instanceof UpdateManifestTreeItem) {
      return this.getCategoryItems(
        this.packages.filter((pkg) => pkg.packageJsonPath === element.manifestPath),
        element.manifestPath
      );
    }

    if (element instanceof UpdateCategoryTreeItem) {
      const sorted = this.sortPackages(
        this.packages.filter(
          (pkg) =>
            pkg.type === element.category &&
            (element.manifestPath ? pkg.packageJsonPath === element.manifestPath : true)
        )
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

  private shouldGroupByManifest(): boolean {
    return this.shouldGroupByManifestForPackages(this.packages);
  }

  private shouldGroupByWorkspace(): boolean {
    return new Set(this.packages.map((pkg) => pkg.workspaceFolderPath).filter(Boolean)).size > 1;
  }

  private shouldGroupByManifestForPackages(packages: InstalledPackage[]): boolean {
    return new Set(packages.map((pkg) => pkg.packageJsonPath)).size > 1;
  }

  private getWorkspaceItems(): UpdateWorkspaceTreeItem[] {
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
        return new UpdateWorkspaceTreeItem(workspaceFolderPath, label, count);
      });
  }

  private getPreferredWorkspaceLabel(workspaceFolderPath: string): string {
    const normalized = workspaceFolderPath.replace(/\\/g, '/');
    const segments = normalized.split('/').filter(Boolean);
    return segments[segments.length - 1] || workspaceFolderPath;
  }

  private getManifestItems(packages: InstalledPackage[] = this.packages): UpdateManifestTreeItem[] {
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
        return new UpdateManifestTreeItem(manifestPath, label, count);
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

  private getCategoryItems(packages: InstalledPackage[], manifestPath?: string): UpdateCategoryTreeItem[] {
    const categories: DependencyType[] = [
      'dependencies',
      'devDependencies',
      'peerDependencies',
      'optionalDependencies',
    ];

    return categories
      .map((category) => {
        const count = packages.filter((pkg) => pkg.type === category).length;
        return count > 0 ? new UpdateCategoryTreeItem(category, count, manifestPath) : null;
      })
      .filter((item): item is UpdateCategoryTreeItem => item !== null);
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
}
