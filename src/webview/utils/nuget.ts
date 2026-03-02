import type { NuGetCopyFormat } from '../../types/package';
import { NUGET_COPY_FORMAT_LABELS } from '../../types/package';
import type { SourceInfo } from '../context/VSCodeContext';

export const NUGET_DETAIL_FORMAT_OPTIONS: NuGetCopyFormat[] = [
  'packagereference',
  'dotnet-cli',
  'pmc',
  'paket',
  'cpm-combined',
  'script',
  'file-based',
  'cake',
  'cake-tool',
];

const KNOWN_PACKAGE_MANAGERS_TO_FORMAT: Record<string, NuGetCopyFormat> = {
  'PackageReference': 'packagereference',
  'NuGet CPM': 'cpm-combined',
  'Paket': 'paket',
  'packages.config': 'pmc',
};

export function resolveAdaptiveNuGetFormat(
  sourceInfo: SourceInfo
): { format?: NuGetCopyFormat; uncertain: boolean } {
  const packageManager = sourceInfo.installTarget?.packageManager;
  if (packageManager && KNOWN_PACKAGE_MANAGERS_TO_FORMAT[packageManager]) {
    return {
      format: KNOWN_PACKAGE_MANAGERS_TO_FORMAT[packageManager],
      uncertain: false,
    };
  }

  switch (sourceInfo.detectedNuGetStyle) {
    case 'packagereference':
      return { format: 'packagereference', uncertain: !packageManager };
    case 'cpm':
      return { format: 'cpm-combined', uncertain: !packageManager };
    case 'paket':
      return { format: 'paket', uncertain: !packageManager };
    case 'packages.config':
      return { format: 'pmc', uncertain: !packageManager };
    case 'cake':
      return { format: 'cake', uncertain: true };
    default:
      return { uncertain: true };
  }
}

export function getNuGetActionLabel(format?: NuGetCopyFormat): string {
  switch (format) {
    case 'dotnet-cli':
      return 'Copy .NET CLI command';
    case 'pmc':
      return 'Copy PMC command';
    case 'paket':
      return 'Copy Paket CLI command';
    case 'packagereference':
      return 'Copy PackageReference';
    case 'cpm-combined':
      return 'Copy CPM snippets';
    case 'script':
      return 'Copy Script snippet';
    case 'file-based':
      return 'Copy File-based snippet';
    case 'cake':
      return 'Copy Cake addin';
    case 'cake-tool':
      return 'Copy Cake tool';
    default:
      return 'Copy dependency snippet';
  }
}

export function getNuGetFormatOptions(): Array<{ value: string; label: string }> {
  return NUGET_DETAIL_FORMAT_OPTIONS.map((format) => ({
    value: format,
    label: NUGET_COPY_FORMAT_LABELS[format] || format,
  }));
}
