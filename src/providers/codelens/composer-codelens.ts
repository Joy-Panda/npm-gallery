import * as json from 'jsonc-parser/lib/esm/main.js';
import * as vscode from 'vscode';
import { getServices } from '../../services';
import { getUpdateType, isNewerVersion, parseDependencySpec } from '../../utils/version-utils';
import {
  formatSecurityTitle,
  formatUpdateTitle,
  isComposerPlatformPackage,
  topOfFileRange,
} from './common';

export async function provideCodeLensesForComposerJson(
  document: vscode.TextDocument,
  text: string
): Promise<vscode.CodeLens[]> {
  const codeLenses: vscode.CodeLens[] = [];
  const tree = json.parseTree(text);
  if (!tree) {
    return [];
  }

  const composerJson = json.getNodeValue(tree) as Record<string, unknown> | undefined;
  if (!composerJson || typeof composerJson !== 'object') {
    return [];
  }

  const services = getServices();
  const config = vscode.workspace.getConfiguration('npmGallery');
  const showSecurityInfo = config.get<boolean>('showSecurityInfo', true);
  const packagistAdapter = services.sourceRegistry.getAdapter('packagist');
  if (!packagistAdapter) {
    return [];
  }

  const sections = ['require', 'require-dev'];
  let updateLensCount = 0;
  const updatePromises: Promise<void>[] = [];

  for (const section of sections) {
    const sectionDeps = composerJson[section];
    if (!sectionDeps || typeof sectionDeps !== 'object' || Array.isArray(sectionDeps)) {
      continue;
    }

    for (const [name, versionRange] of Object.entries(sectionDeps as Record<string, string>)) {
      if (typeof versionRange !== 'string' || isComposerPlatformPackage(name)) {
        continue;
      }

      const valueNode = json.findNodeAtLocation(tree, [section, name]);
      const keyNode = valueNode?.parent?.type === 'property' && valueNode.parent.children?.[0]
        ? valueNode.parent.children[0]
        : null;
      if (!keyNode) {
        continue;
      }

      const parsedSpec = parseDependencySpec(versionRange);
      if (!parsedSpec.isRegistryResolvable || !parsedSpec.normalizedVersion) {
        continue;
      }

      const currentVersion = parsedSpec.normalizedVersion;
      updatePromises.push(
        (async () => {
          try {
            const range = new vscode.Range(
              document.positionAt(keyNode.offset),
              document.positionAt(keyNode.offset + keyNode.length)
            );

            if (showSecurityInfo && packagistAdapter.getSecurityInfo) {
              try {
                const security = await packagistAdapter.getSecurityInfo(name, currentVersion);
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

            const info = await packagistAdapter.getPackageInfo(name);
            const latestVersion = info?.version ?? null;
            if (latestVersion && isNewerVersion(currentVersion, latestVersion)) {
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
              updateLensCount += 1;
            }
          } catch {
            // Skip packages that fail.
          }
        })()
      );
    }
  }

  await Promise.all(updatePromises);
  if (updateLensCount > 0) {
    codeLenses.unshift(
      new vscode.CodeLens(topOfFileRange(), {
        title: `${updateLensCount} update${updateLensCount > 1 ? 's' : ''} available`,
        command: 'npmGallery.updateAllComposerDependencies',
        arguments: [document.uri.fsPath],
      })
    );
  }
  return codeLenses;
}
