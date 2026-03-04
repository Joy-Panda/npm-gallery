import * as vscode from 'vscode';
import { getServices } from '../../services';
import { getUpdateType, isNewerVersion } from '../../utils/version-utils';
import { formatSecurityTitle, formatUpdateTitle, topOfFileRange } from './common';

export async function provideCodeLensesForPomXml(
  document: vscode.TextDocument,
  text: string
): Promise<vscode.CodeLens[]> {
  const codeLenses: vscode.CodeLens[] = [];
  const services = getServices();
  const config = vscode.workspace.getConfiguration('npmGallery');
  const showSecurityInfo = config.get<boolean>('showSecurityInfo', true);
  const currentSource = services.getCurrentSourceType();
  const securityAdapter = currentSource === 'libraries-io'
    ? services.sourceRegistry.getAdapter('libraries-io')
    : services.sourceRegistry.getAdapter('sonatype');
  if (!securityAdapter) {
    return codeLenses;
  }

  const dependencyRegex = /<dependency>([\s\S]*?)<\/dependency>/g;
  let dependencyMatch: RegExpExecArray | null;
  const updatePromises: Promise<void>[] = [];
  let updateLensCount = 0;

  while ((dependencyMatch = dependencyRegex.exec(text)) !== null) {
    const depContent = dependencyMatch[1];
    const groupIdMatch = depContent.match(/<groupId>(.*?)<\/groupId>/);
    const artifactIdMatch = depContent.match(/<artifactId>(.*?)<\/artifactId>/);
    const versionMatch = depContent.match(/<version>(.*?)<\/version>/);

    if (!groupIdMatch || !artifactIdMatch || !versionMatch) {
      continue;
    }

    const groupId = groupIdMatch[1].trim();
    const artifactId = artifactIdMatch[1].trim();
    const currentVersion = versionMatch[1].trim();
    if (/\$\{.+\}/.test(currentVersion)) {
      continue;
    }

    const coordinate = `${groupId}:${artifactId}`;
    const versionTagStart = dependencyMatch.index + depContent.indexOf('<version>');
    const position = document.positionAt(versionTagStart);
    const range = new vscode.Range(position, position);

    updatePromises.push(
      (async () => {
        try {
          if (showSecurityInfo && securityAdapter.getSecurityInfo) {
            try {
              const security = await securityAdapter.getSecurityInfo(coordinate, currentVersion);
              if (security?.summary) {
                codeLenses.push(
                  new vscode.CodeLens(range, {
                    title: formatSecurityTitle(security.summary),
                    command: 'npmGallery.showPackageDetails',
                    arguments: [coordinate, { installedVersion: currentVersion, securityOnly: true }],
                  })
                );
              }
            } catch {
              // Continue without security lens.
            }
          }

          const latestVersion = await services.package.getLatestVersion(coordinate);
          if (latestVersion && isNewerVersion(currentVersion, latestVersion)) {
            const updateType = getUpdateType(currentVersion, latestVersion);
            codeLenses.push(
              new vscode.CodeLens(range, {
                title: formatUpdateTitle(latestVersion, updateType),
                command: 'npmGallery.updateMavenDependency',
                arguments: [document.uri.fsPath, groupId, artifactId, latestVersion],
              })
            );
            updateLensCount += 1;
          }
        } catch {
          // Skip packages that fail
        }
      })()
    );
  }

  await Promise.all(updatePromises);
  if (updateLensCount > 0) {
    codeLenses.unshift(
      new vscode.CodeLens(topOfFileRange(), {
        title: `${updateLensCount} update${updateLensCount > 1 ? 's' : ''} available`,
        command: 'npmGallery.updateAllSonatypeDependencies',
        arguments: [document.uri.fsPath],
      })
    );
  }

  return codeLenses;
}

export async function provideCodeLensesForGradle(
  document: vscode.TextDocument,
  text: string
): Promise<vscode.CodeLens[]> {
  const codeLenses: vscode.CodeLens[] = [];
  const services = getServices();
  const config = vscode.workspace.getConfiguration('npmGallery');
  const showSecurityInfo = config.get<boolean>('showSecurityInfo', true);
  const currentSource = services.getCurrentSourceType();
  const securityAdapter = currentSource === 'libraries-io'
    ? services.sourceRegistry.getAdapter('libraries-io')
    : services.sourceRegistry.getAdapter('sonatype');
  if (!securityAdapter) {
    return codeLenses;
  }

  const gradleDepRegex =
    /(?:^|\s)(implementation|testImplementation|compileOnly|runtimeOnly|api|compile)\s*(?:\(\s*)?['"]([^:]+):([^:]+):([^"')\s]+)['"]\s*\)?/gm;
  let depMatch: RegExpExecArray | null;
  const updatePromises: Promise<void>[] = [];
  let updateLensCount = 0;

  while ((depMatch = gradleDepRegex.exec(text)) !== null) {
    const groupId = depMatch[2];
    const artifactId = depMatch[3];
    const currentVersion = depMatch[4];
    if (/[${]/.test(currentVersion)) {
      continue;
    }

    const coordinate = `${groupId}:${artifactId}`;
    const matchIndex = depMatch.index;
    const versionStart = matchIndex + depMatch[0].lastIndexOf(':') + 1;
    const position = document.positionAt(versionStart);
    const range = new vscode.Range(position, position);

    updatePromises.push(
      (async () => {
        try {
          if (showSecurityInfo && securityAdapter.getSecurityInfo) {
            try {
              const security = await securityAdapter.getSecurityInfo(coordinate, currentVersion);
              if (security?.summary) {
                codeLenses.push(
                  new vscode.CodeLens(range, {
                    title: formatSecurityTitle(security.summary),
                    command: 'npmGallery.showPackageDetails',
                    arguments: [coordinate, { installedVersion: currentVersion, securityOnly: true }],
                  })
                );
              }
            } catch {
              // Continue without security lens.
            }
          }

          const latestVersion = await services.package.getLatestVersion(coordinate);
          if (latestVersion && isNewerVersion(currentVersion, latestVersion)) {
            const updateType = getUpdateType(currentVersion, latestVersion);
            codeLenses.push(
              new vscode.CodeLens(range, {
                title: formatUpdateTitle(latestVersion, updateType),
                command: 'npmGallery.updateGradleDependency',
                arguments: [document.uri.fsPath, groupId, artifactId, latestVersion],
              })
            );
            updateLensCount += 1;
          }
        } catch {
          // Skip packages that fail
        }
      })()
    );
  }

  await Promise.all(updatePromises);
  if (updateLensCount > 0) {
    codeLenses.unshift(
      new vscode.CodeLens(topOfFileRange(), {
        title: `${updateLensCount} update${updateLensCount > 1 ? 's' : ''} available`,
        command: 'npmGallery.updateAllSonatypeDependencies',
        arguments: [document.uri.fsPath],
      })
    );
  }

  return codeLenses;
}
