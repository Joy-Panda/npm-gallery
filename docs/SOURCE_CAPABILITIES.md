# Source Capabilities

This document defines a reusable capability model for package sources and project integrations.

Support markers:

- `YES`: fully supported
- `PARTIAL`: supported with scope or source-specific limits
- `NO`: not supported

## Capability Model

| Category | Capability | Description |
| --- | --- | --- |
| Search | Search | Supports package search results. |
| Search | Suggestions | Supports autocomplete or suggestion results. |
| Search | Filters | Supports source-specific search filter fields. |
| Search | Sorts | Supports source-specific sort options. |
| Package Info | Basic Info | Supports package name, version, description, links, and other summary metadata. |
| Package Info | Download Stats | Supports download metrics. |
| Package Info | Quality Score | Supports package quality or ranking score. |
| Package Info | Bundle Size | Supports package size or bundle size information. |
| Package Info | Security Info | Supports vulnerability or advisory data. |
| Details View | Details Page | Supports opening a package details view. |
| Details View | Header | Supports package summary/header area in details view. |
| Details View | Sidebar | Supports sidebar metadata and external links. |
| Details View | Readme Tab | Supports README or long description display. |
| Details View | Versions Tab | Supports version history display. |
| Details View | Dependencies Tab | Supports dependency list display. |
| Details View | Requirements Tab | Supports structured requirements display. |
| Details View | Dependents Tab | Supports dependent packages display. |
| Details View | Security Tab | Supports security details tab. |
| Dependency Management | Install Command | Supports generating install commands or install actions. |
| Dependency Management | Update Command | Supports generating update commands or update actions. |
| Dependency Management | Remove Command | Supports generating remove commands or remove actions. |
| Dependency Management | Dependency Types | Supports multiple dependency target types such as runtime or dev. |
| Dependency Management | Install Target Selection | Supports choosing the manifest or target file to modify. |
| Workspace | Installed Packages | Supports reading installed or declared packages from workspace manifests. |
| Workspace | Available Updates | Supports detecting newer available versions for workspace packages. |
| Workspace | Manifest Watch | Supports automatic refresh when relevant manifests change. |
| Workspace | Multi-Manifest Scan | Supports scanning multiple manifests in a workspace. |
| Workspace | Workspace Graph | Supports workspace dependency graph analysis. |
| Workspace | Version Alignment | Supports aligning the same dependency across workspace manifests. |
| Editor | Hover | Supports editor hover details in manifests. |
| Editor | CodeLens | Supports editor CodeLens in manifests. |
| Editor | Update CodeLens | Supports CodeLens for package updates. |
| Editor | Security CodeLens | Supports CodeLens for package security status. |
| Editor | Batch Update CodeLens | Supports section-level or batch update CodeLens. |
| Analysis | Security Audit Command | Supports running package manager audit commands. |
| Analysis | Dependency Analyzer | Supports dependency analyzer or workspace graph UI. |

## Tooling Terms

To avoid mixing unlike concepts, this project uses these terms when describing source integration:

- `Project Manifests`: files the extension can parse and manage directly, such as `package.json`, `pom.xml`, or `go.mod`
- `Direct Command Tools`: tools that support install/update/remove through runnable commands, such as `npm`, `pnpm`, `composer`, or `cargo`
- `Copy Formats`: dependency declaration formats where the extension mainly generates snippets to paste into project files, such as `Maven`, `Gradle`, or `Ivy`

Important distinction:

- `npm / pnpm / yarn / bun` are direct command tools
- `Maven / Gradle / SBT / Mill / Ivy / Grape / Leiningen / Buildr` are primarily copy formats or build/dependency declaration formats
- A source may support both, only one, or different subsets of each

## Source Tooling Matrix

| Source | Project Manifests | Direct Command Tools | Copy Formats |
| --- | --- | --- | --- |
| `npm-registry` | `package.json` | `npm`, `pnpm`, `yarn`, `bun` | None |
| `npms-io` | `package.json` | `npm`, `pnpm`, `yarn`, `bun` | None |
| `sonatype` | `pom.xml`, `build.gradle`, `build.gradle.kts` | None | `Maven`, `Gradle`, `SBT`, `Mill`, `Ivy`, `Grape`, `Leiningen`, `Buildr` |
| `nuget` | `Directory.Packages.props`, `packages.config`, `paket.dependencies`, `*.csproj`, `*.vbproj`, `*.fsproj`, `*.cake` | `.NET CLI`, `Paket` | `PackageReference`, `CPM`, `packages.config`, `Cake`, `PMC`, `Script`, `File-based` |
| `packagist` | `composer.json` | `Composer` | None |
| `rubygems` | `Gemfile` | `Bundler` | None |
| `clojars` | `deps.edn`, `project.clj` | `neil` | `deps.edn`, `Leiningen` |
| `crates.io` | `Cargo.toml` | `Cargo` | None |
| `pkg.go.dev` | `go.mod` | `Go modules` | None |
| `metacpan` | `cpanfile` | `cpanm` | None |
| `pub.dev` | `pubspec.yaml` | `dart pub`, `flutter pub` | None |
| `cran` | `DESCRIPTION` | `R` | `DESCRIPTION` dependency entry |
| `libraries-io` | Follows current project type | Follows current project type when command support exists | Follows current project type when copy support exists |

Matrix notes:

- `libraries-io` is a fallback source, so its tooling surface depends on the active project type rather than one fixed ecosystem
- `Rproj` is not listed as a project manifest because current dependency management is still proxied through sibling `DESCRIPTION`
- Lockfiles such as `composer.lock`, `Gemfile.lock`, `Cargo.lock`, and `pubspec.lock` are supporting files, not primary manifests in this terminology

## npm-registry Source with npm Project Support

### Search

| Capability | Supported | Notes |
| --- | --- | --- |
| Search | `YES` | Supports keyword search, exact name prioritization, and pagination. |
| Suggestions | `YES` | Suggestions are provided through search-based lookup. |
| Filters | `YES` | `author`, `maintainer`, `scope`, `keywords`, `deprecated`, `unstable`, `insecure`, `boost-exact`. |
| Sorts | `YES` | `relevance`, `popularity`, `quality`, `maintenance`, `name`. |

### Package Info

| Capability | Supported | Notes |
| --- | --- | --- |
| Basic Info | `YES` | Includes version, description, links, maintainers, and metadata. |
| Download Stats | `YES` | Search cards use monthly downloads when available; details and hover use monthly download API. |
| Quality Score | `YES` | Search results expose npm search score. |
| Bundle Size | `YES` | Uses bundle size integration when available. |
| Security Info | `YES` | Uses OSV-backed security data. |

### Details View

| Capability | Supported | Notes |
| --- | --- | --- |
| Details Page | `YES` | Package details panel is supported. |
| Header | `YES` | Shows version, downloads, size, score, license, and actions. |
| Sidebar | `YES` | Shows registry and repository related metadata. |
| Readme Tab | `YES` | Can use registry README and falls back to unpkg README fetch. |
| Versions Tab | `YES` | Shows version history. |
| Dependencies Tab | `YES` | Shows runtime, dev, peer, and optional dependency sections. |
| Requirements Tab | `YES` | Uses deps.dev requirements data. |
| Dependents Tab | `YES` | Uses deps.dev dependents data. |
| Security Tab | `YES` | Shows vulnerability summary and details. |

### Dependency Management

| Capability | Supported | Notes |
| --- | --- | --- |
| Install Command | `YES` | Supports npm, yarn, pnpm, and bun command generation. |
| Update Command | `YES` | Supports package manager-specific update command generation. |
| Remove Command | `YES` | Supports package manager-specific remove command generation. |
| Dependency Types | `YES` | `dependencies`, `devDependencies`, `peerDependencies`, `optionalDependencies`. |
| Install Target Selection | `YES` | Supports choosing the target `package.json` in multi-manifest workspaces. |

### Workspace

| Capability | Supported | Notes |
| --- | --- | --- |
| Installed Packages | `YES` | Reads package declarations from workspace `package.json` files. |
| Available Updates | `YES` | Resolves latest versions and groups updates by manifest or workspace. |
| Manifest Watch | `YES` | Refreshes when package manifests or workspace config change. |
| Multi-Manifest Scan | `YES` | Supports multiple `package.json` files in one workspace. |
| Workspace Graph | `YES` | Builds workspace dependency graph for npm manifests. |
| Version Alignment | `YES` | Supports aligning dependency versions across workspace manifests. |

### Editor

| Capability | Supported | Notes |
| --- | --- | --- |
| Hover | `YES` | Supports `package.json` hover details. |
| CodeLens | `YES` | Supports `package.json` CodeLens. |
| Update CodeLens | `YES` | Shows update actions for supported dependency sections. |
| Security CodeLens | `YES` | Shows vulnerability summary CodeLens. |
| Batch Update CodeLens | `YES` | Supports section-level update-all actions in `package.json`. |

### Analysis

| Capability | Supported | Notes |
| --- | --- | --- |
| Security Audit Command | `YES` | Supports `npm audit`, `yarn audit`, `pnpm audit`, and `bun audit`. |
| Dependency Analyzer | `YES` | Supports dependency analyzer and workspace graph entry points for `package.json`. |

## Notes for Reuse

- This structure is intended to be reused for other sources such as `packagist`, `nuget`, `rubygems`, `metacpan`, and others.
- Source-specific fields should stay in the `Notes` column instead of introducing new top-level capability names.
- If a source supports a details page but lacks one or more tabs, mark the page as `YES` and the missing tabs as `NO` or `PARTIAL`.
