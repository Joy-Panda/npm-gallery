# Architecture Document

## NPM Gallery - VS Code Extension

This document describes the technical architecture, design decisions, and component structure of the NPM Gallery extension.

---

## Table of Contents
1. [High-Level Architecture](#1-high-level-architecture)
2. [Project Structure](#2-project-structure)
3. [Core Components](#3-core-components)
4. [Data Flow](#4-data-flow)
5. [State Management](#5-state-management)
6. [Extension Points](#6-extension-points)
7. [Security Considerations](#7-security-considerations)
8. [Performance Optimization](#8-performance-optimization)
9. [Testing Strategy](#9-testing-strategy)
10. [Technology Decisions](#10-technology-decisions)

---

## 1. High-Level Architecture

### 1.1 Architecture Overview
```
┌─────────────────────────────────────────────────────────────────────┐
│                         VS Code Extension Host                      │
├─────────────────────────────────────────────────────────────────────┤
│  ┌────────────────┐  ┌────────────────┐  ┌─────────────────────┐  │
│  │ Extension      │  │ Webview + Tree │  │ Editor integrations │  │
│  │ activation     │  │ providers      │  │ Hover / CodeLens    │  │
│  └────────┬───────┘  └────────┬───────┘  └──────────┬──────────┘  │
│           └───────────────────┴──────────────────────┘             │
│                               │                                    │
│   ┌───────────────────────────▼─────────────────────────────────┐  │
│   │                    Core services                             │  │
│   │ Package / Search / Install / Workspace / SourceContext      │  │
│   │ PackageQuery / NpmLocal                                     │  │
│   └───────────────────────────┬─────────────────────────────────┘  │
│                               │                                    │
│   ┌───────────────────────────▼─────────────────────────────────┐  │
│   │                Source infrastructure                         │  │
│   │ SourceConfig / ProjectDetector / SourceRegistry / Selector   │  │
│   └───────────────────────────┬─────────────────────────────────┘  │
│                               │                                    │
│   ┌───────────────────────────▼─────────────────────────────────┐  │
│   │                    Source adapters                           │  │
│   │ npm / npms / sonatype / nuget / packagist / rubygems / ...  │  │
│   └───────────────────────────┬─────────────────────────────────┘  │
│                               │                                    │
│   ┌───────────────────────────▼─────────────────────────────────┐  │
│   │                     API clients                              │  │
│   │ npm-registry / deps.dev / osv / sonatype / nuget / ...      │  │
│   └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 Layer Responsibilities

| Layer | Responsibility |
|-------|----------------|
| **Extension Host** | VS Code integration, activation, commands |
| **Webview / Trees** | Search UI, details panel, installed and updates trees |
| **Editor Integrations** | Manifest-aware hover and CodeLens routing |
| **Core Services** | Search, package queries, install, workspace orchestration, source context |
| **Source Infrastructure** | Project detection, source registration, source selection |
| **Source Adapters / APIs** | Ecosystem-specific capabilities and external API communication |

---

## 2. Project Structure

```
npm-gallery/
├── .vscode/
│   ├── launch.json           # Debug configurations
│   └── tasks.json            # Build tasks
├── docs/                     # Documentation
│   ├── README.md
│   ├── PRD.md
│   ├── FEATURES.md
│   ├── ARCHITECTURE.md
│   ├── API.md
│   ├── UI-UX.md
│   └── DEVELOPMENT.md
├── src/
│   ├── extension.ts          # Extension entry point
│   ├── constants.ts          # Configuration constants
│   │
│   ├── api/                  # API clients
│   │   ├── index.ts
│   │   ├── base-client.ts
│   │   ├── npm-registry.ts
│   │   ├── npms-api.ts
│   │   ├── bundlephobia.ts
│   │   ├── npm-audit.ts
│   │   └── github.ts
│   │
│   ├── services/             # Business logic services
│   │   ├── index.ts
│   │   ├── container.ts
│   │   ├── package-service.ts
│   │   ├── search-service.ts
│   │   ├── install-service.ts
│   │   ├── source-context-service.ts
│   │   ├── workspace-service.ts
│   │   ├── package/          # Package query + npm-local helpers
│   │   ├── source-context/   # Source-specific context strategies
│   │   └── workspace/        # Discovery, scope, parsers, editors
│   │
│   ├── providers/            # VS Code providers
│   │   ├── index.ts
│   │   ├── hover-provider.ts
│   │   ├── codelens-provider.ts
│   │   ├── webview-provider.ts
│   │   ├── package-details-panel.ts
│   │   ├── hover/            # Per-ecosystem hover handlers
│   │   └── codelens/         # Per-ecosystem CodeLens handlers
│   │
│   ├── commands/             # Command handlers
│   │   ├── index.ts
│   │   ├── search.ts
│   │   ├── install.ts
│   │   ├── update.ts
│   │   ├── audit.ts
│   │   └── open-panel.ts
│   │
│   ├── cache/                # Caching infrastructure
│   │   ├── index.ts
│   │   ├── memory-cache.ts
│   │   └── persistent-cache.ts
│   │
│   ├── utils/                # Utility functions
│   │   ├── index.ts
│   │   ├── package-json.ts   # npm-specific helpers
│   │   ├── semver.ts
│   │   ├── url-parser.ts
│   │   └── formatters.ts
│   │
│   ├── types/                # TypeScript interfaces
│   │   ├── index.ts
│   │   ├── api.ts
│   │   ├── package.ts
│   │   ├── search.ts
│   │   └── config.ts
│   │
│   └── webview/              # Webview UI (React)
│       ├── index.tsx
│       ├── App.tsx
│       ├── components/
│       │   ├── SearchBar.tsx
│       │   ├── SearchResults.tsx
│       │   ├── PackageCard.tsx
│       │   ├── PackageDetails.tsx
│       │   ├── VersionSelector.tsx
│       │   ├── SecurityBadge.tsx
│       │   └── InstallModal.tsx
│       ├── hooks/
│       │   ├── useSearch.ts
│       │   ├── usePackage.ts
│       │   └── useVSCode.ts
│       ├── context/
│       │   └── VSCodeContext.tsx
│       └── styles/
│           └── index.css
│
├── test/                     # Test files
│   ├── unit/
│   │   ├── api/
│   │   ├── services/
│   │   └── utils/
│   ├── integration/
│   │   └── extension.test.ts
│   └── fixtures/
│       └── mock-data.ts
│
├── media/                    # Static assets
│   ├── icon.png
│   └── logo.svg
│
├── package.json              # Extension manifest
├── tsconfig.json             # TypeScript config
├── webpack.config.js         # Webpack config
├── .eslintrc.js              # ESLint config
└── README.md                 # Project readme
```

---

## 3. Core Components

### 3.1 Extension Entry Point

```typescript
// src/extension.ts
import * as vscode from 'vscode';
import { createApiClients } from './api';
import { registerCommands } from './commands';
import { initServices } from './services';
import {
  InstalledPackagesProvider,
  PackageCodeLensProvider,
  PackageHoverProvider,
  SearchViewProvider,
  UpdatesProvider,
} from './providers';

export async function activate(context: vscode.ExtensionContext) {
  console.log('NPM Gallery: Activating...');

  createApiClients();
  const services = await initServices();
  const workspaceDisposables = services.workspace.initialize();
  context.subscriptions.push(...workspaceDisposables);

  const hoverProvider = new PackageHoverProvider();
  const codeLensProvider = new PackageCodeLensProvider();
  const searchViewProvider = new SearchViewProvider(context.extensionUri);
  const installedProvider = new InstalledPackagesProvider();
  const updatesProvider = new UpdatesProvider();

  registerCommands(context, {
    codelens: codeLensProvider,
    installed: installedProvider,
    updates: updatesProvider,
  });

  console.log('NPM Gallery: Activated successfully');
}

export function deactivate() {
  console.log('NPM Gallery: Deactivating...');
}
```

### 3.2 Service Container

```typescript
// src/services/container.ts
import { PackageService } from './package-service';
import { SearchService } from './search-service';
import { InstallService } from './install-service';
import { WorkspaceService } from './workspace-service';
import { SourceContextService } from './source-context-service';
import { initSourceConfigManager } from '../config/source-config';
import { initSourceRegistry } from '../registry/source-registry';
import { getProjectDetector } from '../registry/project-detector';
import { initSourceSelector } from '../registry/source-selector';

export class ServiceContainer {
  readonly package: PackageService;
  readonly search: SearchService;
  readonly install: InstallService;
  readonly workspace: WorkspaceService;
  readonly sourceContext: SourceContextService;

  readonly configManager = initSourceConfigManager();
  readonly sourceRegistry = initSourceRegistry();
  readonly projectDetector = getProjectDetector();
  readonly sourceSelector = initSourceSelector(
    this.sourceRegistry,
    this.projectDetector,
    this.configManager
  );

  constructor() {
    this.workspace = new WorkspaceService();
    this.package = new PackageService(this.sourceSelector);
    this.search = new SearchService(this.sourceSelector);
    this.install = new InstallService(this.sourceSelector, this.workspace);
    this.sourceContext = new SourceContextService({
      workspace: this.workspace,
      install: this.install,
      package: this.package,
      search: this.search,
      getCurrentProjectType: () => this.getCurrentProjectType(),
      getCurrentSourceType: () => this.getCurrentSourceType(),
      getDetectedProjectTypes: () => this.getDetectedProjectTypes(),
      getAvailableSources: () => this.getAvailableSources(),
      getSupportedSortOptions: () => this.getSupportedSortOptions(),
      getSupportedFilters: () => this.getSupportedFilters(),
    });
  }
}
```

Current role split:

- `ServiceContainer`: wires source registry, project detection, source selection, and core services.
- `WorkspaceService`: owns manifest discovery, scope resolution, installed/update parsing, manifest edits, and refresh orchestration.
- `PackageService`: façade over source-facing queries and npm-local dependency analysis.
- `SourceContextService`: builds the `sourceInfo` payload shared by the sidebar and details panel.

### 3.3 API Client Base Class

```typescript
// src/api/base-client.ts
import axios, { AxiosInstance, AxiosError, AxiosHeaders } from 'axios';
import * as vscode from 'vscode';

export abstract class BaseApiClient {
  protected client: AxiosInstance;

  constructor(baseURL: string, serviceName: string, timeout = 10000) {
    this.client = axios.create({ baseURL, timeout });
    this.client.interceptors.request.use((config) => {
      config.headers = AxiosHeaders.from({
        Accept: 'application/json',
        'User-Agent': getUserAgent(),
        ...(config.headers || {}),
      });
      return config;
    });
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        throw this.handleAxiosError(error);
      }
    );
  }

  protected async get<T>(endpoint: string) {
    const response = await this.client.get<T>(endpoint);
    return response.data;
  }

  protected async post<T>(endpoint: string, data?: unknown) {
    const response = await this.client.post<T>(endpoint, data);
    return response.data;
  }
}
```

Notes:

- shared request metadata such as `User-Agent` is injected dynamically at request time
- cache policy is not owned by `BaseApiClient`; source-level or service-level caches sit above the transport layer
- some APIs also use shared `fetch` helpers, but they follow the same header strategy

### 3.4 Package Service

```typescript
// src/services/package-service.ts
import { NpmLocalService } from './package/npm-local-service';
import { PackageQueryService } from './package/package-query-service';
import type { SourceSelector } from '../registry/source-selector';

export class PackageService {
  private npmLocalService = new NpmLocalService();
  private queryService: PackageQueryService;

  constructor(sourceSelector?: SourceSelector) {
    this.queryService = new PackageQueryService(sourceSelector);
  }

  async getPackageInfo(name: string) {
    return this.queryService.getPackageInfo(name);
  }

  async getPackageDetails(name: string, version?: string) {
    return this.queryService.getPackageDetails(name, version);
  }

  async getLatestVersion(name: string) {
    return this.queryService.getLatestVersion(name);
  }

  async getDependencyAnalyzerData(manifestPath: string) {
    return this.npmLocalService.getDependencyAnalyzerData(
      manifestPath,
      (name, version, targetPath) => this.getPackageDependencies(name, version, targetPath)
    );
  }
}
```

Current role split:

- `PackageService` is now a thin façade.
- `PackageQueryService` owns latest-version caching, security queries, requirements/dependents, and capability-aware source access.
- `NpmLocalService` owns npm-local dependency tree loading and the dependency analyzer path.

### 3.5 Webview Provider

```typescript
// src/providers/webview-provider.ts
import * as vscode from 'vscode';
import { getServices } from '../services';
import { buildSourceInfoMessage } from './source-info';
import { PackageDetailsPanel } from './package-details-panel';

export class SearchViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'npmGallery.searchView';
  private _view?: vscode.WebviewView;
  private searchRequestId = 0;
  private searchAbortController?: AbortController;

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };

    webviewView.webview.html = this.getHtmlContent(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (message) => {
      await this.handleMessage(message);
    });
  }

  private async handleMessage(message: WebviewToExtensionMessage): Promise<void> {
    const services = getServices();
    switch (message.type) {
      case 'search':
        await services.search.search({ query: message.query, sortBy: message.sortBy });
        break;
      case 'openPackageDetails':
        await PackageDetailsPanel.createOrShow(this.extensionUri, message.packageName);
        break;
      case 'getSourceInfo':
        this.postMessage(await buildSourceInfoMessage());
        break;
      case 'changeSource':
        services.setSelectedSource(message.source);
        this.postMessage(await buildSourceInfoMessage());
        break;
    }
  }
}
```

Current provider split:

- `SearchViewProvider`: sidebar search webview and source/search/install/copy messages.
- `PackageDetailsPanel`: editor-area details panel with richer package actions.
- `InstalledPackagesProvider` / `UpdatesProvider`: native tree views.
- `PackageHoverProvider` / `PackageCodeLensProvider`: thin routers over per-ecosystem handlers.

---

## 4. Data Flow

### 4.1 Search Flow
```
┌──────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  User    │───▶│ Search View  │───▶│ Search       │───▶│ Source       │
│  Types   │    │  Webview     │    │ Service      │    │ Selector     │
└──────────┘    └──────────────┘    └──────────────┘    └──────┬───────┘
                                                                │
                                                                ▼
                                                         ┌──────────────┐
                                                         │ Active source│
                                                         │ adapter/API  │
                                                         └──────┬───────┘
                                                                │
                               ┌────────────────────────────────┴─────────────────────────┐
                               ▼                                                          ▼
                        ┌──────────────┐                                           ┌──────────────┐
                        │ 5-minute     │                                           │ Search       │
                        │ search cache │                                           │ results      │
                        └──────────────┘                                           └──────────────┘
```

### 4.2 Install Flow
```
┌─────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ User    │───▶│ Search/details│───▶│ Install      │───▶│ Install      │
│ Click   │    │ webview       │    │ target       │    │ service      │
└─────────┘    └──────────────┘    │ resolution    │    └──────┬───────┘
                                   └──────┬───────┘           │
                                          │                   ▼
                                          │            ┌──────────────┐
                                          │            │ Source adapter│
                                          │            │ command/copy  │
                                          │            └──────┬───────┘
                                          │                   │
                                          ▼                   ▼
                                   ┌──────────────┐    ┌──────────────┐
                                   │ Manifest path│    │ Terminal or  │
                                   │ and package  │    │ manifest edit│
                                   │ manager      │    └──────┬───────┘
                                   └──────────────┘           │
                                                              ▼
                                                       ┌──────────────┐
                                                       │ Refresh      │
                                                       │ source info /│
                                                       │ trees / UI   │
                                                       └──────────────┘
```

### 4.3 Hover Flow
```
┌──────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ User     │───▶│ Hover        │───▶│ Route table  │───▶│ Ecosystem    │
│ Hovers   │    │ Provider     │    │ by manifest  │    │ hover handler│
└──────────┘    └──────────────┘    └──────────────┘    └──────┬───────┘
                                                                │
                                                                ▼
                                                         ┌──────────────┐
                                                         │ Package      │
                                                         │ service /    │
                                                         │ source query │
                                                         └──────┬───────┘
                                                                │
                                                                ▼
                                                         ┌──────────────┐
                                                         │ Markdown     │
                                                         │ hover result │
                                                         └──────────────┘
```

---

## 5. State Management

### 5.1 Extension Runtime State

```typescript
// There is no single generic StateManager anymore.
// Runtime state is split across focused services and providers.

WorkspaceService:
- manifest discovery caches
- installed package cache
- refresh debounce/coalescing state

PackageQueryService:
- latest-version cache
- in-flight latest-version promise de-duplication

PackageCodeLensProvider:
- per-document CodeLens cache
- security summary cache

SearchViewProvider:
- active webview instance
- in-flight search abort controller
```

### 5.2 Webview State

```typescript
// src/webview/context/VSCodeContext.tsx
export interface PersistedSearchState {
  searchQuery?: string;
  filters?: Record<string, unknown>;
  sortBy?: string;
}

export interface SourceInfo {
  currentProjectType: ProjectType;
  detectedPackageManager: PackageManager;
  detectedBuildTool?: BuildTool;
  detectedCopyFormatLabel?: string;
  detectedNuGetStyle?: NuGetManagementStyle;
  installTarget?: {
    manifestPath: string;
    label: string;
    description: string;
    packageManager: string;
  };
  currentSource: SourceType;
  availableSources: SourceType[];
  supportedSortOptions: string[];
  supportedFilters: string[];
  supportedCapabilities: string[];
}
```

Current behavior:

- `retainContextWhenHidden` keeps the sidebar webview alive during normal hide/show.
- persisted webview state stores only lightweight query/filter/sort inputs.
- actual search results remain in live React state and can also be re-served by the 5-minute `SearchService` cache after a real webview recreation.

---

## 6. Extension Points

### 6.1 Commands
```typescript
// package.json contribution points (representative subset)
{
  "contributes": {
    "commands": [
      {
        "command": "npmGallery.openPanel",
        "title": "Open NPM Gallery",
        "category": "NPM Gallery"
      },
      {
        "command": "npmGallery.searchPackages",
        "title": "Search Packages",
        "category": "NPM Gallery"
      },
      {
        "command": "npmGallery.installPackage",
        "title": "Install Package",
        "category": "NPM Gallery"
      },
      {
        "command": "npmGallery.updatePackage",
        "title": "Update Package",
        "category": "NPM Gallery"
      },
      {
        "command": "npmGallery.updateAllPackages",
        "title": "Update All Packages",
        "category": "NPM Gallery"
      },
      {
        "command": "npmGallery.removePackage",
        "title": "Remove Package",
        "category": "NPM Gallery"
      },
      {
        "command": "npmGallery.runSecurityAudit",
        "title": "Run Security Audit",
        "category": "NPM Gallery"
      },
      {
        "command": "npmGallery.showPackageDetails",
        "title": "Show Package Details",
        "category": "NPM Gallery"
      },
      {
        "command": "npmGallery.openDependencyAnalyzer",
        "title": "Open with NPM Gallery (Text + Dependency Analyzer)",
        "category": "NPM Gallery"
      }
    ]
  }
}
```

### 6.2 Views
```typescript
{
  "contributes": {
    "viewsContainers": {
      "activitybar": [
        {
          "id": "npmGallery",
          "title": "NPM Gallery",
          "icon": "media/icon.svg"
        }
      ]
    },
    "views": {
      "npmGallery": [
        {
          "type": "webview",
          "id": "npmGallery.searchView",
          "name": "Search"
        },
        {
          "id": "npmGallery.installedView",
          "name": "Installed Packages"
        },
        {
          "id": "npmGallery.updatesView",
          "name": "Available Updates"
        }
      ]
    }
  }
}
```

### 6.3 Configuration
```typescript
{
  "contributes": {
    "configuration": {
      "title": "NPM Gallery",
      "properties": {
        "npmGallery.defaultRegistry": {
          "type": "string",
          "default": "https://registry.npmjs.org",
          "description": "Default registry URL for npm-oriented sources"
        },
        "npmGallery.packageManager": {
          "type": "string",
          "enum": ["npm", "yarn", "pnpm", "bun", "dotnet", "paket", "composer", "bundler", "cpanm", "dart", "flutter", "r", "clojure", "leiningen", "cargo"],
          "default": "npm",
          "description": "Preferred package manager or build tool fallback"
        },
        "npmGallery.userAgentContact": {
          "type": "string",
          "default": "",
          "description": "Optional contact appended to the HTTP User-Agent header"
        },
        "npmGallery.showBundleSize": {
          "type": "boolean",
          "default": true,
          "description": "Show bundle size in search results and hover"
        },
        "npmGallery.showSecurityInfo": {
          "type": "boolean",
          "default": true,
          "description": "Show security vulnerability information"
        },
        "npmGallery.autoCheckUpdates": {
          "type": "boolean",
          "default": true,
          "description": "Automatically check for package updates on startup"
        },
        "npmGallery.licenseWhitelist": {
          "type": "array",
          "items": { "type": "string" },
          "default": ["MIT", "Apache-2.0", "ISC", "BSD-2-Clause", "BSD-3-Clause"],
          "description": "Allowed licenses (warn if package uses different license)"
        }
      }
    }
  }
}
```

---

## 7. Security Considerations

### 7.1 Content Security Policy
```typescript
const csp = `
  default-src 'none';
  style-src ${webview.cspSource} 'unsafe-inline';
  script-src ${webview.cspSource};
  img-src ${webview.cspSource} https:;
  font-src ${webview.cspSource};
`;
```

### 7.2 Input Validation
```typescript
function validatePackageName(name: string): boolean {
  // npm package name rules
  const pattern = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
  return pattern.test(name) && name.length <= 214;
}

function sanitizeSearchQuery(query: string): string {
  // Remove potentially dangerous characters
  return query.replace(/[<>'"&]/g, '');
}
```

### 7.3 Secure Communication
- All API requests use HTTPS
- No sensitive data in URLs (query params)
- Token handling for private registries uses VS Code SecretStorage

```typescript
async function storeToken(
  context: vscode.ExtensionContext,
  registry: string,
  token: string
): Promise<void> {
  await context.secrets.store(`npm-gallery:${registry}`, token);
}
```

---

## 8. Performance Optimization

### 8.1 Runtime Caching and Deferral
```typescript
// Current performance-critical layers rely on focused caches instead of one lazy service registry.

SearchService:
- 5-minute search-result cache
- stable structured cache keys

PackageQueryService:
- latest-version cache
- in-flight latest-version promise deduplication

WorkspaceService:
- debounced manifest refresh events
- scope coalescing before Installed / Updates / CodeLens refresh
```

### 8.2 Virtual Scrolling
```typescript
// Webview - React virtual list for large result sets
import { FixedSizeList } from 'react-window';

function SearchResults({ results }: { results: PackageInfo[] }) {
  return (
    <FixedSizeList
      height={600}
      width="100%"
      itemCount={results.length}
      itemSize={80}
    >
      {({ index, style }) => (
        <div style={style}>
          <PackageCard package={results[index]} />
        </div>
      )}
    </FixedSizeList>
  );
}
```

### 8.3 Request De-duplication
```typescript
class PackageQueryService {
  private latestVersionCache = new Map<string, string | null>();
  private latestVersionPromises = new Map<string, Promise<string | null>>();

  async getLatestVersion(name: string): Promise<string | null> {
    if (this.latestVersionCache.has(name)) {
      return this.latestVersionCache.get(name) ?? null;
    }

    const pending = this.latestVersionPromises.get(name);
    if (pending) {
      return pending;
    }

    const promise = this.resolveLatestVersion(name);
    this.latestVersionPromises.set(name, promise);
    return promise;
  }
}
```

---

## 9. Testing Strategy

### 9.1 Unit Tests
```typescript
// test/unit/services/search-service.test.ts
import { SearchService } from '../../../src/services/search-service';
import { MockNpmsClient } from '../../mocks/npms-client';

describe('SearchService', () => {
  let service: SearchService;
  let mockClient: MockNpmsClient;

  beforeEach(() => {
    mockClient = new MockNpmsClient();
    service = new SearchService(mockClient);
  });

  describe('search', () => {
    it('should return search results', async () => {
      mockClient.setSearchResults([
        { name: 'lodash', version: '4.17.21' }
      ]);

      const results = await service.search('lodash');

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('lodash');
    });

    it('should handle empty query', async () => {
      const results = await service.search('');
      expect(results).toHaveLength(0);
    });

    it('should apply filters', async () => {
      const results = await service.search('lodash', {
        minDownloads: 100000
      });
      // Assert filtering logic
    });
  });
});
```

### 9.2 Integration Tests
```typescript
// test/integration/extension.test.ts
import * as vscode from 'vscode';
import * as assert from 'assert';

suite('Extension Integration Tests', () => {
  test('Extension should activate', async () => {
    const extension = vscode.extensions.getExtension('your-publisher.npm-gallery');
    await extension?.activate();
    assert.strictEqual(extension?.isActive, true);
  });

  test('Search command should be registered', async () => {
    const commands = await vscode.commands.getCommands();
    assert.ok(commands.includes('npmGallery.searchPackages'));
  });

  test('Hover provider should work in a supported manifest', async () => {
    const doc = await vscode.workspace.openTextDocument({
      language: 'json',
      content: '{"dependencies": {"lodash": "^4.17.21"}}'
    });

    const position = new vscode.Position(0, 20);
    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
      'vscode.executeHoverProvider',
      doc.uri,
      position
    );

    assert.ok(hovers && hovers.length > 0);
  });
});
```

### 9.3 E2E Tests
```typescript
// test/e2e/search-flow.test.ts
import { Browser, Page } from 'puppeteer';

describe('Search Flow E2E', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    // Launch VS Code with extension
    browser = await launchVSCodeWithExtension();
    page = await browser.newPage();
  });

  it('should complete search and install flow', async () => {
    // Open command palette
    await page.keyboard.press('Control+Shift+P');

    // Type command
    await page.keyboard.type('NPM Gallery: Search Packages');
    await page.keyboard.press('Enter');

    // Wait for webview
    await page.waitForSelector('#npm-gallery-search');

    // Type search query
    await page.type('#search-input', 'lodash');
    await page.waitForSelector('.search-result');

    // Click first result
    await page.click('.search-result:first-child');

    // Verify details panel
    await page.waitForSelector('.package-details');
    const title = await page.$eval('.package-name', el => el.textContent);
    expect(title).toBe('lodash');
  });
});
```

---

## 10. Technology Decisions

### 10.1 Decision Record: React for Webview

**Context**: Need to build interactive UI for package search and details.

**Decision**: Use React with TypeScript for webview UI.

**Rationale**:
- Component-based architecture fits our UI needs
- Strong TypeScript support
- Large ecosystem of libraries
- Team familiarity

**Alternatives Considered**:
- Vanilla JS: Too verbose, harder to maintain
- Vue: Less TypeScript integration
- Svelte: Smaller community, less VS Code examples

### 10.2 Decision Record: Source Selector with Adapter Fallbacks

**Context**: The extension now supports multiple ecosystems and sources rather than a single-ecosystem search path.

**Decision**: Route package operations through `SourceSelector` and per-source adapters, with ecosystem-specific fallbacks where implemented.

**Rationale**:
- Keeps search/details/install behavior source-aware
- Allows one workspace to expose multiple project types and source choices
- Supports primary/fallback behavior without hardcoding one ecosystem's flow into core services

**Trade-offs**:
- More adapter complexity
- Capability differences must be surfaced clearly in UI and source context

### 10.3 Decision Record: In-Extension Caching

**Context**: Need to minimize API calls and improve response times.

**Decision**: Implement two-tier caching (memory + VS Code globalState).

**Rationale**:
- Memory cache for hot data (sub-millisecond access)
- globalState for persistence across sessions
- Configurable TTLs per data type

**Trade-offs**:
- Memory overhead for cache
- Cache invalidation complexity

---

## Appendix: Component Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        NPM Gallery Extension                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │                      UI Layer                               │   │
│   ├─────────────────────────────────────────────────────────────┤   │
│   │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │   │
│   │  │ Search View  │  │ Package      │  │ Installed /      │  │   │
│   │  │ Webview      │  │ Details Panel│  │ Updates Trees    │  │   │
│   │  └──────────────┘  └──────────────┘  └──────────────────┘  │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                                  │                                  │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │                 VS Code Provider Layer                      │   │
│   ├─────────────────────────────────────────────────────────────┤   │
│   │  ┌────────────┐ ┌────────────┐ ┌──────────────┐ ┌────────┐ │   │
│   │  │ Hover      │ │ CodeLens   │ │ Search view  │ │ Trees  │ │   │
│   │  │ router     │ │ router     │ │ provider     │ │ providers│ │  │
│   │  └────────────┘ └────────────┘ └──────────────┘ └────────┘ │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                                  │                                  │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │                    Core Service Layer                       │   │
│   ├─────────────────────────────────────────────────────────────┤   │
│   │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐       │   │
│   │  │ Package      │ │ Search       │ │ Install      │       │   │
│   │  │ Service      │ │ Service      │ │ Service      │       │   │
│   │  └──────────────┘ └──────────────┘ └──────────────┘       │   │
│   │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐       │   │
│   │  │ Workspace    │ │ SourceContext│ │ PackageQuery │       │   │
│   │  │ Service      │ │ Service      │ │ / NpmLocal   │       │   │
│   │  └──────────────┘ └──────────────┘ └──────────────┘       │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                                  │                                  │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │                Source Infrastructure Layer                  │   │
│   ├─────────────────────────────────────────────────────────────┤   │
│   │  ┌──────────────┐ ┌──────────────┐ ┌────────────────────┐  │   │
│   │  │ SourceConfig │ │ Project      │ │ SourceSelector /   │  │   │
│   │  │ Manager      │ │ Detector     │ │ SourceRegistry     │  │   │
│   │  └──────────────┘ └──────────────┘ └────────────────────┘  │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                                  │                                  │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │                  Source Adapter Layer                       │   │
│   ├─────────────────────────────────────────────────────────────┤   │
│   │ npm │ npms │ sonatype │ nuget │ packagist │ rubygems │ ...│   │
│   └─────────────────────────────────────────────────────────────┘   │
│                                  │                                  │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │                    API Client Layer                         │   │
│   ├─────────────────────────────────────────────────────────────┤   │
│   │ npm-registry │ deps.dev │ osv/audit │ sonatype │ nuget │...│   │
│   └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```
