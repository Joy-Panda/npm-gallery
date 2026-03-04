# NPM Gallery

Browse, search, and manage packages across multiple ecosystems directly from VS Code, with source-aware search, package details, security signals, and workspace package management.

![example](https://storage.googleapis.com/nprep-f64b1.firebasestorage.app/admin/example.png)

## Features

### Search & Browse Packages
- Search packages directly from the sidebar across multiple sources
- View package details including README, version history, dependencies, requirements, dependents, and security where supported
- See source-specific download stats, bundle sizes, package scores, and ecosystem metadata
- Beautiful UI integrated with VS Code themes

### Package Management
- Install, copy, update, or remove dependencies from supported manifests
- Update individual packages or all packages at once
- Remove packages with a single click
- Supports multiple ecosystems including npm, Maven/Gradle, NuGet, Composer, Ruby, Cargo, Dart/Flutter, CRAN, Clojure, Perl, and Go

### Installed Packages View
- View installed packages across supported workspace manifests
- See current version at a glance
- Quick access to remove or view package details

### Available Updates View
- See all packages with available updates
- Update type indicators (major, minor, patch)
- One-click update to latest version

### Package Details
- Full README rendering with syntax-highlighted code blocks
- Version information and publish dates
- Repository and homepage links
- License information
- Dependencies, requirements, dependents, and security tabs where supported by the current source

## Commands

All commands are available from the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

| Command | Description |
|---------|-------------|
| `NPM Gallery: Open NPM Gallery` | Open the NPM Gallery sidebar |
| `NPM Gallery: Search Packages` | Search for packages in the current source |
| `NPM Gallery: Install Package` | Install a package |
| `NPM Gallery: Update Package` | Update a specific package |
| `NPM Gallery: Update All Packages` | Update all packages |
| `NPM Gallery: Remove Package` | Remove a package |
| `NPM Gallery: Run Security Audit` | Run the current ecosystem security audit command when supported |
| `NPM Gallery: Show Package Details` | View details for a package |
| `NPM Gallery: Refresh` | Refresh all views |

## Extension Settings

This extension contributes the following settings:

| Setting | Default | Description |
|---------|---------|-------------|
| `npmGallery.defaultRegistry` | `https://registry.npmjs.org` | Default npm registry URL |
| `npmGallery.packageManager` | `npm` | Preferred package manager or build tool fallback |
| `npmGallery.userAgentContact` | `""` | Optional contact string appended to HTTP `User-Agent` |
| `npmGallery.showBundleSize` | `true` | Show bundle size in search results and hover where available |
| `npmGallery.showSecurityInfo` | `true` | Show security vulnerability information |
| `npmGallery.autoCheckUpdates` | `true` | Automatically check for package updates on startup |
| `npmGallery.licenseWhitelist` | `["MIT", "Apache-2.0", "ISC", "BSD-2-Clause", "BSD-3-Clause"]` | Allowed licenses (warn if package uses different license) |
| `npmGallery.bundleSizeWarningThreshold` | `100` | Show warning if bundle size exceeds this value (in KB) |
| `npmGallery.cacheTimeout` | `3600` | Cache timeout in seconds |

## Requirements

- VS Code 1.74.0 or higher
- Workspace manifests from supported ecosystems
- Tooling installed for the package manager or build tool you want to execute directly

## Package Manager Detection

The extension detects package managers and install targets from the current workspace manifest context. Examples include:
- `package-lock.json` / `pnpm-lock.yaml` / `yarn.lock` / `bun.lock*` for Node.js workspaces
- `pom.xml` / `build.gradle*` for JVM workspaces
- `composer.json`, `Gemfile`, `Cargo.toml`, `pubspec.yaml`, `DESCRIPTION`, `deps.edn`, `cpanfile`, and `go.mod` for their respective ecosystems

If no stronger signal is available, it falls back to the configured `npmGallery.packageManager` setting.

## Release Notes

### 0.0.1

Initial release:
- Multi-source package search
- Package details view with README rendering
- Installed packages and available updates views
- Editor hover and CodeLens integrations
- Workspace-aware install/update/remove flows

## License

MIT

---

**Enjoy managing your packages from VS Code.**
