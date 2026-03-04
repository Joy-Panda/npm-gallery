import * as vscode from 'vscode';
import { formatDependencySpecDisplay, parseDependencySpec } from '../../utils/version-utils';
import { createPackageHover, type ExtractedPackageInfo } from './common';

export async function provideHoverForPackageJson(
  line: string,
  position: vscode.Position,
  currentSourceType: string | null
): Promise<vscode.Hover | null> {
  const packageInfo = extractPackageJsonPackageInfo(line, position);
  if (!packageInfo) {
    return null;
  }

  return createPackageHover(packageInfo, 'npm', currentSourceType as never);
}

function extractPackageJsonPackageInfo(
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

  const excludedKeys = ['name', 'version', 'description', 'main', 'scripts', 'type', 'license'];
  if (excludedKeys.includes(name)) {
    return null;
  }

  const parsedSpec = parseDependencySpec(version);
  return {
    name,
    version: parsedSpec.normalizedVersion || parsedSpec.displayText,
    rawVersion: parsedSpec.raw,
    displayVersion: formatDependencySpecDisplay(parsedSpec),
    isRegistryResolvable: parsedSpec.isRegistryResolvable && !!parsedSpec.normalizedVersion,
  };
}
