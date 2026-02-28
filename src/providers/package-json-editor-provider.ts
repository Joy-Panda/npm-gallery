import * as vscode from 'vscode';
import { getServices } from '../services';
import type { DependencyAnalyzerPayload } from '../types/analyzer';

type PackageJsonEditorMessage =
  | { type: 'ready' }
  | { type: 'refresh' }
  | { type: 'updateText'; text: string }
  | { type: 'openManifest'; manifestPath: string }
  | { type: 'alignDependency'; packageName: string; targetVersion: string };

export class PackageJsonEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'npmGallery.packageJsonEditor';

  constructor(private readonly extensionUri: vscode.Uri) {}

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };
    webviewPanel.webview.html = this.getHtml(webviewPanel.webview);
    webviewPanel.title = `package.json - ${this.getManifestLabel(document.uri.fsPath)}`;

    const updateWebview = async () => {
      const payload = await this.buildPayload(document);
      webviewPanel.webview.postMessage({ type: 'document', data: payload });
    };

    const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.uri.toString() === document.uri.toString()) {
        updateWebview();
      }
    });

    webviewPanel.onDidDispose(() => {
      changeDocumentSubscription.dispose();
    });

    webviewPanel.webview.onDidReceiveMessage(async (message: PackageJsonEditorMessage) => {
      switch (message.type) {
        case 'ready':
        case 'refresh':
          await updateWebview();
          break;
        case 'updateText':
          await this.updateDocumentText(document, message.text);
          break;
        case 'openManifest':
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
            await updateWebview();
          }
          break;
        }
      }
    });

    await updateWebview();
  }

  private async buildPayload(document: vscode.TextDocument): Promise<DependencyAnalyzerPayload> {
    const services = getServices();
    const workspaceGraph = await services.workspace.getWorkspaceProjectGraph();
    const dependencyAnalyzer = await services.package.getDependencyAnalyzerData(document.uri.fsPath);

    return {
      workspaceGraph,
      dependencyAnalyzer,
      activeManifestPath: document.uri.fsPath,
      manifestText: document.getText(),
      initialMode: 'manifest',
    };
  }

  private async updateDocumentText(document: vscode.TextDocument, text: string): Promise<void> {
    if (document.getText() === text) {
      return;
    }

    const edit = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(
      document.positionAt(0),
      document.positionAt(document.getText().length)
    );
    edit.replace(document.uri, fullRange, text);
    await vscode.workspace.applyEdit(edit);
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'package-json-editor.js')
    );
    const codiconUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'codicons', 'codicon.css')
    );
    const nonce = this.getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};">
  <link href="${codiconUri}" rel="stylesheet" />
  <title>package.json</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private getManifestLabel(manifestPath: string): string {
    const relativePath = vscode.workspace.asRelativePath(manifestPath) || manifestPath;
    const normalized = relativePath.replace(/\\/g, '/');
    const segments = normalized.split('/').filter(Boolean);
    return segments.length >= 2 ? segments[segments.length - 2] : relativePath;
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
