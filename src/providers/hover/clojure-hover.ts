import * as vscode from 'vscode';
import { createPackageHover, type ExtractedPackageInfo } from './common';
import { parseDepsEdnDependencies } from '../../utils/clojure-deps';

export async function provideHoverForDepsEdn(
  document: vscode.TextDocument,
  position: vscode.Position
): Promise<vscode.Hover | null> {
  const packageInfo = extractDepsEdnPackageInfo(document, position);
  if (!packageInfo) {
    return null;
  }

  return createPackageHover(packageInfo, 'clojars');
}

export async function provideHoverForProjectClj(
  line: string,
  position: vscode.Position
): Promise<vscode.Hover | null> {
  const packageInfo = extractProjectCljPackageInfo(line, position);
  if (!packageInfo) {
    return null;
  }

  return createPackageHover(packageInfo, 'clojars');
}

function extractDepsEdnPackageInfo(
  document: vscode.TextDocument,
  position: vscode.Position
): ExtractedPackageInfo | null {
  const offset = document.offsetAt(position);
  for (const dependency of parseDepsEdnDependencies(document.getText())) {
    if (offset < dependency.start || offset > dependency.end) {
      continue;
    }

    return {
      name: dependency.name,
      version: dependency.version,
      rawVersion: dependency.version,
      displayVersion: dependency.version,
      isRegistryResolvable: true,
    };
  }
  return null;
}

function extractProjectCljPackageInfo(
  line: string,
  position: vscode.Position
): ExtractedPackageInfo | null {
  const regex = /\[([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\s+"([^"]+)"/;
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
