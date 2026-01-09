import * as vscode from 'vscode';
import { BaseSourceAdapter } from '../base/source-adapter.interface';
import type { InstallOptions, PackageManager } from '../../types/package';

/**
 * Base adapter for npm-based sources (npm-registry, npms.io)
 * Provides common npm-specific functionality like package manager detection
 * and command generation
 */
export abstract class NpmBaseAdapter extends BaseSourceAdapter {
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
    switch (packageManager) {
      case 'yarn':
        return this.getYarnInstallCommand(packageSpec, type, exact);
      case 'pnpm':
        return this.getPnpmInstallCommand(packageSpec, type, exact);
      case 'npm':
      default:
        return this.getNpmInstallCommand(packageSpec, type, exact);
    }
  }

  protected getNpmInstallCommand(packageSpec: string, type: string, exact: boolean): string {
    const flags: string[] = [];
    if (type === 'devDependencies') flags.push('--save-dev');
    if (exact) flags.push('--save-exact');
    return `npm install ${packageSpec} ${flags.join(' ')}`.trim();
  }

  protected getYarnInstallCommand(packageSpec: string, type: string, exact: boolean): string {
    const flags: string[] = [];
    if (type === 'devDependencies') flags.push('--dev');
    if (exact) flags.push('--exact');
    return `yarn add ${packageSpec} ${flags.join(' ')}`.trim();
  }

  protected getPnpmInstallCommand(packageSpec: string, type: string, exact: boolean): string {
    const flags: string[] = [];
    if (type === 'devDependencies') flags.push('--save-dev');
    if (exact) flags.push('--save-exact');
    return `pnpm add ${packageSpec} ${flags.join(' ')}`.trim();
  }
}
