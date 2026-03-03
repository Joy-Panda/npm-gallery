import type { ClojureCopyFormat } from '../../types/package';
import type { SourceInfo } from '../context/VSCodeContext';

const CLOJURE_FORMAT_LABELS: Record<ClojureCopyFormat, string> = {
  'deps-edn': 'deps.edn',
  leiningen: 'Leiningen',
};

export function resolveAdaptiveClojureFormat(
  sourceInfo: SourceInfo
): { format?: ClojureCopyFormat; uncertain: boolean } {
  const packageManager = sourceInfo.installTarget?.packageManager.toLowerCase();
  if (packageManager?.includes('leiningen')) {
    return { format: 'leiningen', uncertain: false };
  }
  if (packageManager?.includes('clojure')) {
    return { format: 'deps-edn', uncertain: false };
  }

  if (sourceInfo.detectedPackageManager === 'leiningen') {
    return { format: 'leiningen', uncertain: !sourceInfo.installTarget };
  }
  if (sourceInfo.detectedPackageManager === 'clojure') {
    return { format: 'deps-edn', uncertain: !sourceInfo.installTarget };
  }

  return { uncertain: true };
}

export function getClojureActionLabel(format?: ClojureCopyFormat): string {
  switch (format) {
    case 'deps-edn':
      return 'Copy deps.edn snippet';
    case 'leiningen':
      return 'Copy Leiningen snippet';
    default:
      return 'Copy dependency snippet';
  }
}

export function getClojureFormatOptions(): Array<{ value: string; label: string }> {
  return (Object.keys(CLOJURE_FORMAT_LABELS) as ClojureCopyFormat[]).map((format) => ({
    value: format,
    label: CLOJURE_FORMAT_LABELS[format],
  }));
}
