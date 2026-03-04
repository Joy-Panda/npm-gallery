import * as vscode from 'vscode';
import { getServices } from '../../services';
import { getUpdateType, isNewerVersion } from '../../utils/version-utils';
import {
  formatSecurityTitle,
  formatUpdateTitle,
  parseGemfileLockVersions,
  topOfFileRange,
} from './common';

export async function provideCodeLensesForGemfile(
  document: vscode.TextDocument,
  text: string
): Promise<vscode.CodeLens[]> {
  const codeLenses: vscode.CodeLens[] = [];
  const services = getServices();
  const config = vscode.workspace.getConfiguration('npmGallery');
  const showSecurityInfo = config.get<boolean>('showSecurityInfo', true);
  const rubygemsAdapter = services.sourceRegistry.getAdapter('rubygems');
  if (!rubygemsAdapter) {
    return [];
  }

  let lockedVersions = new Map<string, string>();
  try {
    const lockUri = vscode.Uri.joinPath(document.uri, '..', 'Gemfile.lock');
    const lockContent = await vscode.workspace.fs.readFile(lockUri);
    lockedVersions = parseGemfileLockVersions(lockContent.toString());
  } catch {
    lockedVersions = new Map<string, string>();
  }

  const updatePromises: Promise<void>[] = [];

  for (const match of text.matchAll(/^\s*gem\s+['"]([^'"]+)['"]\s*(?:,\s*['"]([^'"]+)['"])?/gm)) {
    const name = match[1];
    const versionRange = match[2];
    if (!name) {
      continue;
    }

    const lineText = document.lineAt(document.positionAt(match.index ?? 0).line).text;
    if (/^\s*#/.test(lineText)) {
      continue;
    }

    const currentVersion = lockedVersions.get(name) || (versionRange || '').replace(/^[~><=\s]+/, '') || undefined;
    const range = new vscode.Range(
      document.positionAt(match.index ?? 0),
      document.positionAt((match.index ?? 0) + match[0].length)
    );

    updatePromises.push(
      (async () => {
        try {
          if (showSecurityInfo && currentVersion && rubygemsAdapter.getSecurityInfo) {
            try {
              const security = await rubygemsAdapter.getSecurityInfo(name, currentVersion);
              if (security?.summary) {
                codeLenses.push(
                  new vscode.CodeLens(range, {
                    title: formatSecurityTitle(security.summary),
                    command: 'npmGallery.showPackageDetails',
                    arguments: [name, { installedVersion: currentVersion, securityOnly: true }],
                  })
                );
              }
            } catch {
              // Continue without security lens.
            }
          }

          const info = await rubygemsAdapter.getPackageInfo(name);
          const latestVersion = info?.version ?? null;
          if (currentVersion && latestVersion && isNewerVersion(currentVersion, latestVersion)) {
            const updateType = getUpdateType(currentVersion, latestVersion);
            codeLenses.push(
              new vscode.CodeLens(range, {
                title: formatUpdateTitle(latestVersion, updateType),
                command: 'npmGallery.updatePackage',
                arguments: [{
                  pkg: {
                    name,
                    latestVersion,
                    packageJsonPath: document.uri.fsPath,
                  },
                }],
              })
            );
          }
        } catch {
          // Skip packages that fail.
        }
      })()
    );
  }

  let updateLensCount = 0;
  await Promise.all(updatePromises);
  for (const lens of codeLenses) {
    if (lens.command?.command === 'npmGallery.updatePackage') {
      updateLensCount += 1;
    }
  }
  if (updateLensCount > 0) {
    codeLenses.unshift(
      new vscode.CodeLens(topOfFileRange(), {
        title: `${updateLensCount} update${updateLensCount > 1 ? 's' : ''} available`,
        command: 'npmGallery.updateAllRubyDependencies',
        arguments: [document.uri.fsPath],
      })
    );
  }
  return codeLenses;
}
