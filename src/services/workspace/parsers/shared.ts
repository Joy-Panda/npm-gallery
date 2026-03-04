import * as vscode from 'vscode';
import type { InstalledPackage } from '../../../types/package';

export function getWorkspaceFolderPath(manifestPath: string): string | undefined {
  return vscode.workspace.getWorkspaceFolder(vscode.Uri.file(manifestPath))?.uri.fsPath;
}

export function getFallbackManifestName(manifestPath: string): string {
  const relativePath = vscode.workspace.asRelativePath(manifestPath) || manifestPath;
  const normalized = relativePath.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  if (segments.length >= 2) {
    return segments[segments.length - 2];
  }
  return relativePath;
}

export function dedupeInstalledPackages(packages: InstalledPackage[]): InstalledPackage[] {
  const seen = new Set<string>();
  return packages.filter((pkg) => {
    const key = `${pkg.packageJsonPath}:${pkg.type}:${pkg.name}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function readXmlAttribute(attrs: string, name: string): string | undefined {
  const match = attrs.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]+)"`, 'i'));
  return match?.[1]?.trim();
}

export function readXmlElementText(body: string, elementName: string): string | undefined {
  const match = body.match(new RegExp(`<${elementName}>\\s*([^<]+?)\\s*</${elementName}>`, 'i'));
  return match?.[1]?.trim();
}
