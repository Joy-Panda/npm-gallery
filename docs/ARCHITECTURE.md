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
│                         VS Code Extension Host                       │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐ │
│  │   Extension     │  │    Webview      │  │    Language         │ │
│  │   Activation    │  │    Provider     │  │    Features         │ │
│  │                 │  │                 │  │                     │ │
│  │  - Commands     │  │  - React UI     │  │  - Hover Provider   │ │
│  │  - Events       │  │  - Search       │  │  - CodeLens         │ │
│  │  - Lifecycle    │  │  - Details      │  │  - Completion       │ │
│  └────────┬────────┘  └────────┬────────┘  │  - Diagnostics      │ │
│           │                    │           └──────────┬──────────┘ │
│           └──────────┬─────────┘                      │            │
│                      │                                │            │
│           ┌──────────▼────────────────────────────────▼──────────┐ │
│           │                   Core Services                       │ │
│           ├───────────────────────────────────────────────────────┤ │
│           │  ┌─────────────┐  ┌─────────────┐  ┌───────────────┐ │ │
│           │  │ Package     │  │ Security    │  │ Bundle        │ │ │
│           │  │ Service     │  │ Service     │  │ Service       │ │ │
│           │  └─────────────┘  └─────────────┘  └───────────────┘ │ │
│           │  ┌─────────────┐  ┌─────────────┐  ┌───────────────┐ │ │
│           │  │ Search      │  │ Install     │  │ Workspace     │ │ │
│           │  │ Service     │  │ Service     │  │ Service       │ │ │
│           │  └─────────────┘  └─────────────┘  └───────────────┘ │ │
│           └───────────────────────────┬───────────────────────────┘ │
│                                       │                             │
│           ┌───────────────────────────▼───────────────────────────┐ │
│           │                   API Layer                            │ │
│           ├────────────────────────────────────────────────────────┤ │
│           │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │ │
│           │  │ npm      │ │ npms.io  │ │ Bundle   │ │ GitHub   │ │ │
│           │  │ Registry │ │ API      │ │ phobia   │ │ API      │ │ │
│           │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ │ │
│           └───────────────────────────┬───────────────────────────┘ │
│                                       │                             │
│           ┌───────────────────────────▼───────────────────────────┐ │
│           │                   Cache Layer                          │ │
│           │  ┌─────────────────────┐  ┌─────────────────────────┐ │ │
│           │  │   Memory Cache      │  │   Persistent Cache      │ │ │
│           │  │   (LRU, 5 min TTL)  │  │   (globalState, 1hr)    │ │ │
│           │  └─────────────────────┘  └─────────────────────────┘ │ │
│           └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                        ┌───────────────────────┐
                        │    External APIs      │
                        │  - registry.npmjs.org │
                        │  - api.npms.io        │
                        │  - bundlephobia.com   │
                        │  - api.github.com     │
                        └───────────────────────┘
```

### 1.2 Layer Responsibilities

| Layer | Responsibility |
|-------|----------------|
| **Extension Host** | VS Code integration, activation, commands |
| **Webview** | Rich UI for search and package details |
| **Language Features** | package.json integration |
| **Core Services** | Business logic and orchestration |
| **API Layer** | External API communication |
| **Cache Layer** | Response caching and optimization |

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
│   │   ├── package-service.ts
│   │   ├── search-service.ts
│   │   ├── install-service.ts
│   │   ├── security-service.ts
│   │   ├── bundle-service.ts
│   │   ├── license-service.ts
│   │   └── workspace-service.ts
│   │
│   ├── providers/            # VS Code providers
│   │   ├── index.ts
│   │   ├── hover-provider.ts
│   │   ├── codelens-provider.ts
│   │   ├── completion-provider.ts
│   │   ├── diagnostic-provider.ts
│   │   └── webview-provider.ts
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
│   │   ├── package-json.ts
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
import { ServiceContainer } from './services';
import { registerCommands } from './commands';
import { registerProviders } from './providers';
import { initializeCache } from './cache';

export async function activate(context: vscode.ExtensionContext) {
  console.log('NPM Gallery: Activating...');

  // Initialize cache with extension context
  const cache = initializeCache(context);

  // Create service container
  const services = new ServiceContainer(cache, context);

  // Register all commands
  registerCommands(context, services);

  // Register language providers
  registerProviders(context, services);

  // Initialize workspace watcher
  services.workspace.initialize();

  console.log('NPM Gallery: Activated successfully');
}

export function deactivate() {
  console.log('NPM Gallery: Deactivating...');
}
```

### 3.2 Service Container

```typescript
// src/services/index.ts
import { ExtensionContext } from 'vscode';
import { CacheManager } from '../cache';
import { PackageService } from './package-service';
import { SearchService } from './search-service';
import { InstallService } from './install-service';
import { SecurityService } from './security-service';
import { BundleService } from './bundle-service';
import { WorkspaceService } from './workspace-service';

export class ServiceContainer {
  public readonly package: PackageService;
  public readonly search: SearchService;
  public readonly install: InstallService;
  public readonly security: SecurityService;
  public readonly bundle: BundleService;
  public readonly workspace: WorkspaceService;

  constructor(cache: CacheManager, context: ExtensionContext) {
    // Initialize API clients
    const apiClients = createApiClients(cache);

    // Initialize services with dependencies
    this.package = new PackageService(apiClients);
    this.search = new SearchService(apiClients);
    this.security = new SecurityService(apiClients.audit);
    this.bundle = new BundleService(apiClients.bundlephobia);
    this.install = new InstallService(context);
    this.workspace = new WorkspaceService(context);
  }
}
```

### 3.3 API Client Base Class

```typescript
// src/api/base-client.ts
import { CacheManager } from '../cache';
import { ApiError, ApiErrorType } from '../types';

export abstract class BaseApiClient {
  constructor(
    protected baseUrl: string,
    protected cache: CacheManager,
    protected serviceName: string
  ) {}

  protected async request<T>(
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const cacheKey = options.cacheKey || `${this.serviceName}:${endpoint}`;

    // Check cache
    if (options.useCache !== false) {
      const cached = await this.cache.get<T>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    try {
      const response = await fetch(url, {
        method: options.method || 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'npm-gallery-vscode',
          ...options.headers
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: AbortSignal.timeout(options.timeout || 10000)
      });

      if (!response.ok) {
        throw this.handleErrorResponse(response);
      }

      const data = await response.json() as T;

      // Cache successful response
      if (options.cacheTtl) {
        await this.cache.set(cacheKey, data, options.cacheTtl);
      }

      return data;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(ApiErrorType.NETWORK_ERROR, undefined, error);
    }
  }

  private handleErrorResponse(response: Response): ApiError {
    switch (response.status) {
      case 404:
        return new ApiError(ApiErrorType.NOT_FOUND, response.status);
      case 429:
        const retryAfter = parseInt(response.headers.get('Retry-After') || '60');
        return new ApiError(ApiErrorType.RATE_LIMITED, response.status, retryAfter);
      default:
        return new ApiError(ApiErrorType.SERVER_ERROR, response.status);
    }
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
  useCache?: boolean;
  cacheKey?: string;
  cacheTtl?: number;
}
```

### 3.4 Package Service

```typescript
// src/services/package-service.ts
import { NpmRegistryClient } from '../api/npm-registry';
import { NpmsClient } from '../api/npms-api';
import { PackageInfo, PackageDetails, VersionInfo } from '../types';

export class PackageService {
  constructor(
    private npmRegistry: NpmRegistryClient,
    private npmsApi: NpmsClient
  ) {}

  async getPackageInfo(name: string): Promise<PackageInfo> {
    // Try npms.io first for enhanced data
    try {
      const analysis = await this.npmsApi.getPackage(name);
      return this.transformNpmsResponse(analysis);
    } catch {
      // Fallback to npm registry
      const npmData = await this.npmRegistry.getPackage(name);
      return this.transformNpmResponse(npmData);
    }
  }

  async getPackageDetails(name: string): Promise<PackageDetails> {
    // Fetch data from multiple sources in parallel
    const [npmData, downloads, analysis] = await Promise.all([
      this.npmRegistry.getPackage(name),
      this.npmRegistry.getDownloads(name, 'last-week'),
      this.npmsApi.getPackage(name).catch(() => null)
    ]);

    return {
      ...this.transformNpmResponse(npmData),
      readme: npmData.readme,
      versions: this.extractVersions(npmData),
      weeklyDownloads: downloads.downloads,
      score: analysis?.score
    };
  }

  async getVersions(name: string): Promise<VersionInfo[]> {
    const npmData = await this.npmRegistry.getPackage(name);
    return this.extractVersions(npmData);
  }

  private extractVersions(npmData: NpmPackageInfo): VersionInfo[] {
    return Object.entries(npmData.versions)
      .map(([version, data]) => ({
        version,
        publishedAt: npmData.time[version],
        deprecated: !!data.deprecated,
        tag: this.getVersionTag(version, npmData['dist-tags'])
      }))
      .sort((a, b) => semver.rcompare(a.version, b.version));
  }

  private getVersionTag(
    version: string,
    distTags: Record<string, string>
  ): string | undefined {
    return Object.entries(distTags)
      .find(([, v]) => v === version)?.[0];
  }
}
```

### 3.5 Webview Provider

```typescript
// src/providers/webview-provider.ts
import * as vscode from 'vscode';
import { ServiceContainer } from '../services';

export class NpmGalleryWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'npmGallery.searchView';
  private _view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly services: ServiceContainer
  ) {}

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

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'search':
          await this.handleSearch(message.query);
          break;
        case 'getPackageDetails':
          await this.handleGetPackageDetails(message.name);
          break;
        case 'install':
          await this.handleInstall(message.package, message.options);
          break;
      }
    });
  }

  private async handleSearch(query: string) {
    try {
      const results = await this.services.search.search(query);
      this.postMessage({ type: 'searchResults', data: results });
    } catch (error) {
      this.postMessage({ type: 'error', message: error.message });
    }
  }

  private async handleGetPackageDetails(name: string) {
    try {
      const [details, bundleSize, security] = await Promise.all([
        this.services.package.getPackageDetails(name),
        this.services.bundle.getSize(name),
        this.services.security.checkPackage(name)
      ]);

      this.postMessage({
        type: 'packageDetails',
        data: { ...details, bundleSize, security }
      });
    } catch (error) {
      this.postMessage({ type: 'error', message: error.message });
    }
  }

  private async handleInstall(
    packageName: string,
    options: InstallOptions
  ) {
    try {
      await this.services.install.install(packageName, options);
      this.postMessage({ type: 'installSuccess', package: packageName });
      vscode.window.showInformationMessage(
        `Successfully installed ${packageName}`
      );
    } catch (error) {
      this.postMessage({ type: 'installError', message: error.message });
      vscode.window.showErrorMessage(
        `Failed to install ${packageName}: ${error.message}`
      );
    }
  }

  private postMessage(message: unknown) {
    this._view?.webview.postMessage(message);
  }

  private getHtmlContent(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview.css')
    );

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src ${webview.cspSource};">
        <link href="${styleUri}" rel="stylesheet">
        <title>NPM Gallery</title>
      </head>
      <body>
        <div id="root"></div>
        <script src="${scriptUri}"></script>
      </body>
      </html>
    `;
  }
}
```

---

## 4. Data Flow

### 4.1 Search Flow
```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  User    │───▶│ Webview  │───▶│ Search   │───▶│ npms.io  │
│  Types   │    │  UI      │    │ Service  │    │ API      │
└──────────┘    └──────────┘    └──────────┘    └──────────┘
                     │               │               │
                     │               │               │
                     ▼               ▼               ▼
              ┌──────────┐    ┌──────────┐    ┌──────────┐
              │ Display  │◀───│ Transform│◀───│ Cache    │
              │ Results  │    │ Data     │    │ Response │
              └──────────┘    └──────────┘    └──────────┘
```

### 4.2 Install Flow
```
┌────────────────────────────────────────────────────────────────┐
│                        Install Flow                             │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌─────────┐   ┌─────────────┐   ┌──────────────┐            │
│   │ User    │──▶│ Pre-install │──▶│ Security     │            │
│   │ Click   │   │ Checks      │   │ Check        │            │
│   └─────────┘   └─────────────┘   └──────┬───────┘            │
│                                          │                     │
│                        ┌─────────────────┼─────────────────┐   │
│                        │                 │                 │   │
│                        ▼                 ▼                 ▼   │
│                 ┌──────────┐     ┌──────────┐     ┌─────────┐ │
│                 │ License  │     │ Size     │     │ Confirm │ │
│                 │ Check    │     │ Warning  │     │ Dialog  │ │
│                 └────┬─────┘     └────┬─────┘     └────┬────┘ │
│                      │                │                │      │
│                      └────────────────┼────────────────┘      │
│                                       ▼                       │
│                              ┌────────────────┐               │
│                              │ Execute npm    │               │
│                              │ install        │               │
│                              └────────┬───────┘               │
│                                       │                       │
│                              ┌────────▼───────┐               │
│                              │ Update         │               │
│                              │ package.json   │               │
│                              └────────┬───────┘               │
│                                       │                       │
│                              ┌────────▼───────┐               │
│                              │ Show           │               │
│                              │ Notification   │               │
│                              └────────────────┘               │
└────────────────────────────────────────────────────────────────┘
```

### 4.3 Package.json Hover Flow
```
┌──────────┐    ┌──────────────┐    ┌──────────────┐
│ User     │───▶│ Hover        │───▶│ Package      │
│ Hovers   │    │ Provider     │    │ Service      │
└──────────┘    └──────────────┘    └──────────────┘
                      │                    │
                      │                    ▼
                      │             ┌──────────────┐
                      │             │ Parallel     │
                      │             │ Fetch:       │
                      │             │ - Package    │
                      │             │ - Security   │
                      │             │ - Bundle     │
                      │             └──────┬───────┘
                      │                    │
                      ▼                    ▼
               ┌──────────────┐    ┌──────────────┐
               │ Display      │◀───│ Build        │
               │ Hover Card   │    │ Markdown     │
               └──────────────┘    └──────────────┘
```

---

## 5. State Management

### 5.1 Extension State

```typescript
// src/state/extension-state.ts
import * as vscode from 'vscode';

interface ExtensionState {
  // User preferences
  preferences: {
    defaultRegistry: string;
    packageManager: 'npm' | 'yarn' | 'pnpm';
    showBundleSize: boolean;
    licenseWhitelist: string[];
  };

  // Runtime state
  runtime: {
    activeWorkspace?: vscode.WorkspaceFolder;
    packageJsonFiles: vscode.Uri[];
    cachedPackages: Map<string, PackageInfo>;
  };

  // UI state
  ui: {
    searchQuery: string;
    selectedPackage?: string;
    filterOptions: FilterOptions;
  };
}

export class StateManager {
  private state: ExtensionState;
  private onStateChange: vscode.EventEmitter<keyof ExtensionState>;

  constructor(context: vscode.ExtensionContext) {
    this.state = this.loadState(context);
    this.onStateChange = new vscode.EventEmitter();
  }

  get<K extends keyof ExtensionState>(key: K): ExtensionState[K] {
    return this.state[key];
  }

  set<K extends keyof ExtensionState>(
    key: K,
    value: ExtensionState[K]
  ): void {
    this.state[key] = value;
    this.onStateChange.fire(key);
  }

  subscribe(
    key: keyof ExtensionState,
    callback: () => void
  ): vscode.Disposable {
    return this.onStateChange.event((changedKey) => {
      if (changedKey === key) callback();
    });
  }
}
```

### 5.2 Webview State

```typescript
// src/webview/context/AppContext.tsx
import React, { createContext, useReducer, useContext } from 'react';

interface AppState {
  searchQuery: string;
  searchResults: PackageInfo[];
  selectedPackage: PackageDetails | null;
  isLoading: boolean;
  error: string | null;
  filters: FilterOptions;
}

type Action =
  | { type: 'SET_SEARCH_QUERY'; payload: string }
  | { type: 'SET_SEARCH_RESULTS'; payload: PackageInfo[] }
  | { type: 'SET_SELECTED_PACKAGE'; payload: PackageDetails | null }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_FILTERS'; payload: FilterOptions };

const initialState: AppState = {
  searchQuery: '',
  searchResults: [],
  selectedPackage: null,
  isLoading: false,
  error: null,
  filters: { sortBy: 'relevance' }
};

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_SEARCH_QUERY':
      return { ...state, searchQuery: action.payload };
    case 'SET_SEARCH_RESULTS':
      return { ...state, searchResults: action.payload, isLoading: false };
    case 'SET_SELECTED_PACKAGE':
      return { ...state, selectedPackage: action.payload };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload, isLoading: false };
    case 'SET_FILTERS':
      return { ...state, filters: action.payload };
    default:
      return state;
  }
}

const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<Action>;
} | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}
```

---

## 6. Extension Points

### 6.1 Commands
```typescript
// package.json contribution points
{
  "contributes": {
    "commands": [
      {
        "command": "npmGallery.openPanel",
        "title": "Open NPM Gallery",
        "category": "NPM Gallery"
      },
      {
        "command": "npmGallery.search",
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
        "command": "npmGallery.runAudit",
        "title": "Run Security Audit",
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
          "description": "Default npm registry URL"
        },
        "npmGallery.packageManager": {
          "type": "string",
          "enum": ["npm", "yarn", "pnpm"],
          "default": "npm",
          "description": "Preferred package manager"
        },
        "npmGallery.showBundleSize": {
          "type": "boolean",
          "default": true,
          "description": "Show bundle size in search results"
        },
        "npmGallery.securityScanEnabled": {
          "type": "boolean",
          "default": true,
          "description": "Enable automatic security scanning"
        },
        "npmGallery.licenseWhitelist": {
          "type": "array",
          "items": { "type": "string" },
          "default": ["MIT", "Apache-2.0", "ISC", "BSD-3-Clause"],
          "description": "Allowed licenses"
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

### 8.1 Lazy Loading
```typescript
// Load services on demand
class LazyServiceLoader {
  private securityService?: SecurityService;

  getSecurityService(): SecurityService {
    if (!this.securityService) {
      this.securityService = new SecurityService();
    }
    return this.securityService;
  }
}
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

### 8.3 Request Batching
```typescript
class BatchedApiClient {
  private pending: Map<string, Promise<unknown>> = new Map();
  private batchTimeout?: NodeJS.Timeout;
  private batchQueue: string[] = [];

  async getPackage(name: string): Promise<PackageInfo> {
    // Check if request is already pending
    if (this.pending.has(name)) {
      return this.pending.get(name) as Promise<PackageInfo>;
    }

    // Add to batch queue
    this.batchQueue.push(name);

    // Schedule batch execution
    if (!this.batchTimeout) {
      this.batchTimeout = setTimeout(() => this.executeBatch(), 50);
    }

    // Create and store promise
    const promise = new Promise<PackageInfo>((resolve, reject) => {
      // Store resolvers for later
      this.resolvers.set(name, { resolve, reject });
    });

    this.pending.set(name, promise);
    return promise;
  }

  private async executeBatch() {
    const names = [...this.batchQueue];
    this.batchQueue = [];
    this.batchTimeout = undefined;

    // Use npms.io bulk endpoint
    const results = await this.npmsApi.getPackages(names);

    for (const name of names) {
      const resolver = this.resolvers.get(name);
      if (results[name]) {
        resolver?.resolve(results[name]);
      } else {
        resolver?.reject(new Error(`Package ${name} not found`));
      }
      this.pending.delete(name);
      this.resolvers.delete(name);
    }
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
    assert.ok(commands.includes('npmGallery.search'));
  });

  test('Hover provider should work in package.json', async () => {
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
    await page.keyboard.type('NPM Gallery: Search');
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

### 10.2 Decision Record: npms.io as Primary Search

**Context**: Need fast, relevant search results with quality metrics.

**Decision**: Use npms.io API as primary search, npm registry as fallback.

**Rationale**:
- Better search relevance
- Quality/popularity/maintenance scores included
- npm registry as reliable fallback

**Trade-offs**:
- Additional dependency on third-party service
- Need fallback handling

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
│                        NPM Gallery Extension                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │                     User Interface Layer                     │   │
│   ├─────────────────────────────────────────────────────────────┤   │
│   │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │   │
│   │  │   Webview    │  │   Tree View  │  │  Status Bar      │  │   │
│   │  │   (React)    │  │   Providers  │  │  Items           │  │   │
│   │  └──────────────┘  └──────────────┘  └──────────────────┘  │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                                  │                                   │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │                    VS Code Integration Layer                 │   │
│   ├─────────────────────────────────────────────────────────────┤   │
│   │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────┐ │   │
│   │  │  Hover     │ │  CodeLens  │ │ Completion │ │Diagnostic│ │   │
│   │  │  Provider  │ │  Provider  │ │ Provider   │ │ Provider │ │   │
│   │  └────────────┘ └────────────┘ └────────────┘ └──────────┘ │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                                  │                                   │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │                      Service Layer                           │   │
│   ├─────────────────────────────────────────────────────────────┤   │
│   │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐   │   │
│   │  │ Package  │ │ Search   │ │ Security │ │   Install    │   │   │
│   │  │ Service  │ │ Service  │ │ Service  │ │   Service    │   │   │
│   │  └──────────┘ └──────────┘ └──────────┘ └──────────────┘   │   │
│   │  ┌──────────┐ ┌──────────┐ ┌──────────────────────────┐   │   │
│   │  │ Bundle   │ │ License  │ │     Workspace Service     │   │   │
│   │  │ Service  │ │ Service  │ │                          │   │   │
│   │  └──────────┘ └──────────┘ └──────────────────────────┘   │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                                  │                                   │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │                        API Layer                             │   │
│   ├─────────────────────────────────────────────────────────────┤   │
│   │  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐   │   │
│   │  │    npm    │ │  npms.io  │ │  Bundle   │ │  GitHub   │   │   │
│   │  │  Registry │ │   API     │ │  phobia   │ │   API     │   │   │
│   │  └───────────┘ └───────────┘ └───────────┘ └───────────┘   │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                                  │                                   │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │                    Infrastructure Layer                      │   │
│   ├─────────────────────────────────────────────────────────────┤   │
│   │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │   │
│   │  │  Cache Manager  │  │  Rate Limiter   │  │   Logger    │ │   │
│   │  └─────────────────┘  └─────────────────┘  └─────────────┘ │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```
