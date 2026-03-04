import * as json from 'jsonc-parser/lib/esm/main.js';
import * as vscode from 'vscode';
import { formatDependencySpecDisplay, parseDependencySpec } from '../../utils/version-utils';
import { createPackageHover, type ExtractedPackageInfo } from './common';

const composerDependencySections = new Set([
  'require',
  'require-dev',
  'suggest',
  'provide',
  'replace',
  'conflict',
]);

export async function provideHoverForComposer(
  document: vscode.TextDocument,
  line: string,
  position: vscode.Position
): Promise<vscode.Hover | null> {
  const packageInfo = extractComposerPackageInfo(document, line, position);
  if (!packageInfo) {
    return null;
  }

  return createPackageHover(packageInfo, 'packagist');
}

export async function provideHoverForComposerLock(
  document: vscode.TextDocument,
  position: vscode.Position
): Promise<vscode.Hover | null> {
  const packageInfo = extractComposerLockPackageInfo(document, position);
  if (!packageInfo) {
    return null;
  }

  return createPackageHover(packageInfo, 'packagist');
}

function extractComposerPackageInfo(
  document: vscode.TextDocument,
  line: string,
  position: vscode.Position
): ExtractedPackageInfo | null {
  const regex = /"([^"]+)":\s*"([^"]+)"/;
  const match = line.match(regex);
  if (!match) {
    return null;
  }

  const [fullMatch, name, version] = match;
  const startIndex = line.indexOf(fullMatch);
  const endIndex = startIndex + fullMatch.length;
  if (position.character < startIndex || position.character > endIndex) {
    return null;
  }

  const offset = document.offsetAt(position);
  const location = json.getLocation(document.getText(), offset);
  const section = typeof location.path[0] === 'string' ? location.path[0] : undefined;
  if (!section || !composerDependencySections.has(section)) {
    return null;
  }

  const parsedSpec = parseDependencySpec(version);
  return {
    name,
    version: parsedSpec.normalizedVersion || parsedSpec.displayText,
    rawVersion: parsedSpec.raw,
    displayVersion: formatDependencySpecDisplay(parsedSpec),
    isRegistryResolvable: isComposerRegistryPackage(name) && !!parsedSpec.normalizedVersion,
  };
}

function extractComposerLockPackageInfo(
  document: vscode.TextDocument,
  position: vscode.Position
): ExtractedPackageInfo | null {
  const offset = document.offsetAt(position);
  const location = json.getLocation(document.getText(), offset);
  const section = typeof location.path[0] === 'string' ? location.path[0] : undefined;
  const index = typeof location.path[1] === 'number' ? location.path[1] : undefined;
  if ((section !== 'packages' && section !== 'packages-dev') || index === undefined) {
    return null;
  }

  const tree = json.parseTree(document.getText());
  if (!tree) {
    return null;
  }

  const packageNode = json.findNodeAtLocation(tree, [section, index]);
  const packageValue = packageNode ? json.getNodeValue(packageNode) as Record<string, unknown> : null;
  const name = typeof packageValue?.name === 'string' ? packageValue.name : undefined;
  const version = typeof packageValue?.version === 'string' ? packageValue.version : undefined;
  if (!name || !version) {
    return null;
  }

  return {
    name,
    version,
    rawVersion: version,
    displayVersion: version,
    isRegistryResolvable: isComposerRegistryPackage(name),
  };
}

function isComposerRegistryPackage(name: string): boolean {
  const normalized = name.toLowerCase();
  return normalized.includes('/') &&
    normalized !== 'php' &&
    !normalized.startsWith('ext-') &&
    !normalized.startsWith('lib-') &&
    normalized !== 'composer-plugin-api' &&
    normalized !== 'composer-runtime-api' &&
    normalized !== 'composer-api';
}
