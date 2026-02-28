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

/**
 * OSV API vuln shape (matches actual /v1/query response)
 * @see https://google.github.io/osv.dev/post-v1-query/
 */
interface OSVVulnerability {
  id: string;
  summary?: string;
  details?: string;
  modified?: string;
  published?: string;
  aliases?: string[];
  /** Top-level severity (CVSS) when present */
  severity?: Array<{
    type: string;
    score: string;
  }>;
  affected?: Array<{
    package?: { name?: string; ecosystem?: string; purl?: string };
    ranges?: Array<{
      type: string;
      repo?: string;
      events?: Array<{
        introduced?: string;
        fixed?: string;
      }>;
    }>;
    versions?: string[];
    ecosystem_specific?: { severity?: string };
    database_specific?: { source?: string; severity?: string };
  }>;
  references?: Array<{
    type: string;
    url: string;
  }>;
  database_specific?: {
    cwe_ids?: string[];
    github_reviewed?: boolean;
    severity?: string;
    source?: string;
  };
  schema_version?: string;
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
   * @param name Package name (npm package name or Maven coordinate like groupId:artifactId)
   * @param version Package version
   * @param ecosystem Ecosystem type ('npm' or 'Maven'), defaults to 'npm'
   */
  async queryVulnerabilities(name: string, version: string, ecosystem: string = 'npm'): Promise<SecurityInfo> {
    try {
      const request: OSVQueryRequest = {
        package: {
          name,
          ecosystem,
        },
        version,
      };

      const response = await this.post<OSVQueryResponse>('/v1/query', request);
      const vulns = response.vulns || [];

      if (vulns.length === 0) {
        return this.createEmptySecurityInfo();
      }

      return this.transformOSVResponse(vulns);
    } catch (error) {
      // Return empty security info on error
      return this.createEmptySecurityInfo();
    }
  }

  /**
   * Query vulnerabilities for multiple packages
   * @param packages Array of package info with name, version, and optional ecosystem
   */
  async queryBulkVulnerabilities(
    packages: Array<{ name: string; version: string; ecosystem?: string }>
  ): Promise<Record<string, SecurityInfo>> {
    const results: Record<string, SecurityInfo> = {};

    if (packages.length === 0) {
      return results;
    }

    // Use multiple /v1/query calls in parallel to get full vulnerability data,
    // which includes severity, CVSS, etc. needed for summaries.
    const queries = packages.map(async (pkg) => {
      const key = `${pkg.name}@${pkg.version}`;
      try {
        results[key] = await this.queryVulnerabilities(pkg.name, pkg.version, pkg.ecosystem || 'npm');
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
    // Determine severity: database_specific > affected[0].ecosystem_specific > affected[0].database_specific > top-level severity (CVSS)
    let severity: Vulnerability['severity'] = 'moderate';
    let cvssScore: number | undefined;
    let cvssVectorString: string | undefined;

    const parseSeverity = (s: string): Vulnerability['severity'] => {
      const lower = s.toLowerCase();
      if (lower.includes('critical')) return 'critical';
      if (lower.includes('high')) return 'high';
      if (lower.includes('moderate')) return 'moderate';
      if (lower.includes('low')) return 'low';
      if (lower.includes('info')) return 'info';
      return 'moderate';
    };

    if (vuln.database_specific?.severity) {
      severity = parseSeverity(vuln.database_specific.severity);
    } else if (vuln.affected?.[0]?.ecosystem_specific?.severity) {
      severity = parseSeverity(vuln.affected[0].ecosystem_specific.severity);
    } else if (vuln.affected?.[0]?.database_specific?.severity) {
      severity = parseSeverity(vuln.affected[0].database_specific.severity);
    }

    // Parse CVSS vector string if available (top-level severity array)
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
