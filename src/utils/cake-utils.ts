export interface CakeDirective {
  kind: 'addin' | 'tool';
  packageId: string;
  version?: string;
  start: number;
  end: number;
  versionRange?: {
    start: number;
    end: number;
  };
}

export function parseCakeDirectives(text: string): CakeDirective[] {
  const directives: CakeDirective[] = [];
  const directiveRegex = /#(addin|tool)\s+nuget:\?([^\s]+)/gi;
  let match: RegExpExecArray | null;

  while ((match = directiveRegex.exec(text)) !== null) {
    const kind = (match[1] ?? 'addin').toLowerCase() as 'addin' | 'tool';
    const query = match[2] ?? '';
    const params = new URLSearchParams(query);
    const packageId = params.get('package')?.trim();
    if (!packageId) {
      continue;
    }

    const version = params.get('version')?.trim() || undefined;
    const queryOffset = match.index + match[0].lastIndexOf('?') + 1;
    const versionMatch = query.match(/(?:^|&)version=([^&\s]+)/i);
    const versionRange =
      versionMatch && versionMatch.index !== undefined
        ? {
            start: queryOffset + versionMatch.index + versionMatch[0].length - versionMatch[1].length,
            end: queryOffset + versionMatch.index + versionMatch[0].length,
          }
        : undefined;

    directives.push({
      kind,
      packageId,
      version,
      start: match.index,
      end: match.index + match[0].length,
      versionRange,
    });
  }

  return directives;
}
