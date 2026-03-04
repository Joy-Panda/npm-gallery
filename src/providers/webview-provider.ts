import * as vscode from 'vscode';
import { getServices } from '../services';
import type { WebviewToExtensionMessage } from '../types/messages';
import type { SourceType } from '../types/project';
import { PackageDetailsPanel } from './package-details-panel';
import { getInstallTargetSummary, selectInstallTargetManifest } from '../utils/install-target';
import { buildSourceInfoMessage } from './source-info';

/**
 * Provides the search webview panel
 */
export class SearchViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'npmGallery.searchView';

  private _view?: vscode.WebviewView;
  private searchRequestId = 0;
  private searchAbortController?: AbortController;

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    // Installed Packages / Available Updates 是 TreeDataProvider（原生树，无 webview），展开即显。
    // Search 是 WebviewView，需加载 iframe。retainContextWhenHidden 让收起时不销毁内容，再展开时尽量复用同一 view，避免重载。
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    } as vscode.WebviewOptions;

    // 若是同一 view 再次展开（已有内容），不再设置 html，避免重新加载导致的 1～2 秒空白
    const isSameViewReShow = this._view === webviewView
      && this._view.webview.html
      && this._view.webview.html.length > 100;
    if (isSameViewReShow) {
      return;
    }
    this._view = webviewView;

    webviewView.webview.html = this.getHtmlContent(webviewView.webview);
    webviewView.webview.onDidReceiveMessage(async (message: WebviewToExtensionMessage) => {
      await this.handleMessage(message);
    });
  }

  /**
   * Handle messages from webview
   */
  private async handleMessage(message: WebviewToExtensionMessage): Promise<void> {
    const services = getServices();

    switch (message.type) {
      case 'search': {
        const requestId = ++this.searchRequestId;
        this.searchAbortController?.abort();
        const controller = new AbortController();
        this.searchAbortController = controller;
        this.postMessage({ type: 'loading', isLoading: true });
        try {
          const results = await services.search.search({
            query: message.query,
            exactName: message.exactName,
            from: message.from,
            size: message.size,
            sortBy: message.sortBy,
            signal: controller.signal,
          });
          if (requestId === this.searchRequestId && !controller.signal.aborted) {
            this.postMessage({ type: 'searchResults', data: results });
          }
        } catch (error) {
          if (controller.signal.aborted) {
            break;
          }
          if (requestId === this.searchRequestId) {
            this.postMessage({
              type: 'error',
              message: error instanceof Error ? error.message : 'Search failed',
            });
          }
        } finally {
          if (this.searchAbortController === controller) {
            this.searchAbortController = undefined;
          }
          if (requestId === this.searchRequestId && !controller.signal.aborted) {
            this.postMessage({ type: 'loading', isLoading: false });
          }
        }
        break;
      }

      case 'install': {
        const projectType = services.getCurrentProjectType();
        const currentSource = services.getCurrentSourceType();
        const targetManifestPath = await selectInstallTargetManifest(
          message.packageName,
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
                  : await services.workspace.getPackageJsonFiles();
        if (!targetManifestPath && manifestFiles.length > 1) {
          break;
        }

        const result = await services.install.install(
          message.packageName,
          message.options,
          targetManifestPath
        );
        await this.sendSourceInfo();
        if (result.success) {
          this.postMessage({
            type: 'installSuccess',
            packageName: message.packageName,
            version: message.options.version || 'latest',
          });
          vscode.window.showInformationMessage(result.message);
        } else {
          this.postMessage({
            type: 'installError',
            packageName: message.packageName,
            error: result.message,
          });
          vscode.window.showErrorMessage(result.message);
        }
        break;
      }

      case 'openExternal': {
        vscode.env.openExternal(vscode.Uri.parse(message.url));
        break;
      }

      case 'copyToClipboard': {
        await vscode.env.clipboard.writeText(message.text);
        vscode.window.showInformationMessage('Copied to clipboard!');
        break;
      }

      case 'copySnippet': {
        try {
          const projectType = services.getCurrentProjectType();
          const currentSource = services.getCurrentSourceType();
          const installTarget = await getInstallTargetSummary(
            services.workspace,
            services.install,
            vscode.window.activeTextEditor?.document.uri.fsPath,
            projectType,
            currentSource
          );
          const result = await services.install.copySnippet(
            message.packageName,
            message.options,
            installTarget?.manifestPath
          );
          if (result.success) {
            vscode.window.showInformationMessage(result.message);
          } else {
            vscode.window.showErrorMessage(result.message);
          }
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to copy snippet: ${error instanceof Error ? error.message : String(error)}`
          );
        }
        break;
      }

      case 'refresh': {
        // Trigger a refresh
        break;
      }

      case 'openPackageDetails': {
        // Open package details in editor panel
        PackageDetailsPanel.createOrShow(this.extensionUri, message.packageName);
        break;
      }

      case 'getSourceInfo': {
        await this.sendSourceInfo();
        break;
      }

      case 'changeSource': {
        services.setSelectedSource(message.source as SourceType);
        await this.sendSourceInfo();
        break;
      }

      case 'changeProjectType': {
        services.setProjectType(message.projectType);
        await this.sendSourceInfo();
        break;
      }
    }
  }

  /**
   * Send source information to webview
   */
  private async sendSourceInfo(): Promise<void> {
    this.postMessage(await buildSourceInfoMessage());
  }

  /**
   * Post message to webview
   */
  private postMessage(message: unknown): void {
    this._view?.webview.postMessage(message);
  }

  /**
   * Generate HTML content for webview
   */
  private getHtmlContent(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview.js')
    );

    const codiconUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'codicons', 'codicon.css')
    );

    const nonce = this.getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <link href="${codiconUri}" rel="stylesheet" />
  <title>NPM Gallery</title>
  <style>
    body {
      padding: 0;
      margin: 0;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background-color: var(--vscode-sideBar-background);
    }
    #root {
      padding: 0;
      min-height: 100vh;
    }
    #root .load-placeholder {
      padding: 12px;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div id="root"><div class="load-placeholder" aria-hidden="true">Loading…</div></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  /**
   * Generate random nonce for CSP
   */
  private getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}
