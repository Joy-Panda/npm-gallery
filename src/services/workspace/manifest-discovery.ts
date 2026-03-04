import * as vscode from 'vscode';
import type { WorkspacePackageScope } from '../../types/package';

export class WorkspaceManifestDiscovery {
  constructor(
    private readonly discoverWorkspacePackageJsonFiles: () => Promise<vscode.Uri[]>
  ) {}

  async getPackageJsonFiles(): Promise<vscode.Uri[]> {
    const discovered = await this.discoverWorkspacePackageJsonFiles();
    if (discovered.length > 0) {
      return discovered;
    }
    return vscode.workspace.findFiles('**/package.json', '**/node_modules/**');
  }

  async getPomXmlFiles(): Promise<vscode.Uri[]> {
    return vscode.workspace.findFiles('**/pom.xml', '**/target/**');
  }

  async getGradleManifestFiles(): Promise<vscode.Uri[]> {
    return vscode.workspace.findFiles('**/{build.gradle,build.gradle.kts}', '**/{build,target,node_modules,.gradle}/**');
  }

  async getComposerManifestFiles(): Promise<vscode.Uri[]> {
    return vscode.workspace.findFiles('**/composer.json', '**/{vendor,node_modules}/**');
  }

  async getRubyManifestFiles(): Promise<vscode.Uri[]> {
    return vscode.workspace.findFiles('**/Gemfile', '**/{vendor,node_modules}/**');
  }

  async getClojureManifestFiles(): Promise<vscode.Uri[]> {
    return vscode.workspace.findFiles('**/{deps.edn,project.clj}', '**/{node_modules,target,.cpcache}/**');
  }

  async getCargoManifestFiles(): Promise<vscode.Uri[]> {
    return vscode.workspace.findFiles('**/Cargo.toml', '**/{target,node_modules,vendor}/**');
  }

  async getGoManifestFiles(): Promise<vscode.Uri[]> {
    return vscode.workspace.findFiles('**/go.mod', '**/{vendor,node_modules}/**');
  }

  async getPerlManifestFiles(): Promise<vscode.Uri[]> {
    return vscode.workspace.findFiles('**/cpanfile', '**/{local,vendor,node_modules}/**');
  }

  async getPubManifestFiles(): Promise<vscode.Uri[]> {
    return vscode.workspace.findFiles('**/pubspec.yaml', '**/{build,.dart_tool,node_modules}/**');
  }

  async getRManifestFiles(): Promise<vscode.Uri[]> {
    return vscode.workspace.findFiles('**/DESCRIPTION', '**/{renv,packrat,node_modules}/**');
  }

  async getDotNetInstalledManifestFiles(): Promise<vscode.Uri[]> {
    const exclude = '**/node_modules/**,**/bin/**,**/obj/**,**/out/**';
    const [cpmFiles, paketFiles, packagesConfigFiles, csprojFiles, vbprojFiles, fsprojFiles, cakeFiles] = await Promise.all([
      vscode.workspace.findFiles('**/Directory.Packages.props', exclude, 5),
      vscode.workspace.findFiles('**/paket.dependencies', exclude, 10),
      vscode.workspace.findFiles('**/packages.config', exclude, 20),
      vscode.workspace.findFiles('**/*.csproj', exclude, 20),
      vscode.workspace.findFiles('**/*.vbproj', exclude, 10),
      vscode.workspace.findFiles('**/*.fsproj', exclude, 10),
      vscode.workspace.findFiles('**/*.cake', exclude, 20),
    ]);
    return [...cpmFiles, ...paketFiles, ...packagesConfigFiles, ...csprojFiles, ...vbprojFiles, ...fsprojFiles, ...cakeFiles];
  }

  async getDotNetManifestFiles(): Promise<vscode.Uri[]> {
    const exclude = '**/node_modules/**,**/bin/**,**/obj/**,**/out/**';
    const [cpmFiles, paketFiles, packagesConfigFiles, csprojFiles, vbprojFiles, fsprojFiles] = await Promise.all([
      vscode.workspace.findFiles('**/Directory.Packages.props', exclude, 5),
      vscode.workspace.findFiles('**/paket.dependencies', exclude, 10),
      vscode.workspace.findFiles('**/packages.config', exclude, 20),
      vscode.workspace.findFiles('**/*.csproj', exclude, 20),
      vscode.workspace.findFiles('**/*.vbproj', exclude, 10),
      vscode.workspace.findFiles('**/*.fsproj', exclude, 10),
    ]);
    const all = [...cpmFiles, ...paketFiles, ...packagesConfigFiles, ...csprojFiles, ...vbprojFiles, ...fsprojFiles];
    return [...new Map(all.map((u) => [u.fsPath, u])).values()];
  }

  async hasDirectoryPackagesProps(): Promise<boolean> {
    const files = await vscode.workspace.findFiles('**/Directory.Packages.props', '**/node_modules/**', 1);
    return files.length > 0;
  }

  async getPackageJsonFilesForScope(scope: WorkspacePackageScope): Promise<vscode.Uri[]> {
    if (scope.manifestPath) {
      return scope.manifestPath.endsWith('package.json') ? [vscode.Uri.file(scope.manifestPath)] : [];
    }
    return this.filterByWorkspaceFolder(await this.getPackageJsonFiles(), scope.workspaceFolderPath);
  }

  async getComposerManifestFilesForScope(scope: WorkspacePackageScope): Promise<vscode.Uri[]> {
    return this.getManifestFilesForScope(
      scope,
      await this.getComposerManifestFiles(),
      ['composer.json'],
      [['composer.lock', 'composer.json']]
    );
  }

  async getRubyManifestFilesForScope(scope: WorkspacePackageScope): Promise<vscode.Uri[]> {
    return this.getManifestFilesForScope(
      scope,
      await this.getRubyManifestFiles(),
      ['gemfile'],
      [['gemfile.lock', 'Gemfile']]
    );
  }

  async getClojureManifestFilesForScope(scope: WorkspacePackageScope): Promise<vscode.Uri[]> {
    return this.getManifestFilesForScope(
      scope,
      await this.getClojureManifestFiles(),
      ['deps.edn', 'project.clj']
    );
  }

  async getCargoManifestFilesForScope(scope: WorkspacePackageScope): Promise<vscode.Uri[]> {
    return this.getManifestFilesForScope(
      scope,
      await this.getCargoManifestFiles(),
      ['cargo.toml'],
      [['cargo.lock', 'Cargo.toml']]
    );
  }

  async getGoManifestFilesForScope(scope: WorkspacePackageScope): Promise<vscode.Uri[]> {
    return this.getManifestFilesForScope(
      scope,
      await this.getGoManifestFiles(),
      ['go.mod']
    );
  }

  async getPerlManifestFilesForScope(scope: WorkspacePackageScope): Promise<vscode.Uri[]> {
    return this.getManifestFilesForScope(
      scope,
      await this.getPerlManifestFiles(),
      ['cpanfile'],
      [['cpanfile.snapshot', 'cpanfile']]
    );
  }

  async getPubManifestFilesForScope(scope: WorkspacePackageScope): Promise<vscode.Uri[]> {
    return this.getManifestFilesForScope(
      scope,
      await this.getPubManifestFiles(),
      ['pubspec.yaml'],
      [['pubspec.lock', 'pubspec.yaml']]
    );
  }

  async getRManifestFilesForScope(scope: WorkspacePackageScope): Promise<vscode.Uri[]> {
    return this.getManifestFilesForScope(
      scope,
      await this.getRManifestFiles(),
      ['description']
    );
  }

  async getPomXmlFilesForScope(scope: WorkspacePackageScope): Promise<vscode.Uri[]> {
    return this.getManifestFilesForScope(
      scope,
      await this.getPomXmlFiles(),
      ['pom.xml']
    );
  }

  async getGradleManifestFilesForScope(scope: WorkspacePackageScope): Promise<vscode.Uri[]> {
    return this.getManifestFilesForScope(
      scope,
      await this.getGradleManifestFiles(),
      ['build.gradle', 'build.gradle.kts']
    );
  }

  async getDotNetManifestFilesForScope(scope: WorkspacePackageScope): Promise<vscode.Uri[]> {
    if (scope.manifestPath) {
      const lower = scope.manifestPath.toLowerCase();
      if (
        lower.endsWith('directory.packages.props') ||
        lower.endsWith('paket.dependencies') ||
        lower.endsWith('packages.config') ||
        lower.endsWith('.csproj') ||
        lower.endsWith('.vbproj') ||
        lower.endsWith('.fsproj') ||
        lower.endsWith('.cake')
      ) {
        return [vscode.Uri.file(scope.manifestPath)];
      }
      return [];
    }

    return this.filterByWorkspaceFolder(await this.getDotNetInstalledManifestFiles(), scope.workspaceFolderPath);
  }

  private getManifestFilesForScope(
    scope: WorkspacePackageScope,
    allFiles: vscode.Uri[],
    manifestSuffixes: string[],
    aliasMappings: Array<[string, string]> = []
  ): vscode.Uri[] | Promise<vscode.Uri[]> {
    if (scope.manifestPath) {
      const lower = scope.manifestPath.toLowerCase();
      if (manifestSuffixes.some((suffix) => lower.endsWith(suffix.toLowerCase()))) {
        return [vscode.Uri.file(scope.manifestPath)];
      }
      for (const [fromSuffix, toFile] of aliasMappings) {
        if (lower.endsWith(fromSuffix.toLowerCase())) {
          return [vscode.Uri.file(scope.manifestPath.replace(new RegExp(`${this.escapeForRegex(fromSuffix)}$`, 'i'), toFile))];
        }
      }
      return [];
    }

    return this.filterByWorkspaceFolder(allFiles, scope.workspaceFolderPath);
  }

  private filterByWorkspaceFolder(files: vscode.Uri[], workspaceFolderPath?: string): vscode.Uri[] {
    if (!workspaceFolderPath) {
      return files;
    }

    return files.filter(
      (uri) => vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath === workspaceFolderPath
    );
  }

  private escapeForRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
