import * as vscode from 'vscode';
import { createPackageHover, type ExtractedPackageInfo } from './common';

export async function provideHoverForCargoToml(
  document: vscode.TextDocument,
  line: string,
  position: vscode.Position
): Promise<vscode.Hover | null> {
  const packageInfo = extractCargoTomlPackageInfo(document, line, position);
  if (!packageInfo) {
    return null;
  }

  return createPackageHover(packageInfo, 'crates-io');
}

export async function provideHoverForCargoLock(
  document: vscode.TextDocument,
  position: vscode.Position
): Promise<vscode.Hover | null> {
  const packageInfo = extractCargoLockPackageInfo(document, position);
  if (!packageInfo) {
    return null;
  }

  return createPackageHover(packageInfo, 'crates-io');
}

function extractCargoTomlPackageInfo(
  document: vscode.TextDocument,
  line: string,
  position: vscode.Position
): ExtractedPackageInfo | null {
  const sectionName = getCargoTomlSectionName(document, position.line);
  if (!sectionName || !isCargoDependencySection(sectionName)) {
    return null;
  }

  const stringMatch = line.match(/^\s*([A-Za-z0-9_-]+)\s*=\s*"([^"]+)"/);
  if (stringMatch) {
    return {
      name: stringMatch[1],
      version: stringMatch[2],
      rawVersion: stringMatch[2],
      displayVersion: stringMatch[2],
      isRegistryResolvable: true,
    };
  }

  const inlineMatch = line.match(/^\s*([A-Za-z0-9_-]+)\s*=\s*\{(.*)\}/);
  if (!inlineMatch) {
    return null;
  }

  const versionMatch = inlineMatch[2].match(/\bversion\s*=\s*"([^"]+)"/);
  return {
    name: inlineMatch[1],
    version: versionMatch?.[1] || 'custom',
    rawVersion: versionMatch?.[1] || '',
    displayVersion: versionMatch?.[1] || 'custom',
    isRegistryResolvable: !!versionMatch,
  };
}

function extractCargoLockPackageInfo(
  document: vscode.TextDocument,
  position: vscode.Position
): ExtractedPackageInfo | null {
  const line = document.lineAt(position.line).text;
  const nameMatch = line.match(/^\s*name\s*=\s*"([^"]+)"/);
  if (!nameMatch) {
    return null;
  }

  let version: string | undefined;
  for (let index = position.line + 1; index < Math.min(document.lineCount, position.line + 8); index += 1) {
    const candidate = document.lineAt(index).text;
    const versionMatch = candidate.match(/^\s*version\s*=\s*"([^"]+)"/);
    if (versionMatch) {
      version = versionMatch[1];
      break;
    }
    if (/^\s*\[\[package\]\]\s*$/.test(candidate)) {
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

function getCargoTomlSectionName(document: vscode.TextDocument, lineNumber: number): string | null {
  for (let index = lineNumber; index >= 0; index -= 1) {
    const line = document.lineAt(index).text.trim();
    const match = line.match(/^\[([^\]]+)\]$/);
    if (match) {
      return match[1].trim();
    }
  }
  return null;
}

function isCargoDependencySection(sectionName: string): boolean {
  return sectionName === 'dependencies' ||
    sectionName === 'dev-dependencies' ||
    sectionName === 'build-dependencies' ||
    sectionName.endsWith('.dependencies') ||
    sectionName.endsWith('.dev-dependencies') ||
    sectionName.endsWith('.build-dependencies');
}
