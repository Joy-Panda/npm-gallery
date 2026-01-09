import { BaseApiClient } from './base-client';
import { API_ENDPOINTS } from '../types/config';
import type { SecurityInfo, Vulnerability, VulnerabilitySummary } from '../types/package';
import { CVSS20, CVSS30, CVSS31, CVSS40 } from '@pandatix/js-cvss';

/**
 * OSV.dev API response types
 */
interface OSVQueryRequest {
  package?: {
    name: string;
    ecosystem: string;
  };
  version?: string;
}

interface OSVVulnerability {
  id: string;
  summary?: string;
  details?: string;
  published?: string;
  aliases?: string[];
  severity?: Array<{
    type: string;
    score: string; // CVSS vector string like "CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:L/I:H/A:N"
  }>;
  affected?: Array<{
    ranges?: Array<{
      type: string;
      events?: Array<{
        introduced?: string;
        fixed?: string;
      }>;
    }>;
    versions?: string[];
  }>;
  references?: Array<{
    type: string;
    url: string;
  }>;
  database_specific?: {
    cwe_ids?: string[];
    github_reviewed?: boolean;
    severity?: string;
  };
}

interface OSVQueryResponse {
  vulns: OSVVulnerability[];
}

/**
 * Client for OSV.dev API (Open Source Vulnerabilities)
 * Uses the open standard OSV API for vulnerability queries
 */
export class OSVClient extends BaseApiClient {
  constructor() {
    super(API_ENDPOINTS.OSV_API || 'https://api.osv.dev', 'osv');
  }

  /**
   * Query vulnerabilities for a package
   */
  async queryVulnerabilities(name: string, _version: string): Promise<SecurityInfo> {
    try {
      // TODO: 临时设置版本为 2.2.1，用于测试
      const fixedVersion = '0.150.0';
      const request: OSVQueryRequest = {
        package: {
          name,
          ecosystem: 'npm',
        },
        version: fixedVersion,
      };

      const response = await this.post<OSVQueryResponse>('/v1/query', request);

      if (!response.vulns || response.vulns.length === 0) {
        return this.createEmptySecurityInfo();
      }

      return this.transformOSVResponse(response.vulns);
    } catch (error) {
      // Return empty security info on error
      return this.createEmptySecurityInfo();
    }
  }

  /**
   * Query vulnerabilities for multiple packages
   */
  async queryBulkVulnerabilities(
    packages: Array<{ name: string; version: string }>
  ): Promise<Record<string, SecurityInfo>> {
    const results: Record<string, SecurityInfo> = {};

    // OSV.dev supports batch queries, but we'll do individual queries for now
    // to ensure compatibility and proper error handling
    const queries = packages.map(async (pkg) => {
      const key = `${pkg.name}@${pkg.version}`;
      try {
        results[key] = await this.queryVulnerabilities(pkg.name, pkg.version);
      } catch {
        results[key] = this.createEmptySecurityInfo();
      }
    });

    await Promise.all(queries);
    return results;
  }

  /**
   * Transform OSV response to our SecurityInfo format
   */
  private transformOSVResponse(vulns: OSVVulnerability[]): SecurityInfo {
    const vulnerabilities: Vulnerability[] = vulns
      .map((vuln) => this.transformVulnerability(vuln))
      .filter((v): v is Vulnerability => v !== null);

    return {
      vulnerabilities,
      summary: this.calculateSummary(vulnerabilities),
    };
  }

  /**
   * Transform a single OSV vulnerability to our format
   */
  private transformVulnerability(vuln: OSVVulnerability): Vulnerability | null {
    // Determine severity from database_specific first (most reliable), then CVSS vector
    let severity: Vulnerability['severity'] = 'moderate';
    let cvssScore: number | undefined;
    let cvssVectorString: string | undefined;

    // Priority 1: Use database_specific.severity if available
    if (vuln.database_specific?.severity) {
      const dbSeverity = vuln.database_specific.severity.toLowerCase();
      if (dbSeverity.includes('critical')) severity = 'critical';
      else if (dbSeverity.includes('high')) severity = 'high';
      else if (dbSeverity.includes('moderate')) severity = 'moderate';
      else if (dbSeverity.includes('low')) severity = 'low';
    }

    // Priority 2: Parse CVSS vector string if available
    if (vuln.severity && vuln.severity.length > 0) {
      // Support CVSS v2, v3, and v4
      const cvssSeverity = vuln.severity.find((s) => 
        s.type === 'CVSS_V4' || s.type === 'CVSS_V3' || s.type === 'CVSS_V2'
      );
      if (cvssSeverity) {
        cvssVectorString = cvssSeverity.score;
        // Try to calculate score from vector string
        cvssScore = this.calculateCVSSScore(cvssVectorString, severity);
      }
    }

    // Extract vulnerable and patched versions
    let vulnerableVersions: string | undefined;
    let patchedVersions: string | undefined;

    if (vuln.affected && vuln.affected.length > 0) {
      const affected = vuln.affected[0];
      if (affected.ranges && affected.ranges.length > 0) {
        const range = affected.ranges[0];
        if (range.events) {
          const introduced = range.events.find((e) => e.introduced)?.introduced;
          const fixed = range.events.find((e) => e.fixed)?.fixed;
          if (introduced) {
            vulnerableVersions = `>=${introduced}`;
            if (fixed) {
              vulnerableVersions += ` <${fixed}`;
              patchedVersions = `>=${fixed}`;
            }
          }
        }
      } else if (affected.versions) {
        vulnerableVersions = affected.versions.join(', ');
      }
    }

    // Get CVE ID from aliases first, then from id field
    const cveId = vuln.aliases?.find((alias) => alias.startsWith('CVE-')) || 
                  (vuln.id.startsWith('CVE-') ? vuln.id : undefined);
    const osvId = vuln.id;

    // Get reference URL (prefer security advisory, then CVE link, then first reference)
    let url: string | undefined;
    if (vuln.references && vuln.references.length > 0) {
      // Prefer security advisory URLs (GitHub security advisories, etc.)
      const advisoryRef = vuln.references.find(
        (r) => r.type === 'ADVISORY' || 
               r.url.includes('security/advisories') || 
               r.url.includes('advisories')
      );
      if (advisoryRef) {
        url = advisoryRef.url;
      } else {
        // Fall back to first WEB reference, then any reference
        const webRef = vuln.references.find((r) => r.type === 'WEB');
        url = webRef?.url || vuln.references[0].url;
      }
    }
    if (!url && cveId) {
      url = `https://cve.mitre.org/cgi-bin/cvename.cgi?name=${cveId}`;
    }
    if (!url) {
      url = `https://osv.dev/vulnerability/${osvId}`;
    }

    // Build recommendation
    let recommendation: string | undefined;
    if (patchedVersions) {
      recommendation = `Upgrade to version ${patchedVersions} or later`;
    } else if (vulnerableVersions) {
      recommendation = `Update to a version outside the vulnerable range: ${vulnerableVersions}`;
    }

    return {
      id: parseInt(osvId.replace(/\D/g, '').slice(0, 10)) || 0,
      title: vuln.summary || vuln.details || `Vulnerability ${osvId}`,
      severity,
      url,
      vulnerableVersions,
      patchedVersions,
      recommendation,
      cwe: vuln.database_specific?.cwe_ids,
      cvss: cvssVectorString && cvssScore
        ? {
            score: cvssScore,
            vectorString: cvssVectorString,
          }
        : undefined,
      published: vuln.published,
      details: vuln.details,
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
   * Calculate CVSS score from vector string using official @pandatix/js-cvss package
   */
  private calculateCVSSScore(vectorString: string, severity: Vulnerability['severity']): number {
    if (!vectorString) {
      return this.getEstimatedScore(severity);
    }

    try {
      // Extract CVSS version
      const versionMatch = vectorString.match(/CVSS:(\d+)\.(\d+)/);
      if (!versionMatch) {
        return this.getEstimatedScore(severity);
      }

      const majorVersion = parseInt(versionMatch[1], 10);
      const minorVersion = parseInt(versionMatch[2], 10);

      // Use official CVSS calculator based on version
      if (majorVersion === 4) {
        const cvss = new CVSS40(vectorString);
        return cvss.Score();
      } else if (majorVersion === 3) {
        if (minorVersion === 1) {
          const cvss = new CVSS31(vectorString);
          return cvss.BaseScore();
        } else {
          const cvss = new CVSS30(vectorString);
          return cvss.BaseScore();
        }
      } else if (majorVersion === 2) {
        const cvss = new CVSS20(vectorString);
        return cvss.BaseScore();
      }
    } catch (error) {
      // If parsing fails, fall back to estimated score
      console.warn('Failed to calculate CVSS score from vector:', vectorString, error);
      return this.getEstimatedScore(severity);
    }

    return this.getEstimatedScore(severity);
  }

  /**
   * Get estimated score based on severity level
   */
  private getEstimatedScore(severity: Vulnerability['severity']): number {
    switch (severity) {
      case 'critical':
        return 9.0;
      case 'high':
        return 7.5;
      case 'moderate':
        return 5.5;
      case 'low':
        return 3.0;
      default:
        return 5.0;
    }
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
}
