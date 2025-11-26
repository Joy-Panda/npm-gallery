# NPM Gallery - VS Code Extension

> A powerful VS Code extension for browsing, searching, and managing npm packages directly from your editor.

## Overview

NPM Gallery transforms how developers interact with npm packages by bringing the entire npm ecosystem into VS Code. No more switching between browser and editor - search, evaluate, and install packages without leaving your development environment.

## Key Features

- **Smart Package Search** - Search npm's entire registry with intelligent filtering
- **One-Click Installation** - Install packages directly into your project
- **Version Management** - Update outdated packages from package.json
- **Security Scanning** - Real-time vulnerability detection before installation
- **Bundle Analysis** - Preview bundle size impact before adding dependencies
- **Alternative Suggestions** - Discover lighter, better-maintained alternatives
- **License Compliance** - Ensure dependency licenses match your project requirements

## Documentation

| Document | Description |
|----------|-------------|
| [Product Requirements (PRD)](./PRD.md) | Product vision, goals, and requirements |
| [Features Specification](./FEATURES.md) | Detailed feature descriptions and specifications |
| [Architecture](./ARCHITECTURE.md) | Technical architecture and design decisions |
| [API Integration](./API.md) | npm API integration details |
| [UI/UX Specifications](./UI-UX.md) | User interface design and user experience |
| [Development Guide](./DEVELOPMENT.md) | Setup, development, and contribution guide |

## Quick Links

- [Installation](#installation)
- [Usage](#usage)
- [Configuration](#configuration)
- [Contributing](#contributing)

## Installation

### From VS Code Marketplace
1. Open VS Code
2. Go to Extensions (`Ctrl+Shift+X`)
3. Search for "NPM Gallery"
4. Click Install

### From VSIX
```bash
code --install-extension npm-gallery-x.x.x.vsix
```

## Usage

### Opening NPM Gallery
- **Command Palette**: `Ctrl+Shift+P` → "NPM Gallery: Open"
- **Activity Bar**: Click the NPM Gallery icon
- **Keyboard Shortcut**: `Ctrl+Alt+N` (customizable)

### Searching Packages
1. Open NPM Gallery
2. Type package name in search bar
3. Use filters for size, popularity, maintenance score
4. Click on package for details

### Installing Packages
1. Search and select a package
2. Choose version (latest recommended)
3. Select dependency type (dependencies/devDependencies)
4. Click "Install"

### Updating Packages
1. Open any `package.json` file
2. Hover over package names to see update availability
3. Click "Update" or use CodeLens actions
4. Bulk update available via command palette

## Configuration

```json
{
  "npmGallery.defaultRegistry": "https://registry.npmjs.org",
  "npmGallery.showBundleSize": true,
  "npmGallery.securityScanEnabled": true,
  "npmGallery.licenseWhitelist": ["MIT", "Apache-2.0", "ISC"],
  "npmGallery.autoCheckUpdates": true,
  "npmGallery.cacheTimeout": 3600
}
```

## Unique Selling Points (USPs)

### 1. Security-First Approach
Unlike other extensions, NPM Gallery prioritizes security by showing vulnerability data upfront, before you install any package.

### 2. Bundle Impact Preview
See exactly how a package will affect your bundle size before adding it to your project.

### 3. Smart Alternatives
Get intelligent suggestions for lighter, faster, or better-maintained alternatives to popular packages.

### 4. License Guardian
Automatic license compatibility checking prevents legal issues before they start.

### 5. Workspace Intelligence
Full monorepo support with cross-package dependency management.

## Tech Stack

- **Language**: TypeScript
- **Framework**: VS Code Extension API
- **APIs**: npm Registry API, npms.io API, Bundlephobia API
- **UI**: VS Code Webview with React

## Contributing

We welcome contributions! Please see our [Development Guide](./DEVELOPMENT.md) for setup instructions and contribution guidelines.

## License

MIT License - see [LICENSE](../LICENSE) for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/your-org/npm-gallery/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-org/npm-gallery/discussions)

---

Made with care for the developer community.
