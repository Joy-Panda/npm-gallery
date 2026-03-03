import * as json from 'jsonc-parser/lib/esm/main.js';
import * as vscode from 'vscode';
import { getServices } from '../services';
import type { ISourceAdapter } from '../sources/base/source-adapter.interface';
import {
  formatDependencySpecDisplay,
  getUpdateType,
  isNewerVersion,
  parseDependencySpec,
} from '../utils/version-utils';
import type { WorkspacePackageScope } from '../types/package';
import { parseCakeDirectives } from '../utils/cake-utils';

interface CodeLensCacheEntry {
  version: number;
  lenses: vscode.CodeLens[];
}

/**
 * Provides CodeLens for package updates in package.json, composer.json, Gemfile,
 * pom.xml, Gradle, Directory.Packages.props (CPM), paket.dependencies (Paket), and Cake (.cake) scripts.
 */
export class PackageCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  private securitySummaries = new Map<string, { total: number; critical: number; high: number }>();
  private codeLensCache = new Map<string, CodeLensCacheEntry>();

  private formatUpdateTitle(latestVersion: string, updateType: string | null): string {
    return updateType && updateType !== 'patch'
      ? `⬆️ Update to ${latestVersion} (${updateType})`
      : `⬆️ Update to ${latestVersion}`;
  }

  private formatSecurityTitle(summary: { total: number; critical: number; high: number }): string {
    const { total, critical, high } = summary;
    if (total === 0) {
      return '🟢 No vulnerabilities';
    }

    const parts: string[] = [];
    if (critical > 0) {
      parts.push(`🔴 ${critical} critical`);
    }
    if (high > 0) {
      parts.push(`🟠 ${high} high`);
    }

    const overallIcon = critical > 0 ? '🔴' : high > 0 ? '🟠' : '🟡';
    const hasCriticalOnly = critical > 0 && high === 0 && total === critical;
    const hasHighOnly = high > 0 && critical === 0 && total === high;

    if (hasCriticalOnly) {
      return `${overallIcon} ${critical} critical vulns`;
    }
    if (hasHighOnly) {
      return `${overallIcon} ${high} high vulns`;
    }

    return `${overallIcon} ${total} vulns${parts.length ? ` (${parts.join(', ')})` : ''}`;
  }

  /**
   * Refresh CodeLenses
   */
  refresh(scope?: WorkspacePackageScope): void {
    this.invalidateCache(scope);
    this._onDidChangeCodeLenses.fire();
  }

  async provideCodeLenses(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): Promise<vscode.CodeLens[]> {
    const cacheKey = document.uri.toString();
    const cached = this.codeLensCache.get(cacheKey);
    if (cached && cached.version === document.version) {
      return cached.lenses;
    }

    const fileName = document.fileName.toLowerCase();
    const text = document.getText();

    // Handle package.json
    if (fileName.endsWith('package.json')) {
      const lenses = await this.provideCodeLensesForPackageJson(document, text);
      this.codeLensCache.set(cacheKey, { version: document.version, lenses });
      return lenses;
    }

    // Handle composer.json
    if (fileName.endsWith('composer.json')) {
      const lenses = await this.provideCodeLensesForComposerJson(document, text);
      this.codeLensCache.set(cacheKey, { version: document.version, lenses });
      return lenses;
    }

    if (fileName.endsWith('gemfile')) {
      const lenses = await this.provideCodeLensesForGemfile(document, text);
      this.codeLensCache.set(cacheKey, { version: document.version, lenses });
      return lenses;
    }

    if (fileName.endsWith('cpanfile')) {
      const lenses = await this.provideCodeLensesForCpanfile(document, text);
      this.codeLensCache.set(cacheKey, { version: document.version, lenses });
      return lenses;
    }

    if (fileName.endsWith('cpanfile.snapshot')) {
      const lenses = await this.provideCodeLensesForCpanfileSnapshot(document, text);
      this.codeLensCache.set(cacheKey, { version: document.version, lenses });
      return lenses;
    }

    if (fileName.endsWith('pubspec.yaml')) {
      const lenses = await this.provideCodeLensesForPubspecYaml(document, text);
      this.codeLensCache.set(cacheKey, { version: document.version, lenses });
      return lenses;
    }

    if (fileName.endsWith('description')) {
      const lenses = await this.provideCodeLensesForDescription(document, text);
      this.codeLensCache.set(cacheKey, { version: document.version, lenses });
      return lenses;
    }

    if (fileName.endsWith('.rproj')) {
      const lenses = await this.provideCodeLensesForRproj(document);
      this.codeLensCache.set(cacheKey, { version: document.version, lenses });
      return lenses;
    }

    if (fileName.endsWith('deps.edn')) {
      const lenses = await this.provideCodeLensesForDepsEdn(document, text);
      this.codeLensCache.set(cacheKey, { version: document.version, lenses });
      return lenses;
    }

    if (fileName.endsWith('project.clj')) {
      const lenses = await this.provideCodeLensesForProjectClj(document, text);
      this.codeLensCache.set(cacheKey, { version: document.version, lenses });
      return lenses;
    }

    if (fileName.endsWith('cargo.toml')) {
      const lenses = await this.provideCodeLensesForCargoToml(document, text);
      this.codeLensCache.set(cacheKey, { version: document.version, lenses });
      return lenses;
    }

    // Handle pom.xml
    if (fileName.endsWith('pom.xml')) {
      const lenses = await this.provideCodeLensesForPomXml(document, text);
      this.codeLensCache.set(cacheKey, { version: document.version, lenses });
      return lenses;
    }

    // Handle Gradle files
    if (fileName.endsWith('build.gradle') || fileName.endsWith('build.gradle.kts')) {
      const lenses = await this.provideCodeLensesForGradle(document, text);
      this.codeLensCache.set(cacheKey, { version: document.version, lenses });
      return lenses;
    }

    // Handle CPM Directory.Packages.props
    if (fileName.endsWith('directory.packages.props')) {
      const lenses = await this.provideCodeLensesForDirectoryPackagesProps(document, text);
      this.codeLensCache.set(cacheKey, { version: document.version, lenses });
      return lenses;
    }

    // Handle Paket paket.dependencies
    if (fileName.endsWith('paket.dependencies')) {
      const lenses = await this.provideCodeLensesForPaketDependencies(document, text);
      this.codeLensCache.set(cacheKey, { version: document.version, lenses });
      return lenses;
    }

    // Handle Cake build scripts (.cake, e.g. build.cake)
    if (fileName.endsWith('.cake')) {
      const lenses = await this.provideCodeLensesForCake(document, text);
      this.codeLensCache.set(cacheKey, { version: document.version, lenses });
      return lenses;
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
   * Provide CodeLenses for composer.json
   * Only applies to require / require-dev. suggest / provide are not installed update targets.
   */
  private async provideCodeLensesForComposerJson(
    document: vscode.TextDocument,
    text: string
  ): Promise<vscode.CodeLens[]> {
    const codeLenses: vscode.CodeLens[] = [];
    const tree = json.parseTree(text);
    if (!tree) {
      return [];
    }

    const composerJson = json.getNodeValue(tree) as Record<string, unknown> | undefined;
    if (!composerJson || typeof composerJson !== 'object') {
      return [];
    }

    const services = getServices();
    const config = vscode.workspace.getConfiguration('npmGallery');
    const showSecurityInfo = config.get<boolean>('showSecurityInfo', true);
    const packagistAdapter = services.sourceRegistry.getAdapter('packagist');
    if (!packagistAdapter) {
      return [];
    }

    const sections = ['require', 'require-dev'];
    const updatePromises: Promise<void>[] = [];

    for (const section of sections) {
      const sectionDeps = composerJson[section];
      if (!sectionDeps || typeof sectionDeps !== 'object' || Array.isArray(sectionDeps)) {
        continue;
      }

      for (const [name, versionRange] of Object.entries(sectionDeps as Record<string, string>)) {
        if (typeof versionRange !== 'string' || this.isComposerPlatformPackage(name)) {
          continue;
        }

        const valueNode = json.findNodeAtLocation(tree, [section, name]);
        const keyNode = valueNode?.parent?.type === 'property' && valueNode.parent.children?.[0]
          ? valueNode.parent.children[0]
          : null;
        if (!keyNode) {
          continue;
        }

        const parsedSpec = parseDependencySpec(versionRange);
        if (!parsedSpec.isRegistryResolvable || !parsedSpec.normalizedVersion) {
          continue;
        }

        const currentVersion = parsedSpec.normalizedVersion;
        updatePromises.push(
          (async () => {
            try {
              const range = new vscode.Range(
                document.positionAt(keyNode.offset),
                document.positionAt(keyNode.offset + keyNode.length)
              );

              if (showSecurityInfo && packagistAdapter.getSecurityInfo) {
                try {
                  const security = await packagistAdapter.getSecurityInfo(name, currentVersion);
                  if (security?.summary) {
                    codeLenses.push(
                      new vscode.CodeLens(range, {
                        title: this.formatSecurityTitle(security.summary),
                        command: 'npmGallery.showPackageDetails',
                        arguments: [name, { installedVersion: currentVersion, securityOnly: true }],
                      })
                    );
                  }
                } catch {
                  // Continue without security lens
                }
              }

              const info = await packagistAdapter.getPackageInfo(name);
              const latestVersion = info?.version ?? null;
              if (latestVersion && isNewerVersion(currentVersion, latestVersion)) {
                const updateType = getUpdateType(currentVersion, latestVersion);
                codeLenses.push(
                  new vscode.CodeLens(range, {
                    title: this.formatUpdateTitle(latestVersion, updateType),
                    command: 'npmGallery.updatePackage',
                    arguments: [{
                      pkg: {
                        name,
                        latestVersion,
                        packageJsonPath: document.uri.fsPath,
                      },
                    }],
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

  private async provideCodeLensesForGemfile(
    document: vscode.TextDocument,
    text: string
  ): Promise<vscode.CodeLens[]> {
    const codeLenses: vscode.CodeLens[] = [];
    const services = getServices();
    const config = vscode.workspace.getConfiguration('npmGallery');
    const showSecurityInfo = config.get<boolean>('showSecurityInfo', true);
    const rubygemsAdapter = services.sourceRegistry.getAdapter('rubygems');
    if (!rubygemsAdapter) {
      return [];
    }

    let lockedVersions = new Map<string, string>();
    try {
      const lockUri = vscode.Uri.joinPath(document.uri, '..', 'Gemfile.lock');
      const lockContent = await vscode.workspace.fs.readFile(lockUri);
      lockedVersions = this.parseGemfileLockVersions(lockContent.toString());
    } catch {
      lockedVersions = new Map<string, string>();
    }

    const updatePromises: Promise<void>[] = [];

    for (const match of text.matchAll(/^\s*gem\s+['"]([^'"]+)['"]\s*(?:,\s*['"]([^'"]+)['"])?/gm)) {
      const name = match[1];
      const versionRange = match[2];
      if (!name) {
        continue;
      }

      const lineText = document.lineAt(document.positionAt(match.index ?? 0).line).text;
      if (/^\s*#/.test(lineText)) {
        continue;
      }

      const currentVersion = lockedVersions.get(name) || (versionRange || '').replace(/^[~><=\s]+/, '') || undefined;
      const range = new vscode.Range(
        document.positionAt(match.index ?? 0),
        document.positionAt((match.index ?? 0) + match[0].length)
      );

      updatePromises.push(
        (async () => {
          try {
            if (showSecurityInfo && currentVersion && rubygemsAdapter.getSecurityInfo) {
              try {
                const security = await rubygemsAdapter.getSecurityInfo(name, currentVersion);
                if (security?.summary) {
                  codeLenses.push(
                    new vscode.CodeLens(range, {
                      title: this.formatSecurityTitle(security.summary),
                      command: 'npmGallery.showPackageDetails',
                      arguments: [name, { installedVersion: currentVersion, securityOnly: true }],
                    })
                  );
                }
              } catch {
                // Continue without security lens.
              }
            }

            const info = await rubygemsAdapter.getPackageInfo(name);
            const latestVersion = info?.version ?? null;
            if (currentVersion && latestVersion && isNewerVersion(currentVersion, latestVersion)) {
              const updateType = getUpdateType(currentVersion, latestVersion);
              codeLenses.push(
                new vscode.CodeLens(range, {
                  title: this.formatUpdateTitle(latestVersion, updateType),
                  command: 'npmGallery.updatePackage',
                  arguments: [{
                    pkg: {
                      name,
                      latestVersion,
                      packageJsonPath: document.uri.fsPath,
                    },
                  }],
                })
              );
            }
          } catch {
            // Skip packages that fail.
          }
        })()
      );
    }

    await Promise.all(updatePromises);
    return codeLenses;
  }

  private parseGemfileLockVersions(content: string): Map<string, string> {
    const versions = new Map<string, string>();
    let inSpecs = false;

    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.replace(/\r$/, '');
      if (/^\s{2}specs:\s*$/.test(line)) {
        inSpecs = true;
        continue;
      }

      if (inSpecs && /^[A-Z][A-Z\s_-]*$/.test(line.trim())) {
        inSpecs = false;
        continue;
      }

      if (!inSpecs) {
        continue;
      }

      const match = line.match(/^\s{4}([^\s(]+)\s+\(([^)]+)\)/);
      if (match) {
        versions.set(match[1], match[2]);
      }
    }

    return versions;
  }

  private async provideCodeLensesForCpanfile(
    document: vscode.TextDocument,
    text: string
  ): Promise<vscode.CodeLens[]> {
    const codeLenses: vscode.CodeLens[] = [];
    const services = getServices();
    const adapter = services.sourceRegistry.getAdapter('metacpan');
    if (!adapter) {
      return [];
    }

    const updatePromises: Promise<void>[] = [];
    const dependencyRegex = /^\s*(requires|recommends|suggests)\s+['"]([^'"]+)['"](?:\s*,\s*['"]([^'"]+)['"])?/gm;

    for (const match of text.matchAll(dependencyRegex)) {
      const name = match[2];
      const currentVersion = match[3];
      if (!name || !currentVersion) {
        continue;
      }
      const matchIndex = match.index ?? 0;
      const versionStart = matchIndex + match[0].lastIndexOf(currentVersion);
      const range = new vscode.Range(document.positionAt(versionStart), document.positionAt(versionStart));
      updatePromises.push(
        (async () => {
          try {
            const info = await adapter.getPackageInfo(name);
            const latestVersion = info?.version ?? null;
            if (latestVersion && isNewerVersion(currentVersion, latestVersion)) {
              const updateType = getUpdateType(currentVersion, latestVersion);
              codeLenses.push(
                new vscode.CodeLens(range, {
                  title: this.formatUpdateTitle(latestVersion, updateType),
                  command: 'npmGallery.updatePerlDependency',
                  arguments: [document.uri.fsPath, name, latestVersion],
                })
              );
            }
          } catch {
            // Skip packages that fail.
          }
        })()
      );
    }

    await Promise.all(updatePromises);
    return codeLenses;
  }

  private async provideCodeLensesForCpanfileSnapshot(
    document: vscode.TextDocument,
    text: string
  ): Promise<vscode.CodeLens[]> {
    const codeLenses: vscode.CodeLens[] = [];
    const services = getServices();
    const adapter = services.sourceRegistry.getAdapter('metacpan');
    if (!adapter) {
      return [];
    }

    const manifestPath = document.uri.fsPath.replace(/cpanfile\.snapshot$/i, 'cpanfile');
    const updatePromises: Promise<void>[] = [];
    const dependencyRegex = /distribution:\s+.+\/([A-Za-z0-9_:.-]+)-([0-9][A-Za-z0-9._-]*)/g;

    for (const match of text.matchAll(dependencyRegex)) {
      const name = match[1];
      const currentVersion = match[2];
      if (!name || !currentVersion) {
        continue;
      }

      const matchIndex = match.index ?? 0;
      const versionStart = matchIndex + match[0].lastIndexOf(currentVersion);
      const range = new vscode.Range(document.positionAt(versionStart), document.positionAt(versionStart));
      updatePromises.push(
        (async () => {
          try {
            const info = await adapter.getPackageInfo(name);
            const latestVersion = info?.version ?? null;
            if (latestVersion && isNewerVersion(currentVersion, latestVersion)) {
              const updateType = getUpdateType(currentVersion, latestVersion);
              codeLenses.push(
                new vscode.CodeLens(range, {
                  title: this.formatUpdateTitle(latestVersion, updateType),
                  command: 'npmGallery.updatePerlDependency',
                  arguments: [manifestPath, name, latestVersion],
                })
              );
            }
          } catch {
            // Skip packages that fail.
          }
        })()
      );
    }

    await Promise.all(updatePromises);
    return codeLenses;
  }

  private async provideCodeLensesForPubspecYaml(
    document: vscode.TextDocument,
    text: string
  ): Promise<vscode.CodeLens[]> {
    const codeLenses: vscode.CodeLens[] = [];
    const services = getServices();
    const config = vscode.workspace.getConfiguration('npmGallery');
    const showSecurityInfo = config.get<boolean>('showSecurityInfo', true);
    const adapter = services.sourceRegistry.getAdapter('pub-dev');
    if (!adapter) {
      return [];
    }

    const lines = text.split(/\r?\n/);
    let currentSection = '';
    const updatePromises: Promise<void>[] = [];

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex];
      const sectionMatch = line.match(/^([A-Za-z_]+):\s*$/);
      if (sectionMatch) {
        currentSection = sectionMatch[1];
        continue;
      }

      if (!this.isPubspecDependencySection(currentSection)) {
        continue;
      }

      const parsed = this.parsePubspecDependencyForCodeLens(line);
      if (!parsed || !parsed.version) {
        continue;
      }
      const currentVersion = parsed.version;

      const versionStart = line.indexOf(currentVersion);
      if (versionStart === -1) {
        continue;
      }

      const range = new vscode.Range(
        new vscode.Position(lineIndex, versionStart),
        new vscode.Position(lineIndex, versionStart)
      );

      updatePromises.push(
        (async () => {
          try {
            if (showSecurityInfo && adapter.getSecurityInfo) {
              try {
                const security = await adapter.getSecurityInfo(parsed.name, currentVersion);
                if (security?.summary) {
                  codeLenses.push(
                    new vscode.CodeLens(range, {
                      title: this.formatSecurityTitle(security.summary),
                      command: 'npmGallery.showPackageDetails',
                      arguments: [parsed.name, { installedVersion: currentVersion, securityOnly: true }],
                    })
                  );
                }
              } catch {
                // Continue without security lens.
              }
            }

            const info = await adapter.getPackageInfo(parsed.name);
            const latestVersion = info?.version ?? null;
            if (latestVersion && isNewerVersion(currentVersion, latestVersion)) {
              const updateType = getUpdateType(currentVersion, latestVersion);
              codeLenses.push(
                new vscode.CodeLens(range, {
                  title: this.formatUpdateTitle(latestVersion, updateType),
                  command: 'npmGallery.updatePubspecDependency',
                  arguments: [document.uri.fsPath, parsed.name, latestVersion],
                })
              );
            }
          } catch {
            // Skip packages that fail.
          }
        })()
      );
    }

    await Promise.all(updatePromises);
    return codeLenses;
  }

  private async provideCodeLensesForDescription(
    document: vscode.TextDocument,
    text: string
  ): Promise<vscode.CodeLens[]> {
    const codeLenses: vscode.CodeLens[] = [];
    const services = getServices();
    const adapter = services.sourceRegistry.getAdapter('cran');
    if (!adapter) {
      return [];
    }

    const updatePromises: Promise<void>[] = [];
    const fieldRegex = /^\s*(Depends|Imports|LinkingTo|Suggests|Enhances)\s*:\s*(.+)$/gim;
    let fieldMatch: RegExpExecArray | null;
    while ((fieldMatch = fieldRegex.exec(text)) !== null) {
      const dependencies = this.parseDescriptionDependenciesForCodeLens(fieldMatch[2]);
      for (const dependency of dependencies) {
        if (!dependency.version) {
          continue;
        }
        const currentVersion = dependency.version;
        const matchStart = (fieldMatch.index ?? 0) + fieldMatch[0].indexOf(dependency.rawText) + dependency.rawText.lastIndexOf(currentVersion);
        const range = new vscode.Range(document.positionAt(matchStart), document.positionAt(matchStart));
        updatePromises.push(
          (async () => {
            try {
              const info = await adapter.getPackageInfo(dependency.name);
              const latestVersion = info?.version ?? null;
              if (latestVersion && isNewerVersion(currentVersion, latestVersion)) {
                const updateType = getUpdateType(currentVersion, latestVersion);
                codeLenses.push(
                  new vscode.CodeLens(range, {
                    title: this.formatUpdateTitle(latestVersion, updateType),
                    command: 'npmGallery.updateRDependency',
                    arguments: [document.uri.fsPath, dependency.name, latestVersion],
                  })
                );
              }
            } catch {
              // Skip packages that fail.
            }
          })()
        );
      }
    }

    await Promise.all(updatePromises);
    return codeLenses;
  }

  private async provideCodeLensesForRproj(
    document: vscode.TextDocument
  ): Promise<vscode.CodeLens[]> {
    const descriptionUri = vscode.Uri.joinPath(document.uri, '..', 'DESCRIPTION');
    let descriptionText: string;

    try {
      const content = await vscode.workspace.fs.readFile(descriptionUri);
      descriptionText = content.toString();
    } catch {
      return [];
    }

    const codeLenses: vscode.CodeLens[] = [];
    const services = getServices();
    const adapter = services.sourceRegistry.getAdapter('cran');
    if (!adapter) {
      return [];
    }

    const topOfFile = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0));
    const updatePromises: Promise<void>[] = [];
    const fieldRegex = /^\s*(Depends|Imports|LinkingTo|Suggests|Enhances)\s*:\s*(.+)$/gim;
    let fieldMatch: RegExpExecArray | null;
    while ((fieldMatch = fieldRegex.exec(descriptionText)) !== null) {
      const dependencies = this.parseDescriptionDependenciesForCodeLens(fieldMatch[2]);
      for (const dependency of dependencies) {
        if (!dependency.version) {
          continue;
        }
        const currentVersion = dependency.version;

        updatePromises.push(
          (async () => {
            try {
              const info = await adapter.getPackageInfo(dependency.name);
              const latestVersion = info?.version ?? null;
              if (latestVersion && isNewerVersion(currentVersion, latestVersion)) {
                const updateType = getUpdateType(currentVersion, latestVersion);
                codeLenses.push(
                  new vscode.CodeLens(topOfFile, {
                    title: `${dependency.name}: ${this.formatUpdateTitle(latestVersion, updateType)}`,
                    command: 'npmGallery.updateRDependency',
                    arguments: [descriptionUri.fsPath, dependency.name, latestVersion],
                  })
                );
              }
            } catch {
              // Skip packages that fail.
            }
          })()
        );
      }
    }

    await Promise.all(updatePromises);
    return codeLenses;
  }

  private async provideCodeLensesForDepsEdn(
    document: vscode.TextDocument,
    text: string
  ): Promise<vscode.CodeLens[]> {
    const codeLenses: vscode.CodeLens[] = [];
    const services = getServices();
    const config = vscode.workspace.getConfiguration('npmGallery');
    const showSecurityInfo = config.get<boolean>('showSecurityInfo', true);
    const clojarsAdapter = services.sourceRegistry.getAdapter('clojars');
    if (!clojarsAdapter) {
      return [];
    }

    const updatePromises: Promise<void>[] = [];
    const dependencyRegex = /([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\s+\{[^}\n]*:mvn\/version\s+"([^"]+)"/gm;

    for (const match of text.matchAll(dependencyRegex)) {
      const name = match[1];
      const currentVersion = match[2];
      const matchIndex = match.index ?? 0;
      const versionStart = matchIndex + match[0].indexOf(`"${currentVersion}"`) + 1;
      const range = new vscode.Range(
        document.positionAt(versionStart),
        document.positionAt(versionStart)
      );

      updatePromises.push(
        this.addClojarsDependencyLenses(
          codeLenses,
          clojarsAdapter,
          showSecurityInfo,
          name,
          currentVersion,
          range,
          'npmGallery.updateDepsEdnDependency',
          [document.uri.fsPath, name]
        )
      );
    }

    await Promise.all(updatePromises);
    return codeLenses;
  }

  private async provideCodeLensesForProjectClj(
    document: vscode.TextDocument,
    text: string
  ): Promise<vscode.CodeLens[]> {
    const codeLenses: vscode.CodeLens[] = [];
    const services = getServices();
    const config = vscode.workspace.getConfiguration('npmGallery');
    const showSecurityInfo = config.get<boolean>('showSecurityInfo', true);
    const clojarsAdapter = services.sourceRegistry.getAdapter('clojars');
    if (!clojarsAdapter) {
      return [];
    }

    const updatePromises: Promise<void>[] = [];
    const dependencyRegex = /\[([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\s+"([^"]+)"/gm;

    for (const match of text.matchAll(dependencyRegex)) {
      const name = match[1];
      const currentVersion = match[2];
      const matchIndex = match.index ?? 0;
      const versionStart = matchIndex + match[0].indexOf(`"${currentVersion}"`) + 1;
      const range = new vscode.Range(
        document.positionAt(versionStart),
        document.positionAt(versionStart)
      );

      updatePromises.push(
        this.addClojarsDependencyLenses(
          codeLenses,
          clojarsAdapter,
          showSecurityInfo,
          name,
          currentVersion,
          range,
          'npmGallery.updateLeiningenDependency',
          [document.uri.fsPath, name]
        )
      );
    }

    await Promise.all(updatePromises);
    return codeLenses;
  }

  private async addClojarsDependencyLenses(
    codeLenses: vscode.CodeLens[],
    clojarsAdapter: ISourceAdapter,
    showSecurityInfo: boolean,
    name: string,
    currentVersion: string,
    range: vscode.Range,
    updateCommand: string,
    updateArgs: [string, string]
  ): Promise<void> {
    try {
      if (showSecurityInfo && clojarsAdapter.getSecurityInfo) {
        try {
          const security = await clojarsAdapter.getSecurityInfo(name, currentVersion);
          if (security?.summary) {
            codeLenses.push(
              new vscode.CodeLens(range, {
                title: this.formatSecurityTitle(security.summary),
                command: 'npmGallery.showPackageDetails',
                arguments: [name, { installedVersion: currentVersion, securityOnly: true }],
              })
            );
          }
        } catch {
          // Continue without security lens.
        }
      }

      const info = await clojarsAdapter.getPackageInfo(name);
      const latestVersion = info?.version ?? null;
      if (latestVersion && isNewerVersion(currentVersion, latestVersion)) {
        const updateType = getUpdateType(currentVersion, latestVersion);
        codeLenses.push(
          new vscode.CodeLens(range, {
            title: this.formatUpdateTitle(latestVersion, updateType),
            command: updateCommand,
            arguments: [...updateArgs, latestVersion],
          })
        );
      }
    } catch {
      // Skip packages that fail.
    }
  }

  private async provideCodeLensesForCargoToml(
    document: vscode.TextDocument,
    text: string
  ): Promise<vscode.CodeLens[]> {
    const codeLenses: vscode.CodeLens[] = [];
    const services = getServices();
    const config = vscode.workspace.getConfiguration('npmGallery');
    const showSecurityInfo = config.get<boolean>('showSecurityInfo', true);
    const cratesAdapter = services.sourceRegistry.getAdapter('crates-io');
    if (!cratesAdapter) {
      return [];
    }

    const lines = text.split(/\r?\n/);
    let currentSection = '';
    const updatePromises: Promise<void>[] = [];

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex];
      const trimmed = line.trim();
      const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
      if (sectionMatch) {
        currentSection = sectionMatch[1].trim();
        continue;
      }

      if (!this.isCargoDependencySection(currentSection)) {
        continue;
      }

      const parsed = this.parseCargoDependencyForCodeLens(line);
      if (!parsed || !parsed.version) {
        continue;
      }
      const currentVersion = parsed.version;

      const versionStart = line.indexOf(currentVersion);
      const range = new vscode.Range(
        new vscode.Position(lineIndex, versionStart),
        new vscode.Position(lineIndex, versionStart)
      );

      updatePromises.push(
        (async () => {
          try {
            if (showSecurityInfo && cratesAdapter.getSecurityInfo) {
              try {
                const security = await cratesAdapter.getSecurityInfo(parsed.name, currentVersion);
                if (security?.summary) {
                  codeLenses.push(
                    new vscode.CodeLens(range, {
                      title: this.formatSecurityTitle(security.summary),
                      command: 'npmGallery.showPackageDetails',
                      arguments: [parsed.name, { installedVersion: currentVersion, securityOnly: true }],
                    })
                  );
                }
              } catch {
                // Continue without security lens.
              }
            }

            const info = await cratesAdapter.getPackageInfo(parsed.name);
            const latestVersion = info?.version ?? null;
            if (latestVersion && isNewerVersion(currentVersion, latestVersion)) {
              const updateType = getUpdateType(currentVersion, latestVersion);
              codeLenses.push(
                new vscode.CodeLens(range, {
                  title: this.formatUpdateTitle(latestVersion, updateType),
                  command: 'npmGallery.updateCargoDependency',
                  arguments: [document.uri.fsPath, parsed.name, latestVersion],
                })
              );
            }
          } catch {
            // Skip packages that fail.
          }
        })()
      );
    }

    await Promise.all(updatePromises);
    return codeLenses;
  }

  private isCargoDependencySection(sectionName: string): boolean {
    return sectionName === 'dependencies' ||
      sectionName === 'dev-dependencies' ||
      sectionName === 'build-dependencies' ||
      sectionName.endsWith('.dependencies') ||
      sectionName.endsWith('.dev-dependencies') ||
      sectionName.endsWith('.build-dependencies');
  }

  private parseCargoDependencyForCodeLens(line: string): { name: string; version?: string } | null {
    const stringMatch = line.match(/^\s*([A-Za-z0-9_-]+)\s*=\s*"([^"]+)"/);
    if (stringMatch) {
      return {
        name: stringMatch[1],
        version: stringMatch[2],
      };
    }

    const inlineMatch = line.match(/^\s*([A-Za-z0-9_-]+)\s*=\s*\{(.*)\}/);
    if (!inlineMatch) {
      return null;
    }

    const versionMatch = inlineMatch[2].match(/\bversion\s*=\s*"([^"]+)"/);
    return {
      name: inlineMatch[1],
      version: versionMatch?.[1],
    };
  }

  private isPubspecDependencySection(sectionName: string): boolean {
    return sectionName === 'dependencies' ||
      sectionName === 'dev_dependencies' ||
      sectionName === 'dependency_overrides';
  }

  private parsePubspecDependencyForCodeLens(line: string): { name: string; version?: string } | null {
    const stringMatch = line.match(/^\s{2,}([A-Za-z0-9_.-]+)\s*:\s*["']?([^"'#\n]+)["']?\s*$/);
    if (stringMatch) {
      return {
        name: stringMatch[1],
        version: stringMatch[2].trim(),
      };
    }

    return null;
  }

  private parseDescriptionDependenciesForCodeLens(
    field: string
  ): Array<{ name: string; version?: string; rawText: string }> {
    const entries: Array<{ name: string; version?: string; rawText: string }> = [];
    const packageRegex = /([A-Za-z][A-Za-z0-9.]+)\s*(?:\(([^)]+)\))?/g;
    let match: RegExpExecArray | null;
    while ((match = packageRegex.exec(field)) !== null) {
      if (match[1] === 'R') {
        continue;
      }
      const rawVersion = match[2]?.trim();
      const version = rawVersion
        ? rawVersion.replace(/^(>=|<=|==|>|<)\s*/, '').trim()
        : undefined;
      entries.push({
        name: match[1],
        version,
        rawText: match[0],
      });
    }
    return entries;
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

  /**
   * Provide CodeLenses for Directory.Packages.props (CPM)
   */
  private async provideCodeLensesForDirectoryPackagesProps(
    document: vscode.TextDocument,
    text: string
  ): Promise<vscode.CodeLens[]> {
    const codeLenses: vscode.CodeLens[] = [];
    const services = getServices();
    const config = vscode.workspace.getConfiguration('npmGallery');
    const showSecurityInfo = config.get<boolean>('showSecurityInfo', true);
    const nugetAdapter = services.sourceRegistry.getAdapter('nuget');
    if (!nugetAdapter) {
      return codeLenses;
    }

    // Match <PackageVersion Include="Id" Version="x" /> or Version then Include
    const packageVersionRegex = /<PackageVersion\s+Include="([^"]+)"\s+Version="([^"]+)"\s*\/>|<PackageVersion\s+Version="([^"]+)"\s+Include="([^"]+)"\s*\/>/gi;
    let match;
    const entries: Array<{ name: string; version: string; versionAttrStart: number }> = [];

    while ((match = packageVersionRegex.exec(text)) !== null) {
      const includeId = match[1] ?? match[4];
      const version = match[2] ?? match[3];
      if (!includeId || !version) continue;

      const versionAttrStart = text.indexOf(version, match.index);
      if (versionAttrStart === -1) continue;

      entries.push({
        name: includeId,
        version,
        versionAttrStart,
      });
    }

    let bulkSecurity: Record<string, { summary: { total: number; critical: number; high: number } } | null> = {};
    if (showSecurityInfo && entries.length > 0) {
      try {
        const securityResults = await services.package.getSecurityInfoBulk(
          entries.map((entry) => ({ name: entry.name, version: entry.version }))
        );
        for (const entry of entries) {
          const key = `${entry.name}@${entry.version}`;
          const sec = securityResults[key];
          bulkSecurity[key] = sec?.summary
            ? {
                summary: {
                  total: sec.summary.total,
                  critical: sec.summary.critical,
                  high: sec.summary.high,
                },
              }
            : null;
        }
      } catch {
        bulkSecurity = {};
      }
    }

    const updatePromises: Promise<void>[] = [];
    for (const entry of entries) {
      updatePromises.push(
        (async () => {
          try {
            const securityKey = `${entry.name}@${entry.version}`;
            let securitySummary = this.securitySummaries.get(securityKey);
            if (showSecurityInfo && !securitySummary) {
              const sec = bulkSecurity[securityKey];
              if (sec?.summary) {
                securitySummary = sec.summary;
                this.securitySummaries.set(securityKey, securitySummary);
              }
            }

            const position = document.positionAt(entry.versionAttrStart);
            const range = new vscode.Range(position, position);

            if (showSecurityInfo && securitySummary) {
              codeLenses.push(
                new vscode.CodeLens(range, {
                  title: this.formatSecurityTitle(securitySummary),
                  command: 'npmGallery.showPackageDetails',
                  arguments: [entry.name, { installedVersion: entry.version, securityOnly: true }],
                })
              );
            }

            const info = await nugetAdapter.getPackageInfo(entry.name);
            const latestVersion = info?.version ?? null;
            if (latestVersion && isNewerVersion(entry.version, latestVersion)) {
              const updateType = getUpdateType(entry.version, latestVersion);
              codeLenses.push(
                new vscode.CodeLens(range, {
                  title: this.formatUpdateTitle(latestVersion, updateType),
                  command: 'npmGallery.updateCpmPackage',
                  arguments: [document.uri.fsPath, entry.name, latestVersion],
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

  /**
   * Provide CodeLenses for paket.dependencies
   */
  private async provideCodeLensesForPaketDependencies(
    document: vscode.TextDocument,
    text: string
  ): Promise<vscode.CodeLens[]> {
    const codeLenses: vscode.CodeLens[] = [];
    const services = getServices();
    const nugetAdapter = services.sourceRegistry.getAdapter('nuget');
    if (!nugetAdapter) {
      return codeLenses;
    }

    // Match "nuget PackageId version" lines (version may be followed by ~> or rest of line)
    const nugetLineRegex = /^\s*nuget\s+([^\s]+)\s+([^\s~]+)([^\n]*)/gim;
    let match;
    const updatePromises: Promise<void>[] = [];

    while ((match = nugetLineRegex.exec(text)) !== null) {
      const packageId = match[1];
      const currentVersion = match[2];
      if (!packageId || !currentVersion) continue;

      const versionStart = match.index + match[0].indexOf(currentVersion);

      updatePromises.push(
        (async () => {
          try {
            const info = await nugetAdapter.getPackageInfo(packageId);
            const latestVersion = info?.version ?? null;
            if (latestVersion && isNewerVersion(currentVersion, latestVersion)) {
              const updateType = getUpdateType(currentVersion, latestVersion);
              const position = document.positionAt(versionStart);
              const range = new vscode.Range(position, position);
              codeLenses.push(
                new vscode.CodeLens(range, {
                  title: this.formatUpdateTitle(latestVersion, updateType),
                  command: 'npmGallery.updatePaketDependency',
                  arguments: [document.uri.fsPath, packageId, latestVersion],
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

  /**
   * Provide CodeLenses for Cake build scripts (#addin / #tool nuget:?package=Id&version=x)
   */
  private async provideCodeLensesForCake(
    document: vscode.TextDocument,
    text: string
  ): Promise<vscode.CodeLens[]> {
    const codeLenses: vscode.CodeLens[] = [];
    const services = getServices();
    const nugetAdapter = services.sourceRegistry.getAdapter('nuget');
    if (!nugetAdapter) {
      return codeLenses;
    }

    const updatePromises: Promise<void>[] = [];
    for (const directive of parseCakeDirectives(text)) {
      if (!directive.version || !directive.versionRange) continue;
      const currentVersion = directive.version;
      const versionRange = directive.versionRange;

      updatePromises.push(
        (async () => {
          try {
            const info = await nugetAdapter.getPackageInfo(directive.packageId);
            const latestVersion = info?.version ?? null;
            if (latestVersion && isNewerVersion(currentVersion, latestVersion)) {
              const updateType = getUpdateType(currentVersion, latestVersion);
              const position = document.positionAt(versionRange.start);
              const range = new vscode.Range(position, position);
              codeLenses.push(
                new vscode.CodeLens(range, {
                  title: this.formatUpdateTitle(latestVersion, updateType),
                  command: 'npmGallery.updateCakePackage',
                  arguments: [document.uri.fsPath, directive.packageId, latestVersion, directive.kind],
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
        const parsedSpec = parseDependencySpec(currentVersionRange);
        if (parsedSpec.isRegistryResolvable && parsedSpec.normalizedVersion) {
          packagesForSecurity.push({ name, version: parsedSpec.normalizedVersion });
        }
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
      const parsedSpec = parseDependencySpec(currentVersionRange);
      const valueNode = json.findNodeAtLocation(tree, [section, name]);
      const keyNode = valueNode?.parent?.type === 'property' && valueNode.parent.children?.[0]
        ? valueNode.parent.children[0]
        : null;

      if (!parsedSpec.isRegistryResolvable || !parsedSpec.normalizedVersion) {
        if (keyNode) {
          const start = document.positionAt(keyNode.offset);
          const end = document.positionAt(keyNode.offset + keyNode.length);
          const range = new vscode.Range(start, end);

          codeLenses.push(
            new vscode.CodeLens(range, {
              title: `📍 ${formatDependencySpecDisplay(parsedSpec)}`,
              command: 'npmGallery.showPackageDetails',
              arguments: [name],
            })
          );
        }
        continue;
      }
      const currentVersion = parsedSpec.normalizedVersion;

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

            if (keyNode) {
              const start = document.positionAt(keyNode.offset);
              const end = document.positionAt(keyNode.offset + keyNode.length);
              const range = new vscode.Range(start, end);

              // Security CodeLens
              if (showSecurityInfo && securitySummary) {
                codeLenses.push(
                  new vscode.CodeLens(range, {
                    title: this.formatSecurityTitle(securitySummary),
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

  private invalidateCache(scope?: WorkspacePackageScope): void {
    if (!scope?.manifestPath && !scope?.workspaceFolderPath) {
      this.codeLensCache.clear();
      return;
    }

    for (const key of this.codeLensCache.keys()) {
      const uri = vscode.Uri.parse(key);
      if (this.matchesScope(uri, scope)) {
        this.codeLensCache.delete(key);
      }
    }
  }

  private matchesScope(uri: vscode.Uri, scope: WorkspacePackageScope): boolean {
    if (scope.manifestPath) {
      return uri.fsPath === scope.manifestPath;
    }

    if (scope.workspaceFolderPath) {
      return vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath === scope.workspaceFolderPath;
    }

    return true;
  }

  private isComposerPlatformPackage(name: string): boolean {
    const normalized = name.toLowerCase();
    return normalized === 'php' ||
      normalized.startsWith('ext-') ||
      normalized.startsWith('lib-') ||
      normalized === 'composer-plugin-api' ||
      normalized === 'composer-runtime-api' ||
      normalized === 'composer-api';
  }
}
