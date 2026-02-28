import * as vscode from 'vscode';
import { getServices } from '../services';
import type { WebviewToExtensionMessage } from '../types/messages';
import type { SourceInfoMessage } from '../types/messages';
import { getInstallTargetSummary, selectInstallTargetManifest } from '../utils/install-target';

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
  private _securityOnly: boolean;
  private _panelKey: string;
  private _installedVersion?: string;
  private _disposables: vscode.Disposable[] = [];

  private static getPanelKey(packageName: string, securityOnly: boolean): string {
    return `${packageName}:${securityOnly ? 'security' : 'details'}`;
  }

  public static async createOrShow(
    extensionUri: vscode.Uri,
    packageName: string,
    options?: { installedVersion?: string; securityOnly?: boolean }
  ): Promise<void> {
    const column = vscode.ViewColumn.One;
    const securityOnly = !!options?.securityOnly;
    const installedVersion = options?.installedVersion;
    const key = PackageDetailsPanel.getPanelKey(packageName, securityOnly);

    // Check if we already have a panel for this package + mode
    const existingPanel = PackageDetailsPanel.currentPanels.get(key);
    if (existingPanel) {
      existingPanel.setInstalledVersion(installedVersion);
      await existingPanel.loadPackageDetails();
      existingPanel._panel.reveal(column);
      return;
    }

    // Create a new panel
    const panel = vscode.window.createWebviewPanel(
      PackageDetailsPanel.viewType,
      securityOnly ? `Security: ${packageName}` : `${packageName}`,
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      }
    );

    const detailsPanel = new PackageDetailsPanel(
      panel,
      extensionUri,
      packageName,
      securityOnly,
      key,
      installedVersion
    );
    PackageDetailsPanel.currentPanels.set(key, detailsPanel);
    // Panel will load data when React app sends 'ready' message
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    packageName: string,
    securityOnly: boolean,
    panelKey: string,
    installedVersion?: string
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._packageName = packageName;
    this._securityOnly = securityOnly;
    this._panelKey = panelKey;
    this._installedVersion = installedVersion;

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

  public setInstalledVersion(version?: string): void {
    this._installedVersion = version;
  }

  private async loadPackageDetails(): Promise<void> {
    try {
      const services = getServices();
      const details = await services.package.getEnrichedPackageDetails(this._packageName, {
        installedVersion: this._installedVersion,
      });

      // When opened in security-only mode, tell webview to render only Security tab
      const securityOnlyView = this._securityOnly;
      this._panel.webview.postMessage({
        type: 'packageDetails',
        data: details,
        securityOnlyView,
      });
    } catch (error) {
      this._panel.webview.postMessage({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to load package details',
      });
    }
  }

  private async handleMessage(message: WebviewToExtensionMessage): Promise<void> {
    const services = getServices();

    switch (message.type) {
      case 'ready': {
        // React app is ready, load and send package details
        await this.sendSourceInfo();
        await this.loadPackageDetails();
        break;
      }

      case 'getSourceInfo': {
        await this.sendSourceInfo();
        break;
      }

      case 'install': {
        const targetManifestPath = await selectInstallTargetManifest(
          message.packageName,
          services.workspace,
          services.install,
          vscode.window.activeTextEditor?.document.uri.fsPath
        );
        if (!targetManifestPath && (await services.workspace.getPackageJsonFiles()).length > 1) {
          break;
        }

        const result = await services.install.install(
          message.packageName,
          message.options,
          targetManifestPath
        );
        await this.sendSourceInfo();
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

      case 'openPackageDetails': {
        await PackageDetailsPanel.createOrShow(this._extensionUri, message.packageName);
        break;
      }

      case 'copyToClipboard': {
        await vscode.env.clipboard.writeText(message.text);
        vscode.window.showInformationMessage('Copied to clipboard!');
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

  private async sendSourceInfo(): Promise<void> {
    const services = getServices();
    const supportedCapabilities = services.package.getSupportedCapabilities();
    const activePath = vscode.window.activeTextEditor?.document.uri.fsPath;
    const detectedPackageManager = await services.install.detectPackageManager(activePath);
    const installTarget = await getInstallTargetSummary(
      services.workspace,
      services.install,
      activePath
    );

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
        detectedPackageManager,
        installTarget: installTarget || undefined,
        currentSource: services.getCurrentSourceType(),
        availableSources: services.getAvailableSources(),
        supportedSortOptions: services.getSupportedSortOptions(),
        supportedFilters: services.getSupportedFilters(),
        supportedCapabilities: supportedCapabilities.map((c) => c.toString()),
        capabilitySupport,
      },
    };

    this._panel.webview.postMessage(sourceInfo);
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
    PackageDetailsPanel.currentPanels.delete(this._panelKey);
    this._panel.dispose();
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}
