import * as vscode from 'vscode';
import type { InstalledPackage, DependencyType, UpdateType } from '../types/package';
import { getApiClients } from '../api/clients';

/**
 * Service for workspace package management
 */
export class WorkspaceService {
  private _onDidChangePackages = new vscode.EventEmitter<void>();
  readonly onDidChangePackages = this._onDidChangePackages.event;

  private fileWatcher: vscode.FileSystemWatcher | null = null;

  /**
   * Initialize workspace service
   */
  initialize(): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = [];

    // Watch for package.json changes
    this.fileWatcher = vscode.workspace.createFileSystemWatcher('**/package.json');

    this.fileWatcher.onDidChange(() => this._onDidChangePackages.fire());
    this.fileWatcher.onDidCreate(() => this._onDidChangePackages.fire());
    this.fileWatcher.onDidDelete(() => this._onDidChangePackages.fire());

    disposables.push(this.fileWatcher);
    disposables.push(this._onDidChangePackages);

    return disposables;
  }

  /**
   * Get all package.json files in workspace
   */
  async getPackageJsonFiles(): Promise<vscode.Uri[]> {
    return vscode.workspace.findFiles('**/package.json', '**/node_modules/**');
  }

  /**
   * Get installed packages from workspace
   */
  async getInstalledPackages(): Promise<InstalledPackage[]> {
    const packageJsonFiles = await this.getPackageJsonFiles();
    const installedPackages: InstalledPackage[] = [];

    for (const uri of packageJsonFiles) {
      try {
        const content = await vscode.workspace.fs.readFile(uri);
        const packageJson = JSON.parse(content.toString());

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
              const version = this.parseVersion(versionRange as string);
              installedPackages.push({
                name,
                currentVersion: version,
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

    return installedPackages;
  }

  /**
   * Get packages with available updates
   */
  async getUpdatablePackages(): Promise<InstalledPackage[]> {
    const installedPackages = await this.getInstalledPackages();
    const clients = getApiClients();

    // Get unique package names
    const uniqueNames = [...new Set(installedPackages.map((p) => p.name))];

    // Fetch latest versions in batches
    const latestVersions = new Map<string, string>();

    for (const name of uniqueNames) {
      try {
        const pkg = await clients.npmRegistry.getPackageAbbreviated(name);
        latestVersions.set(name, pkg['dist-tags'].latest);
      } catch {
        // Skip packages that can't be fetched
      }
    }

    // Update packages with latest version info
    return installedPackages
      .map((pkg) => {
        const latestVersion = latestVersions.get(pkg.name);
        if (latestVersion) {
          const updateType = this.getUpdateType(pkg.currentVersion, latestVersion);
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

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Parse version from version range
   */
  private parseVersion(versionRange: string): string {
    // Remove prefixes like ^, ~, >=, etc.
    return versionRange.replace(/^[\^~>=<]+/, '');
  }

  /**
   * Determine update type between versions
   */
  private getUpdateType(current: string, latest: string): UpdateType | null {
    const currentParts = current.split('.').map((p) => parseInt(p, 10) || 0);
    const latestParts = latest.split('.').map((p) => parseInt(p, 10) || 0);

    if (latestParts[0] > currentParts[0]) return 'major';
    if (latestParts[1] > currentParts[1]) return 'minor';
    if (latestParts[2] > currentParts[2]) return 'patch';

    // Check for prerelease
    if (latest.includes('-') || current.includes('-')) {
      return 'prerelease';
    }

    return null;
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.fileWatcher?.dispose();
    this._onDidChangePackages.dispose();
  }
}
