import * as vscode from 'vscode';
import { getServices } from '../services';
import type { PackageCodeLensProvider, InstalledPackagesProvider, UpdatesProvider } from '../providers';
import { PackageDetailsPanel } from '../providers';

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
        ],
        { placeHolder: 'Select dependency type' }
      );

      if (!depType) return;

      const result = await services.install.install(packageName, {
        type: depType.label as 'dependencies' | 'devDependencies' | 'peerDependencies',
      });

      if (result.success) {
        vscode.window.showInformationMessage(result.message);
      } else {
        vscode.window.showErrorMessage(result.message);
      }
    })
  );

  // Update package
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'npmGallery.updatePackage',
      async (arg?: string | { pkg?: { name: string; latestVersion?: string } }, version?: string) => {
        let packageName: string | undefined;
        let targetVersion = version;

        // Handle TreeItem object from context menu
        if (arg && typeof arg === 'object' && 'pkg' in arg && arg.pkg) {
          packageName = arg.pkg.name;
          targetVersion = arg.pkg.latestVersion;
        } else if (typeof arg === 'string') {
          packageName = arg;
        }

        if (!packageName) {
          packageName = await vscode.window.showInputBox({
            prompt: 'Enter package name to update',
          });
        }

        if (!packageName) return;

        const result = await services.install.update(packageName, targetVersion);

        if (result.success) {
          vscode.window.showInformationMessage(result.message);
          providers.codelens.refresh();
          providers.updates.refresh();
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
          providers.codelens.refresh();
          providers.updates.refresh();
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
              await services.install.update(name, latestVersion);
              updateCount++;
            } catch {
              // Continue with other packages if one fails
            }
          }

          if (updateCount > 0) {
            vscode.window.showInformationMessage(
              `Updated ${updateCount} package(s) in ${section}`
            );
            providers.codelens.refresh();
            providers.updates.refresh();
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

          const terminal = vscode.window.createTerminal('NPM Gallery');
          terminal.show();

          const packageManager = await services.install.detectPackageManager();
          const commands: Record<string, string> = {
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
    vscode.commands.registerCommand('npmGallery.removePackage', async (arg?: string | { pkg?: { name: string } }) => {
      let packageName: string | undefined;

      // Handle TreeItem object from context menu
      if (arg && typeof arg === 'object' && 'pkg' in arg && arg.pkg) {
        packageName = arg.pkg.name;
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

      const result = await services.install.remove(packageName);

      if (result.success) {
        vscode.window.showInformationMessage(result.message);
        providers.installed.refresh();
      } else {
        vscode.window.showErrorMessage(result.message);
      }
    })
  );

  // Run security audit
  context.subscriptions.push(
    vscode.commands.registerCommand('npmGallery.runSecurityAudit', async () => {
      const terminal = vscode.window.createTerminal('NPM Gallery - Audit');
      terminal.show();

      const packageManager = await services.install.detectPackageManager();
      const commands: Record<string, string> = {
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
      async (arg?: string | { pkg?: { name: string } }, version?: string) => {
        let packageName: string | undefined;

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

        // If a version is provided (from vulnerability CodeLens), open security-only view for that version.
        // Otherwise open full package details view.
        if (version) {
          await PackageDetailsPanel.createOrShow(context.extensionUri, packageName, {
            installedVersion: version,
            securityOnly: true,
          });
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
}
