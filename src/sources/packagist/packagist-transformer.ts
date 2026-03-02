import type {
  PackageDetails,
  PackageInfo,
  RequirementsInfo,
  SearchResult,
  SecurityInfo,
  VersionInfo,
  Vulnerability,
  VulnerabilitySeverity,
} from '../../types/package';
import { compareVersions } from '../../utils/version-utils';
import type {
  PackagistAdvisory,
  PackagistPackageMetadata,
  PackagistPackageVersion,
  PackagistSearchResponse,
} from '../../api/packagist-api';

export class PackagistTransformer {
  transformSearchResult(raw: PackagistSearchResponse, from: number, size: number): SearchResult {
    return {
      packages: raw.results.map(item => ({
        name: item.name,
        version: '',
        description: item.description,
        repository: item.repository ? { url: item.repository } : undefined,
        homepage: item.url,
        downloads: item.downloads,
      })),
      total: raw.total,
      hasMore: typeof raw.next === 'string' ? true : from + size < raw.total,
    };
  }

  transformPackageInfo(raw: PackagistPackageMetadata): PackageInfo {
    const selected = this.getPreferredVersion(raw);
    return {
      name: raw.name,
      version: selected?.version || '0.0.0',
      description: selected?.description || raw.description,
      keywords: selected?.keywords,
      license: this.pickLicense(selected?.license),
      author: selected?.authors?.[0]
        ? {
            name: selected.authors[0].name,
            email: selected.authors[0].email,
            url: selected.authors[0].homepage,
          }
        : undefined,
      repository: this.pickRepository(raw, selected),
      homepage: selected?.homepage,
      downloads: raw.downloads?.monthly ?? raw.downloads?.total,
      deprecated: typeof selected?.abandoned === 'string'
        ? `Abandoned, use ${selected.abandoned}`
        : selected?.abandoned
          ? 'Abandoned'
          : undefined,
    };
  }

  transformPackageDetails(
    raw: PackagistPackageMetadata,
    requestedVersion?: string
  ): PackageDetails {
    const selected = this.getPreferredVersion(raw, requestedVersion);
    const versions = this.transformVersions(raw);
    const selectedVersion = selected?.version || versions[0]?.version || '0.0.0';

    return {
      ...this.transformPackageInfo(raw),
      version: selectedVersion,
      description: selected?.description || raw.description,
      keywords: selected?.keywords,
      license: this.pickLicense(selected?.license),
      readme: selected?.description || raw.description,
      versions,
      dependencies: selected?.require,
      devDependencies: selected?.['require-dev'],
      repository: this.pickRepository(raw, selected),
      homepage: selected?.homepage,
      maintainers: this.collectMaintainers(raw, selected),
      time: this.buildTimeMap(raw),
      bugs: selected?.support?.issues ? { url: selected.support.issues } : undefined,
    };
  }

  transformVersions(raw: PackagistPackageMetadata): VersionInfo[] {
    return Object.values(raw.versions || {})
      .map(version => ({
        version: version.version,
        publishedAt: version.time,
        deprecated: typeof version.abandoned === 'string'
          ? `Abandoned, use ${version.abandoned}`
          : version.abandoned
            ? 'Abandoned'
            : undefined,
        dist: version.dist
          ? {
              shasum: version.dist.shasum,
              tarball: version.dist.url,
            }
          : undefined,
      }))
      .sort((a, b) => compareVersions(b.version, a.version));
  }

  buildRequirements(raw: PackagistPackageMetadata, requestedVersion?: string): RequirementsInfo | null {
    const version = this.getPreferredVersion(raw, requestedVersion);
    if (!version) {
      return null;
    }

    const sections = [
      this.mapRequirementSection('runtime', 'Runtime', version.require),
      this.mapRequirementSection('dev', 'Development', version['require-dev']),
      this.mapRequirementSection('suggest', 'Suggested', version.suggest, true),
      this.mapRequirementSection('provide', 'Provides', version.provide),
      this.mapRequirementSection('replace', 'Replaces', version.replace),
      this.mapRequirementSection('conflict', 'Conflicts', version.conflict),
    ].filter((section): section is NonNullable<typeof section> => !!section);

    if (sections.length === 0) {
      return null;
    }

    return {
      system: 'packagist',
      package: raw.name,
      version: version.version,
      sections,
      webUrl: `https://packagist.org/packages/${raw.name}`,
    };
  }

  transformSecurityInfo(pkgName: string, advisories: PackagistAdvisory[]): SecurityInfo {
    const vulnerabilities = advisories.map((advisory, index) => this.mapAdvisory(pkgName, advisory, index));
    const summary = {
      total: vulnerabilities.length,
      critical: vulnerabilities.filter(v => v.severity === 'critical').length,
      high: vulnerabilities.filter(v => v.severity === 'high').length,
      moderate: vulnerabilities.filter(v => v.severity === 'moderate').length,
      low: vulnerabilities.filter(v => v.severity === 'low').length,
      info: vulnerabilities.filter(v => v.severity === 'info').length,
    };

    return { vulnerabilities, summary };
  }

  private getPreferredVersion(
    raw: PackagistPackageMetadata,
    requestedVersion?: string
  ): PackagistPackageVersion | undefined {
    if (requestedVersion && raw.versions?.[requestedVersion]) {
      return raw.versions[requestedVersion];
    }

    const stable = Object.values(raw.versions || {}).filter(version => !this.isDevVersion(version.version));
    const candidates = stable.length > 0 ? stable : Object.values(raw.versions || {});
    return candidates.sort((a, b) => compareVersions(b.version, a.version))[0];
  }

  private isDevVersion(version: string): boolean {
    const normalized = version.toLowerCase();
    return normalized.includes('dev') || normalized.includes('alpha') || normalized.includes('beta') || normalized.includes('rc');
  }

  private pickLicense(licenses?: string[]): string | undefined {
    return licenses?.[0];
  }

  private pickRepository(
    raw: PackagistPackageMetadata,
    version?: PackagistPackageVersion
  ): { type?: string; url?: string } | undefined {
    const url = version?.support?.source || version?.source?.url || raw.repository;
    if (!url) {
      return undefined;
    }
    return {
      type: version?.source?.type,
      url,
    };
  }

  private collectMaintainers(raw: PackagistPackageMetadata, version?: PackagistPackageVersion) {
    const fromVersion: Array<{ name?: string; email?: string }> = (version?.authors || []).map(author => ({
      name: author.name,
      email: author.email,
    }));
    const fromPackage: Array<{ name?: string; email?: string }> = (raw.maintainers || []).map(maintainer => ({
      name: maintainer.name,
    }));

    return [...fromVersion, ...fromPackage].filter(item => item.name || item.email);
  }

  private buildTimeMap(raw: PackagistPackageMetadata): Record<string, string> | undefined {
    const entries = Object.values(raw.versions || {})
      .filter(version => version.time)
      .map(version => [version.version, version.time!] as const);
    return entries.length > 0 ? Object.fromEntries(entries) : undefined;
  }

  private mapRequirementSection(
    id: string,
    title: string,
    requirements?: Record<string, string>,
    optional: boolean = false
  ): RequirementsInfo['sections'][number] | null {
    const items = Object.entries(requirements || {}).map(([name, requirement]) => ({
      name,
      requirement,
      optional,
    }));
    if (items.length === 0) {
      return null;
    }
    return { id, title, items };
  }

  private mapAdvisory(pkgName: string, advisory: PackagistAdvisory, index: number): Vulnerability {
    return {
      id: this.numericId(advisory.advisoryId || advisory.remoteId || `${pkgName}-${index}`),
      title: advisory.title || advisory.cve || advisory.remoteId || 'Security advisory',
      severity: this.mapSeverity(advisory.severity),
      url: advisory.link,
      vulnerableVersions: advisory.affectedVersions,
      recommendation: advisory.sources?.map(source => source.name).filter(Boolean).join(', ') || undefined,
      published: advisory.reportedAt,
      details: advisory.cve ? `CVE: ${advisory.cve}` : undefined,
    };
  }

  private numericId(input: string): number {
    return input.split('').reduce((acc, ch) => ((acc * 31) + ch.charCodeAt(0)) >>> 0, 0);
  }

  private mapSeverity(severity?: string): VulnerabilitySeverity {
    switch ((severity || '').toLowerCase()) {
      case 'critical':
        return 'critical';
      case 'high':
        return 'high';
      case 'medium':
      case 'moderate':
        return 'moderate';
      case 'low':
        return 'low';
      default:
        return 'info';
    }
  }
}
