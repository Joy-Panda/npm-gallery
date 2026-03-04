import * as vscode from 'vscode';
import { getServices } from '../../services';
import { getUpdateType, isNewerVersion } from '../../utils/version-utils';
import { formatUpdateTitle, topOfFileRange } from './common';

export async function provideCodeLensesForDescription(
  document: vscode.TextDocument,
  text: string
): Promise<vscode.CodeLens[]> {
  const codeLenses: vscode.CodeLens[] = [];
  const services = getServices();
  const adapter = services.sourceRegistry.getAdapter('cran');
  if (!adapter) {
    return [];
  }

  const topOfFile = topOfFileRange();
  const updatePromises: Promise<void>[] = [];
  const fieldRegex = /^\s*(Depends|Imports|LinkingTo|Suggests|Enhances)\s*:\s*(.+)$/gim;
  let fieldMatch: RegExpExecArray | null;
  while ((fieldMatch = fieldRegex.exec(text)) !== null) {
    const dependencies = parseDescriptionDependenciesForCodeLens(fieldMatch[2]);
    for (const dependency of dependencies) {
      if (!dependency.version) {
        continue;
      }
      const currentVersion = dependency.version;
      const matchStart =
        (fieldMatch.index ?? 0) +
        fieldMatch[0].indexOf(dependency.rawText) +
        dependency.rawText.lastIndexOf(currentVersion);
      const range = new vscode.Range(document.positionAt(matchStart), document.positionAt(matchStart));
      updatePromises.push(
        (async () => {
          try {
            const info = await adapter.getPackageInfo(dependency.name);
            const latestVersion = info?.version ?? null;
            if (latestVersion && isNewerVersion(currentVersion, latestVersion)) {
              const updateType = getUpdateType(currentVersion, latestVersion);
              codeLenses.push(
                new vscode.CodeLens(range, {
                  title: formatUpdateTitle(latestVersion, updateType),
                  command: 'npmGallery.updateRDependency',
                  arguments: [document.uri.fsPath, dependency.name, latestVersion],
                })
              );
            }
          } catch {
            // Skip packages that fail.
          }
        })()
      );
    }
  }

  await Promise.all(updatePromises);
  if (codeLenses.length > 0) {
    codeLenses.unshift(
      new vscode.CodeLens(topOfFile, {
        title: `${codeLenses.length} update(s) available`,
        command: 'npmGallery.updateAllRDependencies',
        arguments: [document.uri.fsPath],
      })
    );
  }
  return codeLenses;
}

export async function provideCodeLensesForRproj(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
  const descriptionUri = vscode.Uri.joinPath(document.uri, '..', 'DESCRIPTION');
  let descriptionText: string;

  try {
    const content = await vscode.workspace.fs.readFile(descriptionUri);
    descriptionText = content.toString();
  } catch {
    return [];
  }

  const codeLenses: vscode.CodeLens[] = [];
  const services = getServices();
  const adapter = services.sourceRegistry.getAdapter('cran');
  if (!adapter) {
    return [];
  }

  const topOfFile = topOfFileRange();
  const updatePromises: Promise<void>[] = [];
  const fieldRegex = /^\s*(Depends|Imports|LinkingTo|Suggests|Enhances)\s*:\s*(.+)$/gim;
  let fieldMatch: RegExpExecArray | null;
  while ((fieldMatch = fieldRegex.exec(descriptionText)) !== null) {
    const dependencies = parseDescriptionDependenciesForCodeLens(fieldMatch[2]);
    for (const dependency of dependencies) {
      if (!dependency.version) {
        continue;
      }
      const currentVersion = dependency.version;
      updatePromises.push(
        (async () => {
          try {
            const info = await adapter.getPackageInfo(dependency.name);
            const latestVersion = info?.version ?? null;
            if (latestVersion && isNewerVersion(currentVersion, latestVersion)) {
              const updateType = getUpdateType(currentVersion, latestVersion);
              codeLenses.push(
                new vscode.CodeLens(topOfFile, {
                  title: `${dependency.name}: ${formatUpdateTitle(latestVersion, updateType)}`,
                  command: 'npmGallery.updateRDependency',
                  arguments: [descriptionUri.fsPath, dependency.name, latestVersion],
                })
              );
            }
          } catch {
            // Skip packages that fail.
          }
        })()
      );
    }
  }

  await Promise.all(updatePromises);
  if (codeLenses.length > 0) {
    codeLenses.unshift(
      new vscode.CodeLens(topOfFile, {
        title: `${codeLenses.length} update(s) available`,
        command: 'npmGallery.updateAllRDependencies',
        arguments: [descriptionUri.fsPath],
      })
    );
  }
  return codeLenses;
}

function parseDescriptionDependenciesForCodeLens(
  field: string
): Array<{ name: string; version?: string; rawText: string }> {
  const entries: Array<{ name: string; version?: string; rawText: string }> = [];
  const packageRegex = /([A-Za-z][A-Za-z0-9.]+)\s*(?:\(([^)]+)\))?/g;
  let match: RegExpExecArray | null;
  while ((match = packageRegex.exec(field)) !== null) {
    if (match[1] === 'R') {
      continue;
    }
    const rawVersion = match[2]?.trim();
    const version = rawVersion ? rawVersion.replace(/^(>=|<=|==|>|<)\s*/, '').trim() : undefined;
    entries.push({
      name: match[1],
      version,
      rawText: match[0],
    });
  }
  return entries;
}
