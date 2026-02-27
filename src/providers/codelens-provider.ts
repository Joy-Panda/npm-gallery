import * as json from 'jsonc-parser/lib/esm/main.js';
import * as vscode from 'vscode';
import { getServices } from '../services';
import { getUpdateType, isNewerVersion } from '../utils/version-utils';

/**
 * Provides CodeLens for package updates in package.json, pom.xml, and Gradle files
 */
export class PackageCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  private securitySummaries = new Map<string, { total: number; critical: number; high: number }>();

  private formatUpdateTitle(latestVersion: string, updateType: string | null): string {
    return updateType && updateType !== 'patch'
      ? `⬆️ Update to ${latestVersion} (${updateType})`
      : `⬆️ Update to ${latestVersion}`;
  }

  /**
   * Refresh CodeLenses
   */
  refresh(): void {
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
    const tree = json.parseTree(text);
    if (!tree) {
      return [];
    }
    const packageJson = json.getNodeValue(tree) as Record<string, unknown> | undefined;
    if (!packageJson || typeof packageJson !== 'object') {
      return [];
    }
    const depSections = ['dependencies', 'devDependencies', 'peerDependencies'];

    for (const section of depSections) {
      const sectionDeps = packageJson[section];
      if (sectionDeps && typeof sectionDeps === 'object' && !Array.isArray(sectionDeps)) {
        const sectionLenses = await this.getCodeLensesForNpmSection(
          document,
          section,
          sectionDeps as Record<string, string>,
          tree
        );
        codeLenses.push(...sectionLenses);
      }
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
              const latestVersion = await services.package.getLatestVersion(coordinate);

              if (latestVersion && isNewerVersion(currentVersion, latestVersion)) {
                const updateType = getUpdateType(currentVersion, latestVersion);
                // Find the position of the version tag
                const versionTagStart = dependencyMatch.index! + depContent.indexOf('<version>');
                const position = document.positionAt(versionTagStart);
                const range = new vscode.Range(position, position);

                codeLenses.push(
                  new vscode.CodeLens(range, {
                    title: this.formatUpdateTitle(latestVersion, updateType),
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
            const latestVersion = await services.package.getLatestVersion(coordinate);

            if (latestVersion && isNewerVersion(currentVersion, latestVersion)) {
              const updateType = getUpdateType(currentVersion, latestVersion);
              // Find the position of the version in the dependency line
              const versionStart = matchIndex + depMatch[0].lastIndexOf(':') + 1;
              const position = document.positionAt(versionStart);
              const range = new vscode.Range(position, position);

              codeLenses.push(
                new vscode.CodeLens(range, {
                  title: this.formatUpdateTitle(latestVersion, updateType),
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
   * Get CodeLenses for an npm dependency section using jsonc-parser tree for exact key positions.
   */
  private async getCodeLensesForNpmSection(
    document: vscode.TextDocument,
    section: string,
    deps: Record<string, string>,
    tree: json.Node
  ): Promise<vscode.CodeLens[]> {
    const codeLenses: vscode.CodeLens[] = [];
    const services = getServices();
    const config = vscode.workspace.getConfiguration('npmGallery');
    const showSecurityInfo = config.get<boolean>('showSecurityInfo', true);

    const sectionValueNode = json.findNodeAtLocation(tree, [section]);
    if (!sectionValueNode || sectionValueNode.type !== 'object') {
      return [];
    }
    const sectionKeyNode = sectionValueNode.parent?.type === 'property' && sectionValueNode.parent.children?.[0]
      ? sectionValueNode.parent.children[0]
      : null;

    // Prepare bulk security query for all dependencies in this section
    const packagesForSecurity: Array<{ name: string; version: string }> = [];
    if (showSecurityInfo) {
      for (const [name, currentVersionRange] of Object.entries(deps)) {
        const currentVersion = currentVersionRange.replace(/^[\^~>=<]+/, '');
        packagesForSecurity.push({ name, version: currentVersion });
      }
    }

    let bulkSecurity: Record<string, { summary: { total: number; critical: number; high: number } } | null> = {};
    if (showSecurityInfo && packagesForSecurity.length > 0) {
      try {
        const securityResults = await services.package.getSecurityInfoBulk(packagesForSecurity);
        const mapped: typeof bulkSecurity = {};
        for (const { name, version } of packagesForSecurity) {
          const key = `${name}@${version}`;
          const sec = securityResults[key];
          mapped[key] = sec && sec.summary
            ? { summary: { total: sec.summary.total, critical: sec.summary.critical, high: sec.summary.high } }
            : null;
        }
        bulkSecurity = mapped;
      } catch {
        bulkSecurity = {};
      }
    }

    // Get updates count
    let updatesCount = 0;
    const updatePromises: Promise<void>[] = [];

    for (const [name, currentVersionRange] of Object.entries(deps)) {
      const currentVersion = currentVersionRange.replace(/^[\^~>=<]+/, '');

      updatePromises.push(
        (async () => {
          try {
            const securityKey = `${name}@${currentVersion}`;
            let securitySummary = this.securitySummaries.get(securityKey);

            const latestVersion = await services.package.getLatestVersion(name);

            // Get security summary from bulk results (no per-package OSV calls here)
            if (showSecurityInfo && !securitySummary) {
              const sec = bulkSecurity[securityKey];
              if (sec && sec.summary) {
                securitySummary = {
                  total: sec.summary.total,
                  critical: sec.summary.critical,
                  high: sec.summary.high,
                };
                this.securitySummaries.set(securityKey, securitySummary);
              }
            }

            // Use jsonc-parser to get the key node for this package (exact offset; one CodeLens per section occurrence)
            const valueNode = json.findNodeAtLocation(tree, [section, name]);
            const keyNode = valueNode?.parent?.type === 'property' && valueNode.parent.children?.[0]
              ? valueNode.parent.children[0]
              : null;

            if (keyNode) {
              const start = document.positionAt(keyNode.offset);
              const end = document.positionAt(keyNode.offset + keyNode.length);
              const range = new vscode.Range(start, end);

              // Security CodeLens
              if (showSecurityInfo && securitySummary) {
                const { total, critical, high } = securitySummary;
                let title: string;
                if (total === 0) {
                  // Green shield for fully secure dependencies
                  title = '🟢 No vulnerabilities';
                } else {
                  const parts: string[] = [];
                  if (critical > 0) {
                    parts.push(`🔴 ${critical} critical`);
                  }
                  if (high > 0) {
                    parts.push(`🟠 ${high} high`);
                  }

                  // Overall: red > orange > yellow (yellow when only moderate/low/info)
                  const overallIcon = critical > 0 ? '🔴' : high > 0 ? '🟠' : '🟡';

                  const hasCriticalOnly = critical > 0 && high === 0 && total === critical;
                  const hasHighOnly = high > 0 && critical === 0 && total === high;

                  if (hasCriticalOnly) {
                    // All vulnerabilities are critical -> avoid duplication
                    title = `${overallIcon} ${critical} critical vulns`;
                  } else if (hasHighOnly) {
                    // All vulnerabilities are high -> avoid duplication
                    title = `${overallIcon} ${high} high vulns`;
                  } else {
                    title = `${overallIcon} ${total} vulns${
                      parts.length ? ` (${parts.join(', ')})` : ''
                    }`;
                  }
                }

                codeLenses.push(
                  new vscode.CodeLens(range, {
                    title,
                    command: 'npmGallery.showPackageDetails',
                    arguments: [name, { installedVersion: currentVersion, securityOnly: true }],
                  })
                );
              }

              // Version update CodeLens
              if (latestVersion && isNewerVersion(currentVersion, latestVersion)) {
                const updateType = getUpdateType(currentVersion, latestVersion);
                updatesCount++;

                codeLenses.push(
                  new vscode.CodeLens(range, {
                    title: this.formatUpdateTitle(latestVersion, updateType),
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
    if (updatesCount > 0 && sectionKeyNode) {
      const sectionPosition = document.positionAt(sectionKeyNode.offset);
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


  dispose(): void {
    this._onDidChangeCodeLenses.dispose();
  }
}
