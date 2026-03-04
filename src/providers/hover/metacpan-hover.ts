import * as vscode from 'vscode';
import { createPackageHover, type ExtractedPackageInfo } from './common';

export async function provideHoverForCpanfile(
  line: string,
  position: vscode.Position
): Promise<vscode.Hover | null> {
  const packageInfo = extractCpanfilePackageInfo(line, position);
  if (!packageInfo) {
    return null;
  }

  return createPackageHover(packageInfo, 'metacpan');
}

export async function provideHoverForCpanfileSnapshot(
  line: string,
  position: vscode.Position
): Promise<vscode.Hover | null> {
  const packageInfo = extractCpanfileSnapshotPackageInfo(line, position);
  if (!packageInfo) {
    return null;
  }

  return createPackageHover(packageInfo, 'metacpan');
}

function extractCpanfilePackageInfo(
  line: string,
  position: vscode.Position
): ExtractedPackageInfo | null {
  const regex = /^\s*(requires|recommends|suggests)\s+['"]([^'"]+)['"](?:\s*,\s*['"]([^'"]+)['"])?/;
  const match = line.match(regex);
  if (!match) {
    return null;
  }

  const [fullMatch, , name, versionRange] = match;
  const startIndex = line.indexOf(fullMatch);
  const endIndex = startIndex + fullMatch.length;
  if (position.character < startIndex || position.character > endIndex) {
    return null;
  }

  return {
    name,
    version: versionRange || 'latest',
    rawVersion: versionRange || '',
    displayVersion: versionRange || 'latest',
    isRegistryResolvable: true,
  };
}

function extractCpanfileSnapshotPackageInfo(
  line: string,
  position: vscode.Position
): ExtractedPackageInfo | null {
  const regex = /distribution:\s+.+\/([A-Za-z0-9_:.-]+)-([0-9][A-Za-z0-9._-]*)/;
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
