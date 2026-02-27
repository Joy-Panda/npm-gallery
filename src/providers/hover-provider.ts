import * as vscode from 'vscode';
import { getServices } from '../services';
import { formatBytes } from '../utils/formatters';

/**
 * Provides hover information for packages in package.json
 */
export class PackageHoverProvider implements vscode.HoverProvider {
  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): Promise<vscode.Hover | null> {
    // Only handle package.json files
    if (!document.fileName.endsWith('package.json')) {
      return null;
    }

    const line = document.lineAt(position.line).text;
    const packageInfo = this.extractPackageInfo(line, position);

    if (!packageInfo) {
      return null;
    }

    const { name, version } = packageInfo;
    const services = getServices();

    try {
      const [details, bundleSize, security] = await Promise.all([
        services.package.getPackageInfo(name),
        services.package.getBundleSize(name, version),
        services.package.getSecurityInfo(name, version),
      ]);

      const markdown = this.buildHoverContent(name, version, details, bundleSize, security);
      return new vscode.Hover(markdown);
    } catch {
      // Return basic hover if API fails
      return new vscode.Hover(
        new vscode.MarkdownString(`**${name}** @ ${version}`)
      );
    }
  }

  /**
   * Extract package name and version from line
   */
  private extractPackageInfo(
    line: string,
    position: vscode.Position
  ): { name: string; version: string } | null {
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

    return { name, version: version.replace(/^[\^~>=<]+/, '') };
  }

  /**
   * Build hover content markdown
   */
  private buildHoverContent(
    name: string,
    currentVersion: string,
    details: { description?: string; license?: string; downloads?: number; score?: { final: number } },
    bundleSize: { size: number; gzip: number } | null,
    security: { summary: { total: number; critical: number; high: number } } | null
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
      stats.push(`⬇️ ${this.formatDownloads(details.downloads)}/week`);
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
    md.appendMarkdown(
      `[View Details](command:npmGallery.showPackageDetails?${encodeURIComponent(
        JSON.stringify([name, { installedVersion: currentVersion }])
      )}) • ` +
      `[npm](https://www.npmjs.com/package/${name})`
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
}
