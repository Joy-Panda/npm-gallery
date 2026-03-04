import * as vscode from 'vscode';
import { getServices } from '../../services';
import type { ISourceAdapter } from '../../sources/base/source-adapter.interface';
import { getUpdateType, isNewerVersion } from '../../utils/version-utils';
import { parseCakeDirectives } from '../../utils/cake-utils';
import { formatSecurityTitle, formatUpdateTitle, readXmlAttribute } from './common';

type SecuritySummary = { total: number; critical: number; high: number };
type NuGetEntry = { name: string; version: string; versionStart: number };

export async function provideCodeLensesForDirectoryPackagesProps(
  document: vscode.TextDocument,
  text: string,
  securitySummaries: Map<string, SecuritySummary>
): Promise<vscode.CodeLens[]> {
  const codeLenses: vscode.CodeLens[] = [];
  const services = getServices();
  const config = vscode.workspace.getConfiguration('npmGallery');
  const showSecurityInfo = config.get<boolean>('showSecurityInfo', true);
  const nugetAdapter = services.sourceRegistry.getAdapter('nuget');
  if (!nugetAdapter) {
    return codeLenses;
  }

  const packageVersionRegex = /<PackageVersion\s+Include="([^"]+)"\s+Version="([^"]+)"\s*\/>|<PackageVersion\s+Version="([^"]+)"\s+Include="([^"]+)"\s*\/>/gi;
  let match: RegExpExecArray | null;
  const entries: Array<{ name: string; version: string; versionAttrStart: number }> = [];

  while ((match = packageVersionRegex.exec(text)) !== null) {
    const includeId = match[1] ?? match[4];
    const version = match[2] ?? match[3];
    if (!includeId || !version) {
      continue;
    }

    const versionAttrStart = text.indexOf(version, match.index);
    if (versionAttrStart === -1) {
      continue;
    }

    entries.push({ name: includeId, version, versionAttrStart });
  }

  let bulkSecurity: Record<string, { summary: SecuritySummary } | null> = {};
  if (showSecurityInfo && entries.length > 0) {
    try {
      const securityResults = await services.package.getSecurityInfoBulk(
        entries.map((entry) => ({ name: entry.name, version: entry.version }))
      );
      for (const entry of entries) {
        const key = `${entry.name}@${entry.version}`;
        const sec = securityResults[key];
        bulkSecurity[key] = sec?.summary
          ? {
              summary: {
                total: sec.summary.total,
                critical: sec.summary.critical,
                high: sec.summary.high,
              },
            }
          : null;
      }
    } catch {
      bulkSecurity = {};
    }
  }

  const updatePromises: Promise<void>[] = [];
  for (const entry of entries) {
    updatePromises.push(
      (async () => {
        try {
          const securityKey = `${entry.name}@${entry.version}`;
          let securitySummary = securitySummaries.get(securityKey);
          if (showSecurityInfo && !securitySummary) {
            const sec = bulkSecurity[securityKey];
            if (sec?.summary) {
              securitySummary = sec.summary;
              securitySummaries.set(securityKey, securitySummary);
            }
          }

          const position = document.positionAt(entry.versionAttrStart);
          const range = new vscode.Range(position, position);

          if (showSecurityInfo && securitySummary) {
            codeLenses.push(
              new vscode.CodeLens(range, {
                title: formatSecurityTitle(securitySummary),
                command: 'npmGallery.showPackageDetails',
                arguments: [entry.name, { installedVersion: entry.version, securityOnly: true }],
              })
            );
          }

          const info = await nugetAdapter.getPackageInfo(entry.name);
          const latestVersion = info?.version ?? null;
          if (latestVersion && isNewerVersion(entry.version, latestVersion)) {
            const updateType = getUpdateType(entry.version, latestVersion);
            codeLenses.push(
              new vscode.CodeLens(range, {
                title: formatUpdateTitle(latestVersion, updateType),
                command: 'npmGallery.updateCpmPackage',
                arguments: [document.uri.fsPath, entry.name, latestVersion],
              })
            );
          }
        } catch {
          // Skip packages that fail
        }
      })()
    );
  }

  await Promise.all(updatePromises);
  return codeLenses;
}

export async function provideCodeLensesForPackagesConfig(
  document: vscode.TextDocument,
  text: string,
  securitySummaries: Map<string, SecuritySummary>
): Promise<vscode.CodeLens[]> {
  const codeLenses: vscode.CodeLens[] = [];
  const services = getServices();
  const config = vscode.workspace.getConfiguration('npmGallery');
  const showSecurityInfo = config.get<boolean>('showSecurityInfo', true);
  const nugetAdapter = services.sourceRegistry.getAdapter('nuget');
  if (!nugetAdapter) {
    return codeLenses;
  }

  const entries: NuGetEntry[] = [];
  const packageRegex = /<package\b([^>]*?)\/?>/gi;
  let match: RegExpExecArray | null;
  while ((match = packageRegex.exec(text)) !== null) {
    const attrs = match[1] ?? '';
    const name = readXmlAttribute(attrs, 'id');
    const version = readXmlAttribute(attrs, 'version');
    if (!name || !version) {
      continue;
    }

    const versionAttr = attrs.match(/\bversion\s*=\s*"([^"]+)"/i);
    if (!versionAttr || versionAttr.index === undefined) {
      continue;
    }

    const attrOffset = match.index + match[0].indexOf(attrs);
    const valueOffset = attrOffset + versionAttr.index + versionAttr[0].length - versionAttr[1].length - 1;
    entries.push({ name, version, versionStart: valueOffset });
  }

  await populateNuGetCodeLenses(
    document,
    codeLenses,
    nugetAdapter,
    entries,
    showSecurityInfo,
    securitySummaries,
    (entry) => ({
      title: formatUpdateTitle(entry.latestVersion, entry.updateType),
      command: 'npmGallery.updatePackagesConfigPackage',
      arguments: [document.uri.fsPath, entry.name, entry.latestVersion],
    })
  );

  return codeLenses;
}

export async function provideCodeLensesForProjectPackageReferences(
  document: vscode.TextDocument,
  text: string,
  securitySummaries: Map<string, SecuritySummary>
): Promise<vscode.CodeLens[]> {
  const codeLenses: vscode.CodeLens[] = [];
  const services = getServices();
  const config = vscode.workspace.getConfiguration('npmGallery');
  const showSecurityInfo = config.get<boolean>('showSecurityInfo', true);
  const nugetAdapter = services.sourceRegistry.getAdapter('nuget');
  if (!nugetAdapter) {
    return codeLenses;
  }

  const entries: NuGetEntry[] = [];
  const refRegex = /<PackageReference\b([^>]*?)\/>|<PackageReference\b([^>]*?)>([\s\S]*?)<\/PackageReference>/gi;
  let match: RegExpExecArray | null;
  while ((match = refRegex.exec(text)) !== null) {
    const fullMatch = match[0];
    const attrs = (match[1] ?? match[2] ?? '').trim();
    const body = match[3] ?? '';
    const name = readXmlAttribute(attrs, 'Include') || readXmlAttribute(attrs, 'Update');
    if (!name) {
      continue;
    }

    const attrVersionMatch = attrs.match(/\bVersion\s*=\s*"([^"]+)"/i);
    if (attrVersionMatch && attrVersionMatch.index !== undefined) {
      const attrOffset = match.index + fullMatch.indexOf(attrs);
      const valueOffset = attrOffset + attrVersionMatch.index + attrVersionMatch[0].length - attrVersionMatch[1].length - 1;
      entries.push({ name, version: attrVersionMatch[1], versionStart: valueOffset });
      continue;
    }

    const bodyVersionMatch = body.match(/<Version>\s*([^<]+?)\s*<\/Version>/i);
    if (bodyVersionMatch && bodyVersionMatch.index !== undefined) {
      const bodyOffset = match.index + fullMatch.indexOf(body);
      const valueOffset = bodyOffset + bodyVersionMatch.index + bodyVersionMatch[0].indexOf(bodyVersionMatch[1]);
      entries.push({ name, version: bodyVersionMatch[1].trim(), versionStart: valueOffset });
    }
  }

  await populateNuGetCodeLenses(
    document,
    codeLenses,
    nugetAdapter,
    entries,
    showSecurityInfo,
    securitySummaries,
    (entry) => ({
      title: formatUpdateTitle(entry.latestVersion, entry.updateType),
      command: 'npmGallery.updateProjectPackageReference',
      arguments: [document.uri.fsPath, entry.name, entry.latestVersion],
    })
  );

  return codeLenses;
}

export async function provideCodeLensesForPaketDependencies(
  document: vscode.TextDocument,
  text: string
): Promise<vscode.CodeLens[]> {
  const codeLenses: vscode.CodeLens[] = [];
  const services = getServices();
  const nugetAdapter = services.sourceRegistry.getAdapter('nuget');
  if (!nugetAdapter) {
    return codeLenses;
  }

  const nugetLineRegex = /^\s*nuget\s+([^\s]+)\s+([^\s~]+)([^\n]*)/gim;
  let match: RegExpExecArray | null;
  const updatePromises: Promise<void>[] = [];

  while ((match = nugetLineRegex.exec(text)) !== null) {
    const packageId = match[1];
    const currentVersion = match[2];
    if (!packageId || !currentVersion) {
      continue;
    }

    const versionStart = match.index + match[0].indexOf(currentVersion);
    updatePromises.push(
      (async () => {
        try {
          const info = await nugetAdapter.getPackageInfo(packageId);
          const latestVersion = info?.version ?? null;
          if (latestVersion && isNewerVersion(currentVersion, latestVersion)) {
            const updateType = getUpdateType(currentVersion, latestVersion);
            const position = document.positionAt(versionStart);
            const range = new vscode.Range(position, position);
            codeLenses.push(
              new vscode.CodeLens(range, {
                title: formatUpdateTitle(latestVersion, updateType),
                command: 'npmGallery.updatePaketDependency',
                arguments: [document.uri.fsPath, packageId, latestVersion],
              })
            );
          }
        } catch {
          // Skip packages that fail
        }
      })()
    );
  }

  await Promise.all(updatePromises);
  return codeLenses;
}

export async function provideCodeLensesForCake(
  document: vscode.TextDocument,
  text: string
): Promise<vscode.CodeLens[]> {
  const codeLenses: vscode.CodeLens[] = [];
  const services = getServices();
  const nugetAdapter = services.sourceRegistry.getAdapter('nuget');
  if (!nugetAdapter) {
    return codeLenses;
  }

  const updatePromises: Promise<void>[] = [];
  for (const directive of parseCakeDirectives(text)) {
    if (!directive.version || !directive.versionRange) {
      continue;
    }

    const currentVersion = directive.version;
    const versionRange = directive.versionRange;
    updatePromises.push(
      (async () => {
        try {
          const info = await nugetAdapter.getPackageInfo(directive.packageId);
          const latestVersion = info?.version ?? null;
          if (latestVersion && isNewerVersion(currentVersion, latestVersion)) {
            const updateType = getUpdateType(currentVersion, latestVersion);
            const position = document.positionAt(versionRange.start);
            const range = new vscode.Range(position, position);
            codeLenses.push(
              new vscode.CodeLens(range, {
                title: formatUpdateTitle(latestVersion, updateType),
                command: 'npmGallery.updateCakePackage',
                arguments: [document.uri.fsPath, directive.packageId, latestVersion, directive.kind],
              })
            );
          }
        } catch {
          // Skip packages that fail
        }
      })()
    );
  }

  await Promise.all(updatePromises);
  return codeLenses;
}

async function populateNuGetCodeLenses(
  document: vscode.TextDocument,
  codeLenses: vscode.CodeLens[],
  nugetAdapter: ISourceAdapter,
  entries: NuGetEntry[],
  showSecurityInfo: boolean,
  securitySummaries: Map<string, SecuritySummary>,
  createUpdateCommand: (entry: { name: string; latestVersion: string; updateType: string | null }) => vscode.Command
): Promise<void> {
  let bulkSecurity: Record<string, { summary: SecuritySummary } | null> = {};
  if (showSecurityInfo && entries.length > 0 && nugetAdapter.getSecurityInfoBulk) {
    try {
      const securityResults = await nugetAdapter.getSecurityInfoBulk(
        entries.map((entry) => ({ name: entry.name, version: entry.version }))
      );
      for (const entry of entries) {
        const key = `${entry.name}@${entry.version}`;
        const sec = securityResults[key];
        bulkSecurity[key] = sec?.summary
          ? {
              summary: {
                total: sec.summary.total,
                critical: sec.summary.critical,
                high: sec.summary.high,
              },
            }
          : null;
      }
    } catch {
      bulkSecurity = {};
    }
  }

  const updatePromises: Promise<void>[] = [];
  for (const entry of entries) {
    updatePromises.push(
      (async () => {
        try {
          const position = document.positionAt(entry.versionStart);
          const range = new vscode.Range(position, position);
          const securityKey = `${entry.name}@${entry.version}`;
          let securitySummary = securitySummaries.get(securityKey);
          if (showSecurityInfo && !securitySummary) {
            const sec = bulkSecurity[securityKey];
            if (sec?.summary) {
              securitySummary = sec.summary;
              securitySummaries.set(securityKey, securitySummary);
            }
          }

          if (showSecurityInfo && securitySummary) {
            codeLenses.push(
              new vscode.CodeLens(range, {
                title: formatSecurityTitle(securitySummary),
                command: 'npmGallery.showPackageDetails',
                arguments: [entry.name, { installedVersion: entry.version, securityOnly: true }],
              })
            );
          }

          const info = await nugetAdapter.getPackageInfo(entry.name);
          const latestVersion = info?.version ?? null;
          if (latestVersion && isNewerVersion(entry.version, latestVersion)) {
            const updateType = getUpdateType(entry.version, latestVersion);
            codeLenses.push(
              new vscode.CodeLens(range, createUpdateCommand({
                name: entry.name,
                latestVersion,
                updateType,
              }))
            );
          }
        } catch {
          // Skip packages that fail
        }
      })()
    );
  }

  await Promise.all(updatePromises);
}
