import type { SearchSortBy } from '../../types/package';

export interface ParsedQuery {
  baseQuery: string;
  author?: string;
  maintainer?: string;
  scope?: string;
  keywords?: string;
  excludeUnstable?: boolean;
  excludeInsecure?: boolean;
  includeUnstable?: boolean;
  includeInsecure?: boolean;
  sortBy?: SearchSortBy;
}

/**
 * Parse search query to extract base query, filters, and sort
 * Supports queries like "flat author:jkoops sort:quality"
 */
export function parseQuery(query: string): ParsedQuery {
  const result: ParsedQuery = {
    baseQuery: '',
  };

  if (!query || !query.trim()) {
    return result;
  }

  // Use regex to match qualifiers while preserving the rest as base query
  // Match patterns like "author:value", "sort:value", etc.
  const qualifierPatterns = [
    { pattern: /\bauthor:([^\s]+)/g, key: 'author' as const },
    { pattern: /\bmaintainer:([^\s]+)/g, key: 'maintainer' as const },
    { pattern: /\bscope:([^\s]+)/g, key: 'scope' as const },
    { pattern: /\bkeywords:([^\s]+)/g, key: 'keywords' as const },
    { pattern: /\bsort:([^\s]+)/g, key: 'sortBy' as const },
  ];

  const matchesToRemove: string[] = [];

  // Extract qualifiers
  for (const { pattern, key } of qualifierPatterns) {
    const matches = [...query.matchAll(pattern)];
    for (const match of matches) {
      const fullMatch = match[0];
      const value = match[1];
      
      if (key === 'sortBy') {
        if (['relevance', 'popularity', 'quality', 'maintenance', 'name'].includes(value)) {
          result.sortBy = value as SearchSortBy;
        }
      } else {
        (result as any)[key] = value;
      }
      
      // Mark for removal
      matchesToRemove.push(fullMatch);
    }
  }

  // Handle boolean flags
  const booleanPatterns = [
    { pattern: /\bnot:unstable\b/g, key: 'excludeUnstable' as const },
    { pattern: /\bnot:insecure\b/g, key: 'excludeInsecure' as const },
    { pattern: /\bis:unstable\b/g, key: 'includeUnstable' as const },
    { pattern: /\bis:insecure\b/g, key: 'includeInsecure' as const },
  ];

  for (const { pattern, key } of booleanPatterns) {
    const matches = [...query.matchAll(pattern)];
    if (matches.length > 0) {
      (result as any)[key] = true;
      for (const match of matches) {
        matchesToRemove.push(match[0]);
      }
    }
  }

  // Remove all matched qualifiers from the query
  let processedQuery = query;
  for (const match of matchesToRemove) {
    // Escape special regex characters in the match string
    const escapedMatch = match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    processedQuery = processedQuery.replace(new RegExp(escapedMatch, 'g'), '');
  }

  // Clean up multiple spaces and trim
  result.baseQuery = processedQuery.replace(/\s+/g, ' ').trim();

  return result;
}

/**
 * Build complete query string from base query, filters, and sort
 */
export function buildQuery(params: {
  baseQuery?: string;
  author?: string;
  maintainer?: string;
  scope?: string;
  keywords?: string;
  excludeUnstable?: boolean;
  excludeInsecure?: boolean;
  includeUnstable?: boolean;
  includeInsecure?: boolean;
  sortBy?: SearchSortBy;
}): string {
  const parts: string[] = [];

  // Add base query
  if (params.baseQuery && params.baseQuery.trim()) {
    parts.push(params.baseQuery.trim());
  }

  // Add filters
  if (params.author) {
    parts.push(`author:${params.author}`);
  }
  if (params.maintainer) {
    parts.push(`maintainer:${params.maintainer}`);
  }
  if (params.scope) {
    parts.push(`scope:${params.scope}`);
  }
  if (params.keywords) {
    parts.push(`keywords:${params.keywords}`);
  }
  if (params.excludeUnstable) {
    parts.push('not:unstable');
  }
  if (params.excludeInsecure) {
    parts.push('not:insecure');
  }
  if (params.includeUnstable) {
    parts.push('is:unstable');
  }
  if (params.includeInsecure) {
    parts.push('is:insecure');
  }

  // Add sort (only if not relevance, as relevance is default)
  if (params.sortBy && params.sortBy !== 'relevance') {
    parts.push(`sort:${params.sortBy}`);
  }

  return parts.join(' ');
}

/**
 * Extract base text (non-qualifier parts) from query string
 * Example: "react author:dan sort:quality" -> "react"
 */
export function extractBaseText(query: string): string {
  if (!query || !query.trim()) {
    return '';
  }

  // Patterns for all qualifiers
  const qualifierPatterns = [
    /\bauthor:([^\s]+)/g,
    /\bmaintainer:([^\s]+)/g,
    /\bscope:([^\s]+)/g,
    /\bkeywords:([^\s]+)/g,
    /\bsort:([^\s]+)/g,
    /\bnot:unstable\b/g,
    /\bnot:insecure\b/g,
    /\bis:unstable\b/g,
    /\bis:insecure\b/g,
  ];

  let processedQuery = query;

  // Remove all qualifiers
  for (const pattern of qualifierPatterns) {
    processedQuery = processedQuery.replace(pattern, '');
  }

  // Clean up multiple spaces and trim
  return processedQuery.replace(/\s+/g, ' ').trim();
}

/**
 * Parse query string to FilterState object
 * This is a convenience function that extracts filters from a query string
 */
export function parseQueryToFilters(query: string): {
  author: string;
  maintainer: string;
  scope: string;
  keywords: string;
  excludeUnstable: boolean;
  excludeInsecure: boolean;
  includeUnstable: boolean;
  includeInsecure: boolean;
} {
  const parsed = parseQuery(query);
  return {
    author: parsed.author || '',
    maintainer: parsed.maintainer || '',
    scope: parsed.scope || '',
    keywords: parsed.keywords || '',
    excludeUnstable: parsed.excludeUnstable || false,
    excludeInsecure: parsed.excludeInsecure || false,
    includeUnstable: parsed.includeUnstable || false,
    includeInsecure: parsed.includeInsecure || false,
  };
}
