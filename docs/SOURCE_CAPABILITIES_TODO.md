# Source Capabilities Todo

This document follows the capability model defined in [SOURCE_CAPABILITIES.md](./SOURCE_CAPABILITIES.md).

Scope of this file:

- Excludes `npm-registry` and `npms-io`
- Focuses on non-npm sources and their current project integration state
- Uses source-based grouping

Status markers:

- `Supported`: implemented and wired into the current UX
- `Todo`: likely supported by the source or current architecture, but not fully implemented
- `Not Supported`: currently not supported and not clearly backed by an existing implementation path
- `TBD`: not enough confidence yet to classify as supported or implementable

## Summary Matrix

Legend:

- `S`: Supported
- `T`: Todo
- `N`: Not Supported
- `?`: TBD

| Source | Search | Details | Dependencies | Requirements | Dependents | Security | Hover | CodeLens | Installed / Updates | Install / Copy | Workspace Tools |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Sonatype | S | T | S | S | S | S | S | S | S | S | N |
| NuGet | S | S | S | S | S | S | S | S | S | S | N |
| Packagist | S | S | S | S | S | S | S | S | S | S | N |
| RubyGems | S | T | S | S | S | S | S | T | S | S | N |
| Clojars | S | T | S | S | N | S | S | S | S | S | N |
| crates.io | S | T | S | S | S | S | S | T | S | S | N |
| MetaCPAN | S | S | S | S | N | N | S | S | S | S | N |
| pub.dev | S | T | S | S | N | S | S | T | S | S | N |
| CRAN | S | S | S | S | N | N | S | S | S | S | N |
| Libraries.io | S | S | S | N | N | S | S | S | S | S | N |
| pkg.go.dev | S | T | S | S | S | S | S | S | S | S | N |

Matrix notes:

- `Details` means the overall details experience including page/header/sidebar/readme-style content. A `T` here usually means the details page exists but one or more important tabs or content sources are still incomplete.
- `Installed / Updates` means workspace manifest parsing plus update detection for the source's project files.
- `Install / Copy` means at least one of install action, install command, or copy snippet flow is available for the source's project type.
- `Workspace Tools` means npm-style workspace graph, version alignment, or dependency analyzer. These are currently not first-class for non-npm ecosystems.

## Sonatype

### Supported

- Search
- Suggestions
- Filters: `groupId`, `artifactId`, `tags`
- Sorts: `relevance`, `timestamp desc`, `name`
- Package info and details
- Header and sidebar
- Versions tab
- Dependencies tab
- Requirements tab
- Dependents tab
- Security tab
- Copy snippet flow for `Maven`, `Gradle`, `SBT`, `Mill`, `Ivy`, `Grape`, `Leiningen`, and `Buildr`
- Update action for `pom.xml`
- Update action for `build.gradle` and `build.gradle.kts`
- InstalledPackages for `pom.xml`
- InstalledPackages for `build.gradle` and `build.gradle.kts`
- AvailableUpdates for `pom.xml`
- AvailableUpdates for `build.gradle` and `build.gradle.kts`
- Manifest watch for `pom.xml`
- Manifest watch for `build.gradle` and `build.gradle.kts`
- Multi-manifest scan for `pom.xml`
- Multi-manifest scan for `build.gradle` and `build.gradle.kts`
- Project detection for Gradle-only workspaces
- Search/source selection for Gradle-only workspaces
- Hover for `pom.xml`
- Hover for Gradle files
- CodeLens for `pom.xml`
- CodeLens for `build.gradle` and `build.gradle.kts`
- Update CodeLens for `pom.xml`
- Update CodeLens for `build.gradle` and `build.gradle.kts`
- Security CodeLens for `pom.xml`
- Security CodeLens for `build.gradle` and `build.gradle.kts`
- Batch update CodeLens for `pom.xml`
- Batch update CodeLens for `build.gradle` and `build.gradle.kts`

### Not Supported

- Install command / install action
- Download stats
- Remove command / remove action
- Bundle size
- Quality score
- Install target selection
- Workspace graph
- Version alignment
- Dependency analyzer
- Security audit command

### TBD

- Readme tab: current details payload does not set `readme`, and the codebase has no confirmed Sonatype README source

## NuGet

### Supported

- Search
- Suggestions
- Filters: `author`, `tags`, `packageType`
- Sorts: `relevance`, `popularity`, `name`
- Package info and details
- Readme tab
- Download stats
- Security info
- Versions tab
- Dependencies tab
- Requirements tab
- Dependents tab
- Security tab
- Frameworks tab
- Header and sidebar
- Copy snippet flow
- InstalledPackages for `Directory.Packages.props`, `paket.dependencies`, `packages.config`, PackageReference project files, and `*.cake`
- AvailableUpdates for `Directory.Packages.props`, `paket.dependencies`, `packages.config`, PackageReference project files, and `*.cake`
- CodeLens for `Directory.Packages.props`, `packages.config`, `paket.dependencies`, PackageReference project files, and `*.cake`
- Hover for `Directory.Packages.props`
- Hover for `packages.config`
- Hover for `*.csproj`, `*.vbproj`, `*.fsproj`
- Hover for `paket.dependencies`
- Hover for `*.cake`
- Manifest watch for `packages.config` and project files
- Remove action for `Directory.Packages.props`, `paket.dependencies`, `packages.config`, PackageReference project files, and `*.cake` via command when supported, otherwise manifest edit

### Not Supported

- Install action in the current source UX model
- Workspace graph
- Version alignment
- Dependency analyzer
- Security audit command

## Packagist

### Supported

- Search
- Suggestions
- Filters: `tags`, `type`
- Sorts: `relevance`, `popularity`, `name`
- Package info and details
- Download stats
- Security info
- Header
- Sidebar
- Readme tab
- Versions tab
- Dependencies tab
- Requirements tab
- Dependents tab
- Security tab
- Install command / install action
- Update command / update action
- Remove command / remove action
- Dependency type selection: runtime and dev
- Install target selection
- InstalledPackages for `composer.json`
- AvailableUpdates for `composer.json`
- `composer.lock`-aware installed version resolution for `composer.json`
- Manifest watch for `composer.json` and `composer.lock`
- Hover for `composer.json`
- Hover sections: `require`, `require-dev`, `suggest`, `provide`, `replace`, `conflict`
- Hover for `composer.lock`
- CodeLens for `composer.json`
- CodeLens sections: `require`, `require-dev`
- CodeLens for `composer.lock`
- Update CodeLens for Composer dependencies
- Security CodeLens for Composer dependencies
- Batch update CodeLens for Composer sections
- Batch update CodeLens for `composer.lock`

### Not Supported

- Quality score
- Bundle size
- Workspace graph
- Version alignment
- Dependency analyzer
- Security audit command

## RubyGems

### Supported

- Search
- Suggestions
- Sorts: `relevance`, `popularity`, `name`
- Package info and details
- Download stats
- Security info
- Header
- Sidebar
- Versions tab
- Dependencies tab
- Requirements tab
- Dependents tab
- Security tab
- Install command / install action
- Update command / update action
- Remove command / remove action
- Dependency type selection: runtime and dev
- Install target selection
- InstalledPackages for `Gemfile`
- AvailableUpdates for `Gemfile`
- `Gemfile.lock`-aware installed version resolution for `Gemfile`
- Manifest watch for `Gemfile` and `Gemfile.lock`
- Hover for `Gemfile`
- Hover for `Gemfile.lock`
- CodeLens for `Gemfile`
- CodeLens for `Gemfile.lock`
- Update CodeLens for `Gemfile`
- Update CodeLens for `Gemfile.lock`
- Security CodeLens for `Gemfile`
- Security CodeLens for `Gemfile.lock`
- Batch update CodeLens for `Gemfile`
- Batch update CodeLens for `Gemfile.lock`

### Not Supported

- Filters
- Quality score
- Bundle size
- Workspace graph
- Version alignment
- Dependency analyzer
- Security audit command

### TBD

- Real readme tab: current RubyGems API integration exposes summary/description fields, but no confirmed readme document source is wired

## Clojars

### Supported

- Search
- Suggestions
- Sorts: `relevance`, `popularity`, `name`
- Package info and details
- Download stats
- Security info
- Header
- Sidebar
- Versions tab
- Dependencies tab
- Requirements tab
- Security tab
- Direct install action for `deps.edn` targets when `neil` is available
- Install command generation for `deps.edn` via `neil add`
- Copy snippet flow for Clojure manifests
- Copy snippet formats: `deps.edn`, `Leiningen`
- Install target selection
- InstalledPackages for `deps.edn`
- InstalledPackages for `project.clj`
- AvailableUpdates for `deps.edn`
- AvailableUpdates for `project.clj`
- Manifest watch for `deps.edn` and `project.clj`
- Hover for `deps.edn`
- Hover for `project.clj`
- CodeLens for `deps.edn`
- CodeLens for `project.clj`
- Update CodeLens for `deps.edn`
- Update CodeLens for `project.clj`
- Security CodeLens for `deps.edn`
- Security CodeLens for `project.clj`
- Update commands for `deps.edn` and `project.clj`
- Batch update CodeLens for `deps.edn`
- Batch update CodeLens for `project.clj`

### Not Supported

- Filters
- Remove command / remove action
- Dependents tab / dependents data source
- Dependency type selection in install command generation
- Bundle size
- Workspace graph
- Version alignment
- Dependency analyzer
- Security audit command

### TBD

- Real readme tab: current Clojars integration only uses description-like text, and no confirmed long-form documentation source is wired
- Whether a reliable dependents data source exists for Clojars artifacts within the current architecture
- Whether Clojars package details should distinguish runtime-only dependency data more explicitly

## crates.io

### Supported

- Search
- Suggestions
- Sorts: `relevance`, `popularity`, `name`
- Package info and details
- Download stats
- Security info
- Header
- Sidebar
- Versions tab
- Dependencies tab
- Requirements tab
- Dependents tab
- Security tab
- Install command / install action
- Update command / update action
- Remove command / remove action
- Dependency type selection: runtime, dev, optional
- Install target selection
- InstalledPackages for `Cargo.toml`
- AvailableUpdates for `Cargo.toml`
- `Cargo.lock`-aware installed version resolution for `Cargo.toml`
- Manifest watch for `Cargo.toml` and `Cargo.lock`
- Hover for `Cargo.toml`
- Hover for `Cargo.lock`
- CodeLens for `Cargo.toml`
- CodeLens for `Cargo.lock`
- Update CodeLens for `Cargo.toml`
- Update CodeLens for `Cargo.lock`
- Security CodeLens for `Cargo.toml`
- Security CodeLens for `Cargo.lock`
- Update command for `Cargo.toml`
- Batch update CodeLens for `Cargo.toml`
- Batch update CodeLens for `Cargo.lock`

### Not Supported

- Filters
- Quality score
- Bundle size
- Workspace graph
- Version alignment
- Dependency analyzer
- Security audit command

### TBD

- Real readme tab: current crates.io integration only uses crate description, and no confirmed README document source is wired

## MetaCPAN

### Supported

- Search
- Suggestions
- Sorts: `relevance`, `name`
- Package info and details
- Download stats
- Header
- Sidebar
- Readme tab
- Versions tab
- Dependencies tab
- Requirements tab
- Install command / install action
- Update command / update action
- Install target selection
- InstalledPackages for `cpanfile`
- AvailableUpdates for `cpanfile`
- `cpanfile.snapshot`-aware installed version resolution for `cpanfile`
- Manifest watch for `cpanfile` and `cpanfile.snapshot`
- Hover for `cpanfile`
- Hover for `cpanfile.snapshot`
- CodeLens for `cpanfile`
- CodeLens for `cpanfile.snapshot`
- Update CodeLens for `cpanfile`
- Update CodeLens for `cpanfile.snapshot`
- Batch update CodeLens for `cpanfile`
- Batch update CodeLens for `cpanfile.snapshot`
- Remove action for `cpanfile`

### Not Supported

- Filters
- Dependents tab / dependents data source
- Security tab / security integration
- Security CodeLens
- Dependency type selection in install command generation
- Quality score
- Bundle size
- Workspace graph
- Version alignment
- Dependency analyzer
- Security audit command

## pub.dev

### Supported

- Search
- Suggestions
- Sorts: `relevance`, `popularity`, `quality`, `name`
- Package info and details
- Download stats
- Quality score
- Security info
- Header and sidebar
- Versions tab
- Dependencies tab
- Requirements tab
- Security tab
- Install command / install action
- Update command / update action
- Remove command / remove action
- Dependency type selection: runtime and dev
- Install target selection
- InstalledPackages for `pubspec.yaml`
- AvailableUpdates for `pubspec.yaml`
- `pubspec.lock`-backed installed version resolution for `pubspec.yaml`
- Manifest watch for `pubspec.yaml` and `pubspec.lock`
- Hover for `pubspec.yaml`
- Hover for `pubspec.lock`
- CodeLens for `pubspec.yaml`
- CodeLens for `pubspec.lock`
- Update CodeLens for `pubspec.yaml`
- Update CodeLens for `pubspec.lock`
- Security CodeLens for `pubspec.yaml`
- Security CodeLens for `pubspec.lock`
- CodeLens coverage for multi-line dependency blocks in `pubspec.yaml`
- Batch update CodeLens for `pubspec.yaml`
- Batch update CodeLens for `pubspec.lock`

### Not Supported

- Dependents tab
- Filters
- Bundle size
- Workspace graph
- Version alignment
- Dependency analyzer
- Security audit command

### TBD

- Real readme tab: current pub.dev integration only uses package description, and no confirmed readme document source is wired

## CRAN

### Supported

- Search
- Suggestions
- Sorts: `relevance`, `popularity`, `name`
- Package info and details
- Download stats
- Header
- Sidebar
- Readme tab
- Versions tab
- Dependencies tab
- Requirements tab
- Install command / install action
- Copy snippet flow
- Remove action for `DESCRIPTION`
- Update command / update action for `DESCRIPTION`
- InstalledPackages for `DESCRIPTION`
- AvailableUpdates for `DESCRIPTION`
- Manifest watch for `DESCRIPTION`
- Manifest watch for `*.Rproj`
- Hover for `DESCRIPTION`
- CodeLens for `DESCRIPTION`
- CodeLens for `*.Rproj` via companion `DESCRIPTION`
- Update CodeLens for `DESCRIPTION`
- Update CodeLens for `*.Rproj` via companion `DESCRIPTION`
- Batch update CodeLens for `DESCRIPTION`
- Batch update CodeLens for `*.Rproj` via companion `DESCRIPTION`

### Not Supported

- Dependents tab / dependents data source
- Security tab / security integration
- Security CodeLens
- Hover for `*.Rproj`
- Filters
- Quality score
- Bundle size
- Workspace graph
- Version alignment
- Dependency analyzer
- Security audit command

## Libraries.io

### Supported

- Search
- Suggestions
- Filters: `languages`, `licenses`, `keywords`, `platforms`
- Sorts: `relevance`, `latest_release_published_at`, `rank`, `stars`
- Package info and details
- Readme tab backed by package description
- Header and sidebar
- Versions tab
- Dependencies tab
- Security tab when OSV client is available
- Hover for `package.json` when Libraries.io is the selected npm source
- Hover for `pom.xml`
- Hover for `build.gradle` and `build.gradle.kts`
- CodeLens for `package.json` when Libraries.io is the selected npm source
- CodeLens for `pom.xml`
- CodeLens for `build.gradle` and `build.gradle.kts`
- Update CodeLens for `package.json`, `pom.xml`, `build.gradle`, and `build.gradle.kts`
- Security CodeLens for `package.json`, `pom.xml`, `build.gradle`, and `build.gradle.kts`
- Batch update CodeLens for `package.json`
- Batch update CodeLens for `pom.xml`
- Batch update CodeLens for `build.gradle` and `build.gradle.kts`
- InstalledPackages when used as the active source for existing npm or Maven manifests
- AvailableUpdates when used as the active source for existing npm or Maven manifests
- Manifest watch through the existing npm / Maven workspace manifest pipeline
- Copy snippet flow for direct npm usage and Maven-style usage
- Security info when OSV client is available
- Configured as a fallback source for all project types through source configuration

### Not Supported

- Install command / install action
- Download stats
- Dependents tab
- Requirements tab
- Bundle size
- Quality score
- Workspace graph
- Version alignment
- Dependency analyzer
- Security audit command

## pkg.go.dev

### Supported

- Source adapter implementation
- Source registration in the service container
- Search
- Suggestions
- Sorts: `relevance`, `popularity`, `name`
- Package info and details
- Header and sidebar
- Versions tab
- Dependencies tab
- Requirements tab
- Dependents tab
- Security tab
- Install command / install action
- Update command / update action
- Remove command / remove action
- Install target selection
- InstalledPackages for `go.mod`
- AvailableUpdates for `go.mod`
- Manifest watch for `go.mod`
- Project detection for `go.mod`
- Hover for `go.mod`
- CodeLens for `go.mod`
- Update CodeLens for `go.mod`
- Security CodeLens for `go.mod`
- Batch update CodeLens for `go.mod`
- Security integration
- Dependents integration
- Requirements integration

### Not Supported

- Filters
- Copy snippet flow
- Download stats
- Quality score
- Bundle size
- Workspace graph
- Version alignment
- Dependency analyzer
- Security audit command

### TBD

- Readme tab: current details payload uses description-like content, not a confirmed full README source

## Cross-Source Follow-ups

- Normalize the meaning of `ReadmeTab` across sources. Several sources currently feed description-like text instead of a true readme document.
- Normalize `Header` download labels by source and ensure each source uses explicit semantics such as `total`, `monthly`, or `weekly`.
- Decide whether lockfiles should receive first-class hover and CodeLens support across ecosystems, or remain secondary to manifest files.
- Decide whether non-npm ecosystems should get a workspace graph and dependency analyzer, or if those remain npm-only features.
