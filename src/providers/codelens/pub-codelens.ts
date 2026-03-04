import * as vscode from 'vscode';
import { getServices } from '../../services';
import { getUpdateType, isNewerVersion } from '../../utils/version-utils';
import { formatSecurityTitle, formatUpdateTitle, topOfFileRange } from './common';

export async function provideCodeLensesForPubspecYaml(
  document: vscode.TextDocument,
  text: string
): Promise<vscode.CodeLens[]> {
  const codeLenses: vscode.CodeLens[] = [];
  const services = getServices();
  const config = vscode.workspace.getConfiguration('npmGallery');
  const showSecurityInfo = config.get<boolean>('showSecurityInfo', true);
  const adapter = services.sourceRegistry.getAdapter('pub-dev');
  if (!adapter) {
    return [];
  }

  const lines = text.split(/\r?\n/);
  let currentSection = '';
  const updatePromises: Promise<void>[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const sectionMatch = line.match(/^([A-Za-z_]+):\s*$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      continue;
    }

    if (!isPubspecDependencySection(currentSection)) {
      continue;
    }

    const parsed = parsePubspecDependencyForCodeLens(lines, lineIndex);
    if (!parsed || !parsed.version) {
      continue;
    }
    const currentVersion = parsed.version;
    const range = new vscode.Range(
      new vscode.Position(parsed.versionLine, parsed.versionColumn),
      new vscode.Position(parsed.versionLine, parsed.versionColumn)
    );

    updatePromises.push(
      (async () => {
        try {
          if (showSecurityInfo && adapter.getSecurityInfo) {
            try {
              const security = await adapter.getSecurityInfo(parsed.name, currentVersion);
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

          const info = await adapter.getPackageInfo(parsed.name);
          const latestVersion = info?.version ?? null;
          if (latestVersion && isNewerVersion(currentVersion, latestVersion)) {
            const updateType = getUpdateType(currentVersion, latestVersion);
            codeLenses.push(
              new vscode.CodeLens(range, {
                title: formatUpdateTitle(latestVersion, updateType),
                command: 'npmGallery.updatePubspecDependency',
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
  const updateLensCount = codeLenses.filter((lens) => lens.command?.command === 'npmGallery.updatePubspecDependency').length;
  if (updateLensCount > 0) {
    codeLenses.unshift(
      new vscode.CodeLens(topOfFileRange(), {
        title: `${updateLensCount} update${updateLensCount > 1 ? 's' : ''} available`,
        command: 'npmGallery.updateAllPubDependencies',
        arguments: [document.uri.fsPath],
      })
    );
  }
  return codeLenses;
}

function isPubspecDependencySection(sectionName: string): boolean {
  return sectionName === 'dependencies' ||
    sectionName === 'dev_dependencies' ||
    sectionName === 'dependency_overrides';
}

function parsePubspecDependencyForCodeLens(
  lines: string[],
  lineIndex: number
): { name: string; version?: string; versionLine: number; versionColumn: number } | null {
  const line = lines[lineIndex];
  const stringMatch = line.match(/^\s{2,}([A-Za-z0-9_.-]+)\s*:\s*["']?([^"'#\n]+)["']?\s*$/);
  if (stringMatch) {
    const version = stringMatch[2].trim();
    return {
      name: stringMatch[1],
      version,
      versionLine: lineIndex,
      versionColumn: line.indexOf(version),
    };
  }

  const blockMatch = line.match(/^\s{2,}([A-Za-z0-9_.-]+)\s*:\s*$/);
  if (!blockMatch) {
    return null;
  }

  for (let index = lineIndex + 1; index < lines.length; index += 1) {
    const candidate = lines[index];
    if (!candidate.trim()) {
      continue;
    }
    if (/^\S/.test(candidate) || /^\s{2}[A-Za-z0-9_.-]+\s*:\s*$/.test(candidate)) {
      break;
    }

    const versionMatch = candidate.match(/^\s{4,}version:\s*["']?([^"'#\n]+)["']?\s*$/);
    if (versionMatch) {
      const version = versionMatch[1].trim();
      return {
        name: blockMatch[1],
        version,
        versionLine: index,
        versionColumn: candidate.indexOf(version),
      };
    }
  }

  return null;
}
