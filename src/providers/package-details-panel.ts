import * as vscode from 'vscode';
import { getServices } from '../services';
import type { WebviewToExtensionMessage, SourceInfoMessage } from '../types/messages';

/**
 * Manages package details webview panels that open in the editor area
 * Uses React for rendering with @uiw/react-markdown-preview
 */
export class PackageDetailsPanel {
  public static currentPanels: Map<string, PackageDetailsPanel> = new Map();
  public static readonly viewType = 'npmGallery.packageDetails';

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _packageName: string;
  private _disposables: vscode.Disposable[] = [];

  public static async createOrShow(extensionUri: vscode.Uri, packageName: string): Promise<void> {
    const column = vscode.ViewColumn.One;

    // Check if we already have a panel for this package
    const existingPanel = PackageDetailsPanel.currentPanels.get(packageName);
    if (existingPanel) {
      existingPanel._panel.reveal(column);
      return;
    }

    // Create a new panel
    const panel = vscode.window.createWebviewPanel(
      PackageDetailsPanel.viewType,
      `${packageName}`,
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      }
    );

    const detailsPanel = new PackageDetailsPanel(panel, extensionUri, packageName);
    PackageDetailsPanel.currentPanels.set(packageName, detailsPanel);
    // Panel will load data when React app sends 'ready' message
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, packageName: string) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._packageName = packageName;

    // Set initial HTML with React app
    this._panel.webview.html = this.getHtmlContent();

    // Handle messages from webview
    this._panel.webview.onDidReceiveMessage(
      (message: WebviewToExtensionMessage) => this.handleMessage(message),
      null,
      this._disposables
    );

    // Handle panel disposal
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  private async loadPackageDetails(): Promise<void> {
    try {
      const services = getServices();
      const details = await services.package.getPackageDetails(this._packageName);
      // Send package details to React app
      this._panel.webview.postMessage({ type: 'packageDetails', data: details });
    } catch (error) {
      this._panel.webview.postMessage({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to load package details',
      });
    }
  }

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
    
    const sortOptionsWithLabels = services.search.getSupportedSortOptionsWithLabels();
    const filterOptionsWithLabels = services.search.getSupportedFiltersWithLabels();
    const sourceInfo: SourceInfoMessage = {
      type: 'sourceInfo',
      data: {
        currentProjectType: services.getCurrentProjectType(),
        currentSource: services.getCurrentSourceType(),
        availableSources: services.getAvailableSources(),
        supportedSortOptions: services.getSupportedSortOptions(), // For backward compatibility
        supportedSortOptionsWithLabels: sortOptionsWithLabels.map(opt => {
          if (typeof opt === 'string') {
            return { value: opt, label: opt.charAt(0).toUpperCase() + opt.slice(1) };
          }
          return { value: opt.value, label: opt.label };
        }),
        supportedFilters: services.getSupportedFilters(), // For backward compatibility
        supportedFiltersWithLabels: filterOptionsWithLabels.map(filter => {
          if (typeof filter === 'string') {
            return { value: filter, label: filter.charAt(0).toUpperCase() + filter.slice(1) };
          }
          return { value: filter.value, label: filter.label, placeholder: filter.placeholder };
        }),
        supportedCapabilities: supportedCapabilities.map(c => c.toString()),
        capabilitySupport,
      },
    };
    
    this._panel.webview.postMessage(sourceInfo);
  }

  private async handleMessage(message: WebviewToExtensionMessage): Promise<void> {
    const services = getServices();

    switch (message.type) {
      case 'ready': {
        // React app is ready, send source info and load package details
        this.sendSourceInfo();
        await this.loadPackageDetails();
        break;
      }

      case 'getSourceInfo': {
        this.sendSourceInfo();
        break;
      }

      case 'install': {
        const result = await services.install.install(message.packageName, message.options);
        if (result.success) {
          this._panel.webview.postMessage({
            type: 'installSuccess',
            packageName: message.packageName,
          });
          vscode.window.showInformationMessage(result.message);
        } else {
          this._panel.webview.postMessage({
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
          const result = await services.install.copySnippet(message.packageName, message.options);
          if (result.success) {
            this._panel.webview.postMessage({
              type: 'copySuccess',
              packageName: message.packageName,
              message: result.message,
            });
            vscode.window.showInformationMessage(result.message);
          } else {
            this._panel.webview.postMessage({
              type: 'copyError',
              packageName: message.packageName,
              error: result.message,
            });
            vscode.window.showErrorMessage(result.message);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this._panel.webview.postMessage({
            type: 'copyError',
            packageName: message.packageName,
            error: `Failed to copy snippet: ${errorMessage}`,
          });
          vscode.window.showErrorMessage(
            `Failed to copy snippet: ${errorMessage}`
          );
        }
        break;
      }
    }
  }

  private getHtmlContent(): string {
    const webview = this._panel.webview;
    const nonce = this.getNonce();

    // Get URIs for scripts and styles
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'package-details.js')
    );

    const codiconUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'codicons', 'codicon.css')
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} https: data:; font-src ${webview.cspSource};">
  <link href="${codiconUri}" rel="stylesheet" />
  <title>${this.escapeHtml(this._packageName)}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
    }
    #root {
      height: 100vh;
    }
  </style>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  public dispose(): void {
    PackageDetailsPanel.currentPanels.delete(this._packageName);
    this._panel.dispose();
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}
