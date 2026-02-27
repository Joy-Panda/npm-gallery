import * as vscode from 'vscode';
import { getServices } from '../services';
import type { WebviewToExtensionMessage, SourceInfoMessage } from '../types/messages';
import type { SourceType } from '../types/project';
import { PackageDetailsPanel } from './package-details-panel';

/**
 * Provides the search webview panel
 */
export class SearchViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'npmGallery.searchView';

  private _view?: vscode.WebviewView;

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.html = this.getHtmlContent(webviewView.webview);

    // Handle messages from webview
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
        this.postMessage({ type: 'loading', isLoading: true });
        try {
          const results = await services.search.search({
            query: message.query,
            from: message.from,
            size: message.size,
            sortBy: message.sortBy,
          });
          this.postMessage({ type: 'searchResults', data: results });
        } catch (error) {
          this.postMessage({
            type: 'error',
            message: error instanceof Error ? error.message : 'Search failed',
          });
        } finally {
          this.postMessage({ type: 'loading', isLoading: false });
        }
        break;
      }

      case 'install': {
        const result = await services.install.install(message.packageName, message.options);
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
        this.sendSourceInfo();
        break;
      }

      case 'changeSource': {
        services.setSelectedSource(message.source as SourceType);
        this.sendSourceInfo();
        break;
      }
    }
  }

  /**
   * Send source information to webview
   */
  private sendSourceInfo(): void {
    const services = getServices();
    const supportedCapabilities = services.package.getSupportedCapabilities();
    
    // Build capability support map
    const capabilitySupport: Record<string, { capability: string; supported: boolean; reason?: string }> = {};
    for (const cap of supportedCapabilities) {
      const support = services.package.getCapabilitySupport(cap);
      if (support) {
        capabilitySupport[cap] = {
          capability: cap,
          supported: support.supported,
          reason: support.reason,
        };
      }
    }
    
    const sourceInfo: SourceInfoMessage = {
      type: 'sourceInfo',
      data: {
        currentProjectType: services.getCurrentProjectType(),
        currentSource: services.getCurrentSourceType(),
        availableSources: services.getAvailableSources(),
        supportedSortOptions: services.getSupportedSortOptions(),
        supportedFilters: services.getSupportedFilters(),
        supportedCapabilities: supportedCapabilities.map(c => c.toString()),
        capabilitySupport,
      },
    };
    
    this.postMessage(sourceInfo);
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
    }
  </style>
</head>
<body>
  <div id="root"></div>
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
