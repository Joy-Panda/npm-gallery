import * as vscode from 'vscode';
import { getServices } from '../../services';
import type { ISourceAdapter } from '../../sources/base/source-adapter.interface';
import { getUpdateType, isNewerVersion } from '../../utils/version-utils';
import { parseDepsEdnDependencies } from '../../utils/clojure-deps';
import { formatSecurityTitle, formatUpdateTitle, topOfFileRange } from './common';

export async function provideCodeLensesForDepsEdn(
  document: vscode.TextDocument,
  text: string
): Promise<vscode.CodeLens[]> {
  return provideCodeLensesForClojure(document, text, 'deps');
}

export async function provideCodeLensesForProjectClj(
  document: vscode.TextDocument,
  text: string
): Promise<vscode.CodeLens[]> {
  return provideCodeLensesForClojure(document, text, 'lein');
}

async function provideCodeLensesForClojure(
  document: vscode.TextDocument,
  text: string,
  mode: 'deps' | 'lein'
): Promise<vscode.CodeLens[]> {
  const codeLenses: vscode.CodeLens[] = [];
  const services = getServices();
  const config = vscode.workspace.getConfiguration('npmGallery');
  const showSecurityInfo = config.get<boolean>('showSecurityInfo', true);
  const clojarsAdapter = services.sourceRegistry.getAdapter('clojars');
  if (!clojarsAdapter) {
    return [];
  }

  const updatePromises: Promise<void>[] = [];
  const updateCommand = mode === 'deps' ? 'npmGallery.updateDepsEdnDependency' : 'npmGallery.updateLeiningenDependency';

  if (mode === 'deps') {
    for (const dependency of parseDepsEdnDependencies(text)) {
      const range = new vscode.Range(
        document.positionAt(dependency.versionStart),
        document.positionAt(dependency.versionStart)
      );

      updatePromises.push(
        addClojarsDependencyLenses(
          codeLenses,
          clojarsAdapter,
          showSecurityInfo,
          dependency.name,
          dependency.version,
          range,
          updateCommand,
          [document.uri.fsPath, dependency.name]
        )
      );
    }
  } else {
    for (const match of text.matchAll(/\[([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\s+"([^"]+)"/gm)) {
      const name = match[1];
      const currentVersion = match[2];
      const matchIndex = match.index ?? 0;
      const versionStart = matchIndex + match[0].indexOf(`"${currentVersion}"`) + 1;
      const range = new vscode.Range(document.positionAt(versionStart), document.positionAt(versionStart));

      updatePromises.push(
        addClojarsDependencyLenses(
          codeLenses,
          clojarsAdapter,
          showSecurityInfo,
          name,
          currentVersion,
          range,
          updateCommand,
          [document.uri.fsPath, name]
        )
      );
    }
  }

  await Promise.all(updatePromises);
  const updateLensCount = codeLenses.filter((lens) => lens.command?.command === updateCommand).length;
  if (updateLensCount > 0) {
    codeLenses.unshift(
      new vscode.CodeLens(topOfFileRange(), {
        title: `${updateLensCount} update${updateLensCount > 1 ? 's' : ''} available`,
        command: 'npmGallery.updateAllClojureDependencies',
        arguments: [document.uri.fsPath],
      })
    );
  }
  return codeLenses;
}

async function addClojarsDependencyLenses(
  codeLenses: vscode.CodeLens[],
  clojarsAdapter: ISourceAdapter,
  showSecurityInfo: boolean,
  name: string,
  currentVersion: string,
  range: vscode.Range,
  updateCommand: string,
  updateArgs: [string, string]
): Promise<void> {
  try {
    if (showSecurityInfo && clojarsAdapter.getSecurityInfo) {
      try {
        const security = await clojarsAdapter.getSecurityInfo(name, currentVersion);
        if (security?.summary) {
          codeLenses.push(
            new vscode.CodeLens(range, {
              title: formatSecurityTitle(security.summary),
              command: 'npmGallery.showPackageDetails',
              arguments: [name, { installedVersion: currentVersion, securityOnly: true, source: 'clojars' }],
            })
          );
        }
      } catch {
        // Continue without security lens.
      }
    }

    const info = await clojarsAdapter.getPackageInfo(name);
    const latestVersion = info?.version ?? null;
    if (latestVersion && isNewerVersion(currentVersion, latestVersion)) {
      const updateType = getUpdateType(currentVersion, latestVersion);
      codeLenses.push(
        new vscode.CodeLens(range, {
          title: formatUpdateTitle(latestVersion, updateType),
          command: updateCommand,
          arguments: [...updateArgs, latestVersion],
        })
      );
    }
  } catch {
    // Skip packages that fail.
  }
}
