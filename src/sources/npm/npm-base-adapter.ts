import axios from 'axios';
import * as vscode from 'vscode';
import { BaseSourceAdapter } from '../base/source-adapter.interface';
import { CapabilityNotSupportedError, SourceCapability } from '../base/capabilities';
import type { OSVClient } from '../../api/osv';
import type { DepsDevClient } from '../../api/deps-dev';
import type { InstallOptions, PackageManager, SecurityInfo } from '../../types/package';

/**
 * Base adapter for npm-based sources (npm-registry, npms.io)
 * Provides common npm-specific functionality like package manager detection
 * and command generation
 */
export abstract class NpmBaseAdapter extends BaseSourceAdapter {
  constructor(protected osvClient?: OSVClient, depsDevClient?: DepsDevClient) {
    super(depsDevClient);
  }

  /**
   * Generate install command
   * Uses package manager from options or detects from workspace
   */
  getInstallCommand(packageName: string, options: InstallOptions): string {
    const { version, type = 'dependencies', packageManager, exact = false } = options;
    const detectedManager = packageManager || this.detectPackageManagerSync();
    const versionSuffix = version ? `@${version}` : '';
    const packageSpec = `${packageName}${versionSuffix}`;

    return this.generateInstallCommand(detectedManager, packageSpec, type, exact);
  }

  /**
   * Generate update command
   * Detects package manager from workspace or uses default
   */
  getUpdateCommand(packageName: string, version?: string): string {
    const packageManager = this.detectPackageManagerSync();
    
    // If version is specified, use install command
    if (version) {
      const versionSpec = `${packageName}@${version}`;
      switch (packageManager) {
        case 'bun':
          return `bun add ${versionSpec}`;
        case 'yarn':
          return `yarn add ${versionSpec}`;
        case 'pnpm':
          return `pnpm add ${versionSpec}`;
        case 'npm':
        default:
          return `npm install ${versionSpec}`;
      }
    }
    
    // No version specified, use update command
    switch (packageManager) {
      case 'bun':
        return `bun update ${packageName}`;
      case 'yarn':
        return `yarn upgrade ${packageName}`;
      case 'pnpm':
        return `pnpm update ${packageName}`;
      case 'npm':
      default:
        return `npm update ${packageName}`;
    }
  }

  /**
   * Generate remove command
   * Detects package manager from workspace or uses default
   */
  getRemoveCommand(packageName: string): string {
    const packageManager = this.detectPackageManagerSync();
    
    switch (packageManager) {
      case 'bun':
        return `bun remove ${packageName}`;
      case 'yarn':
        return `yarn remove ${packageName}`;
      case 'pnpm':
        return `pnpm remove ${packageName}`;
      case 'npm':
      default:
        return `npm uninstall ${packageName}`;
    }
  }

  /**
   * Detect package manager synchronously (for command generation)
   * Checks lock files in workspace
   */
  protected detectPackageManagerSync(): PackageManager {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return this.getConfiguredPackageManager();
    }

    const rootPath = workspaceFolder.uri.fsPath;
    
    try {
      const fs = require('fs');
      const path = require('path');

      // Check for lock files (synchronous check)
      const lockFiles: Array<{ file: string; manager: PackageManager }> = [
        { file: 'bun.lock', manager: 'bun' },
        { file: 'bun.lockb', manager: 'bun' },
        { file: 'pnpm-lock.yaml', manager: 'pnpm' },
        { file: 'yarn.lock', manager: 'yarn' },
        { file: 'package-lock.json', manager: 'npm' },
      ];

      for (const { file, manager } of lockFiles) {
        try {
          const lockFilePath = path.join(rootPath, file);
          if (fs.existsSync(lockFilePath)) {
            return manager;
          }
        } catch {
          // Continue checking
        }
      }
    } catch {
      // If fs check fails, fall back to configured
    }

    return this.getConfiguredPackageManager();
  }

  /**
   * Get configured package manager from settings
   */
  protected getConfiguredPackageManager(): PackageManager {
    const config = vscode.workspace.getConfiguration('npmGallery');
    return config.get<PackageManager>('packageManager', 'npm');
  }

  /**
   * Generate install command for specific package manager
   */
  protected generateInstallCommand(
    packageManager: PackageManager,
    packageSpec: string,
    type: string,
    exact: boolean
  ): string {
    // Configuration for each package manager
    const config: Record<PackageManager, { command: string; flags: Record<string, string>; exactFlag: string }> = {
      npm: {
        command: 'npm install',
        flags: {
          peerDependencies: '--save-peer',
          optionalDependencies: '--save-optional',
          devDependencies: '--save-dev',
        },
        exactFlag: '--save-exact',
      },
      bun: {
        command: 'bun add',
        flags: {
          devDependencies: '--dev',
          peerDependencies: '--peer',
          optionalDependencies: '--optional',
        },
        exactFlag: '--exact',
      },
      yarn: {
        command: 'yarn add',
        flags: {
          peerDependencies: '--peer',
          optionalDependencies: '--optional',
          devDependencies: '--dev',
        },
        exactFlag: '--exact',
      },
      pnpm: {
        command: 'pnpm add',
        flags: {
          peerDependencies: '--save-peer',
          optionalDependencies: '--save-optional',
          devDependencies: '--save-dev',
        },
        exactFlag: '--save-exact',
      },
    };

    const managerConfig = config[packageManager] || config.npm;
    const flags: string[] = [];

    // Add type-specific flag if applicable
    if (type !== 'dependencies' && managerConfig.flags[type]) {
      flags.push(managerConfig.flags[type]);
    }

    // Add exact flag if needed
    if (exact) {
      flags.push(managerConfig.exactFlag);
    }

    return `${managerConfig.command} ${packageSpec} ${flags.join(' ')}`.trim();
  }

  protected async fetchReadmeFromUnpkg(
    packageName: string,
    version?: string,
    readmeFilename?: string
  ): Promise<string | null> {
    const pkgPath = this.getUnpkgPackagePath(packageName);
    const prefix = version ? `${pkgPath}@${version}` : pkgPath;
    const candidates = this.buildReadmeCandidates(readmeFilename);

    for (const candidate of candidates) {
      const url = encodeURI(`https://unpkg.com/${prefix}/${candidate}`);
      try {
        const response = await axios.get<string>(url, {
          responseType: 'text',
          timeout: 10000,
        });
        const text = typeof response.data === 'string' ? response.data : '';
        if (this.isValidReadmeContent(text)) {
          return text;
        }
      } catch {
        // Try next candidate
      }
    }

    return null;
  }

  private getUnpkgPackagePath(name: string): string {
    if (name.startsWith('@')) {
      const [, scope, pkg] = name.match(/^@([^/]+)\/(.+)$/) || [];
      if (scope && pkg) {
        return `@${scope}/${encodeURIComponent(pkg)}`;
      }
      return name;
    }
    return encodeURIComponent(name);
  }

  private buildReadmeCandidates(readmeFilename?: string): string[] {
    const candidates = [
      readmeFilename,
      'README.md',
      'README.MD',
      'Readme.md',
      'readme.md',
      'README',
      'readme',
      'README.txt',
      'README.markdown',
      'README.mdx',
      'README.rst',
    ];

    const unique = new Set<string>();
    for (const c of candidates) {
      if (c && c.trim().length > 0) {
        unique.add(c);
      }
    }
    return Array.from(unique);
  }

  private isValidReadmeContent(content: string): boolean {
    const normalized = content.trim();

    if (!normalized) {
      return false;
    }

    if (/^not found:/i.test(normalized)) {
      return false;
    }

    if (/^cannot find/i.test(normalized)) {
      return false;
    }

    if (/^error\b/i.test(normalized)) {
      return false;
    }

    if (/^<!doctype html>/i.test(normalized) || /^<html/i.test(normalized)) {
      return false;
    }

    return true;
  }

  getEcosystem(): string {
    return 'npm';
  }

  /**
   * Get security info (OSV)
   */
  async getSecurityInfo(_name: string, _version: string): Promise<SecurityInfo | null> {
    if (!this.supportsCapability(SourceCapability.SECURITY)) {
      throw new CapabilityNotSupportedError(SourceCapability.SECURITY, this.sourceType);
    }

    if (!this.osvClient) {
      return null;
    }
    try {
      return await this.osvClient.queryVulnerabilities(
        _name,
        _version,
        this.getEcosystem()
      );
    } catch {
      return null;
    }
  }

  /**
   * Get security info for multiple packages (OSV batch)
   */
  async getSecurityInfoBulk(
    _packages: Array<{ name: string; version: string }>
  ): Promise<Record<string, SecurityInfo | null>> {
    if (!this.supportsCapability(SourceCapability.SECURITY)) {
      throw new CapabilityNotSupportedError(SourceCapability.SECURITY, this.sourceType);
    }

    if (!this.osvClient || _packages.length === 0) {
      return {};
    }

    try {
      const result = await this.osvClient.queryBulkVulnerabilities(
        _packages.map(pkg => ({ ...pkg, ecosystem: this.getEcosystem() || 'npm' }))
      );
      const mapped: Record<string, SecurityInfo | null> = {};
      for (const pkg of _packages) {
        const key = `${pkg.name}@${pkg.version}`;
        mapped[key] = result[key] ?? null;
      }
      return mapped;
    } catch {
      const empty: Record<string, SecurityInfo | null> = {};
      for (const pkg of _packages) {
        const key = `${pkg.name}@${pkg.version}`;
        empty[key] = null;
      }
      return empty;
    }
  }
}
