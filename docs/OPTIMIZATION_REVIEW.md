# Optimization Review

This document records concrete optimization opportunities found during a code and UX review of the extension. Items are based on current implementation details and should be treated as actionable review findings, not general ideas.

## Findings

### 1. Sonatype build tool detection is workspace-root-only

- Severity: High
- Area: Install flow, copy snippet UX, source hint accuracy
- Files:
  - [install-service.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/services/install-service.ts#L327)
  - [install-service.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/services/install-service.ts#L437)
  - [webview-provider.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/providers/webview-provider.ts#L278)
  - [package-details-panel.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/providers/package-details-panel.ts#L390)

`detectBuildTool()` only checks build files under `workspaceFolders[0]`. In multi-module or nested workspaces, the detected build tool can differ from the active file or selected install target. That wrong result is then reused by the UI source hint and copy snippet generation.

Recommended optimization:

- Make build tool detection path-aware, using the active file or resolved install target first.
- Cache detection per workspace scope or manifest path, not globally per root.
- Use the same scoped result for both UI hinting and copy generation.

### 2. HTTP User-Agent behavior is inconsistent across client types

- Severity: Medium-High
- Area: API infrastructure, operability
- Files:
  - [base-client.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/api/base-client.ts#L4)
  - [base-client.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/api/base-client.ts#L72)
  - [clients.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/api/clients.ts#L38)

The request helpers now support a configurable contact string, but `axios` clients freeze headers at client construction time while `fetch` requests read the config per call. Because API clients are singletons, updating `npmGallery.userAgentContact` during a session does not update all requests consistently. The base UA version is also hardcoded and can drift from the extension version.

Recommended optimization:

- Move UA header injection to a request interceptor or per-request helper for all `axios` clients.
- Derive the extension version from runtime/package metadata instead of a string literal.
- Add one shared request-header strategy for both `axios` and `fetch`.

Status:

- Completed for shared request header injection.
- `axios` clients now attach `User-Agent` at request time through a shared interceptor, and `fetch` continues to use the same dynamic header builder.
- The base UA version is now derived from runtime extension metadata instead of a hardcoded string.

### 3. Workspace refresh pipeline lacks debounce and parallel discovery

- Severity: Medium
- Area: Performance, scalability
- Files:
  - [workspace-service.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/services/workspace-service.ts#L37)
  - [workspace-service.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/services/workspace-service.ts#L528)
  - [workspace-service.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/services/workspace-service.ts#L557)
  - [extension.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/extension.ts#L430)

Every watched manifest change triggers an immediate refresh path. For full refreshes, manifest discovery across ecosystems is done as a long sequence of awaits. During lockfile writes, branch changes, or batch updates, the extension can end up doing repeated expensive scans and tree refreshes.

Recommended optimization:

- Debounce watcher-driven refresh events.
- Coalesce repeated scope refreshes within a short window.
- Run manifest discovery in parallel with `Promise.all`.
- Separate lightweight metadata refresh from full installed-package reparse.

Status:

- Partially completed.
- Watcher-driven package change events are now debounced and de-duplicated in [workspace-service.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/services/workspace-service.ts#L22).
- Extension-level refresh handling now batches scopes within a short window and processes them serially in [extension.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/extension.ts#L429).
- Lockfile-triggered refresh scopes are already normalized back to their owning manifest in [workspace-service.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/services/workspace-service.ts#L2311), so refresh remains manifest-centric even when `*.lock` files change.
- Main installed-package manifest discovery now runs in parallel in [workspace-service.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/services/workspace-service.ts#L574).
- Some secondary discovery paths still remain a follow-up optimization.

### 4. Package details loading state is time-based instead of response-based

- Severity: Medium
- Area: UX interaction quality
- Files:
  - [PackageDetailsView.tsx](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/webview/components/PackageDetailsView.tsx#L171)
  - [PackageDetailsView.tsx](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/webview/components/PackageDetailsView.tsx#L203)

Install and copy actions set `installing = true`, then clear it with a fixed 2-second timeout. Slow operations can appear finished early, and quick failures can appear artificially delayed. This also allows duplicate actions while the real request may still be running.

Recommended optimization:

- Tie loading state strictly to extension responses such as `installSuccess`, `installError`, `copySuccess`, and `copyError`.
- Track install and copy states independently if they can overlap.
- Disable duplicate actions until the matching request completes.

Status:

- Completed for package details install/copy actions.
- [PackageDetailsView.tsx](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/webview/components/PackageDetailsView.tsx#L171) now keeps loading active until the matching response message arrives instead of clearing it on a fixed timeout.

### 5. Source info composition is duplicated across providers

- Severity: Low-Medium
- Area: Architecture, maintainability
- Files:
  - [webview-provider.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/providers/webview-provider.ts#L224)
  - [package-details-panel.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/providers/package-details-panel.ts#L339)

`sendSourceInfo()` is implemented twice with mostly the same logic. The two payloads are already slightly different, which increases the risk of silent drift when new source-specific capabilities or labels are added.

Recommended optimization:

- Extract source info building into a shared service or helper.
- Have both providers call the same function and only differ in transport.
- Define one typed payload contract and keep optional fields explicit.

### 6. Search state persistence stores full result sets

- Severity: Low
- Area: Webview performance, state management
- Files:
  - [VSCodeContext.tsx](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/webview/context/VSCodeContext.tsx#L248)
  - [App.tsx](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/webview/App.tsx#L98)

The webview persists not only query, filters, and sort state, but also the full `searchResults` payload. That increases serialization and state size, especially when the result list grows or carries richer package metadata.

Recommended optimization:

- Persist only the user inputs and lightweight UI state.
- Re-run the last search on restore, or keep a bounded in-memory cache keyed by query/source.
- Avoid duplicate persistence on both debounce and hide if the state did not change.

Status:

- Completed for sidebar state persistence scope.
- Persisted webview state now keeps lightweight inputs such as query, filters, and sort order only.
- Search results are no longer stored in persisted state; normal hide/show reuse is handled by `retainContextWhenHidden`.

## Structural Hotspots

The following files are not necessarily incorrect, but their size now makes further changes slower and riskier:

- [workspace-service.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/services/workspace-service.ts)
- [package-service.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/services/package-service.ts)
- [hover-provider.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/providers/hover-provider.ts)
- [codelens-provider.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/providers/codelens-provider.ts)

Current line counts during review:

- `workspace-service.ts`: 1443
- `package-service.ts`: 1554
- `hover-provider.ts`: 1287
- `codelens-provider.ts`: 2559

Recommended optimization:

- Split per-ecosystem parsing into dedicated modules.
- Separate manifest parsing, workspace discovery, update editing, and view-model building.
- Move source-specific UI enrichment out of large generic providers where possible.

Progress:

- Workspace manifest discovery and scope resolution have started to move out of [workspace-service.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/services/workspace-service.ts) into:
  - [manifest-discovery.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/services/workspace/manifest-discovery.ts)
  - [scope-resolver.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/services/workspace/scope-resolver.ts)
- Parser extraction has also started, with ecosystem-specific parsing now split into:
  - [java-parsers.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/services/workspace/parsers/java-parsers.ts)
  - [dotnet-parsers.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/services/workspace/parsers/dotnet-parsers.ts)
  - [composer-parser.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/services/workspace/parsers/composer-parser.ts)
  - [ruby-parser.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/services/workspace/parsers/ruby-parser.ts)
  - [clojure-parser.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/services/workspace/parsers/clojure-parser.ts)
  - [cargo-go-parsers.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/services/workspace/parsers/cargo-go-parsers.ts)
  - [perl-pub-parsers.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/services/workspace/parsers/perl-pub-parsers.ts)
  - [r-parser.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/services/workspace/parsers/r-parser.ts)
  - [shared.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/services/workspace/parsers/shared.ts)
- Manifest text editing and rewrite logic has now also started to move into:
  - [manifest-editors.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/services/workspace/editors/manifest-editors.ts)
- npm/monorepo graph and package.json mutation helpers have also started to move into:
  - [npm-workspace.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/services/workspace/npm-workspace.ts)
- `CodeLensProvider` extraction has also started with:
  - [common.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/providers/codelens/common.ts)
  - [npm-codelens.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/providers/codelens/npm-codelens.ts)
  - [composer-codelens.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/providers/codelens/composer-codelens.ts)
  - [ruby-codelens.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/providers/codelens/ruby-codelens.ts)
  - [pub-codelens.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/providers/codelens/pub-codelens.ts)
  - [r-codelens.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/providers/codelens/r-codelens.ts)
  - [clojure-codelens.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/providers/codelens/clojure-codelens.ts)
  - [metacpan-codelens.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/providers/codelens/metacpan-codelens.ts)
  - [cargo-codelens.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/providers/codelens/cargo-codelens.ts)
  - [go-codelens.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/providers/codelens/go-codelens.ts)
  - [sonatype-codelens.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/providers/codelens/sonatype-codelens.ts)
  - [nuget-codelens.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/providers/codelens/nuget-codelens.ts)
- [codelens-provider.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/providers/codelens-provider.ts) now uses a route table instead of a long file-name `if` chain, so manifest-to-handler wiring is centralized as data rather than imperative branching.
- This is the fourth phase of breaking `WorkspaceService` into orchestrator, discovery, parsers, editors, and npm workspace helpers. The next step is to continue splitting the remaining `codelens-provider.ts` ecosystems or move on to `hover-provider.ts`.
- `codelens-provider.ts` now primarily acts as a cache, router, and refresh surface. The next structural step is to apply the same extraction pattern to `hover-provider.ts`.
- `hover-provider.ts` extraction has also started with:
  - [common.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/providers/hover/common.ts)
  - [npm-hover.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/providers/hover/npm-hover.ts)
  - [composer-hover.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/providers/hover/composer-hover.ts)
  - [ruby-hover.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/providers/hover/ruby-hover.ts)
  - [pub-hover.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/providers/hover/pub-hover.ts)
  - [r-hover.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/providers/hover/r-hover.ts)
  - [clojure-hover.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/providers/hover/clojure-hover.ts)
  - [cargo-hover.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/providers/hover/cargo-hover.ts)
  - [go-hover.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/providers/hover/go-hover.ts)
  - [metacpan-hover.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/providers/hover/metacpan-hover.ts)
  - [nuget-hover.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/providers/hover/nuget-hover.ts)
  - [sonatype-hover.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/providers/hover/sonatype-hover.ts)
- The current phase moves `hover-provider.ts` toward routing plus remaining ecosystems, with shared markdown rendering already extracted into `hover/common.ts`.
- `hover-provider.ts` now primarily acts as a manifest router. The ecosystem-specific extraction and hover rendering paths have been split into dedicated modules under `src/providers/hover/`.
- [hover-provider.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/providers/hover-provider.ts) now also uses a route table instead of a long file-name `if` chain, so manifest-to-handler wiring is centralized like the CodeLens router.
- `package-service.ts` has also started to shed npm-local execution and dependency-analyzer responsibilities into:
  - [npm-local-service.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/services/package/npm-local-service.ts)
  - [package-query-service.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/services/package/package-query-service.ts)
- `package-service.ts` now mainly acts as the source/capability orchestrator, while npm local tree loading, lockfile-based manager detection, dependency analyzer traversal, and source-facing query/capability handling live in dedicated helpers.
- Source context composition has also been centralized into:
  - [source-context-service.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/services/source-context-service.ts)
- `source-info.ts` now delegates install-target resolution, capability adjustment, Sonatype build-tool labeling, and NuGet style detection to a dedicated service instead of rebuilding that state ad hoc in the provider layer.
- The source-context layer has now also started to split source-specific adjustments into dedicated strategy modules:
  - [clojure-context.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/services/source-context/clojure-context.ts)
  - [nuget-context.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/services/source-context/nuget-context.ts)
  - [sonatype-context.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/services/source-context/sonatype-context.ts)

## Suggested Priority

1. Fix Sonatype build tool detection so UI hinting and copy output are scope-correct.
2. Replace timeout-based install/copy loading with response-driven state.
3. Add debounce and coalescing to workspace refresh flow.
4. Unify source info composition into one shared helper.
5. Normalize User-Agent injection and version sourcing.
6. Trim persisted search state to lightweight inputs only.

## Lockfile Rule

Current rule after cleanup:

- Manifest files remain the primary surface for update CodeLens and update actions.
- Lockfiles and snapshot files remain available for hover and installed-version context where useful.
- Lockfile-triggered refresh events are normalized back to the owning manifest scope instead of being treated as independent update surfaces.

Examples:

- `composer.lock` refreshes the owning `composer.json` project context.
- `Gemfile.lock` refreshes the owning `Gemfile` project context.
- `Cargo.lock` refreshes the owning `Cargo.toml` project context.
- `pubspec.lock` refreshes the owning `pubspec.yaml` project context.
- `cpanfile.snapshot` refreshes the owning `cpanfile` project context.

## Search Cache

Current behavior:

- Search API results are cached in [search-service.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/services/search-service.ts) for 5 minutes.
- The cache is shared across all sources through the common search service layer.
- Cache keys now use a stable structured representation of source, query, exact name, paging, sorting, and structured filters when present.

This keeps caching behavior source-agnostic while avoiding avoidable misses caused by ad hoc string concatenation.

## Refactor Regression Checklist

Use this checklist after the current architecture refactor series. It focuses on the surfaces most likely to regress after router extraction, service splitting, and manifest-centric refresh changes.

### Current Pass Status

Code-level validation completed in this pass:

- `Hover` now routes through a centralized route table in [hover-provider.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/providers/hover-provider.ts), and lockfile hover registrations are still intentionally present in [extension.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/extension.ts).
- `CodeLens` now routes through a centralized route table in [codelens-provider.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/providers/codelens-provider.ts), and lockfiles are no longer registered as CodeLens surfaces in [extension.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/extension.ts).
- Lockfile-to-manifest refresh normalization is still active in [scope-resolver.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/services/workspace/scope-resolver.ts).
- Search sidebar retention still depends on `retainContextWhenHidden` in [extension.ts](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/extension.ts), while persisted webview state only keeps lightweight query/filter/sort inputs in [VSCodeContext.tsx](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/webview/context/VSCodeContext.tsx).
- Source switching still preserves the intersection of supported filters instead of clearing all search state in [App.tsx](/mnt/c/develop/workspace/vscode-plugin/npm-gallery/src/webview/App.tsx).

Still requires real IDE click-through validation:

- actual hover rendering in each manifest
- actual CodeLens rendering and command execution
- Installed Packages / Available Updates refresh behavior under live file edits
- sidebar hide/show behavior under a real VS Code view lifecycle
- source hint consistency between search view and details panel

### Manual Validation Run Sheet

Use this section as the execution sheet for real VS Code click-through validation.

Validation environment:

- VS Code version: `__________`
- Extension build/commit: `__________`
- Workspace used: `__________`
- Result summary: `PASS / FAIL / PARTIAL`

#### A. Sidebar Lifecycle

1. Open the search sidebar without typing any query.
2. Collapse the sidebar by clicking another activity-bar icon.
3. Reopen the extension sidebar.
4. Expected:
   - recommended keywords do not reset
   - sidebar does not show a fresh loading/init state
5. Result: `__________`
6. Notes: `__________`

#### B. Search Result Retention

1. Run a search that returns visible results.
2. Collapse the sidebar and reopen it.
3. Expected:
   - query text is preserved
   - result list is preserved
   - current sort/filter UI state is preserved
4. Result: `__________`
5. Notes: `__________`

#### C. Source Switching

1. Search using a source that supports multiple filters.
2. Apply both a shared filter and a source-specific filter.
3. Switch to another source that supports only the shared filter.
4. Expected:
   - base query stays
   - shared filter stays
   - unsupported filter is removed
   - sort only resets if unsupported by the new source
5. Result: `__________`
6. Notes: `__________`

#### D. Hover Routing

Open one dependency in each of these files and confirm hover renders the correct ecosystem metadata:

- `package.json`
- `composer.json`
- `Gemfile`
- `cpanfile`
- `pubspec.yaml`
- `DESCRIPTION`
- `Directory.Packages.props`
- `packages.config`
- `deps.edn`
- `project.clj`
- `Cargo.toml`
- `go.mod`
- `pom.xml`
- `build.gradle`

Expected:

- hover appears on supported dependency entries
- no cross-ecosystem hover content appears
- unsupported files stay quiet

Result: `__________`
Notes: `__________`

#### E. Lockfile Hover

Check hover on:

- `composer.lock`
- `Gemfile.lock`
- `cpanfile.snapshot`
- `pubspec.lock`
- `Cargo.lock`

Expected:

- hover still works where intentionally preserved
- no update CodeLens is shown on these files

Result: `__________`
Notes: `__________`

#### F. CodeLens Rendering

Open each primary manifest and confirm update/security/batch CodeLens visibility:

- `package.json`
- `composer.json`
- `Gemfile`
- `cpanfile`
- `pubspec.yaml`
- `DESCRIPTION`
- `*.Rproj`
- `deps.edn`
- `project.clj`
- `Cargo.toml`
- `go.mod`
- `pom.xml`
- `build.gradle`
- `Directory.Packages.props`
- `packages.config`
- `*.csproj`
- `paket.dependencies`
- `*.cake`

Expected:

- manifest files show the intended CodeLens
- lockfiles do not show update CodeLens

Result: `__________`
Notes: `__________`

#### G. CodeLens Command Execution

Run one update path per ecosystem that has CodeLens support.

Expected:

- command executes without wrong-manifest routing
- file refreshes correctly after update
- Installed Packages / Available Updates refresh accordingly

Result: `__________`
Notes: `__________`

#### H. Installed / Updates Refresh

1. Change a manifest and its lockfile in short succession.
2. Observe Installed Packages and Available Updates.
3. Expected:
   - one logical refresh
   - no obvious duplicate flicker
   - updated package rows settle to the correct versions
4. Result: `__________`
5. Notes: `__________`

#### I. Source Context Consistency

For the same package/context, compare search view and details view.

Expected:

- same install target label
- same package manager or build tool hint
- same NuGet style when applicable
- same Sonatype copy format when applicable
- same capability support messaging

Result: `__________`
Notes: `__________`

### 1. Hover Routing

- Open each primary manifest and confirm hover still resolves through the new route table:
  - `package.json`
  - `composer.json`
  - `Gemfile`
  - `cpanfile`
  - `pubspec.yaml`
  - `DESCRIPTION`
  - `Directory.Packages.props`
  - `packages.config`
  - `deps.edn`
  - `project.clj`
  - `Cargo.toml`
  - `go.mod`
  - `pom.xml`
  - `build.gradle`
- Confirm lockfile-only hover still works where intentionally preserved:
  - `composer.lock`
  - `Gemfile.lock`
  - `cpanfile.snapshot`
  - `pubspec.lock`
  - `Cargo.lock`
- Confirm unsupported files return no hover instead of a wrong ecosystem hover.

### 2. CodeLens Routing

- Open each primary manifest and confirm update/security CodeLens still resolves through the new route table.
- Confirm batch-update CodeLens still appears only on intended manifest surfaces.
- Confirm lockfiles no longer expose update CodeLens after the manifest-centric cleanup.
- Confirm refresh after updates still invalidates the correct file scope and re-renders CodeLens.

### 3. Workspace Refresh and Scope Mapping

- Change both a manifest and its lockfile in quick succession and confirm only one logical project refresh occurs.
- Validate manifest-centric scope mapping for:
  - `composer.lock -> composer.json`
  - `Gemfile.lock -> Gemfile`
  - `Cargo.lock -> Cargo.toml`
  - `pubspec.lock -> pubspec.yaml`
  - `cpanfile.snapshot -> cpanfile`
- Trigger batch updates and verify Installed Packages / Available Updates do not flicker through repeated duplicate refreshes.

### 4. Search Sidebar Lifecycle

- Collapse and reopen the sidebar view and confirm:
  - suggested keywords do not reinitialize
  - current query remains
  - existing results remain visible
- Switch sources and confirm:
  - base query is preserved
  - shared filters are preserved
  - unsupported filters are dropped
  - sort is only reset when unsupported by the new source

### 5. Source Context Consistency

- Compare search view and package details view for the same package and confirm they report the same:
  - install target label
  - package manager
  - NuGet style
  - Sonatype copy format
  - capability support
- Validate Clojure context behavior:
  - `neil` available -> direct install enabled
  - `neil` unavailable -> copy-only fallback behaves correctly

### 6. Package Query Behavior

- Verify `latest version`, `security`, and capability checks still behave the same after `PackageService` split.
- Confirm repeated package queries still benefit from caching instead of triggering duplicate source calls.
- Confirm unsupported capabilities still fail softly instead of surfacing router or service errors.

### 7. Manual Multi-Ecosystem Smoke Test

- In a mixed workspace containing at least `npm`, `composer`, `cargo`, and `dotnet` manifests:
  - open Installed Packages
  - open Available Updates
  - trigger one hover per ecosystem
  - trigger one CodeLens update path per ecosystem
  - open package details from each ecosystem
- Expected:
  - no cross-ecosystem routing mistakes
  - no wrong source labels
  - no missing refresh after update/remove actions

## Sonatype Verification Checklist

Use this checklist to validate the Sonatype build tool detection improvements.

### Scenario 1: Root Maven, child Gradle module

- Workspace root contains `pom.xml`
- Child module contains `packages/service-a/build.gradle`
- Open `packages/service-a/build.gradle`
- Expected:
  - Search view source hint shows `Auto copy format: Gradle`
  - Package details header shows `Auto copy format: Gradle`
  - Copy action generates Gradle snippet, not Maven XML

### Scenario 2: Mixed Maven and SBT repository

- Workspace contains both `pom.xml` and `examples/demo/build.sbt`
- Open `examples/demo/build.sbt`
- Expected:
  - Sonatype source info resolves to `SBT`
  - Copy action generates SBT coordinates
  - Switching back to `pom.xml` changes the detected format back to `Maven`

### Scenario 3: Multi-root workspace

- First workspace folder is Maven-based
- Second workspace folder is Gradle-based
- Active editor is inside the second workspace folder
- Expected:
  - Detected Sonatype format follows the active file or resolved target in the second folder
  - It does not fall back to the first workspace folder's root build file

### Scenario 4: Active editor is not a build manifest

- Open a non-build file such as `src/main/java/App.java`
- Current project still has a nearby `pom.xml` or `build.gradle`
- Expected:
  - Source info still resolves to the nearest build manifest
  - Copy action uses the nearby build tool instead of a workspace-root default

### Scenario 5: Install target differs from active editor context

- Active editor is in one module
- Last remembered install target points to another Sonatype manifest
- Trigger copy from search view or details view
- Expected:
  - Copy format follows the resolved install target manifest
  - Source hint and details header remain consistent with the same target context
