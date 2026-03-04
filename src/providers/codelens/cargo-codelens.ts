import * as vscode from 'vscode';
import { getServices } from '../../services';
import { getUpdateType, isNewerVersion } from '../../utils/version-utils';
import { formatSecurityTitle, formatUpdateTitle, topOfFileRange } from './common';

export async function provideCodeLensesForCargoToml(
  document: vscode.TextDocument,
  text: string
): Promise<vscode.CodeLens[]> {
  const codeLenses: vscode.CodeLens[] = [];
  const services = getServices();
  const config = vscode.workspace.getConfiguration('npmGallery');
  const showSecurityInfo = config.get<boolean>('showSecurityInfo', true);
  const cratesAdapter = services.sourceRegistry.getAdapter('crates-io');
  if (!cratesAdapter) {
    return [];
  }

  const lines = text.split(/\r?\n/);
  let currentSection = '';
  const updatePromises: Promise<void>[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const trimmed = line.trim();
    const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      continue;
    }

    if (!isCargoDependencySection(currentSection)) {
      continue;
    }

    const parsed = parseCargoDependencyForCodeLens(line);
    if (!parsed || !parsed.version) {
      continue;
    }
    const currentVersion = parsed.version;
    const versionStart = line.indexOf(currentVersion);
    const range = new vscode.Range(
      new vscode.Position(lineIndex, versionStart),
      new vscode.Position(lineIndex, versionStart)
    );

    updatePromises.push(
      (async () => {
        try {
          if (showSecurityInfo && cratesAdapter.getSecurityInfo) {
            try {
              const security = await cratesAdapter.getSecurityInfo(parsed.name, currentVersion);
              if (security?.summary) {
                codeLenses.push(
                  new vscode.CodeLens(range, {
                    title: formatSecurityTitle(security.summary),
                    command: 'npmGallery.showPackageDetails',
                    arguments: [parsed.name, { installedVersion: currentVersion, securityOnly: true }],
                  })
                );
              }
            } catch {
              // Continue without security lens.
            }
          }

          const info = await cratesAdapter.getPackageInfo(parsed.name);
          const latestVersion = info?.version ?? null;
          if (latestVersion && isNewerVersion(currentVersion, latestVersion)) {
            const updateType = getUpdateType(currentVersion, latestVersion);
            codeLenses.push(
              new vscode.CodeLens(range, {
                title: formatUpdateTitle(latestVersion, updateType),
                command: 'npmGallery.updateCargoDependency',
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
  const updateLensCount = codeLenses.filter((lens) => lens.command?.command === 'npmGallery.updateCargoDependency').length;
  if (updateLensCount > 0) {
    codeLenses.unshift(
      new vscode.CodeLens(topOfFileRange(), {
        title: `${updateLensCount} update${updateLensCount > 1 ? 's' : ''} available`,
        command: 'npmGallery.updateAllCargoDependencies',
        arguments: [document.uri.fsPath],
      })
    );
  }
  return codeLenses;
}

function isCargoDependencySection(sectionName: string): boolean {
  return sectionName === 'dependencies' ||
    sectionName === 'dev-dependencies' ||
    sectionName === 'build-dependencies' ||
    sectionName.endsWith('.dependencies') ||
    sectionName.endsWith('.dev-dependencies') ||
    sectionName.endsWith('.build-dependencies');
}

function parseCargoDependencyForCodeLens(line: string): { name: string; version?: string } | null {
  const stringMatch = line.match(/^\s*([A-Za-z0-9_-]+)\s*=\s*"([^"]+)"/);
  if (stringMatch) {
    return { name: stringMatch[1], version: stringMatch[2] };
  }

  const inlineMatch = line.match(/^\s*([A-Za-z0-9_-]+)\s*=\s*\{(.*)\}/);
  if (!inlineMatch) {
    return null;
  }

  const versionMatch = inlineMatch[2].match(/\bversion\s*=\s*"([^"]+)"/);
  return { name: inlineMatch[1], version: versionMatch?.[1] };
}
