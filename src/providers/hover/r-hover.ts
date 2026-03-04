import * as vscode from 'vscode';
import { createPackageHover, type ExtractedPackageInfo } from './common';

export async function provideHoverForDescription(
  line: string,
  position: vscode.Position
): Promise<vscode.Hover | null> {
  const packageInfo = extractDescriptionPackageInfo(line, position);
  if (!packageInfo) {
    return null;
  }

  return createPackageHover(packageInfo, 'cran');
}

function extractDescriptionPackageInfo(
  line: string,
  position: vscode.Position
): ExtractedPackageInfo | null {
  const fieldMatch = line.match(/^\s*(Depends|Imports|LinkingTo|Suggests|Enhances)\s*:\s*(.+)$/i);
  if (!fieldMatch) {
    return null;
  }

  const body = fieldMatch[2];
  const packageRegex = /([A-Za-z][A-Za-z0-9.]+)\s*(?:\(([^)]+)\))?/g;
  let match: RegExpExecArray | null;
  while ((match = packageRegex.exec(body)) !== null) {
    const name = match[1];
    if (name === 'R') {
      continue;
    }

    const bodyIndex = body.indexOf(match[0], match.index);
    const startIndex = line.indexOf(body) + bodyIndex;
    const endIndex = startIndex + match[0].length;
    if (position.character < startIndex || position.character > endIndex) {
      continue;
    }

    const version = match[2]?.trim() || '*';
    return {
      name,
      version,
      rawVersion: version === '*' ? '' : version,
      displayVersion: version,
      isRegistryResolvable: true,
    };
  }

  return null;
}
