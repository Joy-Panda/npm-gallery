import * as json from 'jsonc-parser/lib/esm/main.js';
import * as vscode from 'vscode';
import { getServices } from '../../services';
import {
  formatDependencySpecDisplay,
  getUpdateType,
  isNewerVersion,
  parseDependencySpec,
} from '../../utils/version-utils';
import { formatSecurityTitle, formatUpdateTitle } from './common';

type SecuritySummary = { total: number; critical: number; high: number };

export async function provideCodeLensesForPackageJson(
  document: vscode.TextDocument,
  text: string,
  securitySummaries: Map<string, SecuritySummary>
): Promise<vscode.CodeLens[]> {
  const codeLenses: vscode.CodeLens[] = [];
  const tree = json.parseTree(text);
  if (!tree) {
    return [];
  }
  const packageJson = json.getNodeValue(tree) as Record<string, unknown> | undefined;
  if (!packageJson || typeof packageJson !== 'object') {
    return [];
  }

  const depSections = ['dependencies', 'devDependencies', 'peerDependencies'];
  for (const section of depSections) {
    const sectionDeps = packageJson[section];
    if (sectionDeps && typeof sectionDeps === 'object' && !Array.isArray(sectionDeps)) {
      const sectionLenses = await getCodeLensesForNpmSection(
        document,
        section,
        sectionDeps as Record<string, string>,
        tree,
        securitySummaries
      );
      codeLenses.push(...sectionLenses);
    }
  }

  return codeLenses;
}

async function getCodeLensesForNpmSection(
  document: vscode.TextDocument,
  section: string,
  deps: Record<string, string>,
  tree: json.Node,
  securitySummaries: Map<string, SecuritySummary>
): Promise<vscode.CodeLens[]> {
  const codeLenses: vscode.CodeLens[] = [];
  const services = getServices();
  const config = vscode.workspace.getConfiguration('npmGallery');
  const showSecurityInfo = config.get<boolean>('showSecurityInfo', true);

  const sectionValueNode = json.findNodeAtLocation(tree, [section]);
  if (!sectionValueNode || sectionValueNode.type !== 'object') {
    return [];
  }
  const sectionKeyNode = sectionValueNode.parent?.type === 'property' && sectionValueNode.parent.children?.[0]
    ? sectionValueNode.parent.children[0]
    : null;

  const packagesForSecurity: Array<{ name: string; version: string }> = [];
  if (showSecurityInfo) {
    for (const [name, currentVersionRange] of Object.entries(deps)) {
      const parsedSpec = parseDependencySpec(currentVersionRange);
      if (parsedSpec.isRegistryResolvable && parsedSpec.normalizedVersion) {
        packagesForSecurity.push({ name, version: parsedSpec.normalizedVersion });
      }
    }
  }

  let bulkSecurity: Record<string, { summary: SecuritySummary } | null> = {};
  if (showSecurityInfo && packagesForSecurity.length > 0) {
    try {
      const securityResults = await services.package.getSecurityInfoBulk(packagesForSecurity);
      const mapped: typeof bulkSecurity = {};
      for (const { name, version } of packagesForSecurity) {
        const key = `${name}@${version}`;
        const sec = securityResults[key];
        mapped[key] = sec && sec.summary
          ? { summary: { total: sec.summary.total, critical: sec.summary.critical, high: sec.summary.high } }
          : null;
      }
      bulkSecurity = mapped;
    } catch {
      bulkSecurity = {};
    }
  }

  let updatesCount = 0;
  const updatePromises: Promise<void>[] = [];

  for (const [name, currentVersionRange] of Object.entries(deps)) {
    const parsedSpec = parseDependencySpec(currentVersionRange);
    const valueNode = json.findNodeAtLocation(tree, [section, name]);
    const keyNode = valueNode?.parent?.type === 'property' && valueNode.parent.children?.[0]
      ? valueNode.parent.children[0]
      : null;

    if (!parsedSpec.isRegistryResolvable || !parsedSpec.normalizedVersion) {
      if (keyNode) {
        const start = document.positionAt(keyNode.offset);
        const end = document.positionAt(keyNode.offset + keyNode.length);
        const range = new vscode.Range(start, end);
        codeLenses.push(
          new vscode.CodeLens(range, {
            title: `📍 ${formatDependencySpecDisplay(parsedSpec)}`,
            command: 'npmGallery.showPackageDetails',
            arguments: [name],
          })
        );
      }
      continue;
    }

    const currentVersion = parsedSpec.normalizedVersion;
    updatePromises.push(
      (async () => {
        try {
          const securityKey = `${name}@${currentVersion}`;
          let securitySummary = securitySummaries.get(securityKey);

          const latestVersion = await services.package.getLatestVersion(name);
          if (showSecurityInfo && !securitySummary) {
            const sec = bulkSecurity[securityKey];
            if (sec && sec.summary) {
              securitySummary = sec.summary;
              securitySummaries.set(securityKey, securitySummary);
            }
          }

          if (!keyNode) {
            return;
          }

          const start = document.positionAt(keyNode.offset);
          const end = document.positionAt(keyNode.offset + keyNode.length);
          const range = new vscode.Range(start, end);

          if (showSecurityInfo && securitySummary) {
            codeLenses.push(
              new vscode.CodeLens(range, {
                title: formatSecurityTitle(securitySummary),
                command: 'npmGallery.showPackageDetails',
                arguments: [name, { installedVersion: currentVersion, securityOnly: true }],
              })
            );
          }

          if (latestVersion && isNewerVersion(currentVersion, latestVersion)) {
            const updateType = getUpdateType(currentVersion, latestVersion);
            updatesCount += 1;
            codeLenses.push(
              new vscode.CodeLens(range, {
                title: formatUpdateTitle(latestVersion, updateType),
                command: 'npmGallery.updatePackage',
                arguments: [name, latestVersion],
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
  if (updatesCount > 0 && sectionKeyNode) {
    const sectionPosition = document.positionAt(sectionKeyNode.offset);
    const sectionRange = new vscode.Range(sectionPosition, sectionPosition);
    codeLenses.unshift(
      new vscode.CodeLens(sectionRange, {
        title: `${updatesCount} update${updatesCount > 1 ? 's' : ''} available`,
        command: 'npmGallery.updateAllPackages',
        arguments: [section],
      })
    );
  }

  return codeLenses;
}
