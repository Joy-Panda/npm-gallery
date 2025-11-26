# NPM Gallery

Browse, search, and manage npm packages directly from VS Code with bundle analysis, download stats, and smart package management.

![example](https://storage.googleapis.com/nprep-f64b1.firebasestorage.app/admin/example.png)

## Features

### Search & Browse Packages
- Search npm packages directly from the sidebar
- View package details including README, version history, and dependencies
- See weekly download counts, bundle sizes, and package scores
- Beautiful UI integrated with VS Code themes

### Package Management
- Install packages as dependencies or devDependencies
- Update individual packages or all packages at once
- Remove packages with a single click
- Supports npm, yarn, and pnpm

### Installed Packages View
- View all installed packages organized by type (dependencies, devDependencies)
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
- Dependencies list

## Commands

All commands are available from the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

| Command | Description |
|---------|-------------|
| `NPM Gallery: Open NPM Gallery` | Open the NPM Gallery sidebar |
| `NPM Gallery: Search Packages` | Search for npm packages |
| `NPM Gallery: Install Package` | Install a package |
| `NPM Gallery: Update Package` | Update a specific package |
| `NPM Gallery: Update All Packages` | Update all packages |
| `NPM Gallery: Remove Package` | Remove a package |
| `NPM Gallery: Run Security Audit` | Run npm/yarn/pnpm audit |
| `NPM Gallery: Show Package Details` | View details for a package |
| `NPM Gallery: Refresh` | Refresh all views |

## Extension Settings

This extension contributes the following settings:

| Setting | Default | Description |
|---------|---------|-------------|
| `npmGallery.defaultRegistry` | `https://registry.npmjs.org` | Default npm registry URL |
| `npmGallery.packageManager` | `npm` | Preferred package manager (`npm`, `yarn`, or `pnpm`) |
| `npmGallery.showBundleSize` | `true` | Show bundle size in search results |
| `npmGallery.showSecurityInfo` | `true` | Show security vulnerability information |
| `npmGallery.autoCheckUpdates` | `true` | Automatically check for package updates on startup |
| `npmGallery.licenseWhitelist` | `["MIT", "Apache-2.0", "ISC", "BSD-2-Clause", "BSD-3-Clause"]` | Allowed licenses (warn if package uses different license) |
| `npmGallery.bundleSizeWarningThreshold` | `100` | Show warning if bundle size exceeds this value (in KB) |
| `npmGallery.cacheTimeout` | `3600` | Cache timeout in seconds |

## Requirements

- VS Code 1.74.0 or higher
- Node.js and npm/yarn/pnpm installed

## Package Manager Detection

The extension automatically detects your package manager based on lock files:
- `pnpm-lock.yaml` → pnpm
- `yarn.lock` → yarn
- `package-lock.json` → npm

If no lock file is found, it falls back to the configured `npmGallery.packageManager` setting.

## Release Notes

### 0.0.1

Initial release:
- Package search with download stats and bundle sizes
- Package details view with README rendering
- Installed packages view
- Available updates view
- Support for npm, yarn, and pnpm

## License

MIT

---

**Enjoy managing your npm packages!**
