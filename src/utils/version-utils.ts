/**
 * Version comparison utilities
 * Supports both npm semantic versions and Maven version formats
 */
import type { DependencySpecKind, UpdateType } from '../types/package';

export interface ParsedDependencySpec {
  raw: string;
  kind: DependencySpecKind;
  normalizedVersion?: string;
  displayText: string;
  isRegistryResolvable: boolean;
}

export function formatDependencySpecDisplay(
  spec: ParsedDependencySpec,
  options?: {
    workspaceLocal?: boolean;
    workspaceSelf?: boolean;
  }
): string {
  if (options?.workspaceSelf) {
    return `workspace self (${spec.raw})`;
  }

  if (options?.workspaceLocal) {
    return `workspace local (${spec.raw})`;
  }

  switch (spec.kind) {
    case 'workspace':
      return `workspace local (${spec.raw})`;
    case 'file':
    case 'path':
      return `local path (${spec.raw})`;
    case 'git':
      return `git (${spec.raw})`;
    case 'tag':
      return spec.displayText;
    case 'semver':
      return spec.displayText;
    default:
      return spec.displayText;
  }
}

const TAG_SPECS = new Set(['latest', 'next', 'beta', 'alpha', 'rc', 'canary', 'nightly', 'dev', 'lts']);

export function parseDependencySpec(rawSpec: string): ParsedDependencySpec {
  const raw = rawSpec.trim();

  if (!raw) {
    return {
      raw,
      kind: 'unknown',
      displayText: raw,
      isRegistryResolvable: false,
    };
  }

  if (raw.startsWith('workspace:')) {
    return {
      raw,
      kind: 'workspace',
      displayText: raw,
      isRegistryResolvable: false,
    };
  }

  if (raw.startsWith('file:') || raw.startsWith('link:')) {
    return {
      raw,
      kind: 'file',
      displayText: raw,
      isRegistryResolvable: false,
    };
  }

  if (raw.startsWith('../') || raw.startsWith('./') || raw.startsWith('/') || raw.startsWith('..\\') || raw.startsWith('.\\')) {
    return {
      raw,
      kind: 'path',
      displayText: raw,
      isRegistryResolvable: false,
    };
  }

  if (
    raw.startsWith('git+') ||
    raw.startsWith('git@') ||
    raw.startsWith('github:') ||
    raw.startsWith('gitlab:') ||
    raw.startsWith('bitbucket:') ||
    /^https?:\/\/.+\.git(?:#.+)?$/i.test(raw)
  ) {
    return {
      raw,
      kind: 'git',
      displayText: raw,
      isRegistryResolvable: false,
    };
  }

  if (TAG_SPECS.has(raw.toLowerCase())) {
    return {
      raw,
      kind: 'tag',
      normalizedVersion: raw,
      displayText: raw,
      isRegistryResolvable: true,
    };
  }

  const normalizedVersion = raw.replace(/^[\^~<>=\s]+/, '');
  if (/^\d+(\.\d+){0,2}([.-][0-9A-Za-z.-]+)?$/.test(normalizedVersion)) {
    return {
      raw,
      kind: 'semver',
      normalizedVersion,
      displayText: normalizedVersion,
      isRegistryResolvable: true,
    };
  }

  return {
    raw,
    kind: 'unknown',
    displayText: raw,
    isRegistryResolvable: false,
  };
}

/**
 * Parse version string into components
 * Handles Maven version formats like: 1.2.3, 1.2.3.RELEASE, 2.0.0-M1, 1.0.0-SNAPSHOT
 */
export function parseVersionComponents(version: string): {
  major: number;
  minor: number;
  patch: number;
  build?: number;
  qualifier?: string;
  prerelease?: string;
} {
  // Remove common suffixes that don't affect version comparison
  let cleanVersion = version.trim();
  
  // Handle Maven qualifiers (RELEASE, FINAL, etc.) - these are typically equivalent to no qualifier
  const qualifierMatch = cleanVersion.match(/^(.+?)(\.(RELEASE|FINAL))$/i);
  if (qualifierMatch) {
    cleanVersion = qualifierMatch[1];
  }

  // Extract prerelease suffix (M1, RC1, SNAPSHOT, alpha, beta, etc.)
  let prerelease: string | undefined;
  const prereleaseMatch = cleanVersion.match(/^(.+?)[-._](M\d+|RC\d+|SNAPSHOT|alpha|beta|ALPHA|BETA|a\d+|b\d+)$/i);
  if (prereleaseMatch) {
    cleanVersion = prereleaseMatch[1];
    prerelease = prereleaseMatch[2].toUpperCase();
  }

  // Split version into parts
  const parts = cleanVersion.split(/[.-]/).map(p => {
    const num = parseInt(p, 10);
    return isNaN(num) ? 0 : num;
  });

  return {
    major: parts[0] || 0,
    minor: parts[1] || 0,
    patch: parts[2] || 0,
    build: parts[3],
    prerelease,
  };
}

/**
 * Compare prerelease identifiers
 * Order: SNAPSHOT < ALPHA/alpha < BETA/beta < M1 < M2 < ... < RC1 < RC2 < ...
 */
function comparePrerelease(p1: string, p2: string): number {
  // Normalize to uppercase for comparison
  const pr1 = p1.toUpperCase();
  const pr2 = p2.toUpperCase();

  // Extract type and number
  const getPrereleaseOrder = (pr: string): number => {
    if (pr.startsWith('SNAPSHOT')) return 0;
    if (pr.startsWith('ALPHA') || pr.startsWith('A')) return 1;
    if (pr.startsWith('BETA') || pr.startsWith('B')) return 2;
    if (pr.startsWith('M')) {
      const num = parseInt(pr.substring(1), 10);
      return 3 + (isNaN(num) ? 0 : num);
    }
    if (pr.startsWith('RC')) {
      const num = parseInt(pr.substring(2), 10);
      return 100 + (isNaN(num) ? 0 : num);
    }
    return 200; // Unknown prerelease type
  };

  const order1 = getPrereleaseOrder(pr1);
  const order2 = getPrereleaseOrder(pr2);

  if (order1 !== order2) {
    return order1 - order2;
  }

  // If same type, compare numbers if present
  const num1 = parseInt(pr1.replace(/\D/g, ''), 10) || 0;
  const num2 = parseInt(pr2.replace(/\D/g, ''), 10) || 0;
  return num1 - num2;
}

/**
 * Compare two version strings
 * Returns: -1 if v1 < v2, 0 if v1 === v2, 1 if v1 > v2
 */
export function compareVersions(v1: string, v2: string): number {
  const v1Parts = parseVersionComponents(v1);
  const v2Parts = parseVersionComponents(v2);

  // Compare major version
  if (v1Parts.major !== v2Parts.major) {
    return v1Parts.major - v2Parts.major;
  }

  // Compare minor version
  if (v1Parts.minor !== v2Parts.minor) {
    return v1Parts.minor - v2Parts.minor;
  }

  // Compare patch version
  if (v1Parts.patch !== v2Parts.patch) {
    return v1Parts.patch - v2Parts.patch;
  }

  // Compare build number if present
  if (v1Parts.build !== undefined || v2Parts.build !== undefined) {
    const build1 = v1Parts.build ?? 0;
    const build2 = v2Parts.build ?? 0;
    if (build1 !== build2) {
      return build1 - build2;
    }
  }

  // Handle prerelease versions
  // Prerelease versions are considered "less than" release versions
  if (v1Parts.prerelease && !v2Parts.prerelease) {
    return -1; // v1 is prerelease, v2 is release
  }
  if (!v1Parts.prerelease && v2Parts.prerelease) {
    return 1; // v1 is release, v2 is prerelease
  }
  if (v1Parts.prerelease && v2Parts.prerelease) {
    // Both are prerelease, compare prerelease identifiers
    return comparePrerelease(v1Parts.prerelease, v2Parts.prerelease);
  }

  return 0; // Versions are equal
}

/**
 * Check if version b is newer than version a
 */
export function isNewerVersion(a: string, b: string): boolean {
  return compareVersions(a, b) < 0;
}

/**
 * Determine update type between versions
 * Handles semver-like npm versions and Maven-style qualifiers.
 */
export function getUpdateType(current: string, latest: string): UpdateType | null {
  const comparison = compareVersions(current, latest);

  if (comparison >= 0) {
    return null;
  }

  const currentParts = parseVersionComponents(current);
  const latestParts = parseVersionComponents(latest);

  if (latestParts.major > currentParts.major) {
    return 'major';
  }
  if (latestParts.minor > currentParts.minor) {
    return 'minor';
  }
  if (latestParts.patch > currentParts.patch) {
    return 'patch';
  }

  if (latestParts.build !== undefined && currentParts.build !== undefined) {
    if (latestParts.build > currentParts.build) {
      return 'patch';
    }
  }

  if (currentParts.prerelease && !latestParts.prerelease) {
    if (latestParts.major > currentParts.major) return 'major';
    if (latestParts.minor > currentParts.minor) return 'minor';
    if (latestParts.patch > currentParts.patch) return 'patch';
    return 'prerelease';
  }

  if (currentParts.prerelease || latestParts.prerelease) {
    return 'prerelease';
  }

  return null;
}
