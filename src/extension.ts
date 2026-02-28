import * as vscode from 'vscode';
import { createApiClients } from './api';
import { initServices } from './services';
import {
  PackageHoverProvider,
  PackageCodeLensProvider,
  SearchViewProvider,
  InstalledPackagesProvider,
  UpdatesProvider,
  PackageJsonEditorProvider,
} from './providers';
import { registerCommands } from './commands';

/**
 * Extension activation
 */
export async function activate(context: vscode.ExtensionContext) {
  console.log('NPM Gallery: Activating...');

  // Initialize API clients
  createApiClients();

  // Initialize services with source detection
  const services = await initServices();
  const workspaceDisposables = services.workspace.initialize();
  context.subscriptions.push(...workspaceDisposables);

  // Create providers
  const hoverProvider = new PackageHoverProvider();
  const codeLensProvider = new PackageCodeLensProvider();
  const searchViewProvider = new SearchViewProvider(context.extensionUri);
  const installedProvider = new InstalledPackagesProvider();
  const updatesProvider = new UpdatesProvider();
  const packageJsonEditorProvider = new PackageJsonEditorProvider(context.extensionUri);

  // Register hover provider for package.json
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      { language: 'json', pattern: '**/package.json' },
      hoverProvider
    )
  );

  // Register CodeLens provider for package.json, pom.xml, and Gradle files
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { language: 'json', pattern: '**/package.json' },
      codeLensProvider
    )
  );

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { language: 'xml', pattern: '**/pom.xml' },
      codeLensProvider
    )
  );

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { scheme: 'file', pattern: '**/build.gradle' },
      codeLensProvider
    )
  );

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { scheme: 'file', pattern: '**/build.gradle.kts' },
      codeLensProvider
    )
  );

  // Register webview provider
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      SearchViewProvider.viewType,
      searchViewProvider
    )
  );

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      PackageJsonEditorProvider.viewType,
      packageJsonEditorProvider,
      {
        webviewOptions: { retainContextWhenHidden: true },
      }
    )
  );

  // Register tree view providers
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('npmGallery.installedView', installedProvider)
  );

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('npmGallery.updatesView', updatesProvider)
  );

  // Register commands
  registerCommands(context, {
    codelens: codeLensProvider,
    installed: installedProvider,
    updates: updatesProvider,
  });

  // Listen for workspace changes
  services.workspace.onDidChangePackages(async (scope) => {
    if (!scope) {
      services.package.invalidateLocalDependencyTreeCache();
      services.package.invalidateLatestVersionCache();
      await installedProvider.refresh();
      await updatesProvider.refresh();
      codeLensProvider.refresh();
      return;
    }

    const scopedInstalledPackages = await services.workspace.refreshInstalledPackages(scope);
    const registryPackageNames = scopedInstalledPackages
      .filter((pkg) => pkg.isRegistryResolvable !== false)
      .map((pkg) => pkg.name);

    services.package.invalidateLocalDependencyTreeCache(scope);
    services.package.invalidateLatestVersionCache(registryPackageNames);
    await installedProvider.refreshScope(scope, true);
    await updatesProvider.refreshScope(scope, true);
    codeLensProvider.refresh(scope);
  });

  // Initial check for updates (if enabled)
  const config = vscode.workspace.getConfiguration('npmGallery');
  if (config.get<boolean>('autoCheckUpdates', true)) {
    // Delay initial check to not block activation
    setTimeout(() => {
      updatesProvider.refresh();
    }, 3000);
  }

  console.log('NPM Gallery: Activated successfully');
}

/**
 * Extension deactivation
 */
export function deactivate() {
  console.log('NPM Gallery: Deactivated');
}
