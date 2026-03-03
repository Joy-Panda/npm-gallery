import * as vscode from 'vscode';
import * as json from 'jsonc-parser/lib/esm/main.js';
import { getServices } from '../services';
import type { SourceType } from '../types/project';
import { formatBytes } from '../utils/formatters';
import { formatDependencySpecDisplay, parseDependencySpec } from '../utils/version-utils';

/**
 * Provides hover information for packages in supported manifests.
 */
export class PackageHoverProvider implements vscode.HoverProvider {
  private readonly composerDependencySections = new Set([
    'require',
    'require-dev',
    'suggest',
    'provide',
    'replace',
    'conflict',
  ]);

  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): Promise<vscode.Hover | null> {
    const fileName = document.fileName.toLowerCase();
    const line = document.lineAt(position.line).text;

    if (fileName.endsWith('package.json')) {
      const packageInfo = this.extractPackageJsonPackageInfo(line, position);
      if (!packageInfo) {
        return null;
      }
      return this.createHover(packageInfo, 'npm', getServices().getCurrentSourceType());
    }

    if (fileName.endsWith('composer.json')) {
      const packageInfo = this.extractComposerPackageInfo(document, line, position);
      if (!packageInfo) {
        return null;
      }
      return this.createHover(packageInfo, 'packagist');
    }

    if (fileName.endsWith('gemfile') || fileName.endsWith('gemfile.lock')) {
      const packageInfo = fileName.endsWith('gemfile.lock')
        ? this.extractGemfileLockPackageInfo(line, position)
        : this.extractGemfilePackageInfo(line, position);
      if (!packageInfo) {
        return null;
      }
      return this.createHover(packageInfo, 'rubygems');
    }

    if (fileName.endsWith('cpanfile')) {
      const packageInfo = this.extractCpanfilePackageInfo(line, position);
      if (!packageInfo) {
        return null;
      }
      return this.createHover(packageInfo, 'metacpan');
    }

    if (fileName.endsWith('pubspec.yaml') || fileName.endsWith('pubspec.lock')) {
      const packageInfo = fileName.endsWith('pubspec.lock')
        ? this.extractPubspecLockPackageInfo(document, position)
        : this.extractPubspecYamlPackageInfo(document, line, position);
      if (!packageInfo) {
        return null;
      }
      return this.createHover(packageInfo, 'pub-dev');
    }

    if (fileName.endsWith('description')) {
      const packageInfo = this.extractDescriptionPackageInfo(line, position);
      if (!packageInfo) {
        return null;
      }
      return this.createHover(packageInfo, 'cran');
    }

    if (fileName.endsWith('directory.packages.props')) {
      const packageInfo = this.extractDirectoryPackagesPropsInfo(line, position);
      if (!packageInfo) {
        return null;
      }
      return this.createHover(packageInfo, 'nuget');
    }

    if (fileName.endsWith('deps.edn')) {
      const packageInfo = this.extractDepsEdnPackageInfo(line, position);
      if (!packageInfo) {
        return null;
      }
      return this.createHover(packageInfo, 'clojars');
    }

    if (fileName.endsWith('project.clj')) {
      const packageInfo = this.extractProjectCljPackageInfo(line, position);
      if (!packageInfo) {
        return null;
      }
      return this.createHover(packageInfo, 'clojars');
    }

    if (fileName.endsWith('cargo.toml') || fileName.endsWith('cargo.lock')) {
      const packageInfo = fileName.endsWith('cargo.lock')
        ? this.extractCargoLockPackageInfo(document, position)
        : this.extractCargoTomlPackageInfo(document, line, position);
      if (!packageInfo) {
        return null;
      }
      return this.createHover(packageInfo, 'crates-io');
    }

    return null;
  }

  private extractComposerPackageInfo(
    document: vscode.TextDocument,
    line: string,
    position: vscode.Position
  ): {
    name: string;
    version: string;
    rawVersion: string;
    displayVersion: string;
    isRegistryResolvable: boolean;
  } | null {
    const regex = /"([^"]+)":\s*"([^"]+)"/;
    const match = line.match(regex);
    if (!match) {
      return null;
    }

    const [fullMatch, name, version] = match;
    const startIndex = line.indexOf(fullMatch);
    const endIndex = startIndex + fullMatch.length;
    if (position.character < startIndex || position.character > endIndex) {
      return null;
    }

    const offset = document.offsetAt(position);
    const location = json.getLocation(document.getText(), offset);
    const section = typeof location.path[0] === 'string' ? location.path[0] : undefined;
    if (!section || !this.composerDependencySections.has(section)) {
      return null;
    }

    const parsedSpec = parseDependencySpec(version);
    return {
      name,
      version: parsedSpec.normalizedVersion || parsedSpec.displayText,
      rawVersion: parsedSpec.raw,
      displayVersion: formatDependencySpecDisplay(parsedSpec),
      isRegistryResolvable: this.isComposerRegistryPackage(name) && !!parsedSpec.normalizedVersion,
    };
  }

  /**
   * Extract package name and version from package.json line
   */
  private extractPackageJsonPackageInfo(
    line: string,
    position: vscode.Position
  ): {
    name: string;
    version: string;
    rawVersion: string;
    displayVersion: string;
    isRegistryResolvable: boolean;
  } | null {
    // Match: "package-name": "version"
    const regex = /"([^"]+)":\s*"([^"]+)"/;
    const match = line.match(regex);

    if (!match) {
      return null;
    }

    const [fullMatch, name, version] = match;
    const startIndex = line.indexOf(fullMatch);
    const endIndex = startIndex + fullMatch.length;

    // Check if cursor is within the match
    if (position.character < startIndex || position.character > endIndex) {
      return null;
    }

    // Exclude common non-package keys
    const excludedKeys = ['name', 'version', 'description', 'main', 'scripts', 'type', 'license'];
    if (excludedKeys.includes(name)) {
      return null;
    }

    const parsedSpec = parseDependencySpec(version);
    return {
      name,
      version: parsedSpec.normalizedVersion || parsedSpec.displayText,
      rawVersion: parsedSpec.raw,
      displayVersion: formatDependencySpecDisplay(parsedSpec),
      isRegistryResolvable: parsedSpec.isRegistryResolvable && !!parsedSpec.normalizedVersion,
    };
  }

  private extractDirectoryPackagesPropsInfo(
    line: string,
    position: vscode.Position
  ): {
    name: string;
    version: string;
    rawVersion: string;
    displayVersion: string;
    isRegistryResolvable: boolean;
  } | null {
    const regex = /<PackageVersion\s+(?:Include="([^"]+)"\s+Version="([^"]+)"|Version="([^"]+)"\s+Include="([^"]+)")\s*\/?>/i;
    const match = line.match(regex);
    if (!match) {
      return null;
    }

    const [fullMatch] = match;
    const name = (match[1] ?? match[4])?.trim();
    const version = (match[2] ?? match[3])?.trim();
    if (!name || !version) {
      return null;
    }

    const startIndex = line.indexOf(fullMatch);
    const endIndex = startIndex + fullMatch.length;
    if (position.character < startIndex || position.character > endIndex) {
      return null;
    }

    return {
      name,
      version,
      rawVersion: version,
      displayVersion: version,
      isRegistryResolvable: true,
    };
  }

  private extractGemfilePackageInfo(
    line: string,
    position: vscode.Position
  ): {
    name: string;
    version: string;
    rawVersion: string;
    displayVersion: string;
    isRegistryResolvable: boolean;
  } | null {
    const regex = /^\s*gem\s+['"]([^'"]+)['"]\s*(?:,\s*['"]([^'"]+)['"])?/;
    const match = line.match(regex);
    if (!match) {
      return null;
    }

    const [fullMatch, name, versionRange] = match;
    const startIndex = line.indexOf(fullMatch);
    const endIndex = startIndex + fullMatch.length;
    if (position.character < startIndex || position.character > endIndex) {
      return null;
    }

    const parsedSpec = parseDependencySpec(versionRange || '');
    return {
      name,
      version: parsedSpec.normalizedVersion || versionRange || 'latest',
      rawVersion: versionRange || '',
      displayVersion: versionRange || 'latest',
      isRegistryResolvable: true,
    };
  }

  private extractGemfileLockPackageInfo(
    line: string,
    position: vscode.Position
  ): {
    name: string;
    version: string;
    rawVersion: string;
    displayVersion: string;
    isRegistryResolvable: boolean;
  } | null {
    const regex = /^\s{4}([^\s(]+)\s+\(([^)]+)\)/;
    const match = line.match(regex);
    if (!match) {
      return null;
    }

    const [fullMatch, name, version] = match;
    const startIndex = line.indexOf(fullMatch);
    const endIndex = startIndex + fullMatch.length;
    if (position.character < startIndex || position.character > endIndex) {
      return null;
    }

    return {
      name,
      version,
      rawVersion: version,
      displayVersion: version,
      isRegistryResolvable: true,
    };
  }

  private extractDepsEdnPackageInfo(
    line: string,
    position: vscode.Position
  ): {
    name: string;
    version: string;
    rawVersion: string;
    displayVersion: string;
    isRegistryResolvable: boolean;
  } | null {
    const regex = /([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\s+\{[^}\n]*:mvn\/version\s+"([^"]+)"/;
    const match = line.match(regex);
    if (!match) {
      return null;
    }

    const [fullMatch, name, version] = match;
    const startIndex = line.indexOf(fullMatch);
    const endIndex = startIndex + fullMatch.length;
    if (position.character < startIndex || position.character > endIndex) {
      return null;
    }

    return {
      name,
      version,
      rawVersion: version,
      displayVersion: version,
      isRegistryResolvable: true,
    };
  }

  private extractProjectCljPackageInfo(
    line: string,
    position: vscode.Position
  ): {
    name: string;
    version: string;
    rawVersion: string;
    displayVersion: string;
    isRegistryResolvable: boolean;
  } | null {
    const regex = /\[([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\s+"([^"]+)"/;
    const match = line.match(regex);
    if (!match) {
      return null;
    }

    const [fullMatch, name, version] = match;
    const startIndex = line.indexOf(fullMatch);
    const endIndex = startIndex + fullMatch.length;
    if (position.character < startIndex || position.character > endIndex) {
      return null;
    }

    return {
      name,
      version,
      rawVersion: version,
      displayVersion: version,
      isRegistryResolvable: true,
    };
  }

  private extractCargoTomlPackageInfo(
    document: vscode.TextDocument,
    line: string,
    position: vscode.Position
  ): {
    name: string;
    version: string;
    rawVersion: string;
    displayVersion: string;
    isRegistryResolvable: boolean;
  } | null {
    const sectionName = this.getCargoTomlSectionName(document, position.line);
    if (!sectionName || !this.isCargoDependencySection(sectionName)) {
      return null;
    }

    const stringMatch = line.match(/^\s*([A-Za-z0-9_-]+)\s*=\s*"([^"]+)"/);
    if (stringMatch) {
      return {
        name: stringMatch[1],
        version: stringMatch[2],
        rawVersion: stringMatch[2],
        displayVersion: stringMatch[2],
        isRegistryResolvable: true,
      };
    }

    const inlineMatch = line.match(/^\s*([A-Za-z0-9_-]+)\s*=\s*\{(.*)\}/);
    if (!inlineMatch) {
      return null;
    }

    const versionMatch = inlineMatch[2].match(/\bversion\s*=\s*"([^"]+)"/);
    return {
      name: inlineMatch[1],
      version: versionMatch?.[1] || 'custom',
      rawVersion: versionMatch?.[1] || '',
      displayVersion: versionMatch?.[1] || 'custom',
      isRegistryResolvable: !!versionMatch,
    };
  }

  private extractCargoLockPackageInfo(
    document: vscode.TextDocument,
    position: vscode.Position
  ): {
    name: string;
    version: string;
    rawVersion: string;
    displayVersion: string;
    isRegistryResolvable: boolean;
  } | null {
    const line = document.lineAt(position.line).text;
    const nameMatch = line.match(/^\s*name\s*=\s*"([^"]+)"/);
    if (!nameMatch) {
      return null;
    }

    let version: string | undefined;
    for (let index = position.line + 1; index < Math.min(document.lineCount, position.line + 8); index += 1) {
      const candidate = document.lineAt(index).text;
      const versionMatch = candidate.match(/^\s*version\s*=\s*"([^"]+)"/);
      if (versionMatch) {
        version = versionMatch[1];
        break;
      }
      if (/^\s*\[\[package\]\]\s*$/.test(candidate)) {
        break;
      }
    }

    if (!version) {
      return null;
    }

    return {
      name: nameMatch[1],
      version,
      rawVersion: version,
      displayVersion: version,
      isRegistryResolvable: true,
    };
  }

  private getCargoTomlSectionName(document: vscode.TextDocument, lineNumber: number): string | null {
    for (let index = lineNumber; index >= 0; index -= 1) {
      const line = document.lineAt(index).text.trim();
      const match = line.match(/^\[([^\]]+)\]$/);
      if (match) {
        return match[1].trim();
      }
    }
    return null;
  }

  private isCargoDependencySection(sectionName: string): boolean {
    return sectionName === 'dependencies' ||
      sectionName === 'dev-dependencies' ||
      sectionName === 'build-dependencies' ||
      sectionName.endsWith('.dependencies') ||
      sectionName.endsWith('.dev-dependencies') ||
      sectionName.endsWith('.build-dependencies');
  }

  private extractCpanfilePackageInfo(
    line: string,
    position: vscode.Position
  ): {
    name: string;
    version: string;
    rawVersion: string;
    displayVersion: string;
    isRegistryResolvable: boolean;
  } | null {
    const regex = /^\s*(requires|recommends|suggests)\s+['"]([^'"]+)['"](?:\s*,\s*['"]([^'"]+)['"])?/;
    const match = line.match(regex);
    if (!match) {
      return null;
    }

    const [fullMatch, , name, versionRange] = match;
    const startIndex = line.indexOf(fullMatch);
    const endIndex = startIndex + fullMatch.length;
    if (position.character < startIndex || position.character > endIndex) {
      return null;
    }

    return {
      name,
      version: versionRange || 'latest',
      rawVersion: versionRange || '',
      displayVersion: versionRange || 'latest',
      isRegistryResolvable: true,
    };
  }

  private extractPubspecYamlPackageInfo(
    document: vscode.TextDocument,
    line: string,
    position: vscode.Position
  ): {
    name: string;
    version: string;
    rawVersion: string;
    displayVersion: string;
    isRegistryResolvable: boolean;
  } | null {
    const sectionName = this.getPubspecSectionName(document, position.line);
    if (!sectionName || !this.isPubspecDependencySection(sectionName)) {
      return null;
    }

    const stringMatch = line.match(/^\s{2,}([A-Za-z0-9_.-]+)\s*:\s*["']?([^"'#\n]+)["']?\s*$/);
    if (stringMatch) {
      return {
        name: stringMatch[1],
        version: stringMatch[2].trim(),
        rawVersion: stringMatch[2].trim(),
        displayVersion: stringMatch[2].trim(),
        isRegistryResolvable: true,
      };
    }

    const nameMatch = line.match(/^\s{2,}([A-Za-z0-9_.-]+)\s*:\s*$/);
    if (!nameMatch) {
      return null;
    }

    const name = nameMatch[1];
    let version = '';
    for (let index = position.line + 1; index < Math.min(document.lineCount, position.line + 6); index += 1) {
      const candidate = document.lineAt(index).text;
      if (/^\s{0,2}[A-Za-z0-9_.-]+\s*:/.test(candidate)) {
        break;
      }
      const versionMatch = candidate.match(/^\s{4,}version\s*:\s*["']?([^"'#\n]+)["']?\s*$/);
      if (versionMatch) {
        version = versionMatch[1].trim();
        break;
      }
    }

    return {
      name,
      version: version || 'sdk/path/git',
      rawVersion: version,
      displayVersion: version || 'sdk/path/git',
      isRegistryResolvable: !!version,
    };
  }

  private extractPubspecLockPackageInfo(
    document: vscode.TextDocument,
    position: vscode.Position
  ): {
    name: string;
    version: string;
    rawVersion: string;
    displayVersion: string;
    isRegistryResolvable: boolean;
  } | null {
    const line = document.lineAt(position.line).text;
    const nameMatch = line.match(/^\s{2}([A-Za-z0-9_.-]+):\s*$/);
    if (!nameMatch) {
      return null;
    }

    let version = '';
    for (let index = position.line + 1; index < Math.min(document.lineCount, position.line + 6); index += 1) {
      const candidate = document.lineAt(index).text;
      const versionMatch = candidate.match(/^\s{4}version:\s*"([^"]+)"/);
      if (versionMatch) {
        version = versionMatch[1];
        break;
      }
      if (/^\s{2}[A-Za-z0-9_.-]+:\s*$/.test(candidate)) {
        break;
      }
    }

    if (!version) {
      return null;
    }

    return {
      name: nameMatch[1],
      version,
      rawVersion: version,
      displayVersion: version,
      isRegistryResolvable: true,
    };
  }

  private extractDescriptionPackageInfo(
    line: string,
    position: vscode.Position
  ): {
    name: string;
    version: string;
    rawVersion: string;
    displayVersion: string;
    isRegistryResolvable: boolean;
  } | null {
    const fieldMatch = line.match(/^\s*(Depends|Imports|LinkingTo|Suggests|Enhances)\s*:\s*(.+)$/i);
    if (!fieldMatch) {
      return null;
    }

    const body = fieldMatch[2];
    const packageRegex = /([A-Za-z][A-Za-z0-9.]+)\s*(?:\(([^)]+)\))?/g;
    let match: RegExpExecArray | null;
    while ((match = packageRegex.exec(body)) !== null) {
      const name = match[1];
      if (name === 'R') {
        continue;
      }
      const bodyIndex = body.indexOf(match[0], match.index);
      const startIndex = line.indexOf(body) + bodyIndex;
      const endIndex = startIndex + match[0].length;
      if (position.character < startIndex || position.character > endIndex) {
        continue;
      }
      const version = match[2]?.trim() || '*';
      return {
        name,
        version,
        rawVersion: version === '*' ? '' : version,
        displayVersion: version,
        isRegistryResolvable: true,
      };
    }

    return null;
  }

  private getPubspecSectionName(document: vscode.TextDocument, lineNumber: number): string | null {
    for (let index = lineNumber; index >= 0; index -= 1) {
      const line = document.lineAt(index).text;
      const match = line.match(/^([A-Za-z_]+):\s*$/);
      if (match) {
        return match[1].trim();
      }
    }
    return null;
  }

  private isPubspecDependencySection(sectionName: string): boolean {
    return sectionName === 'dependencies' || sectionName === 'dev_dependencies' || sectionName === 'dependency_overrides';
  }

  private async createHover(
    packageInfo: {
      name: string;
      version: string;
      rawVersion: string;
      displayVersion: string;
      isRegistryResolvable: boolean;
    },
    ecosystem: 'npm' | 'nuget' | 'packagist' | 'rubygems' | 'metacpan' | 'pub-dev' | 'cran' | 'clojars' | 'crates-io',
    sourceType?: SourceType | null
  ): Promise<vscode.Hover> {
    const { name, version, isRegistryResolvable, displayVersion } = packageInfo;
    const services = getServices();
    const adapter =
      ecosystem === 'nuget'
        ? services.sourceRegistry.getAdapter('nuget')
        : ecosystem === 'packagist'
          ? services.sourceRegistry.getAdapter('packagist')
          : ecosystem === 'rubygems'
            ? services.sourceRegistry.getAdapter('rubygems')
            : ecosystem === 'metacpan'
              ? services.sourceRegistry.getAdapter('metacpan')
              : ecosystem === 'pub-dev'
                ? services.sourceRegistry.getAdapter('pub-dev')
                : ecosystem === 'cran'
                  ? services.sourceRegistry.getAdapter('cran')
            : ecosystem === 'clojars'
              ? services.sourceRegistry.getAdapter('clojars')
              : ecosystem === 'crates-io'
                ? services.sourceRegistry.getAdapter('crates-io')
                : null;

    try {
      const [details, bundleSize, security] = await Promise.all([
        adapter ? adapter.getPackageInfo(name) : services.package.getPackageInfo(name),
        ecosystem === 'npm' && isRegistryResolvable
          ? services.package.getBundleSize(name, version)
          : Promise.resolve(null),
        isRegistryResolvable
          ? adapter?.getSecurityInfo
            ? adapter.getSecurityInfo(name, version)
            : services.package.getSecurityInfo(name, version)
          : Promise.resolve(null),
      ]);

      const markdown = this.buildHoverContent(
        name,
        isRegistryResolvable ? version : displayVersion,
        details,
        bundleSize,
        security,
        ecosystem,
        sourceType
      );
      return new vscode.Hover(markdown);
    } catch {
      return new vscode.Hover(
        new vscode.MarkdownString(`**${name}** @ ${displayVersion}`)
      );
    }
  }

  /**
   * Build hover content markdown
   */
  private buildHoverContent(
    name: string,
    currentVersion: string,
    details: { description?: string; license?: string; downloads?: number; score?: { final: number } },
    bundleSize: { size: number; gzip: number } | null,
    security: { summary: { total: number; critical: number; high: number } } | null,
    ecosystem: 'npm' | 'nuget' | 'packagist' | 'rubygems' | 'metacpan' | 'pub-dev' | 'cran' | 'clojars' | 'crates-io',
    sourceType?: SourceType | null
  ): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.supportHtml = true;
    md.isTrusted = true;

    // Header
    md.appendMarkdown(`### 📦 ${name}\n\n`);

    // Description
    if (details.description) {
      md.appendMarkdown(`${details.description}\n\n`);
    }

    // Version info
    md.appendMarkdown(`**Installed:** \`${currentVersion}\`\n\n`);

    // Stats
    const stats: string[] = [];

    if (details.downloads) {
      stats.push(
        ecosystem === 'nuget'
          ? `⬇️ ${this.formatDownloads(details.downloads)} total`
          : ecosystem === 'rubygems'
            ? `⬇️ ${this.formatDownloads(details.downloads)} total`
            : ecosystem === 'metacpan'
              ? `⬇️ ${this.formatDownloads(details.downloads)} total`
              : ecosystem === 'pub-dev'
                ? `⬇️ ${this.formatDownloads(details.downloads)} monthly`
                : ecosystem === 'cran'
                  ? `⬇️ ${this.formatDownloads(details.downloads)} monthly`
            : ecosystem === 'clojars'
              ? `⬇️ ${this.formatDownloads(details.downloads)} total`
              : ecosystem === 'crates-io'
                ? `⬇️ ${this.formatDownloads(details.downloads)} total`
                : ecosystem === 'packagist' || sourceType === 'npm-registry'
                  ? `⬇️ ${this.formatDownloads(details.downloads)}/month`
                  : `⬇️ ${this.formatDownloads(details.downloads)}/week`
      );
    }

    if (details.score) {
      stats.push(`📊 ${Math.round(details.score.final * 100)}`);
    }

    if (bundleSize && bundleSize.gzip > 0) {
      stats.push(`📦 ${formatBytes(bundleSize.gzip)}`);
    }

    if (details.license) {
      stats.push(`📄 ${details.license}`);
    }

    if (stats.length > 0) {
      md.appendMarkdown(stats.join(' • ') + '\n\n');
    }

    // Security
    if (security) {
      if (security.summary.total === 0) {
        md.appendMarkdown('🛡️ **No vulnerabilities**\n\n');
      } else {
        const vulns: string[] = [];
        if (security.summary.critical > 0) {
          vulns.push(`🔴 ${security.summary.critical} critical`);
        }
        if (security.summary.high > 0) {
          vulns.push(`🟠 ${security.summary.high} high`);
        }
        md.appendMarkdown(`⚠️ **${security.summary.total} vulnerabilities:** ${vulns.join(', ')}\n\n`);
      }
    }

    // Actions
    md.appendMarkdown('---\n\n');
    const externalUrl =
      ecosystem === 'nuget'
        ? `https://www.nuget.org/packages/${name}`
        : ecosystem === 'packagist'
          ? `https://packagist.org/packages/${name}`
          : ecosystem === 'rubygems'
            ? `https://rubygems.org/gems/${name}`
            : ecosystem === 'metacpan'
              ? `https://metacpan.org/pod/${name}`
              : ecosystem === 'pub-dev'
                ? `https://pub.dev/packages/${name}`
                : ecosystem === 'cran'
                  ? `https://cran.r-project.org/package=${name}`
            : ecosystem === 'clojars'
              ? `https://clojars.org/${name}`
              : ecosystem === 'crates-io'
                ? `https://crates.io/crates/${name}`
                : `https://www.npmjs.com/package/${name}`;
    const externalLabel =
      ecosystem === 'nuget'
        ? 'NuGet'
        : ecosystem === 'packagist'
          ? 'Packagist'
          : ecosystem === 'rubygems'
            ? 'RubyGems'
            : ecosystem === 'metacpan'
              ? 'MetaCPAN'
              : ecosystem === 'pub-dev'
                ? 'pub.dev'
                : ecosystem === 'cran'
                  ? 'CRAN'
            : ecosystem === 'clojars'
              ? 'Clojars'
              : ecosystem === 'crates-io'
                ? 'crates.io'
                : 'npm';
    md.appendMarkdown(
      `[View Details](command:npmGallery.showPackageDetails?${encodeURIComponent(
        JSON.stringify([name, { installedVersion: currentVersion }])
      )}) • ` +
      `[${externalLabel}](${externalUrl})`
    );

    return md;
  }

  /**
   * Format download count
   */
  private formatDownloads(count: number): string {
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(1)}M`;
    }
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`;
    }
    return count.toString();
  }

  private isComposerRegistryPackage(name: string): boolean {
    const normalized = name.toLowerCase();
    return normalized.includes('/') &&
      normalized !== 'php' &&
      !normalized.startsWith('ext-') &&
      !normalized.startsWith('lib-') &&
      normalized !== 'composer-plugin-api' &&
      normalized !== 'composer-runtime-api' &&
      normalized !== 'composer-api';
  }
}
