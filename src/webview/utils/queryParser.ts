// Note: sort is no longer part of query string, handled separately

export interface ParsedQuery {
  baseQuery: string;
  // Common filters (npm sources)
  author?: string;
  maintainer?: string;
  scope?: string;
  keywords?: string;
  // Maven-specific filters (Sonatype source)
  groupId?: string;
  artifactId?: string;
  version?: string;
  tags?: string;
  // Libraries.io specific filters
  languages?: string;
  licenses?: string;
  platforms?: string;
  // Package status filters
  excludeUnstable?: boolean;
  excludeInsecure?: boolean;
  includeUnstable?: boolean;
  includeInsecure?: boolean;
  // sortBy is no longer part of query string, handled separately
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
  // Match patterns like "author:value", "groupId:value", etc.
  // Note: sort is no longer part of query string, handled separately
  // Different sources may use different filter formats, but we parse common ones
  const qualifierPatterns = [
    { pattern: /\bauthor:([^\s]+)/g, key: 'author' as const },
    { pattern: /\bmaintainer:([^\s]+)/g, key: 'maintainer' as const },
    { pattern: /\bscope:([^\s]+)/g, key: 'scope' as const },
    { pattern: /\bkeywords:([^\s]+)/g, key: 'keywords' as const },
    { pattern: /\bgroupId:([^\s]+)/g, key: 'groupId' as const },
    { pattern: /\bartifactId:([^\s]+)/g, key: 'artifactId' as const },
    { pattern: /\bversion:([^\s]+)/g, key: 'version' as const },
    { pattern: /\btags:([^\s]+)/g, key: 'tags' as const },
    { pattern: /\blanguages:([^\s]+)/g, key: 'languages' as const },
    { pattern: /\blicenses:([^\s]+)/g, key: 'licenses' as const },
    { pattern: /\bplatforms:([^\s]+)/g, key: 'platforms' as const },
  ];

  const matchesToRemove: string[] = [];

  // Extract qualifiers
  for (const { pattern, key } of qualifierPatterns) {
    const matches = [...query.matchAll(pattern)];
    for (const match of matches) {
      const fullMatch = match[0];
      const value = match[1];
      (result as any)[key] = value;
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
 * Build complete query string from base query and filters
 * Note: sort is no longer part of query string, handled separately
 */
export function buildQuery(params: {
  baseQuery?: string;
  // Common filters (npm sources)
  author?: string;
  maintainer?: string;
  scope?: string;
  keywords?: string;
  // Maven-specific filters (Sonatype source)
  groupId?: string;
  artifactId?: string;
  version?: string;
  tags?: string;
  // Libraries.io specific filters
  languages?: string;
  licenses?: string;
  platforms?: string;
  // Package status filters
  excludeUnstable?: boolean;
  excludeInsecure?: boolean;
  includeUnstable?: boolean;
  includeInsecure?: boolean;
}): string {
  const parts: string[] = [];

  // Add base query
  if (params.baseQuery && params.baseQuery.trim()) {
    parts.push(params.baseQuery.trim());
  }

  // Add common filters (npm sources)
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

  // Add Maven-specific filters (Sonatype source)
  if (params.groupId) {
    parts.push(`groupId:${params.groupId}`);
  }
  if (params.artifactId) {
    parts.push(`artifactId:${params.artifactId}`);
  }
  if (params.version) {
    parts.push(`version:${params.version}`);
  }
  if (params.tags) {
    parts.push(`tags:${params.tags}`);
  }

  // Add Libraries.io specific filters
  if (params.languages) {
    parts.push(`languages:${params.languages}`);
  }
  if (params.licenses) {
    parts.push(`licenses:${params.licenses}`);
  }
  if (params.platforms) {
    parts.push(`platforms:${params.platforms}`);
  }

  // Add package status filters
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

  return parts.join(' ');
}

/**
 * Extract base text (non-qualifier parts) from query string
 * Example: "react author:dan" -> "react"
 * Note: sort is no longer part of query string
 */
export function extractBaseText(query: string): string {
  if (!query || !query.trim()) {
    return '';
  }

  // Patterns for all qualifiers (sort is no longer included)
  const qualifierPatterns = [
    /\bauthor:([^\s]+)/g,
    /\bmaintainer:([^\s]+)/g,
    /\bscope:([^\s]+)/g,
    /\bkeywords:([^\s]+)/g,
    /\bgroupId:([^\s]+)/g,
    /\bartifactId:([^\s]+)/g,
    /\bversion:([^\s]+)/g,
    /\btags:([^\s]+)/g,
    /\blanguages:([^\s]+)/g,
    /\blicenses:([^\s]+)/g,
    /\bplatforms:([^\s]+)/g,
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
  groupId: string;
  artifactId: string;
  version: string;
  tags: string;
  languages: string;
  licenses: string;
  platforms: string;
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
    groupId: parsed.groupId || '',
    artifactId: parsed.artifactId || '',
    version: parsed.version || '',
    tags: parsed.tags || '',
    languages: parsed.languages || '',
    licenses: parsed.licenses || '',
    platforms: parsed.platforms || '',
    excludeUnstable: parsed.excludeUnstable || false,
    excludeInsecure: parsed.excludeInsecure || false,
    includeUnstable: parsed.includeUnstable || false,
    includeInsecure: parsed.includeInsecure || false,
  };
}
