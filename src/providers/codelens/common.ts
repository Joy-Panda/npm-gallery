import * as vscode from 'vscode';

export function formatUpdateTitle(latestVersion: string, updateType: string | null): string {
  return updateType && updateType !== 'patch'
    ? `⬆️ Update to ${latestVersion} (${updateType})`
    : `⬆️ Update to ${latestVersion}`;
}

export function formatSecurityTitle(summary: { total: number; critical: number; high: number }): string {
  const { total, critical, high } = summary;
  if (total === 0) {
    return '🟢 No vulnerabilities';
  }

  const parts: string[] = [];
  if (critical > 0) {
    parts.push(`🔴 ${critical} critical`);
  }
  if (high > 0) {
    parts.push(`🟠 ${high} high`);
  }

  const overallIcon = critical > 0 ? '🔴' : high > 0 ? '🟠' : '🟡';
  const hasCriticalOnly = critical > 0 && high === 0 && total === critical;
  const hasHighOnly = high > 0 && critical === 0 && total === high;

  if (hasCriticalOnly) {
    return `${overallIcon} ${critical} critical vulns`;
  }
  if (hasHighOnly) {
    return `${overallIcon} ${high} high vulns`;
  }

  return `${overallIcon} ${total} vulns${parts.length ? ` (${parts.join(', ')})` : ''}`;
}

export function parseGemfileLockVersions(content: string): Map<string, string> {
  const versions = new Map<string, string>();
  let inSpecs = false;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.replace(/\r$/, '');
    if (/^\s{2}specs:\s*$/.test(line)) {
      inSpecs = true;
      continue;
    }

    if (inSpecs && /^[A-Z][A-Z\s_-]*$/.test(line.trim())) {
      inSpecs = false;
      continue;
    }

    if (!inSpecs) {
      continue;
    }

    const match = line.match(/^\s{4}([^\s(]+)\s+\(([^)]+)\)/);
    if (match) {
      versions.set(match[1], match[2]);
    }
  }

  return versions;
}

export function isComposerPlatformPackage(name: string): boolean {
  const normalized = name.toLowerCase();
  return normalized === 'php' ||
    normalized.startsWith('ext-') ||
    normalized.startsWith('lib-') ||
    normalized === 'composer-plugin-api' ||
    normalized === 'composer-runtime-api' ||
    normalized === 'composer-api';
}

export function readXmlAttribute(attrs: string, name: string): string | undefined {
  const match = attrs.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]+)"`, 'i'));
  return match?.[1]?.trim();
}

export function topOfFileRange(): vscode.Range {
  return new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0));
}
