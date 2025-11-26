import * as vscode from 'vscode';
import type { InstallOptions, PackageManager } from '../types/package';

/**
 * Service for package installation
 */
export class InstallService {
  /**
   * Install a package
   */
  async install(
    packageName: string,
    options: InstallOptions
  ): Promise<{ success: boolean; message: string }> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

    if (!workspaceFolder) {
      return { success: false, message: 'No workspace folder open' };
    }

    const packageManager = options.packageManager || (await this.detectPackageManager());
    const command = this.buildInstallCommand(packageName, options, packageManager);

    try {
      const terminal = this.getOrCreateTerminal();
      terminal.show();
      terminal.sendText(command);

      return {
        success: true,
        message: `Installing ${packageName}...`,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Installation failed',
      };
    }
  }

  /**
   * Update a package
   */
  async update(
    packageName: string,
    version?: string
  ): Promise<{ success: boolean; message: string }> {
    const packageManager = await this.detectPackageManager();
    const versionSpec = version ? `${packageName}@${version}` : packageName;

    const commands: Record<PackageManager, string> = {
      npm: `npm update ${versionSpec}`,
      yarn: `yarn upgrade ${versionSpec}`,
      pnpm: `pnpm update ${versionSpec}`,
    };

    try {
      const terminal = this.getOrCreateTerminal();
      terminal.show();
      terminal.sendText(commands[packageManager]);

      return {
        success: true,
        message: `Updating ${packageName}...`,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Update failed',
      };
    }
  }

  /**
   * Remove a package
   */
  async remove(packageName: string): Promise<{ success: boolean; message: string }> {
    const packageManager = await this.detectPackageManager();

    const commands: Record<PackageManager, string> = {
      npm: `npm uninstall ${packageName}`,
      yarn: `yarn remove ${packageName}`,
      pnpm: `pnpm remove ${packageName}`,
    };

    try {
      const terminal = this.getOrCreateTerminal();
      terminal.show();
      terminal.sendText(commands[packageManager]);

      return {
        success: true,
        message: `Removing ${packageName}...`,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Removal failed',
      };
    }
  }

  /**
   * Build install command
   */
  private buildInstallCommand(
    packageName: string,
    options: InstallOptions,
    packageManager: PackageManager
  ): string {
    const { version, type, exact } = options;
    const versionSpec = version ? `${packageName}@${version}` : packageName;

    const devFlags: Record<PackageManager, string> = {
      npm: '-D',
      yarn: '-D',
      pnpm: '-D',
    };

    const exactFlags: Record<PackageManager, string> = {
      npm: '-E',
      yarn: '-E',
      pnpm: '-E',
    };

    const peerFlags: Record<PackageManager, string> = {
      npm: '--save-peer',
      yarn: '--peer',
      pnpm: '--save-peer',
    };

    let command: string;

    switch (packageManager) {
      case 'yarn':
        command = `yarn add ${versionSpec}`;
        break;
      case 'pnpm':
        command = `pnpm add ${versionSpec}`;
        break;
      default:
        command = `npm install ${versionSpec}`;
    }

    // Add flags based on dependency type
    if (type === 'devDependencies') {
      command += ` ${devFlags[packageManager]}`;
    } else if (type === 'peerDependencies') {
      command += ` ${peerFlags[packageManager]}`;
    }

    // Add exact flag if requested
    if (exact) {
      command += ` ${exactFlags[packageManager]}`;
    }

    return command;
  }

  /**
   * Detect package manager from lock files
   */
  async detectPackageManager(): Promise<PackageManager> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

    if (!workspaceFolder) {
      return this.getConfiguredPackageManager();
    }

    const rootPath = workspaceFolder.uri.fsPath;

    // Check for lock files
    const lockFiles: Array<{ file: string; manager: PackageManager }> = [
      { file: 'pnpm-lock.yaml', manager: 'pnpm' },
      { file: 'yarn.lock', manager: 'yarn' },
      { file: 'package-lock.json', manager: 'npm' },
    ];

    for (const { file, manager } of lockFiles) {
      try {
        await vscode.workspace.fs.stat(vscode.Uri.joinPath(vscode.Uri.file(rootPath), file));
        return manager;
      } catch {
        // File doesn't exist, continue checking
      }
    }

    return this.getConfiguredPackageManager();
  }

  /**
   * Get configured package manager from settings
   */
  private getConfiguredPackageManager(): PackageManager {
    const config = vscode.workspace.getConfiguration('npmGallery');
    return config.get<PackageManager>('packageManager', 'npm');
  }

  /**
   * Get or create terminal for npm commands
   */
  private getOrCreateTerminal(): vscode.Terminal {
    const existingTerminal = vscode.window.terminals.find(
      (t) => t.name === 'NPM Gallery'
    );

    if (existingTerminal) {
      return existingTerminal;
    }

    return vscode.window.createTerminal('NPM Gallery');
  }
}
