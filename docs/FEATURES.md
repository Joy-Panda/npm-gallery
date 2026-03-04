# Features Specification

## NPM Gallery - VS Code Extension

This document provides detailed specifications for all features of the NPM Gallery extension.

---

## Table of Contents
1. [Package Search](#1-package-search)
2. [Package Details View](#2-package-details-view)
3. [Package Installation](#3-package-installation)
4. [Manifest Integration](#4-manifest-integration)
5. [Security Scanning](#5-security-scanning)
6. [Bundle Size Analysis](#6-bundle-size-analysis)
7. [License Management](#7-license-management)
8. [Alternative Suggestions](#8-alternative-suggestions)
9. [Update Management](#9-update-management)
10. [Workspace Support](#10-workspace-support)

---

## 1. Package Search

### 1.1 Overview
Enable developers to search the current package source without leaving VS Code.

### 1.2 Functional Requirements

#### Search Input
- Support for exact match queries using quotes
- Scope-aware search (@scope/package)

**Exact match query behavior**
- Input like `"react"` treats `react` as an explicit exact-match target.
- Input like `router "react-router"` keeps the normal search term (`router`) and also marks `react-router` as an explicit exact-match target.
- Input like `"@types/node"` works the same way for scoped packages.
- When an exact-match target exists and can be resolved, that package should be promoted to the top of the results and shown with an `exact match` badge.
- Input like `"react"` and `react "react"` should produce the same effective behavior: run the normal search and prioritize `react` as the exact match.
- If the exact-match target cannot be resolved, fall back to normal search results without showing the `exact match` badge.
- Only complete quoted segments count as exact-match syntax; unmatched quotes are treated as normal text.

#### Search Results
| Field | Description | Source |
|-------|-------------|--------|
| Package name | Full package name | Active source |
| Description | Short description (max 150 chars) | Active source |
| Version | Selected/latest version | Active source |
| Downloads | Source-specific download metric | Active source |
| Score | Quality/popularity score when available | Active source |
| Bundle size | Minified + gzipped size when available | Bundlephobia or active source |

#### Filters & Sorting Options
**按当前 Source 自适应**：筛选与排序均只展示当前数据源支持的维度。

**筛选**：npm 源支持 author、maintainer、scope、keywords、unstable、insecure 等；npms 源在此基础上还可选 deprecated；Maven（Sonatype）源支持 groupId；其他源可能无筛选或维度不同。

**排序**：npm 源通常支持 relevance（默认）、popularity、quality、maintenance、name；Maven 等源可能仅支持 relevance、popularity；具体以当前源为准。

### 1.3 User Interface
```
┌─────────────────────────────────────────────┐
│ 🔍 Search packages...              [Filters]│
├─────────────────────────────────────────────┤
│ Sort: Relevance ▼  │ Results: 1,234         │
├─────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────┐ │
│ │ 📦 lodash                    v4.17.21  │ │
│ │ A modern JavaScript utility library... │ │
│ │ ⬇️ 14.5M/month  📊 98  📦 72KB        │ │
│ └─────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────┐ │
│ │ 📦 express                    v4.18.2  │ │
│ │ Fast, unopinionated web framework...   │ │
│ │ ⬇️ 11.2M/month  📊 97  📦 54KB        │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

### 1.4 Technical Implementation
- Search is routed through the current source selected by `SourceSelector`
- Sources may implement internal fallback behavior, and `libraries-io` can also be used as a cross-ecosystem fallback source
- Implement local caching (5 min TTL)
- Cancel pending requests on new search

---

## 2. Package Details View

### 2.1 Overview
Display comprehensive package information to help developers make informed decisions.

### 2.2 Information Sections

#### Header
- 包名、描述
- 作者、License、下载量、Bundle size、Score（以 stat 标签形式展示）
- 安装按钮（含依赖类型选择）

最新版本、发布时间以及 Registry / Homepage / Repository / Issues 链接**不在** Header 内，位于右侧**侧栏**。

#### 侧栏（Resources / Info 等）
| 区块 | 内容 |
|------|------|
| Version | 当前展示的版本号 |
| Security | 漏洞数量与简要状态 |
| Resources | Registry、Homepage、Repository、Issues 等外链 |
| Info | Published（发布时间）、Package Manager、Dependencies 数量、Unpacked Size、Maintainers 等 |
| Keywords | 关键词列表（若有） |

#### Tabs
1. **README** - Rendered markdown documentation
2. **Versions** - Version history with dates
3. **Dependencies** - Required packages（按 runtime/dev/peer/optional 分组）
4. **Requirements** - 依赖/要求信息（按 section 分组，多见于 Maven 等生态）
5. **Dependents** - Packages that use this
6. **Security** - Vulnerability information

#### README Tab
- Full markdown rendering
- Syntax highlighting for code blocks
- Image support (remote images allowed)
- Link handling (open in browser)
- Table of contents for long READMEs

#### Versions Tab
```
┌─────────────────────────────────────────────┐
│ Version   │ Published    │ Tag     │ Action │
├───────────┼──────────────┼─────────┼────────┤
│ 4.17.21   │ 2 years ago  │ latest  │ Install│
│ 4.17.20   │ 2 years ago  │         │ Install│
│ 4.17.19   │ 3 years ago  │         │ Install│
│ ...       │              │         │        │
└─────────────────────────────────────────────┘
```

#### Dependencies Tab
- 按 **runtime / dev / peer / optional** 分组的平铺列表（可折叠各分组）
- 每组内展示依赖名与版本，点击可跳转该包详情

#### Requirements Tab
- 展示当前包的 **requirements**（依赖/要求），多用于 Maven 等生态（`RequirementsInfo`：system、package、version、sections）
- 按 **section** 分组（每 section 有 id、title、items），分组可折叠
- 每项展示：依赖名、版本/requirement，以及 meta（scope、type、classifier、optional、exclusions 等）
- 无数据时显示 “{name} {version} has no requirements.”

#### Security Tab
- Vulnerability count by severity
- Individual vulnerability details
- CVE links
- Remediation suggestions

### 2.3 User Interface
```
┌──────────────────────────────────────────────────────┬─────────────────┐
│ ← Back to Search                                      │ Version         │
├──────────────────────────────────────────────────────┤ 4.17.21         │
│ lodash                                                ├─────────────────┤
│ A modern JavaScript utility library delivering        │ Security        │
│ modularity, performance & extras.                     │ ✓ No vulns      │
│                                                       ├─────────────────┤
│ [Author] [⬇️ 14.5M/month] [📦 72KB] [⭐ 98] [MIT]     │ Resources       │
│                                                       │ Registry · Repo │
│ [Install ▼]  Install target: …                        ├─────────────────┤
├──────────────────────────────────────────────────────┤ Info            │
│ [README] [Versions] [Dependencies] [Dependents] …     │ Published: 2y ago│
├──────────────────────────────────────────────────────┤                 │
│                                                       │ Keywords        │
│ # Lodash                                              │ # utility …     │
│ A modern JavaScript utility library...                │                 │
└──────────────────────────────────────────────────────┴─────────────────┘
    主区域（Header + Tabs 内容）                              侧栏
```
主区域 Header 仅含包名、描述、统计标签（作者/下载量/bundle size/score/license）与安装按钮；最新版本、发布时间、Registry/Repository 等在右侧侧栏。

---

## 3. Package Installation

### 3.1 Overview
One-click package installation or copy-snippet generation with version and type selection.

### 3.2 Installation Options

#### Dependency Type
- Available dependency/save types depend on the current ecosystem
- Examples:
  - npm: `dependencies`, `devDependencies`, `peerDependencies`, `optionalDependencies`
  - Composer/Ruby/Perl/Dart/R/Clojure: typically `dependencies` / `devDependencies`
  - Cargo: `dependencies`, `devDependencies`, `optionalDependencies`

#### Package Manager / Build Tool Detection
- Auto-detect package manager or build/declaration format from workspace manifest context
- Supported direct command tools and copy formats depend on the current source
- Show detected package manager/build tool in the UI
- Adapt install/update/remove/copy actions to the detected target automatically
- In multi-project workspaces, prompt for the target manifest before install
- Sort target project suggestions by editor context:
  - currently viewed project
  - opened but not currently viewed project
  - unopened projects
- Remember the last selected install target during the session
- Show the current install target in the UI

### 3.3 Installation Flow
```
1. User clicks "Install" button
2. Show installation modal:
   ┌─────────────────────────────────────┐
   │ Install lodash                      │
   ├─────────────────────────────────────┤
   │ Version: [4.17.21 (latest) ▼]      │
   │                                     │
   │ Save as:                            │
   │ ○ dependencies                      │
   │ ● devDependencies                   │
   │ ○ peerDependencies                  │
   │                                     │
   └─────────────────────────────────────┘
3. Execute installation command
4. Show progress indicator
5. Display success/error notification
```

### 3.4 Post-Installation Actions
- Refresh the affected manifest view
- Update dependency tree
- Show changelog for new installs
- Suggest related packages (optional)

### 3.5 Package Manager / Tooling Support
Representative examples:

| Ecosystem | Tool / Format | Action Type |
|-----------|---------------|-------------|
| npm | `npm` / `yarn` / `pnpm` / `bun` | Direct install/update/remove |
| Sonatype | `Maven` / `Gradle` / `SBT` / `Mill` / `Ivy` / `Grape` / `Leiningen` / `Buildr` | Copy snippet / source-aware add flow |
| NuGet | `.NET CLI` / `PackageReference` / `CPM` / `Paket` / `Cake` / `PMC` | Direct command or manifest edit |
| Composer | `composer` | Direct install/update/remove |
| Ruby | `bundler` | Direct install/update/remove |
| Cargo | `cargo` | Direct install/update/remove |
| Dart / Flutter | `dart pub` / `flutter pub` | Direct install/update/remove |
| R | `install.packages()` and `DESCRIPTION` editing | Direct install or manifest edit |
| Clojure | `neil` / `deps.edn` / `Leiningen` | Direct install or copy snippet |
| Perl | `cpanm` / `cpanfile` | Direct install or manifest edit |
| Go | `go get` | Direct install/update/remove |

---

## 4. Manifest Integration

### 4.1 Overview
Enhance supported manifest editing experiences with inline information and actions.

### 4.2 Hover Information
When hovering over a dependency entry in a supported manifest:
```
┌─────────────────────────────────────────────┐
│ 📦 lodash                                    │
│ A modern JavaScript utility library          │
├─────────────────────────────────────────────┤
│ Installed: 4.17.20                          │
│ Latest:    4.17.21  ⚠️ Update available     │
│ Downloads: 14.5M/month                      │
│ Size:      72KB (gzipped)                   │
│ License:   MIT ✓                            │
│ Security:  No vulnerabilities ✓             │
├─────────────────────────────────────────────┤
│ [Update] [Remove] [View Details]            │
└─────────────────────────────────────────────┘
```

### 4.3 CodeLens Actions
Display above each dependency section:
```json
{
  "dependencies": {  // 3 updates available | Update All
    "lodash": "^4.17.20",      // Update to 4.17.21
    "express": "^4.18.2",      // ✓ Latest
    "axios": "^0.27.0"         // Update to 1.6.0 (major)
  }
}
```

### 4.4 Diagnostic Warnings
Show VS Code diagnostics for:
- Security vulnerabilities (red squiggle)
- Outdated packages (yellow squiggle)
- Deprecated packages (strikethrough)
- License issues (info-level warning where implemented)

### 4.5 Quick Actions
Right-click context menu:
- Update package
- Update to specific version
- Remove package
- View on registry
- View package details
- Copy package name

### 4.6 Autocomplete
When typing package names:
- Suggest from the active source
- Show version hints
- Display package info inline
- Recent/popular packages first

### 4.7 Custom Editor
- Open supported manifests with enhanced text + analyzer experiences where implemented
- Built-in tabs:
  - `Text`
  - `Dependency Analyzer`
- The analyzer view supports:
  - recursive dependency tree visualization
  - transitive version conflict detection
  - search/filter by package name or version
  - direct-only mode
  - hide dev root dependencies
- Current implementation scope:
  - npm dependency analyzer is fully implemented
  - other ecosystems rely on package details, hover, CodeLens, and workspace trees rather than a full local analyzer

---

## 5. Security Scanning

### 5.1 Overview
Proactive security analysis to prevent vulnerable dependencies.

### 5.2 Data Sources
- **OSV / source advisory APIs** - Primary vulnerability data where supported
- **Source-specific security endpoints** - Used when an ecosystem provides its own advisory feed
- Coverage depends on the active source and current package ecosystem

### 5.3 Vulnerability Display

#### Severity Levels
| Level | Color | Icon | Description |
|-------|-------|------|-------------|
| Critical | Red | 🔴 | Immediate action required |
| High | Orange | 🟠 | Action required soon |
| Moderate | Yellow | 🟡 | Should be addressed |
| Low | Blue | 🔵 | Monitor and plan |

#### Vulnerability Card
```
┌─────────────────────────────────────────────┐
│ 🔴 Critical: Prototype Pollution            │
├─────────────────────────────────────────────┤
│ Package: lodash < 4.17.21                   │
│ CVE: CVE-2021-23337                         │
│ CVSS: 7.2                                   │
│                                             │
│ Description:                                │
│ Lodash versions prior to 4.17.21 are       │
│ vulnerable to prototype pollution...        │
│                                             │
│ Recommendation:                             │
│ Upgrade to lodash@4.17.21 or later         │
│                                             │
│ [View CVE ↗] [Update Package]              │
└─────────────────────────────────────────────┘
```

### 5.4 Scanning Triggers
- **On install** - Before installing any package
- **On open** - When opening a workspace
- **On demand** - Via command palette
- **Scheduled** - Background periodic scan

### 5.5 Security Dashboard
Aggregate view of all vulnerabilities in workspace:
```
┌─────────────────────────────────────────────┐
│ 🛡️ Security Overview                        │
├─────────────────────────────────────────────┤
│ Total packages: 234                         │
│ Vulnerable: 3                               │
│                                             │
│ 🔴 Critical: 0                              │
│ 🟠 High: 1                                  │
│ 🟡 Moderate: 2                              │
│ 🔵 Low: 0                                   │
├─────────────────────────────────────────────┤
│ [Run Full Audit] [Export Report]            │
└─────────────────────────────────────────────┘
```

---

## 6. Bundle Size Analysis

### 6.1 Overview
Help developers understand the performance impact of dependencies.

### 6.2 Size Metrics
| Metric | Description |
|--------|-------------|
| Minified | Size after minification |
| Gzipped | Size after gzip compression |
| Parse time | Estimated JavaScript parse time |
| Dependencies | Total deps included |

### 6.3 Data Source
Primary: Bundlephobia API
Fallback: Package tarball size estimation

### 6.4 Display Locations
1. **Search results** - Badge on each result
2. **Package details** - Dedicated section
3. **Package.json hover** - Quick preview
4. **Import statements** - Inline decoration

### 6.5 Bundle Composition
```
┌─────────────────────────────────────────────┐
│ 📦 Bundle Analysis: moment                   │
├─────────────────────────────────────────────┤
│ Total: 72.1KB minified (18.2KB gzipped)    │
│                                             │
│ ├── moment core: 52KB (72%)                │
│ ├── locale data: 18KB (25%)                │
│ └── timezone: 2.1KB (3%)                   │
│                                             │
│ Download time (3G): ~0.6s                   │
│ Download time (4G): ~0.2s                   │
├─────────────────────────────────────────────┤
│ 💡 Consider: date-fns (6.5KB gzipped)      │
│    95% smaller, tree-shakeable              │
└─────────────────────────────────────────────┘
```

### 6.6 Size Warnings
Configurable thresholds:
```json
{
  "npmGallery.sizeWarning": {
    "warn": 50,    // KB - show warning
    "error": 200   // KB - show error
  }
}
```

---

## 7. License Management

### 7.1 Overview
Ensure dependency licenses are compatible with project requirements.

### 7.2 License Detection
- Parse from source/package metadata license fields when available
- Fallback to available package metadata or linked license information
- Handle SPDX expressions (MIT OR Apache-2.0)

### 7.3 License Categories
| Category | Examples | Default |
|----------|----------|---------|
| Permissive | MIT, ISC, BSD | ✅ Allowed |
| Copyleft | GPL, LGPL, MPL | ⚠️ Warning |
| Proprietary | Commercial | ❌ Blocked |
| Unknown | Unlicensed | ⚠️ Warning |

### 7.4 Configuration
```json
{
  "npmGallery.licenseWhitelist": ["MIT", "ISC", "Apache-2.0", "BSD-3-Clause"]
}
```

### 7.5 License Report
Generate exportable report:
```
License Report for my-project
Generated: 2024-11-15

Summary:
- Total packages: 234
- MIT: 180 (77%)
- ISC: 30 (13%)
- Apache-2.0: 20 (8%)
- Other: 4 (2%)

Packages requiring attention:
- some-package@1.0.0: GPL-3.0 (blacklisted)
- unknown-pkg@2.0.0: UNLICENSED (unknown)
```

---

## 8. Alternative Suggestions

### 8.1 Overview
Help developers discover better alternatives to their dependencies.

### 8.2 Suggestion Criteria
- Similar functionality (keyword matching)
- Better maintenance score
- Smaller bundle size
- More downloads
- Fewer vulnerabilities
- More recent updates

### 8.3 Suggestion Display
```
┌─────────────────────────────────────────────┐
│ 💡 Alternatives to moment                    │
├─────────────────────────────────────────────┤
│                                             │
│ 📦 date-fns                                 │
│ Modern JavaScript date utility library       │
│ ✅ 95% smaller (6.5KB vs 72KB)             │
│ ✅ Tree-shakeable                           │
│ ✅ Active maintenance                       │
│ [Compare] [Install Instead]                 │
│                                             │
│ 📦 dayjs                                    │
│ Fast 2KB alternative to Moment.js           │
│ ✅ 97% smaller (2KB vs 72KB)               │
│ ✅ Same API as Moment                       │
│ ⚠️ Fewer features                          │
│ [Compare] [Install Instead]                 │
│                                             │
└─────────────────────────────────────────────┘
```

### 8.4 Comparison View
Side-by-side package comparison:
```
┌──────────────────┬──────────────────┐
│ moment           │ date-fns         │
├──────────────────┼──────────────────┤
│ Size: 72KB       │ Size: 6.5KB  ✓  │
│ Weekly: 18M      │ Weekly: 20M  ✓  │
│ Score: 65        │ Score: 92    ✓  │
│ Last: 2 years    │ Last: 2 weeks ✓ │
│ Vulns: 0         │ Vulns: 0        │
│ License: MIT     │ License: MIT    │
├──────────────────┴──────────────────┤
│ [Install moment] [Install date-fns] │
└─────────────────────────────────────┘
```

### 8.5 Migration Guides
For popular packages, provide migration assistance:
- API mapping documentation
- Code transformation examples
- Common gotchas

---

## 9. Update Management

### 9.1 Overview
Streamline the process of keeping dependencies up to date.

### 9.2 Update Detection
- Compare installed vs latest version
- Identify semver update type (major/minor/patch)
- Check for breaking changes

### 9.3 Update Types
| Type | Example | Risk | Action |
|------|---------|------|--------|
| Patch | 1.0.0 → 1.0.1 | Low | Auto-suggest |
| Minor | 1.0.0 → 1.1.0 | Medium | Suggest |
| Major | 1.0.0 → 2.0.0 | High | Warn |

### 9.4 Bulk Update
```
┌─────────────────────────────────────────────┐
│ 📦 Updates Available (5)                     │
├─────────────────────────────────────────────┤
│ ☑️ lodash      4.17.20 → 4.17.21 (patch)   │
│ ☑️ express     4.18.1  → 4.18.2  (patch)   │
│ ☑️ axios       0.27.0  → 1.6.0   (major) ⚠️│
│ ☐ typescript  4.9.0   → 5.3.0   (major) ⚠️│
│ ☑️ eslint     8.50.0  → 8.54.0  (minor)   │
├─────────────────────────────────────────────┤
│ [Update Selected (4)] [Update All]          │
└─────────────────────────────────────────────┘
```

### 9.5 Changelog Preview
Before updating, show relevant changelog:
```
┌─────────────────────────────────────────────┐
│ 📋 Changelog: axios 0.27.0 → 1.6.0          │
├─────────────────────────────────────────────┤
│ ⚠️ BREAKING CHANGES:                        │
│ - CommonJS/AMD/UMD exports changed          │
│ - Default export removed                    │
│                                             │
│ ✨ New features:                            │
│ - Native fetch adapter                      │
│ - Progress events for uploads               │
│                                             │
│ 🐛 Bug fixes:                               │
│ - Fixed memory leak in interceptors         │
├─────────────────────────────────────────────┤
│ [Cancel] [Update Anyway]                    │
└─────────────────────────────────────────────┘
```

---

## 10. Workspace Support

### 10.1 Multi-Manifest Workspaces
- Support multiple manifests in a single workspace
- Support multiple manifest types in a single workspace
- In multi-root VS Code workspaces, group by workspace folder first
- When only one manifest exists, keep the simple dependency-type grouping
- When multiple manifests exist, group by manifest path/name before dependency type

### 10.2 Monorepo Discovery
- npm / Yarn workspaces via root `package.json.workspaces`
- pnpm workspaces via `pnpm-workspace.yaml`
- Lerna package discovery via `lerna.json`
- Nx package/project discovery via `nx.json`, `project.json`, and `workspace.json`
- Fall back to scanning all manifests when no explicit workspace configuration exists

### 10.3 Local Dependency Semantics
- Preserve and label non-registry specs:
  - `workspace:*`
  - `file:../..`
  - relative local paths
  - git-based dependencies
- Detect and label workspace-local/self references in installed package views, hover, and CodeLens

### 10.4 Workspace Graph And Alignment
- Build a project graph for supported workspace manifests where implemented
- Detect local project-to-project dependencies inside monorepos
- Detect shared dependency version mismatches across projects
- Command: `Show Workspace Graph`
- Command: `Align Workspace Dependency Versions`
- Open a dedicated `Dependency Analyzer` editor panel
- For npm manifests, support `Analyzer / package.json` view switching inside the analyzer panel
- Support manifest-scoped recursive conflict detection for transitive dependencies
- Support analyzer filtering:
  - search/filter by package or version
  - only conflicts
  - direct dependencies only
  - hide dev root dependencies

### 10.5 Scoped Refresh And Performance
- Refresh by workspace folder group
- Refresh by manifest group
- Scope tree data refresh to the selected group
- Scope latest-version invalidation to affected packages
- Scope local dependency tree invalidation to the affected workspace root
- Use document-level CodeLens caching with scope-based invalidation

## Feature Priority Matrix

| Feature | Priority | Complexity | MVP |
|---------|----------|------------|-----|
| Package Search | P0 | Medium | ✅ |
| Package Details | P0 | Medium | ✅ |
| Installation | P0 | Medium | ✅ |
| Manifest Integration | P0 | High | ✅ |
| Security Scanning | P0 | High | ✅ |
| Bundle Size Analysis | P1 | Medium | ❌ |
| License Management | P1 | Medium | ❌ |
| Alternative Suggestions | P1 | High | ❌ |
| Update Management | P1 | Medium | ❌ |
| Workspace Support | P2 | High | ❌ |
