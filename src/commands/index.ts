import * as vscode from 'vscode';
import { getServices } from '../services';
import type { PackageCodeLensProvider, InstalledPackagesProvider, UpdatesProvider } from '../providers';

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
        prompt: 'Search npm packages',
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

  // Update all packages
  context.subscriptions.push(
    vscode.commands.registerCommand('npmGallery.updateAllPackages', async (_section?: string) => {
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
    vscode.commands.registerCommand('npmGallery.showPackageDetails', async (arg?: string | { pkg?: { name: string } }) => {
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

      // Focus the webview and send message to show details
      vscode.commands.executeCommand('npmGallery.searchView.focus');
    })
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
