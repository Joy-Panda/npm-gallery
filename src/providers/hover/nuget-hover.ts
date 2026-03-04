import * as vscode from 'vscode';
import { parseCakeDirectives } from '../../utils/cake-utils';
import { createPackageHover, type ExtractedPackageInfo } from './common';

export async function provideHoverForDirectoryPackagesProps(
  line: string,
  position: vscode.Position
): Promise<vscode.Hover | null> {
  const packageInfo = extractDirectoryPackagesPropsInfo(line, position);
  if (!packageInfo) {
    return null;
  }

  return createPackageHover(packageInfo, 'nuget');
}

export async function provideHoverForPackagesConfig(
  line: string,
  position: vscode.Position
): Promise<vscode.Hover | null> {
  const packageInfo = extractPackagesConfigInfo(line, position);
  if (!packageInfo) {
    return null;
  }

  return createPackageHover(packageInfo, 'nuget');
}

export async function provideHoverForPaketDependencies(
  line: string,
  position: vscode.Position
): Promise<vscode.Hover | null> {
  const packageInfo = extractPaketDependencyInfo(line, position);
  if (!packageInfo) {
    return null;
  }

  return createPackageHover(packageInfo, 'nuget');
}

export async function provideHoverForCake(
  document: vscode.TextDocument,
  position: vscode.Position
): Promise<vscode.Hover | null> {
  const packageInfo = extractCakePackageInfo(document, position);
  if (!packageInfo) {
    return null;
  }

  return createPackageHover(packageInfo, 'nuget');
}

export async function provideHoverForProjectPackageReference(
  document: vscode.TextDocument,
  position: vscode.Position
): Promise<vscode.Hover | null> {
  const packageInfo = extractProjectPackageReferenceInfo(document, position);
  if (!packageInfo) {
    return null;
  }

  return createPackageHover(packageInfo, 'nuget');
}

function extractDirectoryPackagesPropsInfo(
  line: string,
  position: vscode.Position
): ExtractedPackageInfo | null {
  const regex = /<PackageVersion\s+(?:Include="([^"]+)"\s+Version="([^"]+)"|Version="([^"]+)"\s+Include="([^"]+)")\s*\/?>/i;
  const match = line.match(regex);
  if (!match) {
    return null;
  }

  const [fullMatch] = match;
  const name = (match[1] ?? match[4])?.trim();
  const version = (match[2] ?? match[3])?.trim();
  if (!name || !version) {
    return null;
  }

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

function extractPackagesConfigInfo(
  line: string,
  position: vscode.Position
): ExtractedPackageInfo | null {
  const regex = /<package\b[^>]*\bid="([^"]+)"[^>]*\bversion="([^"]+)"[^>]*\/?>|<package\b[^>]*\bversion="([^"]+)"[^>]*\bid="([^"]+)"[^>]*\/?>/i;
  const match = line.match(regex);
  if (!match) {
    return null;
  }

  const [fullMatch] = match;
  const name = (match[1] ?? match[4])?.trim();
  const version = (match[2] ?? match[3])?.trim();
  if (!name || !version) {
    return null;
  }

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

function extractPaketDependencyInfo(
  line: string,
  position: vscode.Position
): ExtractedPackageInfo | null {
  const regex = /^\s*nuget\s+([^\s]+)\s+([^\s~]+)/i;
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

function extractCakePackageInfo(
  document: vscode.TextDocument,
  position: vscode.Position
): ExtractedPackageInfo | null {
  const offset = document.offsetAt(position);
  const directive = parseCakeDirectives(document.getText()).find(
    (entry) => offset >= entry.start && offset <= entry.end
  );
  if (!directive) {
    return null;
  }

  return {
    name: directive.packageId,
    version: directive.version || 'floating',
    rawVersion: directive.version || '',
    displayVersion: directive.version || 'floating',
    isRegistryResolvable: !!directive.version,
  };
}

function extractProjectPackageReferenceInfo(
  document: vscode.TextDocument,
  position: vscode.Position
): ExtractedPackageInfo | null {
  const text = document.getText();
  const offset = document.offsetAt(position);
  const regex = /<PackageReference\b([^>]*?)\/>|<PackageReference\b([^>]*?)>([\s\S]*?)<\/PackageReference>/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const fullMatch = match[0];
    const start = match.index ?? 0;
    const end = start + fullMatch.length;
    if (offset < start || offset > end) {
      continue;
    }

    const attrs = (match[1] ?? match[2] ?? '').trim();
    const body = match[3] ?? '';
    const name = readXmlAttribute(attrs, 'Include') || readXmlAttribute(attrs, 'Update');
    const version = readXmlAttribute(attrs, 'Version') || readXmlElementText(body, 'Version');
    if (!name) {
      return null;
    }

    return {
      name,
      version: version || 'managed by cpm',
      rawVersion: version || '',
      displayVersion: version || 'managed by cpm',
      isRegistryResolvable: !!version,
    };
  }

  return null;
}

function readXmlAttribute(attrs: string, name: string): string | undefined {
  const match = attrs.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]+)"`, 'i'));
  return match?.[1]?.trim();
}

function readXmlElementText(body: string, name: string): string | undefined {
  const match = body.match(new RegExp(`<${name}>\\s*([^<]+?)\\s*</${name}>`, 'i'));
  return match?.[1]?.trim();
}
