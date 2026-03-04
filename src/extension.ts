import * as vscode from 'vscode';
import { createApiClients } from './api';
import { initServices } from './services';
import type { WorkspacePackageScope } from './types/package';
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
  // PackageJsonEditorProvider is no longer used - package.json opens with default editor

  // Register hover providers for package manifests
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      { language: 'json', pattern: '**/package.json' },
      hoverProvider
    )
  );

  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      { language: 'json', pattern: '**/composer.json' },
      hoverProvider
    )
  );

  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      { language: 'json', pattern: '**/composer.lock' },
      hoverProvider
    )
  );

  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      { language: 'xml', pattern: '**/Directory.Packages.props' },
      hoverProvider
    )
  );

  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      { language: 'xml', pattern: '**/packages.config' },
      hoverProvider
    )
  );

  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      { language: 'xml', pattern: '**/*.csproj' },
      hoverProvider
    )
  );

  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      { language: 'xml', pattern: '**/*.vbproj' },
      hoverProvider
    )
  );

  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      { language: 'xml', pattern: '**/*.fsproj' },
      hoverProvider
    )
  );

  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      { scheme: 'file', pattern: '**/paket.dependencies' },
      hoverProvider
    )
  );

  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      { scheme: 'file', pattern: '**/*.cake' },
      hoverProvider
    )
  );

  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      { scheme: 'file', pattern: '**/Gemfile' },
      hoverProvider
    )
  );

  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      { scheme: 'file', pattern: '**/Gemfile.lock' },
      hoverProvider
    )
  );

  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      { scheme: 'file', pattern: '**/cpanfile' },
      hoverProvider
    )
  );

  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      { scheme: 'file', pattern: '**/cpanfile.snapshot' },
      hoverProvider
    )
  );

  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      { scheme: 'file', pattern: '**/pubspec.yaml' },
      hoverProvider
    )
  );

  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      { scheme: 'file', pattern: '**/pubspec.lock' },
      hoverProvider
    )
  );

  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      { scheme: 'file', pattern: '**/DESCRIPTION' },
      hoverProvider
    )
  );

  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      { scheme: 'file', pattern: '**/deps.edn' },
      hoverProvider
    )
  );

  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      { scheme: 'file', pattern: '**/project.clj' },
      hoverProvider
    )
  );

  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      { scheme: 'file', pattern: '**/Cargo.toml' },
      hoverProvider
    )
  );

  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      { scheme: 'file', pattern: '**/Cargo.lock' },
      hoverProvider
    )
  );

  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      { scheme: 'file', pattern: '**/go.mod' },
      hoverProvider
    )
  );

  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      { language: 'xml', pattern: '**/pom.xml' },
      hoverProvider
    )
  );

  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      { scheme: 'file', pattern: '**/build.gradle' },
      hoverProvider
    )
  );

  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      { scheme: 'file', pattern: '**/build.gradle.kts' },
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
      { language: 'json', pattern: '**/composer.json' },
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

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { language: 'xml', pattern: '**/Directory.Packages.props' },
      codeLensProvider
    )
  );

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { language: 'xml', pattern: '**/packages.config' },
      codeLensProvider
    )
  );

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { language: 'xml', pattern: '**/*.csproj' },
      codeLensProvider
    )
  );

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { language: 'xml', pattern: '**/*.vbproj' },
      codeLensProvider
    )
  );

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { language: 'xml', pattern: '**/*.fsproj' },
      codeLensProvider
    )
  );

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { scheme: 'file', pattern: '**/paket.dependencies' },
      codeLensProvider
    )
  );

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { scheme: 'file', pattern: '**/*.cake' },
      codeLensProvider
    )
  );

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { scheme: 'file', pattern: '**/Gemfile' },
      codeLensProvider
    )
  );

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { scheme: 'file', pattern: '**/cpanfile' },
      codeLensProvider
    )
  );

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { scheme: 'file', pattern: '**/pubspec.yaml' },
      codeLensProvider
    )
  );

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { scheme: 'file', pattern: '**/DESCRIPTION' },
      codeLensProvider
    )
  );

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { scheme: 'file', pattern: '**/*.Rproj' },
      codeLensProvider
    )
  );

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { scheme: 'file', pattern: '**/deps.edn' },
      codeLensProvider
    )
  );

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { scheme: 'file', pattern: '**/project.clj' },
      codeLensProvider
    )
  );

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { scheme: 'file', pattern: '**/Cargo.toml' },
      codeLensProvider
    )
  );

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { scheme: 'file', pattern: '**/go.mod' },
      codeLensProvider
    )
  );

  // Register webview provider
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      SearchViewProvider.viewType,
      searchViewProvider,
      {
        webviewOptions: { retainContextWhenHidden: true },
      }
    )
  );

  // Custom editor provider for package.json is disabled - using default editor instead
  // context.subscriptions.push(
  //   vscode.window.registerCustomEditorProvider(
  //     PackageJsonEditorProvider.viewType,
  //     packageJsonEditorProvider,
  //     {
  //       webviewOptions: { retainContextWhenHidden: true },
  //     }
  //   )
  // );

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

  const pendingRefreshScopes = new Map<string, WorkspacePackageScope | undefined>();
  let pendingRefreshTimer: ReturnType<typeof setTimeout> | undefined;
  let refreshQueue = Promise.resolve();
  const queueRefresh = (scope?: WorkspacePackageScope) => {
    const key = scope?.manifestPath || (scope?.workspaceFolderPath ? `workspace:${scope.workspaceFolderPath}` : 'all');
    pendingRefreshScopes.set(key, scope);

    if (pendingRefreshTimer) {
      clearTimeout(pendingRefreshTimer);
    }

    pendingRefreshTimer = setTimeout(() => {
      pendingRefreshTimer = undefined;
      const scopes = [...pendingRefreshScopes.values()];
      pendingRefreshScopes.clear();
      refreshQueue = refreshQueue
        .then(async () => {
          if (scopes.some((item) => !item)) {
            services.package.invalidateLocalDependencyTreeCache();
            services.package.invalidateLatestVersionCache();
            await installedProvider.refresh();
            await updatesProvider.refresh();
            codeLensProvider.refresh();
            return;
          }

          const uniqueScopes = new Map<string, WorkspacePackageScope>();
          for (const item of scopes) {
            if (!item) {
              continue;
            }
            const scopeKey = item.manifestPath || `workspace:${item.workspaceFolderPath || ''}`;
            uniqueScopes.set(scopeKey, item);
          }

          for (const item of uniqueScopes.values()) {
            const scopedInstalledPackages = await services.workspace.refreshInstalledPackages(item);
            const registryPackageNames = scopedInstalledPackages
              .filter((pkg) => pkg.isRegistryResolvable !== false)
              .map((pkg) => pkg.name);

            services.package.invalidateLocalDependencyTreeCache(item);
            services.package.invalidateLatestVersionCache(registryPackageNames);
            await installedProvider.refreshScope(item, true);
            await updatesProvider.refreshScope(item, true);
            codeLensProvider.refresh(item);
          }
        })
        .catch((error) => {
          console.error('NPM Gallery: Failed to refresh package views', error);
        });
    }, 200);
  };
  context.subscriptions.push(new vscode.Disposable(() => {
    if (pendingRefreshTimer) {
      clearTimeout(pendingRefreshTimer);
    }
  }));

  // Listen for workspace changes
  services.workspace.onDidChangePackages((scope) => {
    queueRefresh(scope);
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
