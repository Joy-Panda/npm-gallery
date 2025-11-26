import * as vscode from 'vscode';
import { getApiClients } from '../api';

/**
 * Provides CodeLens for package updates in package.json
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
    if (!document.fileName.endsWith('package.json')) {
      return [];
    }

    const codeLenses: vscode.CodeLens[] = [];
    const text = document.getText();

    try {
      const packageJson = JSON.parse(text);
      const depSections = ['dependencies', 'devDependencies', 'peerDependencies'];

      for (const section of depSections) {
        if (packageJson[section]) {
          const sectionLenses = await this.getCodeLensesForSection(
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

  async resolveCodeLens(
    codeLens: vscode.CodeLens,
    _token: vscode.CancellationToken
  ): Promise<vscode.CodeLens> {
    return codeLens;
  }

  /**
   * Get CodeLenses for a dependency section
   */
  private async getCodeLensesForSection(
    document: vscode.TextDocument,
    text: string,
    section: string,
    deps: Record<string, string>
  ): Promise<vscode.CodeLens[]> {
    const codeLenses: vscode.CodeLens[] = [];
    const clients = getApiClients();

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
              const pkg = await clients.npmRegistry.getPackageAbbreviated(name);
              latestVersion = pkg['dist-tags'].latest;
              if (latestVersion) {
                this.latestVersions.set(name, latestVersion);
              }
            }

            if (latestVersion && this.isNewerVersion(currentVersion, latestVersion)) {
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
   * Check if version b is newer than version a
   */
  private isNewerVersion(a: string, b: string): boolean {
    const partsA = a.split('.').map((p) => parseInt(p, 10) || 0);
    const partsB = b.split('.').map((p) => parseInt(p, 10) || 0);

    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
      const numA = partsA[i] || 0;
      const numB = partsB[i] || 0;

      if (numB > numA) return true;
      if (numB < numA) return false;
    }

    return false;
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
