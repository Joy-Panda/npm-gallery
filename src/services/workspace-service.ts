import * as vscode from 'vscode';
import type { InstalledPackage, DependencyType, UpdateType } from '../types/package';
import { getServices } from './index';
import { compareVersions, parseVersionComponents } from '../utils/version-utils';

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

    // Watch for package.json and pom.xml changes
    this.fileWatcher = vscode.workspace.createFileSystemWatcher('**/{package.json,pom.xml}');

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
   * Get all pom.xml files in workspace
   */
  async getPomXmlFiles(): Promise<vscode.Uri[]> {
    return vscode.workspace.findFiles('**/pom.xml', '**/target/**');
  }

  /**
   * Get installed packages from workspace (supports both npm and Maven)
   */
  async getInstalledPackages(): Promise<InstalledPackage[]> {
    const installedPackages: InstalledPackage[] = [];

    // Get npm packages
    const packageJsonFiles = await this.getPackageJsonFiles();
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

    // Get Maven packages
    const pomXmlFiles = await this.getPomXmlFiles();
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

    return installedPackages;
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
   * Get packages with available updates
   */
  async getUpdatablePackages(): Promise<InstalledPackage[]> {
    const installedPackages = await this.getInstalledPackages();
    const services = getServices();

    // Get unique package names
    const uniqueNames = [...new Set(installedPackages.map((p) => p.name))];

    // Fetch latest versions in batches
    const latestVersions = new Map<string, string>();

    for (const name of uniqueNames) {
      try {
        const latestVersion = await services.package.getLatestVersion(name);
        if (latestVersion) {
          latestVersions.set(name, latestVersion);
        }
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

  /**
   * Parse version from version range
   */
  private parseVersion(versionRange: string): string {
    // Remove prefixes like ^, ~, >=, etc.
    return versionRange.replace(/^[\^~>=<]+/, '');
  }


  /**
   * Determine update type between versions
   * Improved to handle Maven version formats
   */
  private getUpdateType(current: string, latest: string): UpdateType | null {
    const comparison = compareVersions(current, latest);
    
    // If latest is not newer, no update
    if (comparison >= 0) {
      return null;
    }

    const currentParts = parseVersionComponents(current);
    const latestParts = parseVersionComponents(latest);

    // Determine update type based on which version component changed
    if (latestParts.major > currentParts.major) {
      return 'major';
    }
    if (latestParts.minor > currentParts.minor) {
      return 'minor';
    }
    if (latestParts.patch > currentParts.patch) {
      return 'patch';
    }

    // Handle build number increments
    if (latestParts.build !== undefined && currentParts.build !== undefined) {
      if (latestParts.build > currentParts.build) {
        return 'patch'; // Build increments are treated as patch updates
      }
    }

    // Handle prerelease to release updates
    if (currentParts.prerelease && !latestParts.prerelease) {
      // Moving from prerelease to release
      if (latestParts.major > currentParts.major) return 'major';
      if (latestParts.minor > currentParts.minor) return 'minor';
      if (latestParts.patch > currentParts.patch) return 'patch';
      return 'prerelease'; // Same version, but prerelease -> release
    }

    // Handle prerelease updates
    if (currentParts.prerelease || latestParts.prerelease) {
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
