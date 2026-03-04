import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { InstallOptions, CopyOptions, PackageManager, BuildTool, NuGetManagementStyle, NuGetCopyFormat } from '../types/package';
import { NUGET_STYLE_TO_COPY_FORMAT, NUGET_FORMAT_RUN_TYPE, NUGET_FORMAT_RUN_LABELS, NUGET_COPY_FORMAT_LABELS } from '../types/package';
import type { SourceSelector } from '../registry/source-selector';
import type { WorkspaceService } from './workspace-service';
import type { ProjectType } from '../types/project';
import { SourceCapability } from '../sources/base/capabilities';

const execFileAsync = promisify(execFile);

/**
 * Service for package installation
 * Delegates command generation to source adapters, only handles execution
 */
export class InstallService {
  private neilAvailabilityPromise?: Promise<boolean>;

  constructor(
    private sourceSelector?: SourceSelector,
    private workspace?: WorkspaceService
  ) {}

  /**
   * Set the source selector (for late initialization)
   */
  setSourceSelector(selector: SourceSelector): void {
    this.sourceSelector = selector;
  }

  setWorkspace(workspace: WorkspaceService): void {
    this.workspace = workspace;
  }

  /**
   * Detect .NET/NuGet management style (like detectPackageManager for npm/yarn/pnpm/bun).
   * Used to default copy format and show "Detected: Paket" etc.
   */
  detectNuGetManagementStyle(targetPath?: string): NuGetManagementStyle {
    return this.workspace?.detectNuGetManagementStyle(targetPath) ?? 'packagereference';
  }

  async isNeilAvailable(): Promise<boolean> {
    if (!this.neilAvailabilityPromise) {
      this.neilAvailabilityPromise = (async () => {
        try {
          await execFileAsync('neil', ['--version']);
          return true;
        } catch {
          return false;
        }
      })();
    }

    return this.neilAvailabilityPromise;
  }

  async canUseNeil(targetPath?: string): Promise<boolean> {
    const detectedManager = await this.detectPackageManager(targetPath);
    if (detectedManager !== 'clojure') {
      return false;
    }

    return this.isNeilAvailable();
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

      if (adapter.sourceType === 'clojars' && !(await this.canUseNeil(targetPath))) {
        return { success: false, message: 'Direct install requires neil and a deps.edn target' };
      }
      
      // Check if installation is supported
      if (!adapter.supportsCapability(SourceCapability.INSTALLATION)) {
        return { success: false, message: 'Installation is not supported by this source' };
      }
      
      if (!adapter.getInstallCommand) {
        return { success: false, message: 'Install command generation is not supported' };
      }
      
      const packageManager = await this.detectPackageManager(targetPath);
      const command = adapter.getInstallCommand(packageName, {
        ...options,
        packageManager,
      });
      const projectType = this.sourceSelector?.getCurrentProjectType() ?? adapter.projectType;

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
      
      let command = adapter.getUpdateCommand(packageName, version || undefined);
      const packageManager = await this.detectPackageManager(targetPath);
      if (adapter.sourceType === 'pub-dev' && packageManager === 'flutter') {
        command = command.replace(/^dart pub\b/, 'flutter pub');
      }
      const projectType = this.sourceSelector?.getCurrentProjectType() ?? adapter.projectType;
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

      if (adapter.sourceType === 'cran' && targetPath && this.workspace) {
        const removed = await this.workspace.removeRDependency(targetPath, packageName);
        return removed
          ? { success: true, message: `Removed ${packageName}.` }
          : { success: false, message: 'Remove is not supported for this R manifest' };
      }

      if (adapter.sourceType === 'metacpan' && targetPath && this.workspace) {
        const removed = await this.workspace.removePerlDependency(targetPath, packageName);
        return removed
          ? { success: true, message: `Removed ${packageName}.` }
          : { success: false, message: 'Remove is not supported for this Perl manifest' };
      }

      if (adapter.sourceType === 'nuget' && targetPath) {
        const nugetCommand = this.getNuGetRemoveCommand(packageName, targetPath);
        if (nugetCommand) {
          const workspaceFolder = this.resolveWorkspaceFolder(targetPath);
          const executionUri = this.getExecutionUri(targetPath, workspaceFolder);
          const terminal = this.getOrCreateTerminal('dotnet', workspaceFolder, executionUri, targetPath);
          terminal.show();
          terminal.sendText(nugetCommand);
          return {
            success: true,
            message: `Removing ${packageName}...`,
          };
        }

        const removed = await this.removeNuGetPackage(packageName, targetPath);
        return removed
          ? { success: true, message: `Removed ${packageName}.` }
          : { success: false, message: 'Remove is not supported for this NuGet manifest' };
      }
      
      // Check if installation is supported
      if (!adapter.supportsCapability(SourceCapability.INSTALLATION)) {
        return { success: false, message: 'Remove is not supported by this source' };
      }
      
      if (!adapter.getRemoveCommand) {
        return { success: false, message: 'Remove command generation is not supported' };
      }
      
      let command = adapter.getRemoveCommand(packageName);
      const packageManager = await this.detectPackageManager(targetPath);
      if (adapter.sourceType === 'pub-dev' && packageManager === 'flutter') {
        command = command.replace(/^dart pub\b/, 'flutter pub');
      }
      const projectType = this.sourceSelector?.getCurrentProjectType() ?? adapter.projectType;
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

  private async removeNuGetPackage(packageName: string, targetPath: string): Promise<boolean> {
    if (!this.workspace) {
      return false;
    }

    const lower = targetPath.toLowerCase();
    if (lower.endsWith('directory.packages.props')) {
      return this.workspace.removeCpmPackage(targetPath, packageName);
    }
    if (lower.endsWith('paket.dependencies')) {
      return this.workspace.removePaketDependency(targetPath, packageName);
    }
    if (lower.endsWith('packages.config')) {
      return this.workspace.removePackagesConfigPackage(targetPath, packageName);
    }
    if (lower.endsWith('.csproj') || lower.endsWith('.vbproj') || lower.endsWith('.fsproj')) {
      return this.workspace.removeProjectPackageReference(targetPath, packageName);
    }
    if (lower.endsWith('.cake')) {
      return this.workspace.removeCakePackage(targetPath, packageName);
    }

    return false;
  }

  private getNuGetRemoveCommand(packageName: string, targetPath: string): string | null {
    const normalized = targetPath.replace(/\\/g, '/').toLowerCase();
    if (normalized.endsWith('paket.dependencies')) {
      return `paket remove ${packageName}`;
    }

    if (normalized.endsWith('.csproj') || normalized.endsWith('.vbproj') || normalized.endsWith('.fsproj')) {
      const escapedPath = targetPath.includes(' ') ? `"${targetPath}"` : targetPath;
      return `dotnet remove ${escapedPath} package ${packageName}`;
    }

    return null;
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
   * Detect build tool from workspace
   * Checks for build files to determine which build tool is being used
   */
  async detectBuildTool(startPath?: string): Promise<BuildTool | null> {
    const workspaceFolder = this.resolveWorkspaceFolder(startPath);
    if (!workspaceFolder) {
      return null;
    }

    const rootPath = workspaceFolder.uri.fsPath;
    
    try {
      // Use require for synchronous file system access in Node.js
      const fs = require('fs') as typeof import('fs');
      const path = require('path') as typeof import('path');

      // Check for build files (priority order)
      // Note: All of these build tools (maven, gradle, sbt, mill, ivy, grape, leiningen, buildr)
      // require copy functionality instead of direct installation
      const buildFiles: Array<{ file: string; tool: BuildTool }> = [
        { file: 'build.gradle', tool: 'gradle' },
        { file: 'build.gradle.kts', tool: 'gradle' },
        { file: 'build.sbt', tool: 'sbt' },
        { file: 'build.sc', tool: 'mill' },
        { file: 'ivy.xml', tool: 'ivy' },
        { file: 'project.clj', tool: 'leiningen' },
        { file: 'buildfile', tool: 'buildr' },
        { file: 'grapeConfig.xml', tool: 'grape' },
        { file: 'pom.xml', tool: 'maven' }, // Maven last as it's most common
      ];

      const explicitTool = this.getBuildToolForPath(startPath);
      if (explicitTool) {
        return explicitTool;
      }

      let currentDir = startPath
        ? (fs.existsSync(startPath) && fs.statSync(startPath).isFile() ? path.dirname(startPath) : startPath)
        : rootPath;

      while (currentDir) {
        for (const { file, tool } of buildFiles) {
          try {
            const buildFilePath = path.join(currentDir, file);
            if (fs.existsSync(buildFilePath)) {
              return tool;
            }
          } catch {
            // Continue checking
          }
        }

        if (currentDir === rootPath) {
          break;
        }

        const parentDir = path.dirname(currentDir);
        if (parentDir === currentDir || !this.isWithinWorkspace(parentDir, rootPath, path)) {
          break;
        }
        currentDir = parentDir;
      }

      // Check for Grape (Groovy dependency management)
      // Look for .groovy files (grapeConfig.xml is already checked in buildFiles above)
      // Only return grape if no other build tool is detected
      try {
        const groovyFiles = await vscode.workspace.findFiles(
          new vscode.RelativePattern(workspaceFolder, '**/*.groovy'),
          null,
          1
        );
        if (groovyFiles.length > 0) {
          return 'grape';
        }
      } catch {
        // Continue checking
      }
    } catch {
      // If fs check fails, return null
    }

    return null;
    
  }

  /**
   * Get copy snippet and copy to clipboard
   * For build tools that require copying snippets to build files
   * All Java/Scala build tools (maven, gradle, sbt, mill, ivy, grape, leiningen, buildr) require copy
   */
  async copySnippet(
    packageName: string,
    options: CopyOptions,
    targetPath?: string
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
      
      // NuGet/dotnet: use format from options or default (CPM if Directory.Packages.props exists)
      const projectType = this.sourceSelector?.getCurrentProjectType?.() ?? 'unknown';
      const isNuGet = adapter.sourceType === 'nuget' || projectType === 'dotnet';
      const isClojars = adapter.sourceType === 'clojars' || projectType === 'clojure';

      let format: CopyOptions['format'] = 'xml';
      if (isNuGet) {
        if (options.format) {
          format = options.format;
        } else {
          const style = this.workspace?.detectNuGetManagementStyle(
            targetPath || vscode.window.activeTextEditor?.document.uri.fsPath
          ) ?? 'packagereference';
          format = NUGET_STYLE_TO_COPY_FORMAT[style] as NuGetCopyFormat;
        }
      } else if (isClojars) {
        if (options.format) {
          format = options.format;
        } else {
          const detectedManager = await this.detectPackageManager(
            targetPath || vscode.window.activeTextEditor?.document.uri.fsPath
          );
          format = detectedManager === 'leiningen' ? 'leiningen' : 'deps-edn';
        }
      } else {
        // Auto-detect build tool for Maven/Gradle
        let buildTool = options.buildTool;
        if (!buildTool) {
          buildTool = await this.detectBuildTool(
            targetPath || vscode.window.activeTextEditor?.document.uri.fsPath
          ) || 'maven';
        }
        if (buildTool === 'gradle') {
          format = 'gradle';
        } else if (buildTool === 'sbt') {
          format = 'sbt';
        } else if (buildTool === 'grape') {
          format = 'grape';
        } else if (buildTool === 'mill') {
          format = 'mill';
        } else if (buildTool === 'ivy') {
          format = 'ivy';
        } else if (buildTool === 'leiningen') {
          format = 'leiningen';
        } else if (buildTool === 'buildr') {
          format = 'buildr';
        } else if (buildTool === 'maven') {
          format = 'xml';
        } else {
          format = 'other';
        }
      }

      // Generate snippet with detected format
      const snippet = adapter.getCopySnippet(packageName, { ...options, format });

      // Copy to clipboard
      await vscode.env.clipboard.writeText(snippet);

      let message: string;
      if (isNuGet && typeof format === 'string' && NUGET_FORMAT_RUN_TYPE[format as NuGetCopyFormat]) {
        const runType = NUGET_FORMAT_RUN_TYPE[format as NuGetCopyFormat];
        const runHint = NUGET_FORMAT_RUN_LABELS[runType];
        const formatLabel = NUGET_COPY_FORMAT_LABELS[format as NuGetCopyFormat] || format;
        message = `Copied ${packageName} (${formatLabel}). ${runType === 'copy' ? 'Paste into your file.' : runHint}`;
      } else if (isClojars) {
        const formatLabel = format === 'leiningen' ? 'Leiningen' : 'deps.edn';
        message = `Copied ${packageName} snippet (${formatLabel}) to clipboard!`;
      } else {
        const formatLabel = isNuGet ? (NUGET_COPY_FORMAT_LABELS[format as NuGetCopyFormat] || format) : (options.buildTool ?? 'maven');
        message = `Copied ${packageName} snippet (${formatLabel}) to clipboard!`;
      }
      return { success: true, message };
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
        { file: 'go.mod', manager: 'go' },
        { file: 'Cargo.toml', manager: 'cargo' },
        { file: 'Cargo.lock', manager: 'cargo' },
        { file: 'cpanfile', manager: 'cpanm' },
        { file: 'DESCRIPTION', manager: 'r' },
        { file: 'deps.edn', manager: 'clojure' },
        { file: 'project.clj', manager: 'leiningen' },
        { file: 'pubspec.yaml', manager: 'dart' },
        { file: 'pubspec.lock', manager: 'dart' },
        { file: 'Gemfile.lock', manager: 'bundler' },
        { file: 'Gemfile', manager: 'bundler' },
        { file: 'composer.lock', manager: 'composer' },
        { file: 'composer.json', manager: 'composer' },
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
              if (file === 'pubspec.yaml' || file === 'pubspec.lock') {
                return this.detectPubPackageManager(lockFilePath);
              }
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

    if (this.sourceSelector?.getCurrentProjectType() === 'php') {
      return 'composer';
    }
    if (this.sourceSelector?.getCurrentProjectType() === 'ruby') {
      return 'bundler';
    }
    if (this.sourceSelector?.getCurrentProjectType() === 'clojure') {
      return 'clojure';
    }
    if (this.sourceSelector?.getCurrentProjectType() === 'rust') {
      return 'cargo';
    }
    if (this.sourceSelector?.getCurrentProjectType() === 'go') {
      return 'go';
    }
    if (this.sourceSelector?.getCurrentProjectType() === 'perl') {
      return 'cpanm';
    }
    if (this.sourceSelector?.getCurrentProjectType() === 'dart') {
      return 'dart';
    }
    if (this.sourceSelector?.getCurrentProjectType() === 'flutter') {
      return 'flutter';
    }
    if (this.sourceSelector?.getCurrentProjectType() === 'r') {
      return 'r';
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
   * Detect package manager from workspace (simplified version without targetPath)
   * Checks for lock files to determine which package manager is being used
   */
  async detectPackageManagerSimple(): Promise<PackageManager> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return this.getConfiguredPackageManager();
    }

    const rootPath = workspaceFolder.uri.fsPath;
    
    try {
      // Use require for synchronous file system access in Node.js
      const fs = require('fs');
      const path = require('path');

      // Check for lock files (priority order: pnpm > yarn > npm)
      const lockFiles: Array<{ file: string; manager: PackageManager }> = [
        { file: 'go.mod', manager: 'go' },
        { file: 'Cargo.toml', manager: 'cargo' },
        { file: 'Cargo.lock', manager: 'cargo' },
        { file: 'cpanfile', manager: 'cpanm' },
        { file: 'DESCRIPTION', manager: 'r' },
        { file: 'deps.edn', manager: 'clojure' },
        { file: 'project.clj', manager: 'leiningen' },
        { file: 'pubspec.yaml', manager: 'dart' },
        { file: 'pubspec.lock', manager: 'dart' },
        { file: 'Gemfile.lock', manager: 'bundler' },
        { file: 'Gemfile', manager: 'bundler' },
        { file: 'composer.lock', manager: 'composer' },
        { file: 'composer.json', manager: 'composer' },
        { file: 'pnpm-lock.yaml', manager: 'pnpm' },
        { file: 'yarn.lock', manager: 'yarn' },
        { file: 'package-lock.json', manager: 'npm' },
      ];

      for (const { file, manager } of lockFiles) {
        try {
          const lockFilePath = path.join(rootPath, file);
          if (fs.existsSync(lockFilePath)) {
            if (file === 'pubspec.yaml' || file === 'pubspec.lock') {
              return this.detectPubPackageManager(lockFilePath);
            }
            return manager;
          }
        } catch {
          // Continue checking
        }
      }
    } catch {
      // If fs check fails, fall back to configured
    }

    if (this.sourceSelector?.getCurrentProjectType() === 'php') {
      return 'composer';
    }
    if (this.sourceSelector?.getCurrentProjectType() === 'ruby') {
      return 'bundler';
    }
    if (this.sourceSelector?.getCurrentProjectType() === 'clojure') {
      return 'clojure';
    }
    if (this.sourceSelector?.getCurrentProjectType() === 'rust') {
      return 'cargo';
    }
    if (this.sourceSelector?.getCurrentProjectType() === 'go') {
      return 'go';
    }
    if (this.sourceSelector?.getCurrentProjectType() === 'perl') {
      return 'cpanm';
    }
    if (this.sourceSelector?.getCurrentProjectType() === 'dart') {
      return 'dart';
    }
    if (this.sourceSelector?.getCurrentProjectType() === 'flutter') {
      return 'flutter';
    }
    if (this.sourceSelector?.getCurrentProjectType() === 'r') {
      return 'r';
    }

    return this.getConfiguredPackageManager();
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
      dotnet: `NuGet Gallery${workspaceSuffix}${targetSuffix}`,
      php: `Packagist Gallery${workspaceSuffix}${targetSuffix}`,
      ruby: `RubyGems Gallery${workspaceSuffix}${targetSuffix}`,
      clojure: `Clojars Gallery${workspaceSuffix}${targetSuffix}`,
      rust: `Cargo Gallery${workspaceSuffix}${targetSuffix}`,
      perl: `MetaCPAN Gallery${workspaceSuffix}${targetSuffix}`,
      dart: `pub.dev Gallery${workspaceSuffix}${targetSuffix}`,
      flutter: `Flutter Gallery${workspaceSuffix}${targetSuffix}`,
      r: `CRAN Gallery${workspaceSuffix}${targetSuffix}`,
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

  private getBuildToolForPath(targetPath?: string): BuildTool | null {
    if (!targetPath) {
      return null;
    }

    const normalized = targetPath.replace(/\\/g, '/').toLowerCase();
    const fileName = normalized.split('/').pop();
    switch (fileName) {
      case 'pom.xml':
        return 'maven';
      case 'build.gradle':
      case 'build.gradle.kts':
        return 'gradle';
      case 'build.sbt':
        return 'sbt';
      case 'build.sc':
        return 'mill';
      case 'ivy.xml':
        return 'ivy';
      case 'project.clj':
        return 'leiningen';
      case 'buildfile':
        return 'buildr';
      case 'grapeconfig.xml':
        return 'grape';
      default:
        return null;
    }
  }

  private isWithinWorkspace(
    candidatePath: string,
    workspaceRoot: string,
    pathModule: typeof import('path')
  ): boolean {
    const relative = pathModule.relative(workspaceRoot, candidatePath);
    return relative === '' || (!relative.startsWith('..') && !pathModule.isAbsolute(relative));
  }

  private resolveWorkspaceFolder(targetPath?: string): vscode.WorkspaceFolder | undefined {
    if (targetPath) {
      return vscode.workspace.getWorkspaceFolder(vscode.Uri.file(targetPath));
    }

    return vscode.window.activeTextEditor
      ? vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri)
      : vscode.workspace.workspaceFolders?.[0];
  }

  private detectPubPackageManager(manifestPath: string): PackageManager {
    try {
      const fs = require('fs') as typeof import('fs');
      const content = fs.readFileSync(manifestPath, 'utf8');
      if (/\bsdk\s*:\s*flutter\b/m.test(content) || /^\s*flutter\s*:\s*$/m.test(content)) {
        return 'flutter';
      }
    } catch {
      // Ignore and fall back to dart.
    }

    return 'dart';
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
