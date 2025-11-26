# API Integration Guide

## NPM Gallery - VS Code Extension

This document details all external APIs used by NPM Gallery and how to integrate with them.

---

## Table of Contents
1. [Overview](#1-overview)
2. [npm Registry API](#2-npm-registry-api)
3. [npms.io API](#3-npmsio-api)
4. [Bundlephobia API](#4-bundlephobia-api)
5. [npm Audit API](#5-npm-audit-api)
6. [GitHub API](#6-github-api)
7. [Caching Strategy](#7-caching-strategy)
8. [Error Handling](#8-error-handling)
9. [Rate Limiting](#9-rate-limiting)

---

## 1. Overview

### 1.1 API Landscape

| API | Purpose | Auth Required | Rate Limit |
|-----|---------|---------------|------------|
| npm Registry | Package data, versions | No | Generous |
| npms.io | Search, scores | No | 5000/day |
| Bundlephobia | Bundle size | No | Fair use |
| npm Audit | Vulnerabilities | No | Per project |
| GitHub | Repository data | Optional | 60/hr (unauth) |

### 1.2 Base URLs
```typescript
const API_ENDPOINTS = {
  NPM_REGISTRY: 'https://registry.npmjs.org',
  NPM_API: 'https://api.npmjs.org',
  NPMS_API: 'https://api.npms.io/v2',
  BUNDLEPHOBIA: 'https://bundlephobia.com/api',
  GITHUB: 'https://api.github.com'
};
```

---

## 2. npm Registry API

### 2.1 Get Package Information
Retrieve complete package metadata.

**Endpoint**: `GET https://registry.npmjs.org/{package-name}`

**Example**:
```bash
GET https://registry.npmjs.org/lodash
```

**Response**:
```json
{
  "_id": "lodash",
  "_rev": "1-abc123",
  "name": "lodash",
  "description": "Lodash modular utilities.",
  "dist-tags": {
    "latest": "4.17.21"
  },
  "versions": {
    "4.17.21": {
      "name": "lodash",
      "version": "4.17.21",
      "description": "Lodash modular utilities.",
      "keywords": ["modules", "stdlib", "util"],
      "license": "MIT",
      "dependencies": {},
      "devDependencies": {},
      "dist": {
        "shasum": "abc123",
        "tarball": "https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz",
        "unpackedSize": 1412415
      }
    }
  },
  "maintainers": [
    { "name": "jdalton", "email": "john@example.com" }
  ],
  "time": {
    "created": "2012-04-23T16:52:25.123Z",
    "modified": "2021-02-20T15:42:10.123Z",
    "4.17.21": "2021-02-20T15:42:10.123Z"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/lodash/lodash.git"
  },
  "readme": "# Lodash\n\nA modern JavaScript utility library...",
  "license": "MIT"
}
```

**TypeScript Interface**:
```typescript
interface NpmPackageInfo {
  _id: string;
  name: string;
  description?: string;
  'dist-tags': Record<string, string>;
  versions: Record<string, NpmVersionInfo>;
  maintainers: Array<{ name: string; email?: string }>;
  time: Record<string, string>;
  repository?: {
    type: string;
    url: string;
  };
  readme?: string;
  license?: string;
  keywords?: string[];
}

interface NpmVersionInfo {
  name: string;
  version: string;
  description?: string;
  main?: string;
  types?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  dist: {
    shasum: string;
    tarball: string;
    unpackedSize?: number;
  };
}
```

### 2.2 Get Abbreviated Package Info
Lighter response for basic information.

**Endpoint**: `GET https://registry.npmjs.org/{package-name}`

**Headers**:
```
Accept: application/vnd.npm.install-v1+json
```

**Response** (abbreviated):
```json
{
  "name": "lodash",
  "dist-tags": { "latest": "4.17.21" },
  "versions": {
    "4.17.21": {
      "name": "lodash",
      "version": "4.17.21",
      "dist": {
        "shasum": "abc123",
        "tarball": "https://..."
      }
    }
  }
}
```

### 2.3 Get Scoped Package
For packages with scopes like `@types/node`.

**Endpoint**: `GET https://registry.npmjs.org/@{scope}%2F{package-name}`

**Example**:
```bash
GET https://registry.npmjs.org/@types%2Fnode
```

### 2.4 Get Download Counts
**Endpoint**: `GET https://api.npmjs.org/downloads/point/{period}/{package}`

**Periods**: `last-day`, `last-week`, `last-month`, `last-year`

**Example**:
```bash
GET https://api.npmjs.org/downloads/point/last-week/lodash
```

**Response**:
```json
{
  "downloads": 45123456,
  "start": "2024-11-08",
  "end": "2024-11-14",
  "package": "lodash"
}
```

### 2.5 Get Download Range
**Endpoint**: `GET https://api.npmjs.org/downloads/range/{start}:{end}/{package}`

**Example**:
```bash
GET https://api.npmjs.org/downloads/range/2024-01-01:2024-11-14/lodash
```

**Response**:
```json
{
  "package": "lodash",
  "start": "2024-01-01",
  "end": "2024-11-14",
  "downloads": [
    { "downloads": 6123456, "day": "2024-01-01" },
    { "downloads": 6234567, "day": "2024-01-02" }
  ]
}
```

### 2.6 Search Packages
**Endpoint**: `GET https://registry.npmjs.org/-/v1/search`

**Query Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| text | string | Search query |
| size | number | Results per page (max 250) |
| from | number | Offset for pagination |
| quality | number | Quality weight (0-1) |
| popularity | number | Popularity weight (0-1) |
| maintenance | number | Maintenance weight (0-1) |

**Example**:
```bash
GET https://registry.npmjs.org/-/v1/search?text=lodash&size=20
```

**Response**:
```json
{
  "objects": [
    {
      "package": {
        "name": "lodash",
        "scope": "unscoped",
        "version": "4.17.21",
        "description": "Lodash modular utilities.",
        "keywords": ["modules", "stdlib"],
        "date": "2021-02-20T15:42:10.000Z",
        "links": {
          "npm": "https://www.npmjs.com/package/lodash",
          "homepage": "https://lodash.com/",
          "repository": "https://github.com/lodash/lodash",
          "bugs": "https://github.com/lodash/lodash/issues"
        },
        "publisher": {
          "username": "jdalton",
          "email": "john@example.com"
        },
        "maintainers": [
          { "username": "jdalton", "email": "john@example.com" }
        ]
      },
      "score": {
        "final": 0.9687,
        "detail": {
          "quality": 0.9912,
          "popularity": 0.9782,
          "maintenance": 0.9345
        }
      },
      "searchScore": 100000.01
    }
  ],
  "total": 1234,
  "time": "Wed Nov 15 2024 10:30:00 GMT+0000"
}
```

---

## 3. npms.io API

Enhanced search and package analysis API.

### 3.1 Search Packages
**Endpoint**: `GET https://api.npms.io/v2/search`

**Query Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| q | string | Search query with modifiers |
| from | number | Offset |
| size | number | Results count (max 250) |

**Search Modifiers**:
- `scope:types` - Filter by scope
- `author:sindresorhus` - Filter by author
- `maintainer:jdalton` - Filter by maintainer
- `keywords:utility` - Filter by keyword
- `is:deprecated` - Show deprecated
- `is:unstable` - Show < 1.0.0
- `not:deprecated` - Hide deprecated
- `boost-exact:false` - Disable exact match boost

**Example**:
```bash
GET https://api.npms.io/v2/search?q=lodash+not:deprecated&size=20
```

**Response**:
```json
{
  "total": 1234,
  "results": [
    {
      "package": {
        "name": "lodash",
        "scope": "unscoped",
        "version": "4.17.21",
        "description": "Lodash modular utilities.",
        "keywords": ["modules", "stdlib"],
        "date": "2021-02-20T15:42:10.000Z",
        "links": {
          "npm": "https://www.npmjs.com/package/lodash",
          "homepage": "https://lodash.com/",
          "repository": "https://github.com/lodash/lodash"
        },
        "author": { "name": "John-David Dalton" },
        "publisher": { "username": "jdalton" },
        "maintainers": [{ "username": "jdalton" }]
      },
      "score": {
        "final": 0.9687,
        "detail": {
          "quality": 0.9912,
          "popularity": 0.9782,
          "maintenance": 0.9345
        }
      },
      "searchScore": 100000.01,
      "highlight": "<em>lodash</em>"
    }
  ]
}
```

### 3.2 Get Package Analysis
**Endpoint**: `GET https://api.npms.io/v2/package/{package}`

**Example**:
```bash
GET https://api.npms.io/v2/package/lodash
```

**Response**:
```json
{
  "analyzedAt": "2024-11-15T10:30:00.000Z",
  "collected": {
    "metadata": {
      "name": "lodash",
      "scope": "unscoped",
      "version": "4.17.21",
      "description": "Lodash modular utilities.",
      "keywords": ["modules", "stdlib"],
      "date": "2021-02-20T15:42:10.000Z",
      "publisher": { "username": "jdalton" },
      "maintainers": [{ "username": "jdalton" }],
      "repository": {
        "type": "git",
        "url": "https://github.com/lodash/lodash"
      },
      "links": {
        "npm": "https://www.npmjs.com/package/lodash",
        "homepage": "https://lodash.com/",
        "repository": "https://github.com/lodash/lodash",
        "bugs": "https://github.com/lodash/lodash/issues"
      },
      "license": "MIT",
      "dependencies": {},
      "devDependencies": {},
      "releases": [
        { "from": "2024-10-15", "to": "2024-11-15", "count": 0 }
      ],
      "hasSelectiveFiles": true
    },
    "npm": {
      "downloads": [
        { "from": "2024-10-15", "to": "2024-11-15", "count": 180000000 }
      ],
      "starsCount": 123
    },
    "github": {
      "starsCount": 57234,
      "forksCount": 6987,
      "subscribersCount": 1234,
      "issues": {
        "count": 456,
        "openCount": 78,
        "distribution": { "3600": 10, "86400": 20 },
        "isDisabled": false
      },
      "contributors": [
        { "username": "jdalton", "commitsCount": 4567 }
      ],
      "commits": [
        { "from": "2024-10-15", "to": "2024-11-15", "count": 5 }
      ]
    },
    "source": {
      "files": {
        "readmeSize": 12345,
        "testsSize": 234567,
        "hasChangelog": true
      },
      "coverage": 98.5,
      "outdatedDependencies": {}
    }
  },
  "evaluation": {
    "quality": {
      "carefulness": 0.99,
      "tests": 0.98,
      "health": 0.97,
      "branding": 0.95
    },
    "popularity": {
      "communityInterest": 57234,
      "downloadsCount": 180000000,
      "downloadsAcceleration": 1234567,
      "dependentsCount": 123456
    },
    "maintenance": {
      "releasesFrequency": 0.85,
      "commitsFrequency": 0.90,
      "openIssues": 0.92,
      "issuesDistribution": 0.88
    }
  },
  "score": {
    "final": 0.9687,
    "detail": {
      "quality": 0.9912,
      "popularity": 0.9782,
      "maintenance": 0.9345
    }
  }
}
```

### 3.3 Bulk Package Analysis
**Endpoint**: `POST https://api.npms.io/v2/package/mget`

**Body**:
```json
["lodash", "express", "react"]
```

**Response**:
```json
{
  "lodash": { /* same as single package */ },
  "express": { /* ... */ },
  "react": { /* ... */ }
}
```

### 3.4 Search Suggestions
**Endpoint**: `GET https://api.npms.io/v2/search/suggestions`

**Query Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| q | string | Search query |
| size | number | Max suggestions (default 25) |

**Example**:
```bash
GET https://api.npms.io/v2/search/suggestions?q=lod&size=10
```

---

## 4. Bundlephobia API

Get package bundle size information.

### 4.1 Get Package Size
**Endpoint**: `GET https://bundlephobia.com/api/size`

**Query Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| package | string | Package name with version |
| record | boolean | Store result (default true) |

**Example**:
```bash
GET https://bundlephobia.com/api/size?package=lodash@4.17.21
```

**Response**:
```json
{
  "assets": [
    {
      "gzip": 25063,
      "name": "main",
      "size": 72477,
      "type": "js"
    }
  ],
  "dependencyCount": 0,
  "dependencySizes": [],
  "description": "Lodash modular utilities.",
  "gzip": 25063,
  "hasJSModule": true,
  "hasJSNext": false,
  "hasSideEffects": true,
  "name": "lodash",
  "repository": "https://github.com/lodash/lodash",
  "scoped": false,
  "size": 72477,
  "version": "4.17.21"
}
```

**TypeScript Interface**:
```typescript
interface BundlephobiaResult {
  name: string;
  version: string;
  description: string;
  size: number;           // Minified size in bytes
  gzip: number;           // Gzipped size in bytes
  dependencyCount: number;
  dependencySizes: Array<{
    name: string;
    approximateSize: number;
  }>;
  hasJSModule: boolean;   // ES Modules support
  hasJSNext: boolean;     // Legacy ES Modules
  hasSideEffects: boolean;
  scoped: boolean;
  repository?: string;
}
```

### 4.2 Get Export Sizes
**Endpoint**: `GET https://bundlephobia.com/api/exports-sizes`

**Query Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| package | string | Package name with version |

**Response**:
```json
{
  "assets": [
    { "name": "debounce", "gzip": 392, "size": 879 },
    { "name": "throttle", "gzip": 401, "size": 912 },
    { "name": "cloneDeep", "gzip": 2103, "size": 5234 }
  ]
}
```

### 4.3 Package History
**Endpoint**: `GET https://bundlephobia.com/api/package-history`

**Query Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| package | string | Package name |

**Response**:
```json
{
  "4.17.19": { "size": 72100, "gzip": 24900 },
  "4.17.20": { "size": 72300, "gzip": 25000 },
  "4.17.21": { "size": 72477, "gzip": 25063 }
}
```

---

## 5. npm Audit API

Check packages for security vulnerabilities.

### 5.1 Quick Audit
**Endpoint**: `POST https://registry.npmjs.org/-/npm/v1/security/advisories/bulk`

**Headers**:
```
Content-Type: application/json
```

**Body**:
```json
{
  "lodash": ["4.17.20"],
  "express": ["4.17.1", "4.18.0"]
}
```

**Response**:
```json
{
  "lodash": [
    {
      "id": 1523,
      "url": "https://npmjs.com/advisories/1523",
      "title": "Prototype Pollution",
      "severity": "high",
      "vulnerable_versions": "<4.17.21",
      "cwe": ["CWE-1321"],
      "cvss": {
        "score": 7.4,
        "vectorString": "CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:N"
      }
    }
  ],
  "express": []
}
```

### 5.2 Full Audit
**Endpoint**: `POST https://registry.npmjs.org/-/npm/v1/security/audits`

**Body**: Package lock file content
```json
{
  "name": "my-project",
  "requires": {
    "lodash": "^4.17.20"
  },
  "dependencies": {
    "lodash": {
      "version": "4.17.20"
    }
  }
}
```

**Response**:
```json
{
  "actions": [
    {
      "action": "update",
      "module": "lodash",
      "target": "4.17.21",
      "resolves": [{ "id": 1523, "path": "lodash" }]
    }
  ],
  "advisories": {
    "1523": {
      "id": 1523,
      "title": "Prototype Pollution in lodash",
      "module_name": "lodash",
      "severity": "high",
      "url": "https://npmjs.com/advisories/1523",
      "findings": [
        {
          "version": "4.17.20",
          "paths": ["lodash"]
        }
      ],
      "recommendation": "Upgrade to version 4.17.21 or later"
    }
  },
  "metadata": {
    "vulnerabilities": {
      "info": 0,
      "low": 0,
      "moderate": 0,
      "high": 1,
      "critical": 0
    },
    "dependencies": 1,
    "devDependencies": 0,
    "totalDependencies": 1
  }
}
```

**TypeScript Interface**:
```typescript
interface AuditAdvisory {
  id: number;
  title: string;
  module_name: string;
  severity: 'info' | 'low' | 'moderate' | 'high' | 'critical';
  url: string;
  vulnerable_versions: string;
  patched_versions: string;
  recommendation: string;
  cwe: string[];
  cvss?: {
    score: number;
    vectorString: string;
  };
  findings: Array<{
    version: string;
    paths: string[];
  }>;
}

interface AuditResponse {
  actions: AuditAction[];
  advisories: Record<string, AuditAdvisory>;
  metadata: {
    vulnerabilities: Record<string, number>;
    dependencies: number;
    devDependencies: number;
    totalDependencies: number;
  };
}
```

---

## 6. GitHub API

Supplement package data with repository information.

### 6.1 Get Repository Info
**Endpoint**: `GET https://api.github.com/repos/{owner}/{repo}`

**Example**:
```bash
GET https://api.github.com/repos/lodash/lodash
```

**Headers** (optional, for higher rate limits):
```
Authorization: Bearer {token}
```

**Response**:
```json
{
  "id": 12345678,
  "name": "lodash",
  "full_name": "lodash/lodash",
  "description": "A modern JavaScript utility library",
  "stargazers_count": 57234,
  "forks_count": 6987,
  "open_issues_count": 456,
  "license": {
    "key": "mit",
    "name": "MIT License"
  },
  "created_at": "2012-04-23T16:52:25Z",
  "updated_at": "2024-11-15T10:30:00Z",
  "pushed_at": "2024-11-10T08:15:00Z"
}
```

### 6.2 Get Latest Release
**Endpoint**: `GET https://api.github.com/repos/{owner}/{repo}/releases/latest`

**Response**:
```json
{
  "tag_name": "v4.17.21",
  "name": "4.17.21",
  "body": "## Changelog\n- Fixed prototype pollution...",
  "published_at": "2021-02-20T15:42:10Z"
}
```

### 6.3 Parse Repository URL
Utility function to extract owner/repo from npm repository field:

```typescript
function parseGitHubRepo(url: string): { owner: string; repo: string } | null {
  const patterns = [
    /github\.com\/([^\/]+)\/([^\/\.]+)/,
    /github:([^\/]+)\/([^\/\.]+)/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return { owner: match[1], repo: match[2] };
    }
  }
  return null;
}
```

---

## 7. Caching Strategy

### 7.1 Cache Layers
```
┌─────────────────────────────────────────────┐
│              Extension Memory               │
│         (Hot cache, 5 min TTL)             │
├─────────────────────────────────────────────┤
│           VS Code Global State              │
│        (Warm cache, 1 hour TTL)            │
├─────────────────────────────────────────────┤
│             External APIs                   │
│          (Cold, network call)              │
└─────────────────────────────────────────────┘
```

### 7.2 TTL Configuration
```typescript
const CACHE_TTL = {
  SEARCH_RESULTS: 5 * 60 * 1000,        // 5 minutes
  PACKAGE_INFO: 60 * 60 * 1000,         // 1 hour
  PACKAGE_VERSIONS: 30 * 60 * 1000,     // 30 minutes
  BUNDLE_SIZE: 24 * 60 * 60 * 1000,     // 24 hours
  DOWNLOAD_STATS: 60 * 60 * 1000,       // 1 hour
  SECURITY_AUDIT: 15 * 60 * 1000,       // 15 minutes
  GITHUB_DATA: 60 * 60 * 1000           // 1 hour
};
```

### 7.3 Cache Implementation
```typescript
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class ApiCache {
  private memoryCache: Map<string, CacheEntry<unknown>>;
  private context: vscode.ExtensionContext;

  async get<T>(key: string): Promise<T | null> {
    // Check memory cache first
    const memEntry = this.memoryCache.get(key);
    if (memEntry && !this.isExpired(memEntry)) {
      return memEntry.data as T;
    }

    // Check persistent cache
    const persisted = this.context.globalState.get<CacheEntry<T>>(key);
    if (persisted && !this.isExpired(persisted)) {
      // Promote to memory cache
      this.memoryCache.set(key, persisted);
      return persisted.data;
    }

    return null;
  }

  async set<T>(key: string, data: T, ttl: number): Promise<void> {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl
    };

    this.memoryCache.set(key, entry);
    await this.context.globalState.update(key, entry);
  }

  private isExpired(entry: CacheEntry<unknown>): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }
}
```

---

## 8. Error Handling

### 8.1 Error Types
```typescript
enum ApiErrorType {
  NETWORK_ERROR = 'NETWORK_ERROR',
  RATE_LIMITED = 'RATE_LIMITED',
  NOT_FOUND = 'NOT_FOUND',
  SERVER_ERROR = 'SERVER_ERROR',
  INVALID_RESPONSE = 'INVALID_RESPONSE',
  TIMEOUT = 'TIMEOUT'
}

class ApiError extends Error {
  constructor(
    public type: ApiErrorType,
    public statusCode?: number,
    public retryAfter?: number
  ) {
    super(`API Error: ${type}`);
  }
}
```

### 8.2 Retry Strategy
```typescript
async function fetchWithRetry<T>(
  url: string,
  options: RequestInit,
  maxRetries = 3
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(10000) // 10s timeout
      });

      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '60');
        throw new ApiError(ApiErrorType.RATE_LIMITED, 429, retryAfter);
      }

      if (!response.ok) {
        throw new ApiError(
          response.status === 404 ? ApiErrorType.NOT_FOUND : ApiErrorType.SERVER_ERROR,
          response.status
        );
      }

      return await response.json();
    } catch (error) {
      lastError = error as Error;

      if (error instanceof ApiError && error.type === ApiErrorType.NOT_FOUND) {
        throw error; // Don't retry 404s
      }

      // Exponential backoff
      await new Promise(resolve =>
        setTimeout(resolve, Math.pow(2, attempt) * 1000)
      );
    }
  }

  throw lastError!;
}
```

### 8.3 Graceful Degradation
```typescript
async function getPackageWithFallback(name: string): Promise<PackageInfo> {
  try {
    // Try npms.io first (richer data)
    return await npmsApi.getPackage(name);
  } catch (error) {
    console.warn('npms.io failed, falling back to npm registry');

    try {
      // Fall back to npm registry
      return await npmRegistry.getPackage(name);
    } catch (registryError) {
      // Return cached data if available
      const cached = await cache.get(`package:${name}`);
      if (cached) {
        return { ...cached, stale: true };
      }

      throw registryError;
    }
  }
}
```

---

## 9. Rate Limiting

### 9.1 Rate Limit Tracking
```typescript
interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
}

class RateLimiter {
  private limits: Map<string, RateLimitInfo> = new Map();

  updateFromResponse(api: string, headers: Headers): void {
    const limit = parseInt(headers.get('X-RateLimit-Limit') || '0');
    const remaining = parseInt(headers.get('X-RateLimit-Remaining') || '0');
    const reset = parseInt(headers.get('X-RateLimit-Reset') || '0');

    if (limit > 0) {
      this.limits.set(api, { limit, remaining, reset });
    }
  }

  canMakeRequest(api: string): boolean {
    const info = this.limits.get(api);
    if (!info) return true;

    if (Date.now() / 1000 > info.reset) {
      return true; // Limit has reset
    }

    return info.remaining > 0;
  }

  getWaitTime(api: string): number {
    const info = this.limits.get(api);
    if (!info || info.remaining > 0) return 0;

    return Math.max(0, info.reset - Date.now() / 1000) * 1000;
  }
}
```

### 9.2 Request Queue
```typescript
class RequestQueue {
  private queue: Array<() => Promise<void>> = [];
  private processing = false;
  private rateLimiter: RateLimiter;

  async enqueue<T>(api: string, request: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        const waitTime = this.rateLimiter.getWaitTime(api);
        if (waitTime > 0) {
          await new Promise(r => setTimeout(r, waitTime));
        }

        try {
          const result = await request();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;
    while (this.queue.length > 0) {
      const request = this.queue.shift()!;
      await request();
    }
    this.processing = false;
  }
}
```

### 9.3 API-Specific Limits
| API | Limit | Window | Strategy |
|-----|-------|--------|----------|
| npm Registry | High | - | Standard caching |
| npms.io | 5000 | Day | Queue requests |
| Bundlephobia | Fair use | - | Aggressive caching |
| GitHub (unauth) | 60 | Hour | Minimal usage |
| GitHub (auth) | 5000 | Hour | Normal usage |

---

## 10. API Client Implementation

### 10.1 Base Client
```typescript
abstract class BaseApiClient {
  protected cache: ApiCache;
  protected rateLimiter: RateLimiter;

  constructor(
    protected baseUrl: string,
    protected name: string
  ) {}

  protected async request<T>(
    endpoint: string,
    options: RequestInit = {},
    cacheKey?: string,
    cacheTtl?: number
  ): Promise<T> {
    // Check cache first
    if (cacheKey) {
      const cached = await this.cache.get<T>(cacheKey);
      if (cached) return cached;
    }

    // Check rate limit
    if (!this.rateLimiter.canMakeRequest(this.name)) {
      const waitTime = this.rateLimiter.getWaitTime(this.name);
      throw new ApiError(ApiErrorType.RATE_LIMITED, 429, waitTime);
    }

    // Make request
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Accept': 'application/json',
        ...options.headers
      }
    });

    // Update rate limit tracking
    this.rateLimiter.updateFromResponse(this.name, response.headers);

    if (!response.ok) {
      throw new ApiError(
        response.status === 404 ? ApiErrorType.NOT_FOUND : ApiErrorType.SERVER_ERROR,
        response.status
      );
    }

    const data = await response.json() as T;

    // Cache successful response
    if (cacheKey && cacheTtl) {
      await this.cache.set(cacheKey, data, cacheTtl);
    }

    return data;
  }
}
```

### 10.2 Usage Example
```typescript
class NpmRegistryClient extends BaseApiClient {
  constructor() {
    super('https://registry.npmjs.org', 'npm-registry');
  }

  async getPackage(name: string): Promise<NpmPackageInfo> {
    const encodedName = encodeURIComponent(name).replace('%40', '@');
    return this.request<NpmPackageInfo>(
      `/${encodedName}`,
      {},
      `npm:package:${name}`,
      CACHE_TTL.PACKAGE_INFO
    );
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult> {
    const params = new URLSearchParams({
      text: query,
      size: String(options?.size || 20),
      from: String(options?.from || 0)
    });

    return this.request<SearchResult>(
      `/-/v1/search?${params}`,
      {},
      `npm:search:${query}:${options?.size}:${options?.from}`,
      CACHE_TTL.SEARCH_RESULTS
    );
  }
}
```

---

## Appendix: Quick Reference

### Endpoint Summary
```typescript
const ENDPOINTS = {
  // npm Registry
  NPM_PACKAGE: (name: string) =>
    `https://registry.npmjs.org/${encodeURIComponent(name)}`,
  NPM_SEARCH: 'https://registry.npmjs.org/-/v1/search',
  NPM_DOWNLOADS: (period: string, pkg: string) =>
    `https://api.npmjs.org/downloads/point/${period}/${pkg}`,

  // npms.io
  NPMS_SEARCH: 'https://api.npms.io/v2/search',
  NPMS_PACKAGE: (name: string) =>
    `https://api.npms.io/v2/package/${encodeURIComponent(name)}`,
  NPMS_SUGGESTIONS: 'https://api.npms.io/v2/search/suggestions',

  // Bundlephobia
  BUNDLE_SIZE: (pkg: string) =>
    `https://bundlephobia.com/api/size?package=${encodeURIComponent(pkg)}`,

  // npm Audit
  NPM_AUDIT: 'https://registry.npmjs.org/-/npm/v1/security/advisories/bulk',

  // GitHub
  GITHUB_REPO: (owner: string, repo: string) =>
    `https://api.github.com/repos/${owner}/${repo}`
};
```
