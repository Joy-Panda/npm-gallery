import * as vscode from 'vscode';
import type { InstallService } from '../services/install-service';
import type { WorkspaceService } from '../services/workspace-service';

interface InstallTargetItem extends vscode.QuickPickItem {
  manifestPath: string;
}

export interface InstallTargetSummary {
  manifestPath: string;
  label: string;
  description: string;
  packageManager: string;
}

const lastSelectedManifestByWorkspace = new Map<string, string>();

export async function selectInstallTargetManifest(
  packageName: string,
  workspaceService: WorkspaceService,
  installService: InstallService,
  preferredTargetPath?: string
): Promise<string | undefined> {
  const manifestUris = await workspaceService.getPackageJsonFiles();
  const manifestPaths = [...new Set(manifestUris.map((uri) => uri.fsPath))];

  if (manifestPaths.length <= 1) {
    const singlePath = manifestPaths[0] || preferredTargetPath;
    rememberInstallTarget(singlePath);
    return singlePath;
  }

  const items = await Promise.all(
    manifestPaths.map((manifestPath) =>
      buildInstallTargetItem(manifestPath, workspaceService, installService)
    )
  );

  const preferredManifestPath =
    getRememberedInstallTarget(manifestPaths, preferredTargetPath) ||
    (preferredTargetPath && preferredTargetPath.endsWith('package.json')
      ? preferredTargetPath
      : getPreferredManifestPath(manifestPaths));

  items.sort((a, b) => {
    const rankDiff = getManifestPriority(a.manifestPath) - getManifestPriority(b.manifestPath);
    if (rankDiff !== 0) {
      return rankDiff;
    }

    if (preferredManifestPath) {
      if (a.manifestPath === preferredManifestPath) {
        return -1;
      }
      if (b.manifestPath === preferredManifestPath) {
        return 1;
      }
    }
    return (a.description || a.label).localeCompare(b.description || b.label);
  });

  if (preferredManifestPath) {
    const preferredIndex = items.findIndex((item) => item.manifestPath === preferredManifestPath);
    if (preferredIndex > 0) {
      const [preferredItem] = items.splice(preferredIndex, 1);
      preferredItem.label = `$(check) ${preferredItem.label}`;
      items.unshift(preferredItem);
    } else if (preferredIndex === 0) {
      items[0].label = `$(check) ${items[0].label}`;
    }
  }

  const selection = await vscode.window.showQuickPick(items, {
    placeHolder: `Select the target package.json for ${packageName}`,
    title: 'Install into which project?',
    matchOnDescription: true,
    matchOnDetail: true,
  });

  rememberInstallTarget(selection?.manifestPath);
  return selection?.manifestPath;
}

export async function getInstallTargetSummary(
  workspaceService: WorkspaceService,
  installService: InstallService,
  preferredTargetPath?: string
): Promise<InstallTargetSummary | null> {
  const manifestUris = await workspaceService.getPackageJsonFiles();
  const manifestPaths = [...new Set(manifestUris.map((uri) => uri.fsPath))];
  if (manifestPaths.length === 0) {
    return null;
  }

  const manifestPath =
    getRememberedInstallTarget(manifestPaths, preferredTargetPath) ||
    (preferredTargetPath && preferredTargetPath.endsWith('package.json')
      ? preferredTargetPath
      : getPreferredManifestPath(manifestPaths)) ||
    manifestPaths[0];

  const item = await buildInstallTargetItem(manifestPath, workspaceService, installService);
  return {
    manifestPath,
    label: item.label,
    description: item.description || '',
    packageManager: item.detail?.split(' - ')[0] || '',
  };
}

async function buildInstallTargetItem(
  manifestPath: string,
  workspaceService: WorkspaceService,
  installService: InstallService
): Promise<InstallTargetItem> {
  const manifestUri = vscode.Uri.file(manifestPath);
  const packageJson = await workspaceService.getPackageJson(manifestUri);
  const relativePath = vscode.workspace.asRelativePath(manifestPath) || manifestPath;
  const normalized = relativePath.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  const fallbackName = segments.length >= 2 ? segments[segments.length - 2] : relativePath;
  const manifestName =
    typeof packageJson?.name === 'string' && packageJson.name.trim()
      ? packageJson.name.trim()
      : fallbackName;
  const packageManager = await installService.detectPackageManager(manifestPath);
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(manifestUri);
  const detail = workspaceFolder
    ? `${packageManager} - ${workspaceFolder.name}`
    : packageManager;

  return {
    label: manifestName,
    description: relativePath,
    detail,
    manifestPath,
  };
}

function rememberInstallTarget(manifestPath?: string): void {
  if (!manifestPath) {
    return;
  }

  const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(manifestPath));
  const key = workspaceFolder?.uri.fsPath || '__default__';
  lastSelectedManifestByWorkspace.set(key, manifestPath);
}

function getRememberedInstallTarget(
  manifestPaths: string[],
  preferredTargetPath?: string
): string | undefined {
  const workspaceFolder = preferredTargetPath
    ? vscode.workspace.getWorkspaceFolder(vscode.Uri.file(preferredTargetPath))
    : vscode.window.activeTextEditor
      ? vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri)
      : undefined;
  const key = workspaceFolder?.uri.fsPath || '__default__';
  const rememberedPath = lastSelectedManifestByWorkspace.get(key);
  return rememberedPath && manifestPaths.includes(rememberedPath) ? rememberedPath : undefined;
}

function getPreferredManifestPath(manifestPaths: string[]): string | undefined {
  const activePath = vscode.window.activeTextEditor?.document.uri.fsPath;
  if (activePath && activePath.endsWith('package.json') && manifestPaths.includes(activePath)) {
    return activePath;
  }

  return manifestPaths.find((manifestPath) => {
    const relativePath = vscode.workspace.asRelativePath(manifestPath) || manifestPath;
    return relativePath.replace(/\\/g, '/') === 'package.json';
  });
}

function getManifestPriority(manifestPath: string): number {
  const projectRoot = getManifestProjectRoot(manifestPath);
  const activeDocumentPath = vscode.window.activeTextEditor?.document.uri.fsPath;
  if (activeDocumentPath && isPathInProject(activeDocumentPath, projectRoot)) {
    return 0;
  }

  const openDocumentPaths = getOpenTabFilePaths().filter(
    (documentPath) => documentPath !== activeDocumentPath
  );

  if (openDocumentPaths.some((documentPath) => isPathInProject(documentPath, projectRoot))) {
    return 1;
  }

  return 2;
}

function getManifestProjectRoot(manifestPath: string): string {
  const normalized = manifestPath.replace(/\\/g, '/');
  return normalized.slice(0, normalized.lastIndexOf('/')) || normalized;
}

function isPathInProject(filePath: string, projectRoot: string): boolean {
  const normalizedFilePath = filePath.replace(/\\/g, '/');
  const normalizedProjectRoot = projectRoot.replace(/\\/g, '/').replace(/\/+$/, '');
  return (
    normalizedFilePath === normalizedProjectRoot ||
    normalizedFilePath.startsWith(`${normalizedProjectRoot}/`)
  );
}

function getOpenTabFilePaths(): string[] {
  const openPaths = new Set<string>();

  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      const input = tab.input;
      if (input instanceof vscode.TabInputText) {
        openPaths.add(input.uri.fsPath);
      } else if (input instanceof vscode.TabInputTextDiff) {
        openPaths.add(input.modified.fsPath);
      }
    }
  }

  return [...openPaths];
}
