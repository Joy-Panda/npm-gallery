import { BaseApiClient, createFetchRequestInit } from './base-client';
import { API_ENDPOINTS } from '../types/config';

export interface PackagistSearchResultItem {
  name: string;
  description?: string;
  url?: string;
  repository?: string;
  downloads?: number;
  favers?: number;
}

export interface PackagistSearchResponse {
  results: PackagistSearchResultItem[];
  total: number;
  next?: string;
}

export interface PackagistPackageVersion {
  name: string;
  description?: string;
  version: string;
  version_normalized?: string;
  license?: string[];
  keywords?: string[];
  homepage?: string;
  authors?: Array<{
    name?: string;
    email?: string;
    homepage?: string;
    role?: string;
  }>;
  source?: {
    type?: string;
    url?: string;
    reference?: string;
  };
  dist?: {
    type?: string;
    url?: string;
    reference?: string;
    shasum?: string;
  };
  type?: string;
  support?: {
    issues?: string;
    source?: string;
    docs?: string;
  };
  time?: string;
  require?: Record<string, string>;
  'require-dev'?: Record<string, string>;
  suggest?: Record<string, string>;
  provide?: Record<string, string>;
  replace?: Record<string, string>;
  conflict?: Record<string, string>;
  abandoned?: boolean | string;
}

export interface PackagistPackageMetadata {
  name: string;
  description?: string;
  time?: string;
  maintainers?: Array<{
    name?: string;
    avatar_url?: string;
  }>;
  versions: Record<string, PackagistPackageVersion>;
  type?: string;
  repository?: string;
  github_stars?: number;
  github_watchers?: number;
  github_forks?: number;
  github_open_issues?: number;
  language?: string;
  dependents?: number;
  suggesters?: number;
  downloads?: {
    total?: number;
    monthly?: number;
    daily?: number;
  };
  favers?: number;
}

export interface PackagistPackageResponse {
  package: PackagistPackageMetadata;
}

export interface PackagistAdvisory {
  advisoryId?: string;
  packageName: string;
  remoteId?: string;
  title?: string;
  link?: string;
  cve?: string;
  affectedVersions?: string;
  sources?: Array<{
    name?: string;
    remoteId?: string;
  }>;
  reportedAt?: string;
  composerRepository?: string;
  severity?: string;
}

export interface PackagistSecurityAdvisoriesResponse {
  advisories: Record<string, PackagistAdvisory[]>;
}

export type PackagistDependentsResponse = unknown;

export class PackagistApiClient extends BaseApiClient {
  private static readonly WEB_BASE_URL = 'https://packagist.org';

  constructor() {
    super(API_ENDPOINTS.PACKAGIST, 'packagist');
  }

  async search(
    query: string,
    options: {
      page?: number;
      perPage?: number;
      tags?: string;
      type?: string;
      signal?: AbortSignal;
    } = {}
  ): Promise<PackagistSearchResponse> {
    const { page = 1, perPage = 20, tags, type, signal } = options;
    return this.get<PackagistSearchResponse>('/search.json', {
      signal,
      params: {
        q: query,
        page,
        per_page: perPage,
        tags,
        type,
      },
    });
  }

  async getPackage(name: string, signal?: AbortSignal): Promise<PackagistPackageResponse> {
    return this.get<PackagistPackageResponse>(`/packages/${this.encodePackagistName(name)}.json`, {
      signal,
    });
  }

  async getSecurityAdvisories(
    packages: string[],
    options: {
      updatedSince?: number;
      signal?: AbortSignal;
    } = {}
  ): Promise<PackagistSecurityAdvisoriesResponse> {
    const { updatedSince, signal } = options;
    const params = new URLSearchParams();
    for (const pkg of packages) {
      params.append('packages[]', pkg);
    }
    if (updatedSince !== undefined) {
      params.append('updatedSince', String(updatedSince));
    }

    return this.get<PackagistSecurityAdvisoriesResponse>(`/api/security-advisories/?${params.toString()}`, {
      signal,
    });
  }

  async getDependents(
    name: string,
    options: {
      pageUrl?: string;
      orderBy?: 'downloads' | 'name';
      signal?: AbortSignal;
    } = {}
  ): Promise<PackagistDependentsResponse> {
    const { pageUrl, orderBy = 'downloads', signal } = options;
    const endpoint = pageUrl || `/packages/${this.encodePackagistName(name)}/dependents.json`;
    return this.get<PackagistDependentsResponse>(endpoint, {
      signal,
      params: {
        order_by: orderBy,
      },
    });
  }

  async getPackageReadme(name: string, signal?: AbortSignal): Promise<string | null> {
    const response = await fetch(
      `${PackagistApiClient.WEB_BASE_URL}/packages/${this.encodePackagistName(name)}`,
      createFetchRequestInit({
        accept: 'text/html,application/xhtml+xml',
        signal,
      })
    );

    if (!response.ok) {
      return null;
    }

    const html = await response.text();
    return this.extractReadme(html);
  }

  private encodePackagistName(name: string): string {
    return name
      .split('/')
      .map(part => encodeURIComponent(part))
      .join('/');
  }

  private extractReadme(html: string): string | null {
    const candidates = [
      /<(section|div)\b[^>]*(?:id|class)=["'][^"']*readme[^"']*["'][^>]*>([\s\S]*?)<\/\1>/i,
      /<(section|div)\b[^>]*(?:id|class)=["'][^"']*package__readme[^"']*["'][^>]*>([\s\S]*?)<\/\1>/i,
      /<article\b[^>]*>([\s\S]*?)<\/article>/i,
      /<main\b[^>]*>([\s\S]*?)<\/main>/i,
    ];

    let content: string | null = null;
    for (const pattern of candidates) {
      const match = html.match(pattern);
      if (match) {
        content = match[match.length - 1];
        if (content) {
          break;
        }
      }
    }

    if (!content) {
      return null;
    }

    let markdown = content
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<pre\b[^>]*>\s*<code\b[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi, (_, code: string) => {
        return `\n\n\`\`\`\n${this.decodeHtml(code).trim()}\n\`\`\`\n\n`;
      })
      .replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, (_, code: string) => `\`${this.decodeHtml(code).trim()}\``)
      .replace(/<a\b[^>]*href=(['"])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi, (_, _quote: string, href: string, text: string) => {
        const label = this.cleanInlineText(text);
        if (!label) {
          return '';
        }
        const url = href.startsWith('/') ? `${PackagistApiClient.WEB_BASE_URL}${href}` : href;
        return `[${label}](${url})`;
      })
      .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_, level: string, text: string) => {
        return `\n\n${'#'.repeat(Number(level))} ${this.cleanInlineText(text)}\n\n`;
      })
      .replace(/<li\b[^>]*>/gi, '\n- ')
      .replace(/<\/(p|div|section|article|ul|ol|table|blockquote)>/gi, '\n\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/tr>/gi, '\n')
      .replace(/<\/t[dh]>/gi, ' ')
      .replace(/<[^>]+>/g, ' ');

    markdown = this.decodeHtml(markdown)
      .replace(/\r/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    const normalized = markdown.replace(/[#>*`\-\[\]\(\)!]/g, '').trim();
    if (!normalized || normalized.length < 80) {
      return null;
    }

    return this.trimReadmeNoise(markdown);
  }

  private trimReadmeNoise(markdown: string): string {
    const stopHeadings = new Set([
      '# Releases',
      '## Releases',
      '# Changelog',
      '## Changelog',
      '# Maintainers',
      '## Maintainers',
      '# Security',
      '## Security',
    ]);

    const lines: string[] = [];
    for (const line of markdown.split('\n')) {
      const trimmed = line.trim();
      if (stopHeadings.has(trimmed)) {
        break;
      }
      lines.push(line.trimEnd());
    }

    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  private cleanInlineText(text: string): string {
    return this.decodeHtml(text.replace(/<[^>]+>/g, ' '))
      .replace(/\s+/g, ' ')
      .trim();
  }

  private decodeHtml(text: string): string {
    return text
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&#x27;/gi, "'")
      .replace(/&#x2F;/gi, '/')
      .replace(/&#x60;/gi, '`')
      .replace(/&#x3D;/gi, '=')
      .replace(/&#(\d+);/g, (_match, code: string) => String.fromCharCode(Number(code)))
      .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCharCode(parseInt(code, 16)));
  }
}
