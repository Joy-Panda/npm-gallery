import * as vscode from 'vscode';
import { createPackageHover, type ExtractedPackageInfo } from './common';

export async function provideHoverForGoMod(
  document: vscode.TextDocument,
  line: string,
  position: vscode.Position
): Promise<vscode.Hover | null> {
  const packageInfo = extractGoModPackageInfo(document, line, position);
  if (!packageInfo) {
    return null;
  }

  return createPackageHover(packageInfo, 'pkg-go-dev');
}

function extractGoModPackageInfo(
  document: vscode.TextDocument,
  line: string,
  position: vscode.Position
): ExtractedPackageInfo | null {
  const requireBlock = isGoRequireBlock(document, position.line);
  const trimmed = line.replace(/\s*\/\/.*$/, '').trim();
  const requireLine = requireBlock ? trimmed : (trimmed.match(/^require\s+(.+)$/)?.[1] || '');
  const match = requireLine.match(/^([^\s]+)\s+(v[^\s]+)$/);
  if (!match) {
    return null;
  }

  return {
    name: match[1],
    version: match[2],
    rawVersion: match[2],
    displayVersion: match[2],
    isRegistryResolvable: true,
  };
}

function isGoRequireBlock(document: vscode.TextDocument, lineNumber: number): boolean {
  for (let index = lineNumber; index >= 0; index -= 1) {
    const line = document.lineAt(index).text.trim();
    if (line === ')') {
      return false;
    }
    if (/^require\s*\($/.test(line)) {
      return true;
    }
    if (/^[A-Za-z]/.test(line) && !/^require\b/.test(line)) {
      break;
    }
  }
  return false;
}
