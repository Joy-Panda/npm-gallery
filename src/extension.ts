import * as vscode from 'vscode';
import { createApiClients } from './api';
import { getServices } from './services';
import {
  PackageHoverProvider,
  PackageCodeLensProvider,
  SearchViewProvider,
  InstalledPackagesProvider,
  UpdatesProvider,
} from './providers';
import { registerCommands } from './commands';

/**
 * Extension activation
 */
export function activate(context: vscode.ExtensionContext) {
  console.log('NPM Gallery: Activating...');

  // Initialize API clients
  createApiClients();

  // Initialize services
  const services = getServices();
  const workspaceDisposables = services.workspace.initialize();
  context.subscriptions.push(...workspaceDisposables);

  // Create providers
  const hoverProvider = new PackageHoverProvider();
  const codeLensProvider = new PackageCodeLensProvider();
  const searchViewProvider = new SearchViewProvider(context.extensionUri);
  const installedProvider = new InstalledPackagesProvider();
  const updatesProvider = new UpdatesProvider();

  // Register hover provider for package.json
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      { language: 'json', pattern: '**/package.json' },
      hoverProvider
    )
  );

  // Register CodeLens provider for package.json
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { language: 'json', pattern: '**/package.json' },
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
  services.workspace.onDidChangePackages(() => {
    installedProvider.refresh();
    updatesProvider.refresh();
    codeLensProvider.refresh();
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
