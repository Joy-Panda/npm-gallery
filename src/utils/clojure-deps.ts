export type DepsEdnDependency = {
  name: string;
  version: string;
  start: number;
  end: number;
  versionStart: number;
  versionEnd: number;
};

const DEPS_EDN_DEPENDENCY_REGEX =
  /([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\s+\{[\s\S]*?:mvn\/version\s+"([^"]+)"[\s\S]*?\}/g;

export function parseDepsEdnDependencies(text: string): DepsEdnDependency[] {
  const dependencies: DepsEdnDependency[] = [];

  for (const match of text.matchAll(DEPS_EDN_DEPENDENCY_REGEX)) {
    const fullMatch = match[0];
    const name = match[1];
    const version = match[2];
    const start = match.index ?? 0;
    const versionMarker = `:mvn/version "${version}"`;
    const versionMarkerStart = fullMatch.indexOf(versionMarker);
    const versionOffsetInMatch =
      versionMarkerStart >= 0
        ? versionMarkerStart + versionMarker.indexOf(`"${version}"`) + 1
        : fullMatch.indexOf(`"${version}"`) + 1;

    if (versionOffsetInMatch <= 0) {
      continue;
    }

    const versionStart = start + versionOffsetInMatch;
    dependencies.push({
      name,
      version,
      start,
      end: start + fullMatch.length,
      versionStart,
      versionEnd: versionStart + version.length,
    });
  }

  return dependencies;
}

