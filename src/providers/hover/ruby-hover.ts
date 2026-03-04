import * as vscode from 'vscode';
import { parseDependencySpec } from '../../utils/version-utils';
import { createPackageHover, type ExtractedPackageInfo } from './common';

export async function provideHoverForGemfile(
  line: string,
  position: vscode.Position
): Promise<vscode.Hover | null> {
  const packageInfo = extractGemfilePackageInfo(line, position);
  if (!packageInfo) {
    return null;
  }

  return createPackageHover(packageInfo, 'rubygems');
}

export async function provideHoverForGemfileLock(
  line: string,
  position: vscode.Position
): Promise<vscode.Hover | null> {
  const packageInfo = extractGemfileLockPackageInfo(line, position);
  if (!packageInfo) {
    return null;
  }

  return createPackageHover(packageInfo, 'rubygems');
}

function extractGemfilePackageInfo(
  line: string,
  position: vscode.Position
): ExtractedPackageInfo | null {
  const regex = /^\s*gem\s+['"]([^'"]+)['"]\s*(?:,\s*['"]([^'"]+)['"])?/;
  const match = line.match(regex);
  if (!match) {
    return null;
  }

  const [fullMatch, name, versionRange] = match;
  const startIndex = line.indexOf(fullMatch);
  const endIndex = startIndex + fullMatch.length;
  if (position.character < startIndex || position.character > endIndex) {
    return null;
  }

  const parsedSpec = parseDependencySpec(versionRange || '');
  return {
    name,
    version: parsedSpec.normalizedVersion || versionRange || 'latest',
    rawVersion: versionRange || '',
    displayVersion: versionRange || 'latest',
    isRegistryResolvable: true,
  };
}

function extractGemfileLockPackageInfo(
  line: string,
  position: vscode.Position
): ExtractedPackageInfo | null {
  const regex = /^\s{4}([^\s(]+)\s+\(([^)]+)\)/;
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

  return {
    name,
    version,
    rawVersion: version,
    displayVersion: version,
    isRegistryResolvable: true,
  };
}
