import { BaseApiClient, createFetchRequestInit } from './base-client';
import { API_ENDPOINTS } from '../types/config';

export interface MetaCpanSearchHit {
  _source?: Record<string, unknown>;
}

export interface MetaCpanSearchResponse {
  hits?: {
    total?: number | { value: number };
    hits?: MetaCpanSearchHit[];
  };
}

export class MetaCpanApiClient extends BaseApiClient {
  private static readonly WEB_BASE_URL = 'https://metacpan.org';

  constructor() {
    super(API_ENDPOINTS.METACPAN, 'metacpan');
  }

  async searchModules(
    query: string,
    options: {
      from?: number;
      size?: number;
      signal?: AbortSignal;
    } = {}
  ): Promise<MetaCpanSearchResponse> {
    const { from = 0, size = 20, signal } = options;
    return this.get<MetaCpanSearchResponse>('/v1/module/_search', {
      signal,
      params: {
        q: query,
        from,
        size,
      },
    });
  }

  async getModule(name: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
    return this.get<Record<string, unknown>>(`/v1/module/${encodeURIComponent(name)}`, { signal });
  }

  async getRelease(name: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
    return this.get<Record<string, unknown>>(`/v1/release/${encodeURIComponent(name)}`, { signal });
  }

  async searchReleases(
    distribution: string,
    options: {
      size?: number;
      signal?: AbortSignal;
    } = {}
  ): Promise<MetaCpanSearchResponse> {
    const { size = 50, signal } = options;
    return this.get<MetaCpanSearchResponse>('/v1/release/_search', {
      signal,
      params: {
        q: `distribution:${distribution}`,
        size,
        sort: 'date:desc',
      },
    });
  }

  async getPodDocumentation(name: string, signal?: AbortSignal): Promise<string | null> {
    const response = await fetch(
      `${MetaCpanApiClient.WEB_BASE_URL}/pod/${encodeURIComponent(name)}`,
      createFetchRequestInit({
        accept: 'text/html,application/xhtml+xml',
        signal,
      })
    );

    if (!response.ok) {
      return null;
    }

    const html = await response.text();
    return this.extractPodDocumentation(html);
  }

  private extractPodDocumentation(html: string): string | null {
    const main = this.extractPrimaryContent(html);
    if (!main) {
      return null;
    }

    let markdown = main;

    markdown = markdown
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<pre\b[^>]*>\s*<code\b[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi, (_, code: string) => {
        return `\n\n\`\`\`\n${this.decodeHtmlEntities(code).trim()}\n\`\`\`\n\n`;
      })
      .replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, (_, code: string) => {
        return `\`${this.decodeHtmlEntities(code).trim()}\``;
      })
      .replace(/<a\b[^>]*href=(['"])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi, (_, _quote: string, href: string, text: string) => {
        const label = this.cleanInlineText(text);
        if (!label) {
          return '';
        }
        const absoluteHref = href.startsWith('/')
          ? `${MetaCpanApiClient.WEB_BASE_URL}${href}`
          : href;
        return absoluteHref ? `[${label}](${absoluteHref})` : label;
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

    markdown = this.decodeHtmlEntities(markdown)
      .replace(/\r/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    const stripped = markdown.replace(/[#>*`\-\[\]\(\)!]/g, '').trim();
    if (!stripped || stripped.length < 80) {
      return null;
    }

    return this.trimDocumentationNoise(markdown);
  }

  private extractPrimaryContent(html: string): string | null {
    const candidates = [
      /<main\b[^>]*>([\s\S]*?)<\/main>/i,
      /<article\b[^>]*>([\s\S]*?)<\/article>/i,
      /<body\b[^>]*>([\s\S]*?)<\/body>/i,
    ];

    for (const pattern of candidates) {
      const match = html.match(pattern);
      if (match?.[1]) {
        return match[1];
      }
    }

    return null;
  }

  private trimDocumentationNoise(markdown: string): string {
    const lines = markdown
      .split('\n')
      .map((line) => line.trimEnd());

    const stopHeadings = new Set([
      '# Contents',
      '## Contents',
      '# Module Install Instructions',
      '## Module Install Instructions',
      '# River stage',
      '## River stage',
      '# Issues',
      '## Issues',
      '# Repository',
      '## Repository',
      '# Support',
      '## Support',
      '# Bugs',
      '## Bugs',
    ]);

    const filtered: string[] = [];
    let seenRealHeading = false;

    for (const line of lines) {
      if (stopHeadings.has(line.trim())) {
        break;
      }

      if (/^#{1,6}\s+\S/.test(line)) {
        seenRealHeading = true;
      }

      if (!seenRealHeading) {
        if (
          /^Contents$/i.test(line.trim()) ||
          /^Favorites$/i.test(line.trim()) ||
          /^River stage$/i.test(line.trim())
        ) {
          continue;
        }
      }

      filtered.push(line);
    }

    return filtered
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private cleanInlineText(text: string): string {
    return this.decodeHtmlEntities(text.replace(/<[^>]+>/g, ' '))
      .replace(/\s+/g, ' ')
      .trim();
  }

  private decodeHtmlEntities(text: string): string {
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
