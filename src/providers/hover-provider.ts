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

    if (fileName.endsWith('directory.packages.props')) {
      const packageInfo = this.extractDirectoryPackagesPropsInfo(line, position);
      if (!packageInfo) {
        return null;
      }
      return this.createHover(packageInfo, 'nuget');
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

  private async createHover(
    packageInfo: {
      name: string;
      version: string;
      rawVersion: string;
      displayVersion: string;
      isRegistryResolvable: boolean;
    },
    ecosystem: 'npm' | 'nuget' | 'packagist' | 'rubygems',
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
    ecosystem: 'npm' | 'nuget' | 'packagist' | 'rubygems',
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
          : `https://www.npmjs.com/package/${name}`;
    const externalLabel =
      ecosystem === 'nuget' ? 'NuGet' : ecosystem === 'packagist' ? 'Packagist' : ecosystem === 'rubygems' ? 'RubyGems' : 'npm';
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
