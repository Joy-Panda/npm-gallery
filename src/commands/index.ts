import * as vscode from 'vscode';
import { getServices } from '../services';
import type { PackageCodeLensProvider, InstalledPackagesProvider, UpdatesProvider } from '../providers';
import { DependencyAnalyzerPanel, PackageDetailsPanel } from '../providers';
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

      const projectType = services.getCurrentProjectType();
      const currentSource = services.getCurrentSourceType();
      const targetManifestPath = await selectInstallTargetManifest(
        packageName,
        services.workspace,
        services.install,
        vscode.window.activeTextEditor?.document.uri.fsPath,
        projectType,
        currentSource
      );
      const manifestFiles = projectType === 'dotnet' || currentSource === 'nuget'
        ? await services.workspace.getDotNetManifestFiles()
        : projectType === 'php' || currentSource === 'packagist'
          ? await services.workspace.getComposerManifestFiles()
          : projectType === 'ruby' || currentSource === 'rubygems'
            ? await services.workspace.getRubyManifestFiles()
            : projectType === 'perl' || currentSource === 'metacpan'
              ? await services.workspace.getPerlManifestFiles()
              : projectType === 'dart' || projectType === 'flutter' || currentSource === 'pub-dev'
                ? await services.workspace.getPubManifestFiles()
                : projectType === 'r' || currentSource === 'cran'
                  ? await services.workspace.getRManifestFiles()
            : projectType === 'clojure' || currentSource === 'clojars'
              ? await services.workspace.getClojureManifestFiles()
              : projectType === 'rust' || currentSource === 'crates-io'
                ? await services.workspace.getCargoManifestFiles()
                : projectType === 'go' || currentSource === 'pkg-go-dev'
                  ? await services.workspace.getGoManifestFiles()
                : await services.workspace.getPackageJsonFiles();
      if (!targetManifestPath && manifestFiles.length > 1) {
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
        let manifestUpdatedDirectly = false;

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

        const attemptDirectManifestUpdate = async (): Promise<boolean> => {
          const manifestPath = targetPath || vscode.window.activeTextEditor?.document.uri.fsPath;
          if (!manifestPath?.endsWith('package.json') || !targetVersion) {
            return false;
          }

          try {
            const packageJson = await services.workspace.getPackageJson(vscode.Uri.file(manifestPath));
            if (!packageJson) {
              return false;
            }

            const depTypes: Array<'dependencies' | 'devDependencies' | 'peerDependencies' | 'optionalDependencies'> = [
              'dependencies',
              'devDependencies',
              'peerDependencies',
              'optionalDependencies',
            ];

            for (const depType of depTypes) {
              const deps = packageJson[depType];
              if (deps && typeof deps === 'object' && packageName in deps) {
                const updated = await services.workspace.updatePackageJson(
                  vscode.Uri.file(manifestPath),
                  packageName,
                  targetVersion,
                  depType
                );
                if (updated) {
                  targetPath = manifestPath;
                  manifestUpdatedDirectly = true;
                  return true;
                }
              }
            }
          } catch {
            return false;
          }

          return false;
        };

        let result = await services.install.update(packageName, targetVersion, targetPath);
        if (!result.success) {
          const currentSource = services.getCurrentSourceType();
          if (currentSource === 'libraries-io' && await attemptDirectManifestUpdate()) {
            result = {
              success: true,
              message: `Updated ${packageName} to ${targetVersion}`,
            };
          }
        }

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
          if (manifestUpdatedDirectly && targetPath) {
            await providers.installed.refreshScope({ manifestPath: targetPath });
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
          const scope = { manifestPath: gradlePath };
          await providers.installed.refreshScope(scope);
          await providers.updates.refreshScope(scope);
          providers.codelens.refresh(scope);
        } else {
          vscode.window.showErrorMessage(`Failed to update ${groupId}:${artifactId}`);
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'npmGallery.updateAllSonatypeDependencies',
      async (sourcePath?: string) => {
        const activeEditor = vscode.window.activeTextEditor;
        const targetPath = sourcePath || activeEditor?.document.uri.fsPath;
        if (!targetPath || (!targetPath.endsWith('pom.xml') && !targetPath.endsWith('build.gradle') && !targetPath.endsWith('build.gradle.kts'))) {
          vscode.window.showErrorMessage('Please open a pom.xml, build.gradle, or build.gradle.kts file');
          return;
        }

        const confirm = await vscode.window.showWarningMessage(
          'Update all Sonatype dependencies? This may include breaking changes.',
          'Update',
          'Cancel'
        );
        if (confirm !== 'Update') {
          return;
        }

        const document = activeEditor && activeEditor.document.uri.fsPath === targetPath
          ? activeEditor.document
          : await vscode.workspace.openTextDocument(vscode.Uri.file(targetPath));
        const codeLenses = await providers.codelens.provideCodeLenses(document, new vscode.CancellationTokenSource().token);
        const updateCommand = targetPath.endsWith('pom.xml')
          ? 'npmGallery.updateMavenDependency'
          : 'npmGallery.updateGradleDependency';
        const updates = new Map<string, { groupId: string; artifactId: string; version: string }>();

        for (const codeLens of codeLenses) {
          if (codeLens.command?.command !== updateCommand || !codeLens.command.arguments) {
            continue;
          }

          const [, groupId, artifactId, version] = codeLens.command.arguments as [string, string, string, string];
          if (!groupId || !artifactId || !version) {
            continue;
          }

          updates.set(`${groupId}:${artifactId}`, { groupId, artifactId, version });
        }

        if (updates.size === 0) {
          vscode.window.showInformationMessage('No Sonatype dependencies to update');
          return;
        }

        let updateCount = 0;
        for (const update of updates.values()) {
          const result = targetPath.endsWith('pom.xml')
            ? await services.workspace.updateMavenDependency(targetPath, update.groupId, update.artifactId, update.version)
            : await services.workspace.updateGradleDependency(targetPath, update.groupId, update.artifactId, update.version);
          if (result) {
            updateCount += 1;
          }
        }

        if (updateCount === 0) {
          vscode.window.showWarningMessage('Failed to update Sonatype dependencies');
          return;
        }

        vscode.window.showInformationMessage(`Updated ${updateCount} Sonatype dependenc${updateCount === 1 ? 'y' : 'ies'}`);
        const scope = { manifestPath: targetPath };
        await providers.installed.refreshScope(scope);
        await providers.updates.refreshScope(scope);
        providers.codelens.refresh(scope);
      }
    )
  );

  // Update CPM package (Directory.Packages.props)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'npmGallery.updateCpmPackage',
      async (propsPath: string, packageId: string, newVersion: string) => {
        const result = await services.workspace.updateCpmPackage(propsPath, packageId, newVersion);
        if (result) {
          vscode.window.showInformationMessage(`Updated ${packageId} to ${newVersion}`);
          const scope = { manifestPath: propsPath };
          await providers.installed.refreshScope(scope);
          await providers.updates.refreshScope(scope);
          providers.codelens.refresh(scope);
        } else {
          vscode.window.showErrorMessage(`Failed to update ${packageId}`);
        }
      }
    )
  );

  // Update Paket dependency (paket.dependencies)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'npmGallery.updatePaketDependency',
      async (depsPath: string, packageId: string, newVersion: string) => {
        const result = await services.workspace.updatePaketDependency(depsPath, packageId, newVersion);
        if (result) {
          vscode.window.showInformationMessage(`Updated ${packageId} to ${newVersion}`);
          const scope = { manifestPath: depsPath };
          await providers.installed.refreshScope(scope);
          await providers.updates.refreshScope(scope);
          providers.codelens.refresh(scope);
        } else {
          vscode.window.showErrorMessage(`Failed to update ${packageId}`);
        }
      }
    )
  );

  // Update Cake addin/tool (.cake)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'npmGallery.updateCakePackage',
      async (cakePath: string, packageId: string, newVersion: string, kind: 'addin' | 'tool') => {
        const result = await services.workspace.updateCakePackage(cakePath, packageId, newVersion, kind);
        if (result) {
          vscode.window.showInformationMessage(`Updated ${packageId} (${kind}) to ${newVersion}`);
          const scope = { manifestPath: cakePath };
          await providers.installed.refreshScope(scope);
          await providers.updates.refreshScope(scope);
          providers.codelens.refresh(scope);
        } else {
          vscode.window.showErrorMessage(`Failed to update ${packageId}`);
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'npmGallery.updatePackagesConfigPackage',
      async (configPath: string, packageId: string, newVersion: string) => {
        const result = await services.workspace.updatePackagesConfigPackage(configPath, packageId, newVersion);
        if (result) {
          vscode.window.showInformationMessage(`Updated ${packageId} to ${newVersion}`);
          const scope = { manifestPath: configPath };
          await providers.installed.refreshScope(scope);
          await providers.updates.refreshScope(scope);
          providers.codelens.refresh(scope);
        } else {
          vscode.window.showErrorMessage(`Failed to update ${packageId}`);
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'npmGallery.updateProjectPackageReference',
      async (projectPath: string, packageId: string, newVersion: string) => {
        const result = await services.workspace.updateProjectPackageReference(projectPath, packageId, newVersion);
        if (result) {
          vscode.window.showInformationMessage(`Updated ${packageId} to ${newVersion}`);
          const scope = { manifestPath: projectPath };
          await providers.installed.refreshScope(scope);
          await providers.updates.refreshScope(scope);
          providers.codelens.refresh(scope);
        } else {
          vscode.window.showErrorMessage(`Failed to update ${packageId}`);
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'npmGallery.updateDepsEdnDependency',
      async (depsPath: string, packageId: string, newVersion: string) => {
        const result = await services.workspace.updateDepsEdnDependency(depsPath, packageId, newVersion);
        if (result) {
          vscode.window.showInformationMessage(`Updated ${packageId} to ${newVersion}`);
          const scope = { manifestPath: depsPath };
          await providers.installed.refreshScope(scope);
          await providers.updates.refreshScope(scope);
          providers.codelens.refresh(scope);
        } else {
          vscode.window.showErrorMessage(`Failed to update ${packageId}`);
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'npmGallery.updateLeiningenDependency',
      async (projectPath: string, packageId: string, newVersion: string) => {
        const result = await services.workspace.updateLeiningenDependency(projectPath, packageId, newVersion);
        if (result) {
          vscode.window.showInformationMessage(`Updated ${packageId} to ${newVersion}`);
          const scope = { manifestPath: projectPath };
          await providers.installed.refreshScope(scope);
          await providers.updates.refreshScope(scope);
          providers.codelens.refresh(scope);
        } else {
          vscode.window.showErrorMessage(`Failed to update ${packageId}`);
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'npmGallery.updateAllClojureDependencies',
      async (sourcePath?: string) => {
        const activeEditor = vscode.window.activeTextEditor;
        const targetPath = sourcePath || activeEditor?.document.uri.fsPath;
        if (!targetPath || (!targetPath.endsWith('deps.edn') && !targetPath.endsWith('project.clj'))) {
          vscode.window.showErrorMessage('Please open a deps.edn or project.clj file');
          return;
        }

        const confirm = await vscode.window.showWarningMessage(
          'Update all Clojure dependencies? This may include breaking changes.',
          'Update',
          'Cancel'
        );
        if (confirm !== 'Update') {
          return;
        }

        const document = activeEditor && activeEditor.document.uri.fsPath === targetPath
          ? activeEditor.document
          : await vscode.workspace.openTextDocument(vscode.Uri.file(targetPath));
        const codeLenses = await providers.codelens.provideCodeLenses(document, new vscode.CancellationTokenSource().token);
        const updates = new Map<string, string>();
        const updateCommand = targetPath.endsWith('deps.edn')
          ? 'npmGallery.updateDepsEdnDependency'
          : 'npmGallery.updateLeiningenDependency';

        for (const codeLens of codeLenses) {
          if (codeLens.command?.command !== updateCommand || !codeLens.command.arguments) {
            continue;
          }
          const [, packageId, version] = codeLens.command.arguments as [string, string, string];
          if (!packageId || !version) {
            continue;
          }
          updates.set(packageId, version);
        }

        if (updates.size === 0) {
          vscode.window.showInformationMessage('No Clojure dependencies to update');
          return;
        }

        let updateCount = 0;
        for (const [packageId, version] of updates) {
          const result = targetPath.endsWith('deps.edn')
            ? await services.workspace.updateDepsEdnDependency(targetPath, packageId, version)
            : await services.workspace.updateLeiningenDependency(targetPath, packageId, version);
          if (result) {
            updateCount += 1;
          }
        }

        if (updateCount === 0) {
          vscode.window.showWarningMessage('Failed to update Clojure dependencies');
          return;
        }

        vscode.window.showInformationMessage(`Updated ${updateCount} Clojure dependenc${updateCount === 1 ? 'y' : 'ies'}`);
        const scope = { manifestPath: targetPath };
        await providers.installed.refreshScope(scope);
        await providers.updates.refreshScope(scope);
        providers.codelens.refresh(scope);
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'npmGallery.updateCargoDependency',
      async (cargoPath: string, packageId: string, newVersion: string) => {
        const result = await services.workspace.updateCargoDependency(cargoPath, packageId, newVersion);
        if (result) {
          vscode.window.showInformationMessage(`Updated ${packageId} to ${newVersion}`);
          const scope = { manifestPath: cargoPath };
          await providers.installed.refreshScope(scope);
          await providers.updates.refreshScope(scope);
          providers.codelens.refresh(scope);
        } else {
          vscode.window.showErrorMessage(`Failed to update ${packageId}`);
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'npmGallery.updateGoDependency',
      async (goModPath: string, packageId: string, newVersion: string) => {
        const result = await services.workspace.updateGoDependency(goModPath, packageId, newVersion);
        if (result) {
          vscode.window.showInformationMessage(`Updated ${packageId} to ${newVersion}`);
          const scope = { manifestPath: goModPath };
          await providers.installed.refreshScope(scope);
          await providers.updates.refreshScope(scope);
          providers.codelens.refresh(scope);
        } else {
          vscode.window.showErrorMessage(`Failed to update ${packageId}`);
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'npmGallery.updateAllGoDependencies',
      async (sourcePath?: string) => {
        const activeEditor = vscode.window.activeTextEditor;
        const targetPath = sourcePath || activeEditor?.document.uri.fsPath;
        if (!targetPath || !targetPath.endsWith('go.mod')) {
          vscode.window.showErrorMessage('Please open a go.mod file');
          return;
        }

        const confirm = await vscode.window.showWarningMessage(
          'Update all Go dependencies? This may include breaking changes.',
          'Update',
          'Cancel'
        );
        if (confirm !== 'Update') {
          return;
        }

        const document = activeEditor && activeEditor.document.uri.fsPath === targetPath
          ? activeEditor.document
          : await vscode.workspace.openTextDocument(vscode.Uri.file(targetPath));
        const codeLenses = await providers.codelens.provideCodeLenses(document, new vscode.CancellationTokenSource().token);
        const updates = new Map<string, string>();

        for (const codeLens of codeLenses) {
          if (codeLens.command?.command !== 'npmGallery.updateGoDependency' || !codeLens.command.arguments) {
            continue;
          }

          const [, packageId, version] = codeLens.command.arguments as [string, string, string];
          if (!packageId || !version) {
            continue;
          }

          updates.set(packageId, version);
        }

        if (updates.size === 0) {
          vscode.window.showInformationMessage('No Go dependencies to update');
          return;
        }

        let updateCount = 0;
        for (const [packageId, version] of updates) {
          const result = await services.workspace.updateGoDependency(targetPath, packageId, version);
          if (result) {
            updateCount += 1;
          }
        }

        if (updateCount === 0) {
          vscode.window.showWarningMessage('Failed to update Go dependencies');
          return;
        }

        vscode.window.showInformationMessage(`Updated ${updateCount} Go dependenc${updateCount === 1 ? 'y' : 'ies'}`);
        const scope = { manifestPath: targetPath };
        await providers.installed.refreshScope(scope);
        await providers.updates.refreshScope(scope);
        providers.codelens.refresh(scope);
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'npmGallery.updateAllCargoDependencies',
      async (sourcePath?: string) => {
        const activeEditor = vscode.window.activeTextEditor;
        const targetPath = sourcePath || activeEditor?.document.uri.fsPath;
        if (!targetPath || (!targetPath.endsWith('Cargo.toml') && !targetPath.endsWith('Cargo.lock'))) {
          vscode.window.showErrorMessage('Please open a Cargo.toml or Cargo.lock file');
          return;
        }

        const manifestPath = targetPath.endsWith('Cargo.lock')
          ? targetPath.replace(/cargo\.lock$/i, 'Cargo.toml')
          : targetPath;

        const confirm = await vscode.window.showWarningMessage(
          'Update all Cargo dependencies? This may include breaking changes.',
          'Update',
          'Cancel'
        );
        if (confirm !== 'Update') {
          return;
        }

        const document = activeEditor && activeEditor.document.uri.fsPath === targetPath
          ? activeEditor.document
          : await vscode.workspace.openTextDocument(vscode.Uri.file(targetPath));
        const codeLenses = await providers.codelens.provideCodeLenses(document, new vscode.CancellationTokenSource().token);
        const updates = new Map<string, string>();

        for (const codeLens of codeLenses) {
          if (codeLens.command?.command !== 'npmGallery.updateCargoDependency' || !codeLens.command.arguments) {
            continue;
          }

          const [, packageId, version] = codeLens.command.arguments as [string, string, string];
          if (!packageId || !version) {
            continue;
          }

          updates.set(packageId, version);
        }

        if (updates.size === 0) {
          vscode.window.showInformationMessage('No Cargo dependencies to update');
          return;
        }

        let updateCount = 0;
        for (const [packageId, version] of updates) {
          const result = await services.workspace.updateCargoDependency(manifestPath, packageId, version);
          if (result) {
            updateCount += 1;
          }
        }

        if (updateCount === 0) {
          vscode.window.showWarningMessage('Failed to update Cargo dependencies');
          return;
        }

        vscode.window.showInformationMessage(`Updated ${updateCount} Cargo dependenc${updateCount === 1 ? 'y' : 'ies'}`);
        const scope = { manifestPath };
        await providers.installed.refreshScope(scope);
        await providers.updates.refreshScope(scope);
        providers.codelens.refresh(scope);
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'npmGallery.updatePerlDependency',
      async (cpanfilePath: string, packageId: string, newVersion: string) => {
        const result = await services.workspace.updatePerlDependency(cpanfilePath, packageId, newVersion);
        if (result) {
          vscode.window.showInformationMessage(`Updated ${packageId} to ${newVersion}`);
          const scope = { manifestPath: cpanfilePath };
          await providers.installed.refreshScope(scope);
          await providers.updates.refreshScope(scope);
          providers.codelens.refresh(scope);
        } else {
          vscode.window.showErrorMessage(`Failed to update ${packageId}`);
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'npmGallery.updateAllPerlDependencies',
      async (sourcePath?: string) => {
        const activeEditor = vscode.window.activeTextEditor;
        const targetPath = sourcePath || activeEditor?.document.uri.fsPath;
        if (!targetPath || (!targetPath.endsWith('cpanfile') && !targetPath.endsWith('cpanfile.snapshot'))) {
          vscode.window.showErrorMessage('Please open a cpanfile or cpanfile.snapshot file');
          return;
        }

        const confirm = await vscode.window.showWarningMessage(
          'Update all Perl dependencies? This may include breaking changes.',
          'Update',
          'Cancel'
        );
        if (confirm !== 'Update') {
          return;
        }

        const document = activeEditor && activeEditor.document.uri.fsPath === targetPath
          ? activeEditor.document
          : await vscode.workspace.openTextDocument(vscode.Uri.file(targetPath));
        const codeLenses = await providers.codelens.provideCodeLenses(document, new vscode.CancellationTokenSource().token);
        const updates = new Map<string, { manifestPath: string; version: string }>();

        for (const codeLens of codeLenses) {
          if (codeLens.command?.command !== 'npmGallery.updatePerlDependency' || !codeLens.command.arguments) {
            continue;
          }
          const [manifestPath, packageId, version] = codeLens.command.arguments as [string, string, string];
          if (!manifestPath || !packageId || !version) {
            continue;
          }
          updates.set(packageId, { manifestPath, version });
        }

        if (updates.size === 0) {
          vscode.window.showInformationMessage('No Perl dependencies to update');
          return;
        }

        let updateCount = 0;
        let manifestPathForRefresh: string | undefined;
        for (const [packageId, update] of updates) {
          const result = await services.workspace.updatePerlDependency(update.manifestPath, packageId, update.version);
          if (result) {
            updateCount += 1;
            manifestPathForRefresh = update.manifestPath;
          }
        }

        if (updateCount === 0) {
          vscode.window.showWarningMessage('Failed to update Perl dependencies');
          return;
        }

        vscode.window.showInformationMessage(`Updated ${updateCount} Perl dependenc${updateCount === 1 ? 'y' : 'ies'}`);
        const scope = manifestPathForRefresh ? { manifestPath: manifestPathForRefresh } : undefined;
        if (scope) {
          await providers.installed.refreshScope(scope);
          await providers.updates.refreshScope(scope);
          providers.codelens.refresh(scope);
        } else {
          await providers.installed.refresh();
          await providers.updates.refresh();
          providers.codelens.refresh();
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'npmGallery.updatePubspecDependency',
      async (pubspecPath: string, packageId: string, newVersion: string) => {
        const result = await services.workspace.updatePubspecDependency(pubspecPath, packageId, newVersion);
        if (result) {
          vscode.window.showInformationMessage(`Updated ${packageId} to ${newVersion}`);
          const scope = { manifestPath: pubspecPath };
          await providers.installed.refreshScope(scope);
          await providers.updates.refreshScope(scope);
          providers.codelens.refresh(scope);
        } else {
          vscode.window.showErrorMessage(`Failed to update ${packageId}`);
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'npmGallery.updateAllPubDependencies',
      async (sourcePath?: string) => {
        const activeEditor = vscode.window.activeTextEditor;
        const targetPath = sourcePath || activeEditor?.document.uri.fsPath;
        if (!targetPath || (!targetPath.endsWith('pubspec.yaml') && !targetPath.endsWith('pubspec.lock'))) {
          vscode.window.showErrorMessage('Please open a pubspec.yaml or pubspec.lock file');
          return;
        }

        const manifestPath = targetPath.endsWith('pubspec.lock')
          ? targetPath.replace(/pubspec\.lock$/i, 'pubspec.yaml')
          : targetPath;

        const confirm = await vscode.window.showWarningMessage(
          'Update all pub dependencies? This may include breaking changes.',
          'Update',
          'Cancel'
        );
        if (confirm !== 'Update') {
          return;
        }

        const document = activeEditor && activeEditor.document.uri.fsPath === targetPath
          ? activeEditor.document
          : await vscode.workspace.openTextDocument(vscode.Uri.file(targetPath));
        const codeLenses = await providers.codelens.provideCodeLenses(document, new vscode.CancellationTokenSource().token);
        const updates = new Map<string, string>();

        for (const codeLens of codeLenses) {
          if (codeLens.command?.command !== 'npmGallery.updatePubspecDependency' || !codeLens.command.arguments) {
            continue;
          }
          const [, packageId, version] = codeLens.command.arguments as [string, string, string];
          if (!packageId || !version) {
            continue;
          }
          updates.set(packageId, version);
        }

        if (updates.size === 0) {
          vscode.window.showInformationMessage('No pub dependencies to update');
          return;
        }

        let updateCount = 0;
        for (const [packageId, version] of updates) {
          const result = await services.workspace.updatePubspecDependency(manifestPath, packageId, version);
          if (result) {
            updateCount += 1;
          }
        }

        if (updateCount === 0) {
          vscode.window.showWarningMessage('Failed to update pub dependencies');
          return;
        }

        vscode.window.showInformationMessage(`Updated ${updateCount} pub dependenc${updateCount === 1 ? 'y' : 'ies'}`);
        const scope = { manifestPath };
        await providers.installed.refreshScope(scope);
        await providers.updates.refreshScope(scope);
        providers.codelens.refresh(scope);
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'npmGallery.updateRDependency',
      async (descriptionPath: string, packageId: string, newVersion: string) => {
        const result = await services.workspace.updateRDependency(descriptionPath, packageId, newVersion);
        if (result) {
          vscode.window.showInformationMessage(`Updated ${packageId} to ${newVersion}`);
          const scope = { manifestPath: descriptionPath };
          await providers.installed.refreshScope(scope);
          await providers.updates.refreshScope(scope);
          providers.codelens.refresh(scope);
        } else {
          vscode.window.showErrorMessage(`Failed to update ${packageId}`);
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'npmGallery.updateAllRDependencies',
      async (sourcePath?: string) => {
        const activeEditor = vscode.window.activeTextEditor;
        const targetPath = sourcePath || activeEditor?.document.uri.fsPath;
        if (!targetPath || (!targetPath.endsWith('DESCRIPTION') && !targetPath.endsWith('.Rproj'))) {
          vscode.window.showErrorMessage('Please open a DESCRIPTION or .Rproj file');
          return;
        }

        const descriptionPath = targetPath.endsWith('.Rproj')
          ? require('path').join(require('path').dirname(targetPath), 'DESCRIPTION')
          : targetPath;

        const confirm = await vscode.window.showWarningMessage(
          'Update all R dependencies? This may include breaking changes.',
          'Update',
          'Cancel'
        );
        if (confirm !== 'Update') {
          return;
        }

        const document = activeEditor && activeEditor.document.uri.fsPath === targetPath
          ? activeEditor.document
          : await vscode.workspace.openTextDocument(vscode.Uri.file(targetPath));
        const codeLenses = await providers.codelens.provideCodeLenses(document, new vscode.CancellationTokenSource().token);
        const updates = new Map<string, string>();

        for (const codeLens of codeLenses) {
          if (codeLens.command?.command !== 'npmGallery.updateRDependency' || !codeLens.command.arguments) {
            continue;
          }
          const [, packageId, version] = codeLens.command.arguments as [string, string, string];
          if (!packageId || !version) {
            continue;
          }
          updates.set(packageId, version);
        }

        if (updates.size === 0) {
          vscode.window.showInformationMessage('No R dependencies to update');
          return;
        }

        let updateCount = 0;
        for (const [packageId, version] of updates) {
          const result = await services.workspace.updateRDependency(descriptionPath, packageId, version);
          if (result) {
            updateCount += 1;
          }
        }

        if (updateCount === 0) {
          vscode.window.showWarningMessage('Failed to update R dependencies');
          return;
        }

        vscode.window.showInformationMessage(`Updated ${updateCount} R dependenc${updateCount === 1 ? 'y' : 'ies'}`);
        const scope = { manifestPath: descriptionPath };
        await providers.installed.refreshScope(scope);
        await providers.updates.refreshScope(scope);
        providers.codelens.refresh(scope);
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'npmGallery.updateAllComposerDependencies',
      async (sourcePath?: string) => {
        const activeEditor = vscode.window.activeTextEditor;
        const targetPath = sourcePath || activeEditor?.document.uri.fsPath;
        if (!targetPath || (!targetPath.endsWith('composer.json') && !targetPath.endsWith('composer.lock'))) {
          vscode.window.showErrorMessage('Please open a composer.json or composer.lock file');
          return;
        }

        const manifestPath = targetPath.endsWith('composer.lock')
          ? targetPath.replace(/composer\.lock$/i, 'composer.json')
          : targetPath;

        const confirm = await vscode.window.showWarningMessage(
          'Update all Composer dependencies? This may include breaking changes.',
          'Update',
          'Cancel'
        );
        if (confirm !== 'Update') {
          return;
        }

        const document = activeEditor && activeEditor.document.uri.fsPath === targetPath
          ? activeEditor.document
          : await vscode.workspace.openTextDocument(vscode.Uri.file(targetPath));
        const codeLenses = await providers.codelens.provideCodeLenses(document, new vscode.CancellationTokenSource().token);
        const updates = new Map<string, string>();

        for (const codeLens of codeLenses) {
          if (codeLens.command?.command !== 'npmGallery.updatePackage' || !codeLens.command.arguments) {
            continue;
          }

          const [payload] = codeLens.command.arguments as Array<{ pkg?: { name?: string; latestVersion?: string } }>;
          const packageName = payload?.pkg?.name;
          const latestVersion = payload?.pkg?.latestVersion;
          if (!packageName || !latestVersion) {
            continue;
          }

          updates.set(packageName, latestVersion);
        }

        if (updates.size === 0) {
          vscode.window.showInformationMessage('No Composer dependencies to update');
          return;
        }

        let updateCount = 0;
        for (const [packageName, latestVersion] of updates) {
          const result = await services.install.update(packageName, latestVersion, manifestPath);
          if (result.success) {
            updateCount += 1;
          }
        }

        if (updateCount === 0) {
          vscode.window.showWarningMessage('Failed to update Composer dependencies');
          return;
        }

        vscode.window.showInformationMessage(`Triggered ${updateCount} Composer update${updateCount === 1 ? '' : 's'}`);
        const scope = { manifestPath };
        await providers.installed.refreshScope(scope);
        await providers.updates.refreshScope(scope);
        providers.codelens.refresh(scope);
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'npmGallery.updateAllRubyDependencies',
      async (sourcePath?: string) => {
        const activeEditor = vscode.window.activeTextEditor;
        const targetPath = sourcePath || activeEditor?.document.uri.fsPath;
        if (!targetPath || (!targetPath.endsWith('Gemfile') && !targetPath.endsWith('Gemfile.lock'))) {
          vscode.window.showErrorMessage('Please open a Gemfile or Gemfile.lock file');
          return;
        }

        const manifestPath = targetPath.endsWith('Gemfile.lock')
          ? targetPath.replace(/gemfile\.lock$/i, 'Gemfile')
          : targetPath;

        const confirm = await vscode.window.showWarningMessage(
          'Update all Ruby dependencies? This may include breaking changes.',
          'Update',
          'Cancel'
        );
        if (confirm !== 'Update') {
          return;
        }

        const document = activeEditor && activeEditor.document.uri.fsPath === targetPath
          ? activeEditor.document
          : await vscode.workspace.openTextDocument(vscode.Uri.file(targetPath));
        const codeLenses = await providers.codelens.provideCodeLenses(document, new vscode.CancellationTokenSource().token);
        const updates = new Map<string, string>();

        for (const codeLens of codeLenses) {
          if (codeLens.command?.command !== 'npmGallery.updatePackage' || !codeLens.command.arguments) {
            continue;
          }

          const [payload] = codeLens.command.arguments as Array<{ pkg?: { name?: string; latestVersion?: string } }>;
          const packageName = payload?.pkg?.name;
          const latestVersion = payload?.pkg?.latestVersion;
          if (!packageName || !latestVersion) {
            continue;
          }

          updates.set(packageName, latestVersion);
        }

        if (updates.size === 0) {
          vscode.window.showInformationMessage('No Ruby dependencies to update');
          return;
        }

        let updateCount = 0;
        for (const [packageName, latestVersion] of updates) {
          const result = await services.install.update(packageName, latestVersion, manifestPath);
          if (result.success) {
            updateCount += 1;
          }
        }

        if (updateCount === 0) {
          vscode.window.showWarningMessage('Failed to update Ruby dependencies');
          return;
        }

        vscode.window.showInformationMessage(`Triggered ${updateCount} Ruby update${updateCount === 1 ? '' : 's'}`);
        const scope = { manifestPath };
        await providers.installed.refreshScope(scope);
        await providers.updates.refreshScope(scope);
        providers.codelens.refresh(scope);
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
          const currentSource = services.getCurrentSourceType();
          for (const { name, latestVersion } of packagesToUpdate) {
            try {
              const result = await services.install.update(name, latestVersion, document.uri.fsPath);
              if (result.success) {
                updateCount++;
                continue;
              }

              if (currentSource === 'libraries-io') {
                const updated = await services.workspace.updatePackageJson(
                  document.uri,
                  name,
                  latestVersion,
                  section as 'dependencies' | 'devDependencies' | 'peerDependencies' | 'optionalDependencies'
                );
                if (updated) {
                  updateCount++;
                }
              }
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

      if (!targetPath) {
        const projectType = services.getCurrentProjectType();
        const currentSource = services.getCurrentSourceType();
        if (
          projectType === 'dotnet' ||
          currentSource === 'nuget' ||
          projectType === 'go' ||
          currentSource === 'pkg-go-dev' ||
          projectType === 'r' ||
          currentSource === 'cran' ||
          projectType === 'perl' ||
          currentSource === 'metacpan'
        ) {
          targetPath = await selectInstallTargetManifest(
            packageName,
            services.workspace,
            services.install,
            vscode.window.activeTextEditor?.document.uri.fsPath,
            projectType,
            currentSource
          );
          if (!targetPath) {
            return;
          }
        }
      }

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
        options?: string | { installedVersion?: string; securityOnly?: boolean; source?: import('../types/project').SourceType }
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

      await vscode.window.showTextDocument(targetUri);
    })
  );

  // Command to clear package.json editor association (if user previously set custom editor)
  context.subscriptions.push(
    vscode.commands.registerCommand('npmGallery.setPackageJsonEditorDefault', async () => {
      const config = vscode.workspace.getConfiguration('workbench');
      const current = config.get<Record<string, string>>('editorAssociations') ?? {};
      // Remove package.json association to use default editor
      const next: Record<string, string> = { ...current };
      delete next['**/package.json'];
      await config.update('editorAssociations', next, vscode.ConfigurationTarget.Global);
      await config.update('editorAssociations', next, vscode.ConfigurationTarget.Workspace);
      vscode.window.showInformationMessage(
        'package.json will now open with the default editor.'
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
