import * as vscode from 'vscode';
import { createPackageHover, type ExtractedPackageInfo } from './common';

export async function provideHoverForPubspecYaml(
  document: vscode.TextDocument,
  line: string,
  position: vscode.Position
): Promise<vscode.Hover | null> {
  const packageInfo = extractPubspecYamlPackageInfo(document, line, position);
  if (!packageInfo) {
    return null;
  }

  return createPackageHover(packageInfo, 'pub-dev');
}

export async function provideHoverForPubspecLock(
  document: vscode.TextDocument,
  position: vscode.Position
): Promise<vscode.Hover | null> {
  const packageInfo = extractPubspecLockPackageInfo(document, position);
  if (!packageInfo) {
    return null;
  }

  return createPackageHover(packageInfo, 'pub-dev');
}

function extractPubspecYamlPackageInfo(
  document: vscode.TextDocument,
  line: string,
  position: vscode.Position
): ExtractedPackageInfo | null {
  const sectionName = getPubspecSectionName(document, position.line);
  if (!sectionName || !isPubspecDependencySection(sectionName)) {
    return null;
  }

  const stringMatch = line.match(/^\s{2,}([A-Za-z0-9_.-]+)\s*:\s*["']?([^"'#\n]+)["']?\s*$/);
  if (stringMatch) {
    return {
      name: stringMatch[1],
      version: stringMatch[2].trim(),
      rawVersion: stringMatch[2].trim(),
      displayVersion: stringMatch[2].trim(),
      isRegistryResolvable: true,
    };
  }

  const nameMatch = line.match(/^\s{2,}([A-Za-z0-9_.-]+)\s*:\s*$/);
  if (!nameMatch) {
    return null;
  }

  const name = nameMatch[1];
  let version = '';
  for (let index = position.line + 1; index < Math.min(document.lineCount, position.line + 6); index += 1) {
    const candidate = document.lineAt(index).text;
    if (/^\s{0,2}[A-Za-z0-9_.-]+\s*:/.test(candidate)) {
      break;
    }
    const versionMatch = candidate.match(/^\s{4,}version\s*:\s*["']?([^"'#\n]+)["']?\s*$/);
    if (versionMatch) {
      version = versionMatch[1].trim();
      break;
    }
  }

  return {
    name,
    version: version || 'sdk/path/git',
    rawVersion: version,
    displayVersion: version || 'sdk/path/git',
    isRegistryResolvable: !!version,
  };
}

function extractPubspecLockPackageInfo(
  document: vscode.TextDocument,
  position: vscode.Position
): ExtractedPackageInfo | null {
  const line = document.lineAt(position.line).text;
  const nameMatch = line.match(/^\s{2}([A-Za-z0-9_.-]+):\s*$/);
  if (!nameMatch) {
    return null;
  }

  let version = '';
  for (let index = position.line + 1; index < Math.min(document.lineCount, position.line + 6); index += 1) {
    const candidate = document.lineAt(index).text;
    const versionMatch = candidate.match(/^\s{4}version:\s*"([^"]+)"/);
    if (versionMatch) {
      version = versionMatch[1];
      break;
    }
    if (/^\s{2}[A-Za-z0-9_.-]+:\s*$/.test(candidate)) {
      break;
    }
  }

  if (!version) {
    return null;
  }

  return {
    name: nameMatch[1],
    version,
    rawVersion: version,
    displayVersion: version,
    isRegistryResolvable: true,
  };
}

function getPubspecSectionName(document: vscode.TextDocument, lineNumber: number): string | null {
  for (let index = lineNumber; index >= 0; index -= 1) {
    const line = document.lineAt(index).text;
    const match = line.match(/^([A-Za-z_]+):\s*$/);
    if (match) {
      return match[1].trim();
    }
  }
  return null;
}

function isPubspecDependencySection(sectionName: string): boolean {
  return sectionName === 'dependencies' || sectionName === 'dev_dependencies' || sectionName === 'dependency_overrides';
}
