import * as vscode from 'vscode';
import { getServices } from '../services';
import type { PackageCodeLensProvider, InstalledPackagesProvider, UpdatesProvider } from '../providers';
import { DependencyAnalyzerPanel, PackageDetailsPanel } from '../providers';
import { PackageJsonEditorProvider, setPackageJsonEditorPreferredTab } from '../providers/package-json-editor-provider';
import type { WorkspacePackageScope } from '../types/package';
import { selectInstallTargetManifest } from '../utils/install-target';

/**
 * Register all commands
 */
export function registerCommands(
  context: vscode.ExtensionContext,
  providers: {
    codelens: PackageCodeLensProvider;
    installed: InstalledPackagesProvider;
    updates: UpdatesProvider;
  }
): void {
  const services = getServices();

  // Open NPM Gallery panel
  context.subscriptions.push(
    vscode.commands.registerCommand('npmGallery.openPanel', () => {
      vscode.commands.executeCommand('npmGallery.searchView.focus');
    })
  );

  // Search packages (opens panel with search)
  context.subscriptions.push(
    vscode.commands.registerCommand('npmGallery.searchPackages', async () => {
      const query = await vscode.window.showInputBox({
        prompt: 'Search packages',
        placeHolder: 'Enter package name or keywords',
      });

      if (query) {
        vscode.commands.executeCommand('npmGallery.searchView.focus');
        // The webview will need to handle this
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('npmGallery.refreshGroup', async (arg?: {
      workspaceFolderPath?: string;
      manifestPath?: string;
    }) => {
      const scope: WorkspacePackageScope | undefined = arg?.manifestPath
        ? { manifestPath: arg.manifestPath }
        : arg?.workspaceFolderPath
          ? { workspaceFolderPath: arg.workspaceFolderPath }
          : undefined;

      if (!scope) {
        services.package.invalidateLocalDependencyTreeCache();
        services.package.invalidateLatestVersionCache();
        await providers.installed.refresh();
        await providers.updates.refresh();
      } else {
        const scopedInstalledPackages = await services.workspace.refreshInstalledPackages(scope);
        services.package.invalidateLocalDependencyTreeCache(scope);
        services.package.invalidateLatestVersionCache(
          scopedInstalledPackages
            .filter((pkg) => pkg.isRegistryResolvable !== false)
            .map((pkg) => pkg.name)
        );
        await providers.installed.refreshScope(scope, true);
        await providers.updates.refreshScope(scope, true);
      }

      providers.codelens.refresh(scope);
    })
  );

  // Install package
  context.subscriptions.push(
    vscode.commands.registerCommand('npmGallery.installPackage', async (packageName?: string) => {
      if (!packageName) {
        packageName = await vscode.window.showInputBox({
          prompt: 'Enter package name to install',
          placeHolder: 'package-name or package-name@version',
        });
      }

      if (!packageName) return;

      const depType = await vscode.window.showQuickPick(
        [
          { label: 'dependencies', description: 'Production dependency' },
          { label: 'devDependencies', description: 'Development dependency' },
          { label: 'peerDependencies', description: 'Peer dependency' },
          { label: 'optionalDependencies', description: 'Optional dependency' },
        ],
        { placeHolder: 'Select dependency type' }
      );

      if (!depType) return;

      const targetManifestPath = await selectInstallTargetManifest(
        packageName,
        services.workspace,
        services.install,
        vscode.window.activeTextEditor?.document.uri.fsPath
      );
      if (!targetManifestPath && (await services.workspace.getPackageJsonFiles()).length > 1) {
        return;
      }

      const result = await services.install.install(
        packageName,
        {
          type: depType.label as 'dependencies' | 'devDependencies' | 'peerDependencies' | 'optionalDependencies',
        },
        targetManifestPath
      );

      if (result.success) {
        vscode.window.showInformationMessage(result.message);
        if (targetManifestPath) {
          const scope = { manifestPath: targetManifestPath };
          await providers.installed.refreshScope(scope);
          await providers.updates.refreshScope(scope, true);
          providers.codelens.refresh(scope);
        }
      } else {
        vscode.window.showErrorMessage(result.message);
      }
    })
  );

  // Update package
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'npmGallery.updatePackage',
      async (
        arg?: string | { pkg?: { name: string; latestVersion?: string; packageJsonPath?: string } },
        version?: string
      ) => {
        let packageName: string | undefined;
        let targetVersion = version;
        let targetPath: string | undefined;

        // Handle TreeItem object from context menu
        if (arg && typeof arg === 'object' && 'pkg' in arg && arg.pkg) {
          packageName = arg.pkg.name;
          targetVersion = arg.pkg.latestVersion;
          targetPath = arg.pkg.packageJsonPath;
        } else if (typeof arg === 'string') {
          packageName = arg;
        }

        if (!packageName) {
          packageName = await vscode.window.showInputBox({
            prompt: 'Enter package name to update',
          });
        }

        if (!packageName) return;

        const result = await services.install.update(packageName, targetVersion, targetPath);

        if (result.success) {
          vscode.window.showInformationMessage(result.message);
          if (targetPath) {
            const scope = { manifestPath: targetPath };
            services.package.invalidateLocalDependencyTreeCache(scope);
            services.package.invalidateLatestVersionCache([packageName]);
            await providers.installed.refreshScope(scope);
            await providers.updates.refreshScope(scope, true);
            providers.codelens.refresh(scope);
          } else {
            providers.codelens.refresh();
            providers.updates.refresh();
          }
        } else {
          vscode.window.showErrorMessage(result.message);
        }
      }
    )
  );

  // Update Maven dependency
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'npmGallery.updateMavenDependency',
      async (pomPath: string, groupId: string, artifactId: string, newVersion: string) => {
        const result = await services.workspace.updateMavenDependency(pomPath, groupId, artifactId, newVersion);
        
        if (result) {
          vscode.window.showInformationMessage(`Updated ${groupId}:${artifactId} to ${newVersion}`);
          const scope = { manifestPath: pomPath };
          await providers.installed.refreshScope(scope);
          await providers.updates.refreshScope(scope);
          providers.codelens.refresh(scope);
        } else {
          vscode.window.showErrorMessage(`Failed to update ${groupId}:${artifactId}`);
        }
      }
    )
  );

  // Update Gradle dependency
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'npmGallery.updateGradleDependency',
      async (gradlePath: string, groupId: string, artifactId: string, newVersion: string) => {
        const result = await services.workspace.updateGradleDependency(gradlePath, groupId, artifactId, newVersion);
        
        if (result) {
          vscode.window.showInformationMessage(`Updated ${groupId}:${artifactId} to ${newVersion}`);
          providers.codelens.refresh();
          providers.updates.refresh();
        } else {
          vscode.window.showErrorMessage(`Failed to update ${groupId}:${artifactId}`);
        }
      }
    )
  );

  // Update all packages
  context.subscriptions.push(
    vscode.commands.registerCommand('npmGallery.updateAllPackages', async (section?: string) => {
      const activeEditor = vscode.window.activeTextEditor;
      if (!activeEditor || !activeEditor.document.fileName.endsWith('package.json')) {
        vscode.window.showErrorMessage('Please open a package.json file');
        return;
      }

      const document = activeEditor.document;
      const text = document.getText();

      try {
        const packageJson = JSON.parse(text);

        // If section is specified, only update packages in that section
        if (section && packageJson[section]) {
          const confirm = await vscode.window.showWarningMessage(
            `Update all packages in "${section}"? This may include breaking changes.`,
            'Update',
            'Cancel'
          );

          if (confirm !== 'Update') return;

          // Get CodeLenses which already contain the list of packages that need updates
          const codeLenses = await providers.codelens.provideCodeLenses(document, new vscode.CancellationTokenSource().token);
          
          // Filter CodeLenses for individual package updates in this section
          // CodeLens command is 'npmGallery.updatePackage' with arguments [name, latestVersion]
          const packagesToUpdate: Array<{ name: string; latestVersion: string }> = [];
          
          for (const codeLens of codeLenses) {
            if (codeLens.command?.command === 'npmGallery.updatePackage' && codeLens.command.arguments) {
              const [name, latestVersion] = codeLens.command.arguments as [string, string];
              
              // Verify this package is in the target section
              if (packageJson[section] && packageJson[section][name]) {
                packagesToUpdate.push({ name, latestVersion });
              }
            }
          }

          if (packagesToUpdate.length === 0) {
            vscode.window.showInformationMessage('No packages to update in this section');
            return;
          }

          // Update each package individually using install command with version
          let updateCount = 0;
          for (const { name, latestVersion } of packagesToUpdate) {
            try {
              await services.install.update(name, latestVersion, document.uri.fsPath);
              updateCount++;
            } catch {
              // Continue with other packages if one fails
            }
          }

          if (updateCount > 0) {
            vscode.window.showInformationMessage(
              `Updated ${updateCount} package(s) in ${section}`
            );
            const scope = { manifestPath: document.uri.fsPath };
            await providers.installed.refreshScope(scope);
            await providers.updates.refreshScope(scope);
            providers.codelens.refresh(scope);
          } else {
            vscode.window.showWarningMessage('Failed to update packages');
          }
        } else {
          // No section specified, update all packages (original behavior)
          const confirm = await vscode.window.showWarningMessage(
            'Update all packages? This may include breaking changes.',
            'Update',
            'Cancel'
          );

          if (confirm !== 'Update') return;

          const terminal = vscode.window.createTerminal({
            name: 'NPM Gallery',
            cwd: activeEditor.document.uri,
          });
          terminal.show();

          const packageManager = await services.install.detectPackageManager(
            activeEditor.document.uri.fsPath
          );
          const commands: Record<string, string> = {
            bun: 'bun update',
            npm: 'npm update',
            yarn: 'yarn upgrade',
            pnpm: 'pnpm update',
          };

          terminal.sendText(commands[packageManager]);
        }
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to update packages: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    })
  );

  // Remove package
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'npmGallery.removePackage',
      async (arg?: string | { pkg?: { name: string; packageJsonPath?: string } }) => {
      let packageName: string | undefined;
      let targetPath: string | undefined;

      // Handle TreeItem object from context menu
      if (arg && typeof arg === 'object' && 'pkg' in arg && arg.pkg) {
        packageName = arg.pkg.name;
        targetPath = arg.pkg.packageJsonPath;
      } else if (typeof arg === 'string') {
        packageName = arg;
      }

      if (!packageName) {
        packageName = await vscode.window.showInputBox({
          prompt: 'Enter package name to remove',
        });
      }

      if (!packageName) return;

      const confirm = await vscode.window.showWarningMessage(
        `Remove ${packageName}?`,
        'Remove',
        'Cancel'
      );

      if (confirm !== 'Remove') return;

      const result = await services.install.remove(packageName, targetPath);

      if (result.success) {
        vscode.window.showInformationMessage(result.message);
        if (targetPath) {
          const scope = { manifestPath: targetPath };
          await providers.installed.refreshScope(scope);
          await providers.updates.refreshScope(scope);
          providers.codelens.refresh(scope);
        } else {
          providers.installed.refresh();
        }
      } else {
        vscode.window.showErrorMessage(result.message);
      }
    })
  );

  // Run security audit
  context.subscriptions.push(
    vscode.commands.registerCommand('npmGallery.runSecurityAudit', async () => {
      const terminal = vscode.window.createTerminal({
        name: 'NPM Gallery - Audit',
        cwd: vscode.window.activeTextEditor?.document.uri,
      });
      terminal.show();

      const packageManager = await services.install.detectPackageManager(
        vscode.window.activeTextEditor?.document.uri.fsPath
      );
      const commands: Record<string, string> = {
        bun: 'bun audit',
        npm: 'npm audit',
        yarn: 'yarn audit',
        pnpm: 'pnpm audit',
      };

      terminal.sendText(commands[packageManager]);
    })
  );

  // Show package details
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'npmGallery.showPackageDetails',
      async (
        arg?: string | { pkg?: { name: string } },
        options?: string | { installedVersion?: string; securityOnly?: boolean }
      ) => {
        let packageName: string | undefined;
        const normalizedOptions =
          typeof options === 'string' ? { installedVersion: options } : options;

        // Handle TreeItem object from context menu
        if (arg && typeof arg === 'object' && 'pkg' in arg && arg.pkg) {
          packageName = arg.pkg.name;
        } else if (typeof arg === 'string') {
          packageName = arg;
        }

        if (!packageName) {
          packageName = await vscode.window.showInputBox({
            prompt: 'Enter package name',
          });
        }

        if (!packageName) return;

        if (normalizedOptions) {
          await PackageDetailsPanel.createOrShow(context.extensionUri, packageName, normalizedOptions);
        } else {
          await PackageDetailsPanel.createOrShow(context.extensionUri, packageName);
        }
      }
    )
  );

  // Refresh views
  context.subscriptions.push(
    vscode.commands.registerCommand('npmGallery.refreshView', () => {
      providers.codelens.refresh();
      providers.installed.refresh();
      providers.updates.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('npmGallery.showWorkspaceGraph', async () => {
      await DependencyAnalyzerPanel.createOrShow(context.extensionUri, { mode: 'workspace' });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('npmGallery.openDependencyAnalyzer', async (uri?: vscode.Uri) => {
      const targetUri =
        uri ||
        (vscode.window.activeTextEditor?.document.fileName.endsWith('package.json')
          ? vscode.window.activeTextEditor.document.uri
          : undefined);
      if (!targetUri) {
        vscode.window.showErrorMessage('Open a package.json file first.');
        return;
      }

      setPackageJsonEditorPreferredTab(targetUri.fsPath, 'analyzer');
      await vscode.commands.executeCommand(
        'vscode.openWith',
        targetUri,
        PackageJsonEditorProvider.viewType
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('npmGallery.setPackageJsonEditorDefault', async () => {
      const config = vscode.workspace.getConfiguration('workbench');
      const current = config.get<Record<string, string>>('editorAssociations') ?? {};
      const next: Record<string, string> = { ...current, '**/package.json': PackageJsonEditorProvider.viewType };
      await config.update('editorAssociations', next, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(
        'NPM Gallery is now the default editor for package.json. Newly opened package.json files will show Text + Dependency Analyzer tabs.'
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('npmGallery.alignWorkspaceDependencyVersions', async () => {
      const graph = await services.workspace.getWorkspaceProjectGraph();
      if (graph.alignmentIssues.length === 0) {
        vscode.window.showInformationMessage('No workspace dependency version mismatches found.');
        return;
      }

      const dependencyPick = await vscode.window.showQuickPick(
        graph.alignmentIssues.map((issue) => ({
          label: issue.packageName,
          description: `${issue.consumers.length} usages`,
          detail: issue.specs.join(' , '),
          issue,
        })),
        {
          title: 'Align workspace dependency versions',
          placeHolder: 'Select a dependency with mismatched versions',
          matchOnDescription: true,
          matchOnDetail: true,
        }
      );

      if (!dependencyPick) {
        return;
      }

      const latestVersion = await services.package.getLatestVersion(dependencyPick.issue.packageName);
      const versionCandidates = [...dependencyPick.issue.specs];
      if (latestVersion && !versionCandidates.includes(latestVersion)) {
        versionCandidates.unshift(latestVersion);
      }

      const targetVersionPick = await vscode.window.showQuickPick(
        versionCandidates.map((version) => ({
          label: version,
          description: latestVersion === version ? 'latest' : undefined,
        })),
        {
          title: `Align ${dependencyPick.issue.packageName}`,
          placeHolder: 'Select the target version/spec to apply across the workspace',
        }
      );

      if (!targetVersionPick) {
        return;
      }

      const updatedManifests = await services.workspace.alignWorkspaceDependencyVersions(
        dependencyPick.issue.packageName,
        targetVersionPick.label
      );

      if (updatedManifests === 0) {
        vscode.window.showInformationMessage(
          `No changes needed for ${dependencyPick.issue.packageName}.`
        );
        return;
      }

      services.package.invalidateLatestVersionCache([dependencyPick.issue.packageName]);
      services.package.invalidateLocalDependencyTreeCache();
      await providers.installed.refresh();
      await providers.updates.refresh();
      providers.codelens.refresh();
      vscode.window.showInformationMessage(
        `Aligned ${dependencyPick.issue.packageName} in ${updatedManifests} manifest(s).`
      );
    })
  );
}
