import * as vscode from 'vscode';
import type { InstallService } from '../services/install-service';
import type { WorkspaceService } from '../services/workspace-service';
import type { ProjectType, SourceType } from '../types/project';

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
  preferredTargetPath?: string,
  projectType?: ProjectType,
  currentSource?: SourceType
): Promise<string | undefined> {
  const useDotNet = projectType === 'dotnet' || currentSource === 'nuget';
  const manifestUris = useDotNet
    ? await workspaceService.getDotNetManifestFiles()
    : await workspaceService.getPackageJsonFiles();
  const manifestPaths = [...new Set(manifestUris.map((uri) => uri.fsPath))];

  if (manifestPaths.length <= 1) {
    const singlePath = manifestPaths[0] || preferredTargetPath;
    rememberInstallTarget(singlePath);
    return singlePath;
  }

  const items = useDotNet
    ? await Promise.all(
        manifestPaths.map((manifestPath) =>
          buildDotNetInstallTargetItem(manifestPath)
        )
      )
    : await Promise.all(
        manifestPaths.map((manifestPath) =>
          buildInstallTargetItem(manifestPath, workspaceService, installService)
        )
      );

  const preferredManifestPath =
    getRememberedInstallTarget(manifestPaths, preferredTargetPath) ||
    (preferredTargetPath && (preferredTargetPath.endsWith('package.json') || preferredTargetPath.endsWith('Directory.Packages.props') || preferredTargetPath.endsWith('.csproj'))
      ? preferredTargetPath
      : getPreferredManifestPath(manifestPaths, useDotNet));

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
    placeHolder: useDotNet
      ? `Select target for ${packageName} (NuGet CPM or PackageReference)`
      : `Select the target package.json for ${packageName}`,
    title: useDotNet ? 'Copy to which manifest?' : 'Install into which project?',
    matchOnDescription: true,
    matchOnDetail: true,
  });

  rememberInstallTarget(selection?.manifestPath);
  return selection?.manifestPath;
}

export async function getInstallTargetSummary(
  workspaceService: WorkspaceService,
  installService: InstallService,
  preferredTargetPath?: string,
  projectType?: ProjectType,
  currentSource?: SourceType
): Promise<InstallTargetSummary | null> {
  const useDotNet = projectType === 'dotnet' || currentSource === 'nuget';
  const manifestUris = useDotNet
    ? await workspaceService.getDotNetManifestFiles()
    : await workspaceService.getPackageJsonFiles();
  const manifestPaths = [...new Set(manifestUris.map((uri) => uri.fsPath))];
  if (manifestPaths.length === 0) {
    return null;
  }

  const manifestPath =
    getRememberedInstallTarget(manifestPaths, preferredTargetPath) ||
    (preferredTargetPath && (preferredTargetPath.endsWith('package.json') || preferredTargetPath.endsWith('Directory.Packages.props') || preferredTargetPath.endsWith('.csproj'))
      ? preferredTargetPath
      : getPreferredManifestPath(manifestPaths, useDotNet)) ||
    manifestPaths[0];

  const item = useDotNet
    ? await buildDotNetInstallTargetItem(manifestPath)
    : await buildInstallTargetItem(manifestPath, workspaceService, installService);
  return {
    manifestPath,
    label: item.label,
    description: item.description || '',
    packageManager: item.detail?.split(' - ')[0] || '',
  };
}

function getDotNetManifestLabel(manifestPath: string): { label: string; packageManager: string } {
  const lower = manifestPath.replace(/\\/g, '/').toLowerCase();
  if (lower.endsWith('directory.packages.props')) {
    return { label: 'Directory.Packages.props (CPM)', packageManager: 'NuGet CPM' };
  }
  if (lower.endsWith('paket.dependencies')) {
    return { label: 'paket.dependencies (Paket CLI)', packageManager: 'Paket' };
  }
  if (lower.endsWith('packages.config')) {
    return { label: 'packages.config (Legacy)', packageManager: 'packages.config' };
  }
  const name = manifestPath.split(/[/\\]/).pop() || manifestPath;
  if (lower.endsWith('.csproj') || lower.endsWith('.vbproj') || lower.endsWith('.fsproj')) {
    return { label: `${name} (PackageReference)`, packageManager: 'PackageReference' };
  }
  return { label: name, packageManager: 'NuGet' };
}

async function buildDotNetInstallTargetItem(manifestPath: string): Promise<InstallTargetItem> {
  const relativePath = vscode.workspace.asRelativePath(manifestPath) || manifestPath;
  const { label, packageManager } = getDotNetManifestLabel(manifestPath);
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(manifestPath));
  const detail = workspaceFolder ? `${packageManager} - ${workspaceFolder.name}` : packageManager;
  return {
    label,
    description: relativePath,
    detail,
    manifestPath,
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

function getPreferredManifestPath(manifestPaths: string[], useDotNet?: boolean): string | undefined {
  const activePath = vscode.window.activeTextEditor?.document.uri.fsPath;
  if (activePath && manifestPaths.includes(activePath)) {
    const lower = activePath.toLowerCase();
    if (lower.endsWith('package.json') || lower.endsWith('directory.packages.props') || lower.endsWith('.csproj') || lower.endsWith('.vbproj') || lower.endsWith('.fsproj')) {
      return activePath;
    }
  }

  if (useDotNet) {
    const cpm = manifestPaths.find((p) => p.replace(/\\/g, '/').toLowerCase().endsWith('directory.packages.props'));
    if (cpm) {
      return cpm;
    }
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
