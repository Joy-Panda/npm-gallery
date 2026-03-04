# NPM Gallery - Documentation Overview

> A VS Code extension for browsing, searching, and managing packages across multiple ecosystems directly from the editor.

## Overview

NPM Gallery is no longer limited to npm package browsing. The extension now provides a unified package workflow across multiple sources and project types, including:

- npm / pnpm / yarn / bun
- Maven / Gradle
- NuGet
- Composer / Packagist
- RubyGems
- Cargo
- Dart / Flutter
- CRAN
- Clojars
- MetaCPAN
- Go modules

Core goals:

- search packages without leaving VS Code
- inspect package details, versions, requirements, dependents, and security data
- manage installed dependencies from workspace manifests
- surface package information inline through hover and CodeLens
- keep source-specific behavior explicit instead of forcing one single-ecosystem model onto every ecosystem

## Core Capabilities

- **Source-aware Search**
  Search through the currently selected source with source-specific filters and sort options.

- **Package Details**
  Open rich package details with header, sidebar, README, versions, dependencies, requirements, dependents, and security tabs where supported.

- **Workspace Package Management**
  View installed packages and available updates across supported manifests in the current workspace.

- **Inline Editor Assistance**
  Use hover and CodeLens in supported manifests to inspect versions, vulnerabilities, and available updates.

- **Install / Copy / Update / Remove**
  Execute direct package-manager commands where supported, or generate source-appropriate dependency snippets when command execution is not the right UX.

- **Multi-Source Architecture**
  Route operations through `SourceSelector` and source adapters instead of hardcoding a single registry workflow.

## Main User Flows

### Search and Inspect

1. Open the NPM Gallery sidebar
2. Choose the current project type and source
3. Search for a package
4. Open package details from the result list

### Manage Workspace Dependencies

1. Open `Installed Packages` or `Available Updates`
2. Navigate by workspace or manifest group
3. Open package details, update, or remove packages

### Work Inline in a Manifest

1. Open a supported manifest such as `package.json`, `composer.json`, `Cargo.toml`, `pom.xml`, or `pubspec.yaml`
2. Use hover for package metadata
3. Use CodeLens for update and security actions where supported

## Primary Documentation

| Document | Description |
|----------|-------------|
| [PRD.md](./PRD.md) | Product goals and high-level requirements |
| [FEATURES.md](./FEATURES.md) | Feature-level behavior and UX expectations |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Current technical architecture and service/provider structure |
| [API.md](./API.md) | Source and external API integration notes |
| [UI-UX.md](./UI-UX.md) | UI and UX guidance |
| [DEVELOPMENT.md](./DEVELOPMENT.md) | Local development workflow |
| [SOURCE_CAPABILITIES.md](./SOURCE_CAPABILITIES.md) | Shared capability model and tooling matrix |
| [SOURCE_CAPABILITIES_TODO.md](./SOURCE_CAPABILITIES_TODO.md) | Source-by-source support gaps and status |
| [OPTIMIZATION_REVIEW.md](./OPTIMIZATION_REVIEW.md) | Optimization findings, refactor notes, and validation checklist |

## Configuration Themes

Important settings include:

- `npmGallery.defaultRegistry`
- `npmGallery.packageManager`
- `npmGallery.userAgentContact`
- `npmGallery.showBundleSize`
- `npmGallery.showSecurityInfo`
- `npmGallery.autoCheckUpdates`
- `npmGallery.licenseWhitelist`

Refer to [../README.md](../README.md) and [FEATURES.md](./FEATURES.md) for current user-facing configuration details.

## Architectural Notes

Current implementation is organized around:

- `ServiceContainer` for service and source wiring
- `SourceSelector` + source adapters for ecosystem-aware behavior
- `WorkspaceService` for manifest discovery, installed packages, updates, and manifest edits
- `PackageService` / `PackageQueryService` for source-facing package queries
- `SearchViewProvider`, `PackageDetailsPanel`, tree providers, hover router, and CodeLens router for VS Code integration

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the current structure.

## Validation and Maintenance

Recent refactors introduced:

- manifest-centric refresh behavior
- per-ecosystem hover and CodeLens handlers
- source-context unification
- route-table based provider wiring

Use [OPTIMIZATION_REVIEW.md](./OPTIMIZATION_REVIEW.md) for:

- regression checklist
- manual validation run sheet
- optimization history and status

## Contributing

For development setup, commands, and contribution workflow, use [DEVELOPMENT.md](./DEVELOPMENT.md).
