import * as vscode from 'vscode';
import type { SourceType } from '../../types/project';
import { createPackageHover, type ExtractedPackageInfo } from './common';

export async function provideHoverForPomXml(
  document: vscode.TextDocument,
  position: vscode.Position,
  currentSource: SourceType | null
): Promise<vscode.Hover | null> {
  const packageInfo = extractPomXmlPackageInfo(document, position);
  if (!packageInfo) {
    return null;
  }

  return createPackageHover(
    packageInfo,
    currentSource === 'libraries-io' ? 'libraries-io' : 'sonatype',
    currentSource
  );
}

export async function provideHoverForGradle(
  document: vscode.TextDocument,
  position: vscode.Position,
  currentSource: SourceType | null
): Promise<vscode.Hover | null> {
  const packageInfo = extractGradlePackageInfo(document, position);
  if (!packageInfo) {
    return null;
  }

  return createPackageHover(
    packageInfo,
    currentSource === 'libraries-io' ? 'libraries-io' : 'sonatype',
    currentSource
  );
}

function extractPomXmlPackageInfo(
  document: vscode.TextDocument,
  position: vscode.Position
): ExtractedPackageInfo | null {
  const text = document.getText();
  const offset = document.offsetAt(position);
  const dependencyRegex = /<dependency>([\s\S]*?)<\/dependency>/g;
  let match: RegExpExecArray | null;

  while ((match = dependencyRegex.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (offset < start || offset > end) {
      continue;
    }

    const body = match[1];
    const groupId = body.match(/<groupId>(.*?)<\/groupId>/)?.[1]?.trim();
    const artifactId = body.match(/<artifactId>(.*?)<\/artifactId>/)?.[1]?.trim();
    const version = body.match(/<version>(.*?)<\/version>/)?.[1]?.trim();
    if (!groupId || !artifactId || !version) {
      return null;
    }

    return {
      name: `${groupId}:${artifactId}`,
      version,
      rawVersion: version,
      displayVersion: version,
      isRegistryResolvable: !/\$\{.+\}/.test(version),
    };
  }

  return null;
}

function extractGradlePackageInfo(
  document: vscode.TextDocument,
  position: vscode.Position
): ExtractedPackageInfo | null {
  const text = document.getText();
  const offset = document.offsetAt(position);
  const dependencyRegex =
    /(?:^|\s)(implementation|testImplementation|compileOnly|runtimeOnly|api|compile)\s*(?:\(\s*)?["']([^:"']+):([^:"']+):([^"')\s]+)["']\s*\)?/gm;
  let match: RegExpExecArray | null;

  while ((match = dependencyRegex.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (offset < start || offset > end) {
      continue;
    }

    const [, , groupId, artifactId, version] = match;
    return {
      name: `${groupId}:${artifactId}`,
      version,
      rawVersion: version,
      displayVersion: version,
      isRegistryResolvable: !/[${]/.test(version),
    };
  }

  return null;
}
