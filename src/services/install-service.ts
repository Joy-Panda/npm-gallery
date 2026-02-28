import * as vscode from 'vscode';
import type { InstallOptions, CopyOptions, PackageManager } from '../types/package';
import type { SourceSelector } from '../registry/source-selector';
import type { ProjectType } from '../types/project';
import { SourceCapability } from '../sources/base/capabilities';

/**
 * Service for package installation
 * Delegates command generation to source adapters, only handles execution
 */
export class InstallService {
  constructor(private sourceSelector?: SourceSelector) {}

  /**
   * Set the source selector (for late initialization)
   */
  setSourceSelector(selector: SourceSelector): void {
    this.sourceSelector = selector;
  }

  /**
   * Install a package
   * Command generation is delegated to the source adapter
   */
  async install(
    packageName: string,
    options: InstallOptions,
    targetPath?: string
  ): Promise<{ success: boolean; message: string }> {
    const workspaceFolder = this.resolveWorkspaceFolder(targetPath);
    const executionUri = this.getExecutionUri(targetPath, workspaceFolder);

    if (!workspaceFolder) {
      return { success: false, message: 'No workspace folder open' };
    }

    if (!this.sourceSelector) {
      return { success: false, message: 'InstallService not initialized: SourceSelector is required' };
    }

    try {
      const adapter = this.sourceSelector.selectSource();
      
      // Check if installation is supported
      if (!adapter.supportsCapability(SourceCapability.INSTALLATION)) {
        return { success: false, message: 'Installation is not supported by this source' };
      }
      
      if (!adapter.getInstallCommand) {
        return { success: false, message: 'Install command generation is not supported' };
      }
      
      const command = adapter.getInstallCommand(packageName, options);
      const projectType = adapter.projectType;

      const terminal = this.getOrCreateTerminal(projectType, workspaceFolder, executionUri, targetPath);
      terminal.show();
      terminal.sendText(command);

      return {
        success: true,
        message: `Installing ${packageName}${targetPath ? ` into ${vscode.workspace.asRelativePath(targetPath) || targetPath}` : ''}...`,
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
   * Command generation is delegated to the source adapter
   */
  async update(
    packageName: string,
    version?: string,
    targetPath?: string
  ): Promise<{ success: boolean; message: string }> {
    if (!this.sourceSelector) {
      return { success: false, message: 'InstallService not initialized: SourceSelector is required' };
    }

    try {
      const adapter = this.sourceSelector.selectSource();
      
      // Check if installation is supported
      if (!adapter.supportsCapability(SourceCapability.INSTALLATION)) {
        return { success: false, message: 'Update is not supported by this source' };
      }
      
      if (!adapter.getUpdateCommand) {
        return { success: false, message: 'Update command generation is not supported' };
      }
      
      const command = adapter.getUpdateCommand(packageName, version);
      const projectType = adapter.projectType;
      const workspaceFolder = this.resolveWorkspaceFolder(targetPath);
      const executionUri = this.getExecutionUri(targetPath, workspaceFolder);

      const terminal = this.getOrCreateTerminal(projectType, workspaceFolder, executionUri, targetPath);
      terminal.show();
      terminal.sendText(command);

      return {
        success: true,
        message: version 
          ? `Updating ${packageName} to ${version}...` 
          : `Updating ${packageName}...`,
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
   * Command generation is delegated to the source adapter
   */
  async remove(packageName: string, targetPath?: string): Promise<{ success: boolean; message: string }> {
    if (!this.sourceSelector) {
      return { success: false, message: 'InstallService not initialized: SourceSelector is required' };
    }

    try {
      const adapter = this.sourceSelector.selectSource();
      
      // Check if installation is supported
      if (!adapter.supportsCapability(SourceCapability.INSTALLATION)) {
        return { success: false, message: 'Remove is not supported by this source' };
      }
      
      if (!adapter.getRemoveCommand) {
        return { success: false, message: 'Remove command generation is not supported' };
      }
      
      const command = adapter.getRemoveCommand(packageName);
      const projectType = adapter.projectType;
      const workspaceFolder = this.resolveWorkspaceFolder(targetPath);
      const executionUri = this.getExecutionUri(targetPath, workspaceFolder);

      const terminal = this.getOrCreateTerminal(projectType, workspaceFolder, executionUri, targetPath);
      terminal.show();
      terminal.sendText(command);

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
   * Get install command for UI display
   * Delegates to source adapter
   */
  getInstallCommand(
    packageName: string,
    options: InstallOptions
  ): string {
    if (!this.sourceSelector) {
      return `npm install ${packageName}`; // Fallback
    }

    try {
      const adapter = this.sourceSelector.selectSource();
      
      if (!adapter.supportsCapability(SourceCapability.INSTALLATION) || !adapter.getInstallCommand) {
        return `npm install ${packageName}`; // Fallback
      }
      
      return adapter.getInstallCommand(packageName, options);
    } catch {
      return `npm install ${packageName}`; // Fallback
    }
  }

  /**
   * Get copy snippet and copy to clipboard
   * For package managers that require copying snippets (Maven, Gradle, etc.)
   */
  async copySnippet(
    packageName: string,
    options: CopyOptions
  ): Promise<{ success: boolean; message: string }> {
    if (!this.sourceSelector) {
      return { success: false, message: 'InstallService not initialized: SourceSelector is required' };
    }

    try {
      const adapter = this.sourceSelector.selectSource();
      
      // Check if copy is supported
      if (!adapter.supportsCapability(SourceCapability.COPY)) {
        return { success: false, message: 'Copy snippet is not supported by this source' };
      }
      
      if (!adapter.getCopySnippet) {
        return { success: false, message: 'Copy snippet generation is not supported' };
      }
      
      const snippet = adapter.getCopySnippet(packageName, options);
      
      // Copy to clipboard
      await vscode.env.clipboard.writeText(snippet);
      
      return {
        success: true,
        message: `Copied ${packageName} snippet to clipboard!`,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Copy failed',
      };
    }
  }

  /**
   * Get copy snippet for UI display (without copying)
   * Delegates to source adapter
   */
  getCopySnippet(
    packageName: string,
    options: CopyOptions
  ): string | null {
    if (!this.sourceSelector) {
      return null;
    }

    try {
      const adapter = this.sourceSelector.selectSource();
      
      if (!adapter.supportsCapability(SourceCapability.COPY) || !adapter.getCopySnippet) {
        return null;
      }
      
      return adapter.getCopySnippet(packageName, options);
    } catch {
      return null;
    }
  }
 
  /**
   * Detect package manager for the current workspace.
   * This is used by commands that need to run update/audit directly.
   */
  async detectPackageManager(targetPath?: string): Promise<PackageManager> {
    const workspaceFolder = this.resolveWorkspaceFolder(targetPath);
    if (!workspaceFolder) {
      return this.getConfiguredPackageManager();
    }

    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const rootPath = workspaceFolder.uri.fsPath;
    const startPath = targetPath
      ? path.dirname(targetPath)
      : vscode.window.activeTextEditor
        ? path.dirname(vscode.window.activeTextEditor.document.uri.fsPath)
        : rootPath;

    try {
      const lockFiles: Array<{ file: string; manager: PackageManager }> = [
        { file: 'bun.lock', manager: 'bun' },
        { file: 'bun.lockb', manager: 'bun' },
        { file: 'pnpm-lock.yaml', manager: 'pnpm' },
        { file: 'yarn.lock', manager: 'yarn' },
        { file: 'package-lock.json', manager: 'npm' },
      ];

      let currentPath = startPath;
      while (currentPath.startsWith(rootPath)) {
        for (const { file, manager } of lockFiles) {
          const lockFilePath = path.join(currentPath, file);
          try {
            if (fs.existsSync(lockFilePath)) {
              return manager;
            }
          } catch {
            // Ignore and continue checking other lock files
          }
        }

        if (currentPath === rootPath) {
          break;
        }

        const parentPath = path.dirname(currentPath);
        if (parentPath === currentPath) {
          break;
        }
        currentPath = parentPath;
      }
    } catch {
      // Ignore FS errors and fall back to config
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
   * Get or create terminal for commands
   */
  private getOrCreateTerminal(
    projectType: ProjectType,
    workspaceFolder?: vscode.WorkspaceFolder,
    cwdUri?: vscode.Uri,
    targetPath?: string
  ): vscode.Terminal {
    const workspaceSuffix =
      workspaceFolder && vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 1
        ? ` (${workspaceFolder.name})`
        : '';
    const targetSuffix = this.getTargetTerminalSuffix(workspaceFolder, targetPath);
    const terminalNames: Record<ProjectType, string> = {
      npm: `NPM Gallery${workspaceSuffix}${targetSuffix}`,
      maven: `Maven Gallery${workspaceSuffix}${targetSuffix}`,
      go: `Go Gallery${workspaceSuffix}${targetSuffix}`,
      unknown: `Package Gallery${workspaceSuffix}${targetSuffix}`,
    };

    const terminalName = terminalNames[projectType];
    const existingTerminal = vscode.window.terminals.find(
      (t) => t.name === terminalName
    );

    if (existingTerminal) {
      return existingTerminal;
    }

    return vscode.window.createTerminal({
      name: terminalName,
      cwd: cwdUri || workspaceFolder?.uri,
    });
  }

  private getExecutionUri(targetPath?: string, workspaceFolder?: vscode.WorkspaceFolder): vscode.Uri | undefined {
    if (targetPath) {
      const path = require('path') as typeof import('path');
      return vscode.Uri.file(path.dirname(targetPath));
    }

    return workspaceFolder?.uri;
  }

  private resolveWorkspaceFolder(targetPath?: string): vscode.WorkspaceFolder | undefined {
    if (targetPath) {
      return vscode.workspace.getWorkspaceFolder(vscode.Uri.file(targetPath));
    }

    return vscode.window.activeTextEditor
      ? vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri)
      : vscode.workspace.workspaceFolders?.[0];
  }

  private getTargetTerminalSuffix(
    workspaceFolder?: vscode.WorkspaceFolder,
    targetPath?: string
  ): string {
    if (!workspaceFolder || !targetPath) {
      return '';
    }

    const relativePath = vscode.workspace.asRelativePath(targetPath);
    const normalized = relativePath.replace(/\\/g, '/');
    const segments = normalized.split('/').filter(Boolean);
    if (segments.length <= 1) {
      return '';
    }

    const projectSegment = segments[segments.length - 2];
    return ` - ${projectSegment}`;
  }
}
