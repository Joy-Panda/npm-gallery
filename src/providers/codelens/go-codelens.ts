import * as vscode from 'vscode';
import { getServices } from '../../services';
import { getUpdateType, isNewerVersion } from '../../utils/version-utils';
import { formatSecurityTitle, formatUpdateTitle, topOfFileRange } from './common';

export async function provideCodeLensesForGoMod(
  document: vscode.TextDocument,
  text: string
): Promise<vscode.CodeLens[]> {
  const codeLenses: vscode.CodeLens[] = [];
  const services = getServices();
  const config = vscode.workspace.getConfiguration('npmGallery');
  const showSecurityInfo = config.get<boolean>('showSecurityInfo', true);
  const goAdapter = services.sourceRegistry.getAdapter('pkg-go-dev');
  if (!goAdapter) {
    return [];
  }

  const lines = text.split(/\r?\n/);
  const updatePromises: Promise<void>[] = [];
  let inRequireBlock = false;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const trimmed = line.replace(/\s*\/\/.*$/, '').trim();
    if (!trimmed) {
      continue;
    }

    if (/^require\s*\($/.test(trimmed)) {
      inRequireBlock = true;
      continue;
    }
    if (inRequireBlock && trimmed === ')') {
      inRequireBlock = false;
      continue;
    }

    const parsed = parseGoDependencyForCodeLens(trimmed, inRequireBlock);
    if (!parsed) {
      continue;
    }

    const versionStart = line.indexOf(parsed.version);
    const range = new vscode.Range(
      new vscode.Position(lineIndex, versionStart),
      new vscode.Position(lineIndex, versionStart)
    );

    updatePromises.push(
      (async () => {
        try {
          if (showSecurityInfo && goAdapter.getSecurityInfo) {
            try {
              const security = await goAdapter.getSecurityInfo(parsed.name, parsed.version);
              if (security?.summary) {
                codeLenses.push(
                  new vscode.CodeLens(range, {
                    title: formatSecurityTitle(security.summary),
                    command: 'npmGallery.showPackageDetails',
                    arguments: [parsed.name, { installedVersion: parsed.version, securityOnly: true }],
                  })
                );
              }
            } catch {
              // Continue without security lens.
            }
          }

          const info = await goAdapter.getPackageInfo(parsed.name);
          const latestVersion = info?.version ?? null;
          if (latestVersion && isNewerVersion(parsed.version, latestVersion)) {
            const updateType = getUpdateType(parsed.version, latestVersion);
            codeLenses.push(
              new vscode.CodeLens(range, {
                title: formatUpdateTitle(latestVersion, updateType),
                command: 'npmGallery.updateGoDependency',
                arguments: [document.uri.fsPath, parsed.name, latestVersion],
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
  const updateLensCount = codeLenses.filter((lens) => lens.command?.command === 'npmGallery.updateGoDependency').length;
  if (updateLensCount > 0) {
    codeLenses.unshift(
      new vscode.CodeLens(topOfFileRange(), {
        title: `${updateLensCount} update${updateLensCount > 1 ? 's' : ''} available`,
        command: 'npmGallery.updateAllGoDependencies',
        arguments: [document.uri.fsPath],
      })
    );
  }

  return codeLenses;
}

function parseGoDependencyForCodeLens(
  trimmedLine: string,
  inRequireBlock: boolean
): { name: string; version: string } | null {
  const content = inRequireBlock ? trimmedLine : (trimmedLine.match(/^require\s+(.+)$/)?.[1] || '');
  const match = content.match(/^([^\s]+)\s+(v[^\s]+)$/);
  if (!match) {
    return null;
  }

  return {
    name: match[1],
    version: match[2],
  };
}
