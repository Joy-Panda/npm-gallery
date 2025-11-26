# Development Guide

## NPM Gallery - VS Code Extension

This guide covers everything you need to set up, develop, test, and contribute to the NPM Gallery extension.

---

## Table of Contents
1. [Prerequisites](#1-prerequisites)
2. [Getting Started](#2-getting-started)
3. [Project Setup](#3-project-setup)
4. [Development Workflow](#4-development-workflow)
5. [Building & Bundling](#5-building--bundling)
6. [Testing](#6-testing)
7. [Debugging](#7-debugging)
8. [Code Style & Linting](#8-code-style--linting)
9. [Contributing](#9-contributing)
10. [Release Process](#10-release-process)

---

## 1. Prerequisites

### 1.1 Required Software

| Software | Version | Purpose |
|----------|---------|---------|
| Node.js | 18.x or 20.x | Runtime environment |
| npm | 9.x+ | Package management |
| VS Code | 1.74.0+ | Development & testing |
| Git | 2.x+ | Version control |

### 1.2 Recommended VS Code Extensions
```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "ms-vscode.vscode-typescript-next",
    "orta.vscode-jest",
    "usernamehw.errorlens",
    "eamodio.gitlens"
  ]
}
```

### 1.3 System Requirements
- **OS**: Windows 10+, macOS 10.15+, or Linux (Ubuntu 18.04+)
- **RAM**: 8GB minimum, 16GB recommended
- **Disk**: 500MB free space

---

## 2. Getting Started

### 2.1 Clone the Repository
```bash
# Clone the repository
git clone https://github.com/your-org/npm-gallery.git
cd npm-gallery

# Install dependencies
npm install
```

### 2.2 Quick Start
```bash
# Install dependencies
npm install

# Build the extension
npm run build

# Open in VS Code
code .

# Press F5 to launch Extension Development Host
```

### 2.3 Verify Setup
After pressing F5, a new VS Code window should open with:
- NPM Gallery icon in the Activity Bar
- Working search functionality
- No errors in Debug Console

---

## 3. Project Setup

### 3.1 Directory Structure Overview
```
npm-gallery/
├── .vscode/              # VS Code configuration
│   ├── launch.json       # Debug configurations
│   ├── tasks.json        # Build tasks
│   └── settings.json     # Workspace settings
├── src/                  # Source code
│   ├── extension.ts      # Entry point
│   ├── api/              # API clients
│   ├── services/         # Business logic
│   ├── providers/        # VS Code providers
│   ├── commands/         # Command handlers
│   ├── webview/          # React UI
│   └── types/            # TypeScript types
├── test/                 # Test files
├── docs/                 # Documentation
├── media/                # Static assets
├── dist/                 # Compiled output
├── package.json          # Extension manifest
├── tsconfig.json         # TypeScript config
├── webpack.config.js     # Webpack config
└── .eslintrc.js          # ESLint config
```

### 3.2 Key Configuration Files

#### package.json (Extension Manifest)
```json
{
  "name": "npm-gallery",
  "displayName": "NPM Gallery",
  "description": "Browse, search, and manage npm packages from VS Code",
  "version": "0.1.0",
  "publisher": "your-publisher",
  "engines": {
    "vscode": "^1.74.0"
  },
  "categories": ["Other"],
  "activationEvents": [
    "onView:npmGallery.searchView",
    "onCommand:npmGallery.openPanel",
    "workspaceContains:package.json"
  ],
  "main": "./dist/extension.js",
  "contributes": {
    "commands": [...],
    "views": [...],
    "configuration": [...]
  },
  "scripts": {
    "vscode:prepublish": "npm run build",
    "build": "webpack --mode production",
    "watch": "webpack --mode development --watch",
    "test": "jest",
    "lint": "eslint src --ext ts,tsx"
  },
  "devDependencies": {
    "@types/node": "^18.0.0",
    "@types/vscode": "^1.74.0",
    "@types/react": "^18.0.0",
    "@types/react-dom": "^18.0.0",
    "typescript": "^5.0.0",
    "webpack": "^5.0.0",
    "webpack-cli": "^5.0.0",
    "ts-loader": "^9.0.0",
    "eslint": "^8.0.0",
    "jest": "^29.0.0",
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  }
}
```

#### tsconfig.json
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020", "DOM"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "test"]
}
```

#### webpack.config.js
```javascript
const path = require('path');

/** @type {import('webpack').Configuration} */
const extensionConfig = {
  target: 'node',
  mode: 'none',
  entry: './src/extension.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2'
  },
  externals: {
    vscode: 'commonjs vscode'
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: 'ts-loader'
      }
    ]
  },
  devtool: 'nosources-source-map'
};

/** @type {import('webpack').Configuration} */
const webviewConfig = {
  target: 'web',
  mode: 'none',
  entry: './src/webview/index.tsx',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'webview.js'
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx']
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: 'ts-loader'
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      }
    ]
  },
  devtool: 'nosources-source-map'
};

module.exports = [extensionConfig, webviewConfig];
```

---

## 4. Development Workflow

### 4.1 Development Commands
```bash
# Start watch mode (auto-rebuild on changes)
npm run watch

# Build once
npm run build

# Run linter
npm run lint

# Fix lint issues
npm run lint:fix

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate test coverage
npm run test:coverage
```

### 4.2 Development Cycle
```
┌─────────────────────────────────────────────────────────────┐
│                    Development Cycle                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   1. Start watch mode          npm run watch                │
│                                      │                       │
│                                      ▼                       │
│   2. Launch Extension Host     Press F5 in VS Code          │
│                                      │                       │
│                                      ▼                       │
│   3. Make code changes         Edit src/ files              │
│                                      │                       │
│                                      ▼                       │
│   4. Reload Extension          Ctrl+Shift+F5                │
│                                      │                       │
│                                      ▼                       │
│   5. Test changes              Use Extension Host window    │
│                                      │                       │
│                                      ▼                       │
│   6. Repeat                    Go to step 3                 │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 Hot Reload for Webview
The webview supports hot reload in development:
```javascript
// In webview development, add to App.tsx
if (process.env.NODE_ENV === 'development') {
  // @ts-ignore
  if (module.hot) {
    module.hot.accept();
  }
}
```

---

## 5. Building & Bundling

### 5.1 Build Modes

#### Development Build
```bash
npm run build:dev
# or
webpack --mode development
```
- Includes source maps
- No minification
- Faster build time

#### Production Build
```bash
npm run build
# or
webpack --mode production
```
- Minified output
- Tree shaking enabled
- Optimized bundle size

### 5.2 Bundle Analysis
```bash
# Generate bundle stats
npm run build:analyze

# View stats
npx webpack-bundle-analyzer dist/stats.json
```

### 5.3 Output Structure
```
dist/
├── extension.js        # Main extension code
├── extension.js.map    # Source map
├── webview.js          # Webview bundle
├── webview.js.map      # Source map
└── webview.css         # Webview styles
```

---

## 6. Testing

### 6.1 Test Structure
```
test/
├── unit/                       # Unit tests
│   ├── api/
│   │   ├── npm-registry.test.ts
│   │   └── npms-api.test.ts
│   ├── services/
│   │   ├── package-service.test.ts
│   │   └── search-service.test.ts
│   └── utils/
│       ├── semver.test.ts
│       └── formatters.test.ts
├── integration/                # Integration tests
│   └── extension.test.ts
├── e2e/                        # End-to-end tests
│   └── search-flow.test.ts
├── fixtures/                   # Test data
│   └── mock-data.ts
└── setup.ts                    # Test setup
```

### 6.2 Running Tests

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests
npm run test:integration

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- --testPathPattern="search-service"

# Run in watch mode
npm run test:watch
```

### 6.3 Writing Tests

#### Unit Test Example
```typescript
// test/unit/services/search-service.test.ts
import { SearchService } from '../../../src/services/search-service';
import { MockNpmsClient } from '../../mocks/npms-client';

describe('SearchService', () => {
  let service: SearchService;
  let mockClient: MockNpmsClient;

  beforeEach(() => {
    mockClient = new MockNpmsClient();
    service = new SearchService({ npms: mockClient });
  });

  describe('search', () => {
    it('should return results for valid query', async () => {
      mockClient.setSearchResults([
        { name: 'lodash', version: '4.17.21' },
        { name: 'lodash-es', version: '4.17.21' }
      ]);

      const results = await service.search('lodash');

      expect(results).toHaveLength(2);
      expect(results[0].name).toBe('lodash');
    });

    it('should return empty array for no results', async () => {
      mockClient.setSearchResults([]);

      const results = await service.search('nonexistentpackage');

      expect(results).toHaveLength(0);
    });

    it('should handle API errors gracefully', async () => {
      mockClient.setError(new Error('Network error'));

      await expect(service.search('lodash')).rejects.toThrow('Network error');
    });
  });
});
```

#### Integration Test Example
```typescript
// test/integration/extension.test.ts
import * as vscode from 'vscode';
import * as assert from 'assert';
import { activate } from '../../src/extension';

suite('Extension Integration Tests', () => {
  vscode.window.showInformationMessage('Starting integration tests');

  test('Extension should activate', async () => {
    const extension = vscode.extensions.getExtension('your-publisher.npm-gallery');
    assert.ok(extension);
    await extension.activate();
    assert.strictEqual(extension.isActive, true);
  });

  test('Commands should be registered', async () => {
    const commands = await vscode.commands.getCommands();

    assert.ok(commands.includes('npmGallery.openPanel'));
    assert.ok(commands.includes('npmGallery.search'));
    assert.ok(commands.includes('npmGallery.installPackage'));
  });

  test('Should open panel on command', async () => {
    await vscode.commands.executeCommand('npmGallery.openPanel');

    // Verify panel is visible
    const panel = vscode.window.activeWebviewPanel;
    assert.ok(panel);
  });
});
```

### 6.4 Mocking

#### Mock API Client
```typescript
// test/mocks/npms-client.ts
import { NpmsClient, SearchResult } from '../../src/api/npms-api';

export class MockNpmsClient implements NpmsClient {
  private searchResults: SearchResult[] = [];
  private error: Error | null = null;

  setSearchResults(results: SearchResult[]): void {
    this.searchResults = results;
  }

  setError(error: Error): void {
    this.error = error;
  }

  async search(query: string): Promise<SearchResult[]> {
    if (this.error) throw this.error;
    return this.searchResults;
  }

  async getPackage(name: string): Promise<PackageInfo> {
    if (this.error) throw this.error;
    const result = this.searchResults.find(r => r.name === name);
    if (!result) throw new Error('Package not found');
    return result as PackageInfo;
  }
}
```

### 6.5 Test Coverage Requirements
- **Unit tests**: Minimum 80% coverage
- **Integration tests**: All commands and providers
- **E2E tests**: Critical user flows

---

## 7. Debugging

### 7.1 Launch Configurations

#### .vscode/launch.json
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Run Extension",
      "type": "extensionHost",
      "request": "launch",
      "args": [
        "--extensionDevelopmentPath=${workspaceFolder}"
      ],
      "outFiles": [
        "${workspaceFolder}/dist/**/*.js"
      ],
      "preLaunchTask": "npm: watch"
    },
    {
      "name": "Run Extension Tests",
      "type": "extensionHost",
      "request": "launch",
      "args": [
        "--extensionDevelopmentPath=${workspaceFolder}",
        "--extensionTestsPath=${workspaceFolder}/dist/test/suite/index"
      ],
      "outFiles": [
        "${workspaceFolder}/dist/**/*.js"
      ],
      "preLaunchTask": "npm: build"
    },
    {
      "name": "Debug Webview",
      "type": "chrome",
      "request": "attach",
      "port": 9222,
      "webRoot": "${workspaceFolder}/src/webview"
    }
  ]
}
```

### 7.2 Debugging Extension Code
1. Set breakpoints in `.ts` files
2. Press F5 to launch Extension Development Host
3. Trigger the code path (e.g., run a command)
4. Debugger will pause at breakpoints

### 7.3 Debugging Webview
1. In Extension Host, open Command Palette
2. Run "Developer: Open Webview Developer Tools"
3. Use Chrome DevTools to debug React code

### 7.4 Logging
```typescript
// Use output channel for extension logs
const outputChannel = vscode.window.createOutputChannel('NPM Gallery');

export function log(message: string, level: 'info' | 'warn' | 'error' = 'info') {
  const timestamp = new Date().toISOString();
  outputChannel.appendLine(`[${timestamp}] [${level.toUpperCase()}] ${message}`);

  if (level === 'error') {
    console.error(message);
  }
}

// Usage
log('Searching for packages...');
log('API request failed', 'error');
```

### 7.5 Common Issues

#### Extension Not Loading
```bash
# Check for build errors
npm run build

# Verify package.json activationEvents
# Ensure main field points to correct file
```

#### Webview Not Rendering
```javascript
// Check Content Security Policy
// Verify script/style URIs are correct
// Check browser console for errors
```

#### API Calls Failing
```typescript
// Add request logging
console.log('Request:', url, options);

// Check network tab in Webview DevTools
// Verify API endpoints are correct
```

---

## 8. Code Style & Linting

### 8.1 ESLint Configuration

#### .eslintrc.js
```javascript
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true
    }
  },
  plugins: [
    '@typescript-eslint',
    'react',
    'react-hooks'
  ],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended'
  ],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    'react/react-in-jsx-scope': 'off',
    'react/prop-types': 'off'
  },
  settings: {
    react: {
      version: 'detect'
    }
  }
};
```

### 8.2 Prettier Configuration

#### .prettierrc
```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100,
  "bracketSpacing": true,
  "arrowParens": "avoid"
}
```

### 8.3 Code Style Guidelines

#### Naming Conventions
```typescript
// Classes: PascalCase
class PackageService {}

// Interfaces: PascalCase with 'I' prefix (optional)
interface PackageInfo {}

// Functions/methods: camelCase
function getPackageInfo() {}

// Constants: UPPER_SNAKE_CASE
const MAX_RETRY_COUNT = 3;

// Variables: camelCase
let currentPackage = null;

// Files: kebab-case
// package-service.ts, npm-registry.ts
```

#### Import Organization
```typescript
// 1. Node.js built-ins
import * as path from 'path';

// 2. VS Code API
import * as vscode from 'vscode';

// 3. External packages
import React from 'react';

// 4. Internal modules (absolute paths)
import { PackageService } from '@/services';

// 5. Internal modules (relative paths)
import { formatSize } from './utils';

// 6. Types
import type { PackageInfo } from '@/types';
```

---

## 9. Contributing

### 9.1 Contribution Workflow
```
┌─────────────────────────────────────────────────────────────┐
│                   Contribution Workflow                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   1. Fork repository         Click "Fork" on GitHub         │
│                                      │                       │
│                                      ▼                       │
│   2. Clone fork              git clone <your-fork>          │
│                                      │                       │
│                                      ▼                       │
│   3. Create branch           git checkout -b feature/xyz    │
│                                      │                       │
│                                      ▼                       │
│   4. Make changes            Edit, commit, repeat           │
│                                      │                       │
│                                      ▼                       │
│   5. Run tests               npm test                       │
│                                      │                       │
│                                      ▼                       │
│   6. Push branch             git push origin feature/xyz    │
│                                      │                       │
│                                      ▼                       │
│   7. Open PR                 Create Pull Request on GitHub  │
│                                      │                       │
│                                      ▼                       │
│   8. Code review             Address feedback               │
│                                      │                       │
│                                      ▼                       │
│   9. Merge                   Maintainer merges PR           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 9.2 Branch Naming
```
feature/    New features           feature/package-search
fix/        Bug fixes              fix/search-results-empty
docs/       Documentation          docs/update-readme
refactor/   Code refactoring       refactor/api-clients
test/       Test additions         test/add-service-tests
chore/      Maintenance tasks      chore/update-deps
```

### 9.3 Commit Messages
Follow [Conventional Commits](https://www.conventionalcommits.org/):
```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

Examples:
```
feat(search): add filter by package size
fix(install): handle network timeout errors
docs(readme): update installation instructions
refactor(api): extract base client class
test(services): add package service tests
chore(deps): update typescript to 5.3.0
```

### 9.4 Pull Request Guidelines
- Fill out the PR template completely
- Link related issues
- Include screenshots for UI changes
- Ensure all tests pass
- Update documentation if needed
- Keep PRs focused and reasonably sized

### 9.5 Code Review Checklist
- [ ] Code follows style guidelines
- [ ] Tests are included and passing
- [ ] No unnecessary complexity
- [ ] Error handling is appropriate
- [ ] Security considerations addressed
- [ ] Documentation updated
- [ ] No console.log statements left
- [ ] TypeScript types are correct

---

## 10. Release Process

### 10.1 Versioning
Follow [Semantic Versioning](https://semver.org/):
- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes (backward compatible)

### 10.2 Release Checklist
```
□ Update version in package.json
□ Update CHANGELOG.md
□ Run full test suite
□ Build production bundle
□ Test extension manually
□ Create git tag
□ Publish to Marketplace
□ Create GitHub release
□ Announce release
```

### 10.3 Publishing to Marketplace

#### Prerequisites
```bash
# Install vsce (VS Code Extension Manager)
npm install -g @vscode/vsce

# Login to publisher account
vsce login your-publisher
```

#### Package and Publish
```bash
# Package extension
vsce package

# Publish to marketplace
vsce publish

# Publish with version bump
vsce publish minor  # or major, patch
```

### 10.4 Creating GitHub Release
```bash
# Tag the release
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0

# Create release on GitHub
# - Go to Releases > Draft a new release
# - Select tag
# - Add release notes from CHANGELOG
# - Attach .vsix file
# - Publish release
```

### 10.5 CHANGELOG Format
```markdown
# Changelog

## [1.1.0] - 2024-01-15

### Added
- Bundle size analysis for packages
- Alternative package suggestions

### Changed
- Improved search result ranking
- Updated UI for package details

### Fixed
- Fixed search not working with scoped packages
- Fixed memory leak in cache manager

## [1.0.0] - 2024-01-01

### Added
- Initial release
- Package search and browse
- One-click installation
- Security vulnerability scanning
- Package.json hover information
```

---

## Appendix: Useful Resources

### Official Documentation
- [VS Code Extension API](https://code.visualstudio.com/api)
- [VS Code Extension Samples](https://github.com/microsoft/vscode-extension-samples)
- [VS Code Webview API](https://code.visualstudio.com/api/extension-guides/webview)

### npm APIs
- [npm Registry API](https://github.com/npm/registry/blob/master/docs/REGISTRY-API.md)
- [npms.io API](https://api-docs.npms.io/)

### Tools
- [vsce - Extension Manager](https://github.com/microsoft/vscode-vsce)
- [yo code - Extension Generator](https://github.com/microsoft/vscode-generator-code)

### Community
- [VS Code Discussions](https://github.com/microsoft/vscode-discussions)
- [Stack Overflow - vscode-extensions](https://stackoverflow.com/questions/tagged/vscode-extensions)
