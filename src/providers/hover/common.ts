import * as vscode from 'vscode';
import { getServices } from '../../services';
import type { SourceType } from '../../types/project';
import { formatBytes } from '../../utils/formatters';

export type HoverEcosystem =
  'npm' |
  'nuget' |
  'packagist' |
  'rubygems' |
  'metacpan' |
  'pub-dev' |
  'cran' |
  'clojars' |
  'crates-io' |
  'pkg-go-dev' |
  'sonatype' |
  'libraries-io';

export type ExtractedPackageInfo = {
  name: string;
  version: string;
  rawVersion: string;
  displayVersion: string;
  isRegistryResolvable: boolean;
};

export async function createPackageHover(
  packageInfo: ExtractedPackageInfo,
  ecosystem: HoverEcosystem,
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
                    : ecosystem === 'pkg-go-dev'
                      ? services.sourceRegistry.getAdapter('pkg-go-dev')
                      : ecosystem === 'sonatype'
                        ? services.sourceRegistry.getAdapter('sonatype')
                        : ecosystem === 'libraries-io'
                          ? services.sourceRegistry.getAdapter('libraries-io')
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

    return new vscode.Hover(
      buildHoverContent(
        name,
        isRegistryResolvable ? version : displayVersion,
        details,
        bundleSize,
        security,
        ecosystem,
        sourceType
      )
    );
  } catch {
    return new vscode.Hover(
      new vscode.MarkdownString(`**${name}** @ ${displayVersion}`)
    );
  }
}

function buildHoverContent(
  name: string,
  currentVersion: string,
  details: { description?: string; license?: string; downloads?: number; score?: { final: number } },
  bundleSize: { size: number; gzip: number } | null,
  security: { summary: { total: number; critical: number; high: number } } | null,
  ecosystem: HoverEcosystem,
  sourceType?: SourceType | null
): vscode.MarkdownString {
  const md = new vscode.MarkdownString();
  md.supportHtml = true;
  md.isTrusted = true;

  md.appendMarkdown(`### 📦 ${name}\n\n`);

  if (details.description) {
    md.appendMarkdown(`${details.description}\n\n`);
  }

  md.appendMarkdown(`**Installed:** \`${currentVersion}\`\n\n`);

  const stats: string[] = [];
  if (details.downloads && sourceType !== 'libraries-io' && ecosystem !== 'libraries-io') {
    stats.push(
      ecosystem === 'nuget'
        ? `⬇️ ${formatDownloads(details.downloads)} total`
        : ecosystem === 'rubygems'
          ? `⬇️ ${formatDownloads(details.downloads)} total`
          : ecosystem === 'metacpan'
            ? `⬇️ ${formatDownloads(details.downloads)} total`
            : ecosystem === 'pub-dev'
              ? `⬇️ ${formatDownloads(details.downloads)} monthly`
              : ecosystem === 'cran'
                ? `⬇️ ${formatDownloads(details.downloads)} monthly`
                : ecosystem === 'pkg-go-dev'
                  ? `⬇️ ${formatDownloads(details.downloads)} total`
                  : ecosystem === 'clojars'
                    ? `⬇️ ${formatDownloads(details.downloads)} total`
                    : ecosystem === 'crates-io'
                      ? `⬇️ ${formatDownloads(details.downloads)} total`
                      : ecosystem === 'packagist' || sourceType === 'npm-registry'
                        ? `⬇️ ${formatDownloads(details.downloads)}/month`
                        : `⬇️ ${formatDownloads(details.downloads)}/week`
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
    md.appendMarkdown(`${stats.join(' • ')}\n\n`);
  }

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

  md.appendMarkdown('---\n\n');
  const externalUrl =
    sourceType === 'libraries-io' || ecosystem === 'libraries-io'
      ? `https://libraries.io/search?q=${encodeURIComponent(name)}`
      : ecosystem === 'nuget'
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
                  : ecosystem === 'pkg-go-dev'
                    ? `https://pkg.go.dev/${name}`
                    : ecosystem === 'clojars'
                      ? `https://clojars.org/${name}`
                      : ecosystem === 'crates-io'
                        ? `https://crates.io/crates/${name}`
                        : `https://www.npmjs.com/package/${name}`;
  const externalLabel =
    sourceType === 'libraries-io' || ecosystem === 'libraries-io'
      ? 'Libraries.io'
      : ecosystem === 'nuget'
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
                  : ecosystem === 'pkg-go-dev'
                    ? 'pkg.go.dev'
                    : ecosystem === 'clojars'
                      ? 'Clojars'
                      : ecosystem === 'crates-io'
                        ? 'crates.io'
                      : 'npm';
  const detailsSource =
    sourceType === 'libraries-io' || ecosystem === 'libraries-io'
      ? 'libraries-io'
      : ecosystem === 'nuget'
        ? 'nuget'
        : ecosystem === 'packagist'
          ? 'packagist'
          : ecosystem === 'rubygems'
            ? 'rubygems'
            : ecosystem === 'metacpan'
              ? 'metacpan'
              : ecosystem === 'pub-dev'
                ? 'pub-dev'
                : ecosystem === 'cran'
                  ? 'cran'
                  : ecosystem === 'pkg-go-dev'
                    ? 'pkg-go-dev'
                    : ecosystem === 'clojars'
                      ? 'clojars'
                      : ecosystem === 'crates-io'
                        ? 'crates-io'
                        : ecosystem === 'sonatype'
                          ? 'sonatype'
                          : sourceType;
  md.appendMarkdown(
    `[View Details](command:npmGallery.showPackageDetails?${encodeURIComponent(
      JSON.stringify([name, { installedVersion: currentVersion, source: detailsSource }])
    )}) • ` +
    `[${externalLabel}](${externalUrl})`
  );

  return md;
}

function formatDownloads(count: number): string {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toString();
}
