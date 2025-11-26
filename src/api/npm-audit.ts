import { BaseApiClient } from './base-client';
import { API_ENDPOINTS } from '../types/config';
import type { NpmAuditBulkResponse, NpmAdvisory } from '../types/api';
import type { SecurityInfo, Vulnerability, VulnerabilitySummary } from '../types/package';

/**
 * Client for npm Security/Audit API
 */
export class NpmAuditClient extends BaseApiClient {
  constructor() {
    super(API_ENDPOINTS.NPM_REGISTRY, 'npm-audit');
  }

  /**
   * Check security vulnerabilities for packages
   */
  async checkPackages(
    packages: Record<string, string[]>
  ): Promise<Record<string, SecurityInfo>> {
    const results: Record<string, SecurityInfo> = {};

    try {
      const response = await this.post<NpmAuditBulkResponse>(
        '/-/npm/v1/security/advisories/bulk',
        packages
      );

      // Process response
      for (const [name, advisories] of Object.entries(response)) {
        const versions = packages[name] || [];

        for (const version of versions) {
          const relevantAdvisories = advisories.filter((a) =>
            this.isVersionVulnerable(version, a.vulnerable_versions)
          );

          const securityInfo = this.transformAdvisories(relevantAdvisories);
          results[`${name}@${version}`] = securityInfo;
        }
      }

      // Handle packages with no advisories
      for (const [name, versions] of Object.entries(packages)) {
        for (const version of versions) {
          const key = `${name}@${version}`;
          if (!results[key]) {
            results[key] = this.createEmptySecurityInfo();
          }
        }
      }
    } catch {
      // On error, return empty security info for all packages
      for (const [name, versions] of Object.entries(packages)) {
        for (const version of versions) {
          results[`${name}@${version}`] = this.createEmptySecurityInfo();
        }
      }
    }

    return results;
  }

  /**
   * Check security for a single package
   */
  async checkPackage(name: string, version: string): Promise<SecurityInfo> {
    const results = await this.checkPackages({ [name]: [version] });
    return results[`${name}@${version}`] || this.createEmptySecurityInfo();
  }

  /**
   * Transform npm advisories to our SecurityInfo format
   */
  private transformAdvisories(advisories: NpmAdvisory[]): SecurityInfo {
    const vulnerabilities: Vulnerability[] = advisories.map((a) => ({
      id: a.id,
      title: a.title,
      severity: a.severity,
      url: a.url,
      vulnerableVersions: a.vulnerable_versions,
      patchedVersions: a.patched_versions,
      recommendation: a.recommendation,
      cwe: a.cwe,
      cvss: a.cvss,
    }));

    return {
      vulnerabilities,
      summary: this.calculateSummary(vulnerabilities),
    };
  }

  /**
   * Calculate vulnerability summary
   */
  private calculateSummary(vulnerabilities: Vulnerability[]): VulnerabilitySummary {
    const summary: VulnerabilitySummary = {
      total: vulnerabilities.length,
      critical: 0,
      high: 0,
      moderate: 0,
      low: 0,
      info: 0,
    };

    for (const vuln of vulnerabilities) {
      summary[vuln.severity]++;
    }

    return summary;
  }

  /**
   * Create empty security info
   */
  private createEmptySecurityInfo(): SecurityInfo {
    return {
      vulnerabilities: [],
      summary: { total: 0, critical: 0, high: 0, moderate: 0, low: 0, info: 0 },
    };
  }

  /**
   * Check if a version is affected by a vulnerability range
   */
  private isVersionVulnerable(version: string, vulnerableRange: string): boolean {
    if (vulnerableRange === '*') return true;

    const lessThanMatch = vulnerableRange.match(/<\s*([\d.]+)/);
    if (lessThanMatch) {
      return this.compareVersions(version, lessThanMatch[1]) < 0;
    }

    return true; // Default to vulnerable if can't parse
  }

  /**
   * Simple version comparison
   */
  private compareVersions(a: string, b: string): number {
    const partsA = a.split('.').map((p) => parseInt(p, 10) || 0);
    const partsB = b.split('.').map((p) => parseInt(p, 10) || 0);

    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
      const numA = partsA[i] || 0;
      const numB = partsB[i] || 0;
      if (numA < numB) return -1;
      if (numA > numB) return 1;
    }
    return 0;
  }
}
