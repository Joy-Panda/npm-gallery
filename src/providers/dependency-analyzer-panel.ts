import * as vscode from 'vscode';
import { getServices } from '../services';
import type { DependencyAnalyzerPayload } from '../types/analyzer';
import {
  PackageJsonEditorProvider,
  setPackageJsonEditorPreferredTab,
} from './package-json-editor-provider';

type AnalyzerMessage =
  | { type: 'ready' }
  | { type: 'refresh' }
  | { type: 'openManifest'; manifestPath: string }
  | { type: 'alignDependency'; packageName: string; targetVersion: string };

export class DependencyAnalyzerPanel {
  public static readonly viewType = 'npmGallery.dependencyAnalyzer';
  private static currentPanel: DependencyAnalyzerPanel | undefined;

  public static async createOrShow(
    extensionUri: vscode.Uri,
    options?: { manifestPath?: string; mode?: 'workspace' | 'manifest' }
  ): Promise<void> {
    const column = vscode.ViewColumn.Beside;

    if (DependencyAnalyzerPanel.currentPanel) {
      DependencyAnalyzerPanel.currentPanel._manifestPath = options?.manifestPath;
      DependencyAnalyzerPanel.currentPanel._mode = options?.mode || (options?.manifestPath ? 'manifest' : 'workspace');
      await DependencyAnalyzerPanel.currentPanel.loadData();
      DependencyAnalyzerPanel.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      DependencyAnalyzerPanel.viewType,
      'Dependency Analyzer',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      }
    );

    DependencyAnalyzerPanel.currentPanel = new DependencyAnalyzerPanel(
      panel,
      extensionUri,
      options?.manifestPath,
      options?.mode || (options?.manifestPath ? 'manifest' : 'workspace')
    );
  }

  private constructor(
    private readonly _panel: vscode.WebviewPanel,
    private readonly _extensionUri: vscode.Uri,
    private _manifestPath?: string,
    private _mode: 'workspace' | 'manifest' = 'workspace'
  ) {
    this._panel.webview.html = this.getHtml();
    this._panel.webview.onDidReceiveMessage((message: AnalyzerMessage) => this.handleMessage(message));
    this._panel.onDidDispose(() => {
      if (DependencyAnalyzerPanel.currentPanel === this) {
        DependencyAnalyzerPanel.currentPanel = undefined;
      }
    });
  }

  private async handleMessage(message: AnalyzerMessage): Promise<void> {
    switch (message.type) {
      case 'ready':
      case 'refresh':
        await this.loadData();
        break;
      case 'openManifest':
        setPackageJsonEditorPreferredTab(message.manifestPath, 'analyzer');
        await vscode.commands.executeCommand(
          'vscode.openWith',
          vscode.Uri.file(message.manifestPath),
          PackageJsonEditorProvider.viewType
        );
        break;
      case 'alignDependency': {
        const services = getServices();
        const updated = await services.workspace.alignWorkspaceDependencyVersions(
          message.packageName,
          message.targetVersion
        );
        if (updated > 0) {
          services.package.invalidateLatestVersionCache([message.packageName]);
          services.package.invalidateLocalDependencyTreeCache();
          vscode.window.showInformationMessage(
            `Aligned ${message.packageName} in ${updated} manifest(s).`
          );
          await this.loadData();
        }
        break;
      }
    }
  }

  private async loadData(): Promise<void> {
    const services = getServices();
    const workspaceGraph = await services.workspace.getWorkspaceProjectGraph();
    const activeManifestPath = this._manifestPath || this.getActivePackageJsonPath();
    const dependencyAnalyzer =
      activeManifestPath && activeManifestPath.endsWith('package.json')
        ? await services.package.getDependencyAnalyzerData(activeManifestPath)
        : null;
    const manifestText =
      activeManifestPath && activeManifestPath.endsWith('package.json')
        ? await this.readManifestText(activeManifestPath)
        : undefined;

    const payload: DependencyAnalyzerPayload = {
      workspaceGraph,
      dependencyAnalyzer,
      activeManifestPath: activeManifestPath || undefined,
      manifestText,
      initialMode: this._mode,
    };

    this._panel.title =
      this._mode === 'manifest' && dependencyAnalyzer
        ? `Dependency Analyzer - ${dependencyAnalyzer.manifestName}`
        : 'Dependency Analyzer';
    this._panel.webview.postMessage({ type: 'analyzerData', data: payload });
  }

  private getActivePackageJsonPath(): string | undefined {
    const activePath = vscode.window.activeTextEditor?.document.uri.fsPath;
    return activePath && activePath.endsWith('package.json') ? activePath : undefined;
  }

  private getHtml(): string {
    const webview = this._panel.webview;
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'dependency-analyzer.js')
    );
    const codiconUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'codicons', 'codicon.css')
    );
    const nonce = this.getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};">
  <link href="${codiconUri}" rel="stylesheet" />
  <title>Dependency Analyzer</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private async readManifestText(manifestPath: string): Promise<string | undefined> {
    try {
      const raw = await vscode.workspace.fs.readFile(vscode.Uri.file(manifestPath));
      return Buffer.from(raw).toString('utf8');
    } catch {
      return undefined;
    }
  }

  private getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}
