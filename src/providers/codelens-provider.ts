import * as vscode from 'vscode';
import { getServices } from '../services';
import { isNewerVersion } from '../utils/version-utils';

/**
 * Provides CodeLens for package updates in package.json, pom.xml, and Gradle files
 */
export class PackageCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  private latestVersions = new Map<string, string>();

  /**
   * Refresh CodeLenses
   */
  refresh(): void {
    this.latestVersions.clear();
    this._onDidChangeCodeLenses.fire();
  }

  async provideCodeLenses(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): Promise<vscode.CodeLens[]> {
    const fileName = document.fileName.toLowerCase();
    const text = document.getText();

    // Handle package.json
    if (fileName.endsWith('package.json')) {
      return this.provideCodeLensesForPackageJson(document, text);
    }

    // Handle pom.xml
    if (fileName.endsWith('pom.xml')) {
      return this.provideCodeLensesForPomXml(document, text);
    }

    // Handle Gradle files
    if (fileName.endsWith('build.gradle') || fileName.endsWith('build.gradle.kts')) {
      return this.provideCodeLensesForGradle(document, text);
    }

    return [];
  }

  /**
   * Provide CodeLenses for package.json
   */
  private async provideCodeLensesForPackageJson(
    document: vscode.TextDocument,
    text: string
  ): Promise<vscode.CodeLens[]> {
    const codeLenses: vscode.CodeLens[] = [];

    try {
      const packageJson = JSON.parse(text);
      const depSections = ['dependencies', 'devDependencies', 'peerDependencies'];

      for (const section of depSections) {
        if (packageJson[section]) {
          const sectionLenses = await this.getCodeLensesForNpmSection(
            document,
            text,
            section,
            packageJson[section]
          );
          codeLenses.push(...sectionLenses);
        }
      }
    } catch {
      // Invalid JSON, skip
    }

    return codeLenses;
  }

  /**
   * Provide CodeLenses for pom.xml
   */
  private async provideCodeLensesForPomXml(
    document: vscode.TextDocument,
    text: string
  ): Promise<vscode.CodeLens[]> {
    const codeLenses: vscode.CodeLens[] = [];
    const services = getServices();

    // Extract dependencies from pom.xml
    const dependencyRegex = /<dependency>([\s\S]*?)<\/dependency>/g;
    let dependencyMatch;
    const updatePromises: Promise<void>[] = [];

    while ((dependencyMatch = dependencyRegex.exec(text)) !== null) {
      const depContent = dependencyMatch[1];
      const groupIdMatch = depContent.match(/<groupId>(.*?)<\/groupId>/);
      const artifactIdMatch = depContent.match(/<artifactId>(.*?)<\/artifactId>/);
      const versionMatch = depContent.match(/<version>(.*?)<\/version>/);

      if (groupIdMatch && artifactIdMatch && versionMatch) {
        const groupId = groupIdMatch[1].trim();
        const artifactId = artifactIdMatch[1].trim();
        const currentVersion = versionMatch[1].trim();
        const coordinate = `${groupId}:${artifactId}`;

        updatePromises.push(
          (async () => {
            try {
              let latestVersion = this.latestVersions.get(coordinate);

              if (!latestVersion) {
                const version = await services.package.getLatestVersion(coordinate);
                if (version) {
                  latestVersion = version;
                  this.latestVersions.set(coordinate, latestVersion);
                }
              }

              if (latestVersion && isNewerVersion(currentVersion, latestVersion)) {
                // Find the position of the version tag
                const versionTagStart = dependencyMatch.index! + depContent.indexOf('<version>');
                const position = document.positionAt(versionTagStart);
                const range = new vscode.Range(position, position);

                codeLenses.push(
                  new vscode.CodeLens(range, {
                    title: `⬆️ Update to ${latestVersion}`,
                    command: 'npmGallery.updateMavenDependency',
                    arguments: [document.uri.fsPath, groupId, artifactId, latestVersion],
                  })
                );
              }
            } catch {
              // Skip packages that fail
            }
          })()
        );
      }
    }

    await Promise.all(updatePromises);
    return codeLenses;
  }

  /**
   * Provide CodeLenses for Gradle files
   */
  private async provideCodeLensesForGradle(
    document: vscode.TextDocument,
    text: string
  ): Promise<vscode.CodeLens[]> {
    const codeLenses: vscode.CodeLens[] = [];
    const services = getServices();

    // Match Gradle dependency declarations
    // Supports: implementation 'groupId:artifactId:version'
    //           testImplementation 'groupId:artifactId:version'
    //           compileOnly 'groupId:artifactId:version'
    //           etc.
    const gradleDepRegex = /(?:implementation|testImplementation|compileOnly|runtimeOnly|api|compile)\s+['"]([^:]+):([^:]+):([^'"]+)['"]/g;
    let depMatch;
    const updatePromises: Promise<void>[] = [];

    while ((depMatch = gradleDepRegex.exec(text)) !== null) {
      const groupId = depMatch[1];
      const artifactId = depMatch[2];
      const currentVersion = depMatch[3];
      const coordinate = `${groupId}:${artifactId}`;
      const matchIndex = depMatch.index;

      updatePromises.push(
        (async () => {
          try {
            let latestVersion = this.latestVersions.get(coordinate);

            if (!latestVersion) {
              const version = await services.package.getLatestVersion(coordinate);
              if (version) {
                latestVersion = version;
                this.latestVersions.set(coordinate, latestVersion);
              }
            }

            if (latestVersion && isNewerVersion(currentVersion, latestVersion)) {
              // Find the position of the version in the dependency line
              const versionStart = matchIndex + depMatch[0].lastIndexOf(':') + 1;
              const position = document.positionAt(versionStart);
              const range = new vscode.Range(position, position);

              codeLenses.push(
                new vscode.CodeLens(range, {
                  title: `⬆️ Update to ${latestVersion}`,
                  command: 'npmGallery.updateGradleDependency',
                  arguments: [document.uri.fsPath, groupId, artifactId, latestVersion],
                })
              );
            }
          } catch {
            // Skip packages that fail
          }
        })()
      );
    }

    await Promise.all(updatePromises);
    return codeLenses;
  }

  async resolveCodeLens(
    codeLens: vscode.CodeLens,
    _token: vscode.CancellationToken
  ): Promise<vscode.CodeLens> {
    return codeLens;
  }

  /**
   * Get CodeLenses for an npm dependency section
   */
  private async getCodeLensesForNpmSection(
    document: vscode.TextDocument,
    text: string,
    section: string,
    deps: Record<string, string>
  ): Promise<vscode.CodeLens[]> {
    const codeLenses: vscode.CodeLens[] = [];
    const services = getServices();

    // Find section in document
    const sectionRegex = new RegExp(`"${section}"\\s*:\\s*\\{`);
    const sectionMatch = text.match(sectionRegex);

    if (!sectionMatch || sectionMatch.index === undefined) {
      return [];
    }

    // Get updates count
    let updatesCount = 0;
    const updatePromises: Promise<void>[] = [];

    for (const [name, currentVersionRange] of Object.entries(deps)) {
      const currentVersion = currentVersionRange.replace(/^[\^~>=<]+/, '');

      updatePromises.push(
        (async () => {
          try {
            let latestVersion = this.latestVersions.get(name);

            if (!latestVersion) {
              const version = await services.package.getLatestVersion(name);
              if (version) {
                latestVersion = version;
                this.latestVersions.set(name, latestVersion);
              }
            }

            if (latestVersion && isNewerVersion(currentVersion, latestVersion)) {
              updatesCount++;

              // Add CodeLens for individual package
              const packageRegex = new RegExp(`"${this.escapeRegex(name)}"\\s*:\\s*"[^"]+"`);
              const packageMatch = text.match(packageRegex);

              if (packageMatch && packageMatch.index !== undefined) {
                const position = document.positionAt(packageMatch.index);
                const range = new vscode.Range(position, position);

                codeLenses.push(
                  new vscode.CodeLens(range, {
                    title: `⬆️ Update to ${latestVersion}`,
                    command: 'npmGallery.updatePackage',
                    arguments: [name, latestVersion],
                  })
                );
              }
            }
          } catch {
            // Skip packages that fail
          }
        })()
      );
    }

    await Promise.all(updatePromises);

    // Add section-level CodeLens if there are updates
    if (updatesCount > 0) {
      const sectionPosition = document.positionAt(sectionMatch.index);
      const sectionRange = new vscode.Range(sectionPosition, sectionPosition);

      codeLenses.unshift(
        new vscode.CodeLens(sectionRange, {
          title: `${updatesCount} update${updatesCount > 1 ? 's' : ''} available`,
          command: 'npmGallery.updateAllPackages',
          arguments: [section],
        })
      );
    }

    return codeLenses;
  }


  /**
   * Escape regex special characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  dispose(): void {
    this._onDidChangeCodeLenses.dispose();
  }
}
