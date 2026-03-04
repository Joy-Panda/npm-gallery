import * as vscode from 'vscode';
import { getServices } from '../../services';
import { getUpdateType, isNewerVersion } from '../../utils/version-utils';
import { formatUpdateTitle, topOfFileRange } from './common';

export async function provideCodeLensesForCpanfile(
  document: vscode.TextDocument,
  text: string
): Promise<vscode.CodeLens[]> {
  const codeLenses: vscode.CodeLens[] = [];
  const services = getServices();
  const adapter = services.sourceRegistry.getAdapter('metacpan');
  if (!adapter) {
    return [];
  }

  const updatePromises: Promise<void>[] = [];
  const dependencyRegex = /^\s*(requires|recommends|suggests)\s+['"]([^'"]+)['"](?:\s*,\s*['"]([^'"]+)['"])?/gm;

  for (const match of text.matchAll(dependencyRegex)) {
    const name = match[2];
    const currentVersion = match[3];
    if (!name || !currentVersion) {
      continue;
    }
    const matchIndex = match.index ?? 0;
    const versionStart = matchIndex + match[0].lastIndexOf(currentVersion);
    const range = new vscode.Range(document.positionAt(versionStart), document.positionAt(versionStart));
    updatePromises.push(
      (async () => {
        try {
          const info = await adapter.getPackageInfo(name);
          const latestVersion = info?.version ?? null;
          if (latestVersion && isNewerVersion(currentVersion, latestVersion)) {
            const updateType = getUpdateType(currentVersion, latestVersion);
            codeLenses.push(
              new vscode.CodeLens(range, {
                title: formatUpdateTitle(latestVersion, updateType),
                command: 'npmGallery.updatePerlDependency',
                arguments: [document.uri.fsPath, name, latestVersion],
              })
            );
          }
        } catch {
          // Skip packages that fail.
        }
      })()
    );
  }

  await Promise.all(updatePromises);
  if (codeLenses.length > 0) {
    codeLenses.unshift(
      new vscode.CodeLens(topOfFileRange(), {
        title: `${codeLenses.length} update${codeLenses.length > 1 ? 's' : ''} available`,
        command: 'npmGallery.updateAllPerlDependencies',
        arguments: [document.uri.fsPath],
      })
    );
  }
  return codeLenses;
}
