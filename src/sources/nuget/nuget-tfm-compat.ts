/**
 * NuGet TFM (Target Framework Moniker) compatibility and short folder name logic.
 * Business logic aligned with NuGet.Client NuGet.Frameworks:
 * - NuGetFramework.cs: GetShortFolderName(), IsNet5Era, Platform suffix
 * - FrameworkConstants.cs: FrameworkIdentifiers (Net=.NETFramework, NetCoreApp, NetStandard), CommonFrameworks
 * - DefaultFrameworkMappings.cs: IdentifierShortNames, CompatibilityMappings (CreateStandardMapping / CreateGenerationAndStandardMapping)
 * @see https://github.com/NuGet/NuGet.Client/blob/dev/src/NuGet.Core/NuGet.Frameworks/NuGetFramework.cs
 * @see https://github.com/NuGet/NuGet.Client/blob/dev/src/NuGet.Core/NuGet.Frameworks/FrameworkConstants.cs
 * @see https://github.com/NuGet/NuGet.Client/blob/dev/src/NuGet.Core/NuGet.Frameworks/DefaultFrameworkMappings.cs
 */

/** Align with FrameworkConstants.Version5: Net 5 era = NetCoreApp with Version.Major >= 5 */
const VERSION_5_MAJOR = 5;

/** Short folder identifiers (DefaultFrameworkMappings IdentifierShortNames). Net = .NET Framework. */
const SHORT_IDS = {
  Net: 'net',           // .NET Framework
  NetCoreApp: 'netcoreapp',
  NetStandard: 'netstandard',
  NetPlatform: 'dotnet',
  UAP: 'uap',
  MonoAndroid: 'monoandroid',
  MonoTouch: 'monotouch',
  MonoMac: 'monomac',
  XamarinIOs: 'xamarinios',
  XamarinMac: 'xamarinmac',
  XamarinTVOS: 'xamarintvos',
  XamarinWatchOS: 'xamarinwatchos',
  Windows: 'win',
  Tizen: 'tizen',
} as const;

/**
 * Get short folder name version string for .NET Framework (Net).
 * NuGet: Version(4,6,0,0) -> "46", Version(4,6,1,0) -> "461" (no dots).
 */
function getVersionStringNet(major: number, minor: number, build: number): string {
  let s = String(major) + String(minor);
  if (build > 0) {
    s += String(build);
  }
  return s;
}

/**
 * Parse catalog/API TFM (e.g. ".NETFramework4.6", ".NETStandard1.3") into identifier and version,
 * then produce short folder name per NuGetFramework.GetShortFolderName() semantics (lowercase).
 */
/** Normalize identifier so "xamarin.mac" and "Xamarin.Mac" both become "xamarinmac" for lookup */
function normalizeIdentifierForLookup(s: string): string {
  return s
    .replace(/xamarin\.mac/gi, 'xamarinmac')
    .replace(/xamarin\.ios/gi, 'xamarinios')
    .replace(/xamarin\.tvos/gi, 'xamarintvos')
    .replace(/xamarin\.watchos/gi, 'xamarinwatchos');
}

export function normalizeTfmForLookup(tfm: string): string {
  let s = tfm.trim().toLowerCase().replace(/^\./, '');
  s = normalizeIdentifierForLookup(s);
  if (!s) {
    return '';
  }
  // .NETFramework4.6, .NETFramework4.6.1 -> net46, net461 (FrameworkIdentifiers.Net -> "net", version no dots)
  const netFw = s.match(/^netframework(\d+)\.(\d+)(?:\.(\d+))?(?:\.(\d+))?$/);
  if (netFw) {
    const major = parseInt(netFw[1], 10);
    const minor = parseInt(netFw[2], 10);
    const build = netFw[3] ? parseInt(netFw[3], 10) : 0;
    return SHORT_IDS.Net + getVersionStringNet(major, minor, build);
  }
  // .NETStandard1.3 -> netstandard1.3 (short = netstandard + major.minor)
  if (s.startsWith('netstandard')) {
    return SHORT_IDS.NetStandard + s.slice('netstandard'.length);
  }
  // .NETCoreApp2.0, .NETCoreApp5.0 -> netcoreapp2.0 or net5.0 (IsNet5Era: Version.Major >= 5 -> use "net" + version)
  if (s.startsWith('netcoreapp')) {
    const rest = s.slice('netcoreapp'.length);
    const verMatch = rest.match(/^(\d+)\.(\d+)/);
    if (verMatch) {
      const major = parseInt(verMatch[1], 10);
      if (major >= VERSION_5_MAJOR) {
        return SHORT_IDS.Net + verMatch[1] + '.' + verMatch[2];
      }
    }
    return 'netcoreapp' + rest;
  }
  // .NETPlatform5.0 -> same as NetCoreApp 5.0 for short name (net5.0)
  if (s.startsWith('netplatform')) {
    const rest = s.slice('netplatform'.length);
    const verMatch = rest.match(/^(\d+)\.(\d+)/);
    if (verMatch) {
      const major = parseInt(verMatch[1], 10);
      if (major >= VERSION_5_MAJOR) {
        return SHORT_IDS.Net + verMatch[1] + '.' + verMatch[2];
      }
    }
    return SHORT_IDS.NetPlatform + rest;
  }
  // Already short: net5.0, net6.0-windows
  if (/^net\d+\.\d+/.test(s)) {
    return s;
  }
  // MonoAndroid1.0 -> monoandroid10, Xamarin.iOS1.0 -> xamarinios10 (version compact: 1.0 -> 10)
  const withVer = s.match(/^(monoandroid|monotouch|monomac|xamarinios|xamarinmac|xamarintvos|xamarinwatchos|uap|tizen|win)(\d+)\.(\d+)$/);
  if (withVer) {
    return withVer[1] + withVer[2] + withVer[3];
  }
  return s;
}

/**
 * Normalized (short folder) TFM to catalog-style for display.
 * Mirrors NuGetFramework DotNetFrameworkName / GetShortFolderName inverse.
 * net46 -> .NETFramework4.6, net461 -> .NETFramework4.6.1 (version digits: major.minor.build).
 */
export function normalizedTfmToDisplay(normalized: string): string {
  const s = normalized.trim().toLowerCase();
  if (!s) {
    return '';
  }
  // net46, net461, net481 -> .NETFramework4.6, .NETFramework4.6.1, .NETFramework4.8.1
  const netFw = s.match(/^net(4)(\d+)$/);
  if (netFw) {
    const major = 4;
    const rest = netFw[2];
    const minor = rest.length >= 1 ? parseInt(rest.slice(0, 1), 10) : 0;
    const build = rest.length > 1 ? parseInt(rest.slice(1), 10) : 0;
    const version = build > 0 ? `${major}.${minor}.${build}` : `${major}.${minor}`;
    return `.NETFramework${version}`;
  }
  // mono/xamarin short folder: monoandroid10 -> MonoAndroid1.0, xamarinmac20 -> Xamarin.Mac2.0 (version compact: 10=1.0, 20=2.0)
  const monoXamarin = s.match(
    /^(monoandroid|monotouch|monomac|xamarinios|xamarinmac|xamarintvos|xamarinwatchos)(\d)(\d)$/
  );
  if (monoXamarin) {
    const displayPrefix: Record<string, string> = {
      monoandroid: 'MonoAndroid',
      monotouch: 'MonoTouch',
      monomac: 'MonoMac',
      xamarinios: 'Xamarin.iOS',
      xamarinmac: 'Xamarin.Mac',
      xamarintvos: 'Xamarin.TVOS',
      xamarinwatchos: 'Xamarin.WatchOS',
    };
    const prefix = displayPrefix[monoXamarin[1]] ?? monoXamarin[1];
    const ver = `${monoXamarin[2]}.${monoXamarin[3]}`;
    return `${prefix}${ver}`;
  }
  return normalized;
}

/**
 * Derived (computed) frameworks from a declared TFM.
 * Aligns with DefaultFrameworkMappings CompatibilityMappings / CreateStandardMapping:
 * e.g. net46 supports NetStandard1.3 -> so declaring netstandard1.3 implies net46 is computed.
 * Inverse of "framework X supports standard Y" = "declaring Y derives X".
 */
const DERIVED_MAP: Record<string, string[]> = {
  'netstandard1.0': ['net45', 'netcoreapp1.0', 'netcoreapp1.1', 'uap10.0', 'win8', 'wp8', 'wpa81'],
  'netstandard1.1': ['net45', 'netcoreapp1.0', 'netcoreapp1.1', 'netcoreapp2.0', 'netcoreapp2.1', 'netcoreapp3.1', 'uap10.0'],
  'netstandard1.2': ['net45', 'net46', 'netcoreapp1.0', 'netcoreapp1.1', 'netcoreapp2.0', 'netcoreapp2.1', 'netcoreapp3.1', 'uap10.0'],
  'netstandard1.3': [
    'net46', 'net461', 'net462', 'net463', 'net47', 'net471', 'net472', 'net48', 'net481',
    'netcoreapp1.0', 'netcoreapp1.1', 'netcoreapp2.0', 'netcoreapp2.1', 'netcoreapp3.0', 'netcoreapp3.1',
    'net5.0', 'net6.0', 'net7.0', 'net8.0', 'net9.0', 'net10.0',
    'uap10.0', 'monoandroid10', 'monotouch10', 'xamarinios10', 'xamarinmac20', 'xamarintvos10', 'xamarinwatchos10',
  ],
  'netstandard1.4': [
    'net46', 'net461', 'net462', 'net47', 'net471', 'net472', 'net48', 'net481',
    'netcoreapp1.0', 'netcoreapp1.1', 'netcoreapp2.0', 'netcoreapp2.1', 'netcoreapp3.0', 'netcoreapp3.1',
    'net5.0', 'net6.0', 'net7.0', 'net8.0', 'net9.0', 'net10.0', 'uap10.0',
  ],
  'netstandard1.5': [
    'net46', 'net461', 'net462', 'net47', 'net471', 'net472', 'net48', 'net481',
    'netcoreapp1.0', 'netcoreapp1.1', 'netcoreapp2.0', 'netcoreapp2.1', 'netcoreapp3.0', 'netcoreapp3.1',
    'net5.0', 'net6.0', 'net7.0', 'net8.0', 'net9.0', 'net10.0', 'uap10.0',
  ],
  'netstandard1.6': [
    'net46', 'net461', 'net462', 'net47', 'net471', 'net472', 'net48', 'net481',
    'netcoreapp1.0', 'netcoreapp1.1', 'netcoreapp2.0', 'netcoreapp2.1', 'netcoreapp3.0', 'netcoreapp3.1',
    'net5.0', 'net6.0', 'net7.0', 'net8.0', 'net9.0', 'net10.0', 'uap10.0', 'tizen30',
  ],
  'netstandard1.7': ['netcoreapp1.1', 'netcoreapp2.0', 'netcoreapp2.1', 'netcoreapp3.0', 'netcoreapp3.1', 'net5.0', 'net6.0', 'net7.0', 'net8.0', 'net9.0', 'net10.0'],
  'netstandard2.0': [
    'net461', 'net462', 'net463', 'net47', 'net471', 'net472', 'net48', 'net481',
    'netcoreapp2.0', 'netcoreapp2.1', 'netcoreapp2.2', 'netcoreapp3.0', 'netcoreapp3.1',
    'net5.0', 'net6.0', 'net7.0', 'net8.0', 'net9.0', 'net10.0', 'uap10.0', 'tizen40',
  ],
  'netstandard2.1': [
    'net461', 'net462', 'net47', 'net471', 'net472', 'net48', 'net481',
    'netcoreapp2.1', 'netcoreapp3.0', 'netcoreapp3.1',
    'net5.0', 'net6.0', 'net7.0', 'net8.0', 'net9.0', 'net10.0', 'tizen60',
  ],
  net45: ['net451', 'net452', 'net46', 'net461', 'net462', 'net47', 'net471', 'net472', 'net48', 'net481'],
  net46: ['net461', 'net462', 'net463', 'net47', 'net471', 'net472', 'net48', 'net481'],
  net461: ['net462', 'net463', 'net47', 'net471', 'net472', 'net48', 'net481'],
  net462: ['net463', 'net47', 'net471', 'net472', 'net48', 'net481'],
  net463: ['net47', 'net471', 'net472', 'net48', 'net481'],
  net47: ['net471', 'net472', 'net48', 'net481'],
  net471: ['net472', 'net48', 'net481'],
  net472: ['net48', 'net481'],
  net48: ['net481'],
  'netcoreapp1.0': ['netcoreapp1.1', 'netcoreapp2.0', 'netcoreapp2.1', 'netcoreapp2.2', 'netcoreapp3.0', 'netcoreapp3.1', 'net5.0', 'net6.0', 'net7.0', 'net8.0', 'net9.0', 'net10.0'],
  'netcoreapp1.1': ['netcoreapp2.0', 'netcoreapp2.1', 'netcoreapp2.2', 'netcoreapp3.0', 'netcoreapp3.1', 'net5.0', 'net6.0', 'net7.0', 'net8.0', 'net9.0', 'net10.0'],
  'netcoreapp2.0': ['netcoreapp2.1', 'netcoreapp2.2', 'netcoreapp3.0', 'netcoreapp3.1', 'net5.0', 'net6.0', 'net7.0', 'net8.0', 'net9.0', 'net10.0'],
  'netcoreapp2.1': ['netcoreapp2.2', 'netcoreapp3.0', 'netcoreapp3.1', 'net5.0', 'net6.0', 'net7.0', 'net8.0', 'net9.0', 'net10.0'],
  'netcoreapp2.2': ['netcoreapp3.0', 'netcoreapp3.1', 'net5.0', 'net6.0', 'net7.0', 'net8.0', 'net9.0', 'net10.0'],
  'netcoreapp3.0': ['netcoreapp3.1', 'net5.0', 'net6.0', 'net7.0', 'net8.0', 'net9.0', 'net10.0'],
  'netcoreapp3.1': ['net5.0', 'net6.0', 'net7.0', 'net8.0', 'net9.0', 'net10.0'],
  'net5.0': ['net6.0', 'net7.0', 'net8.0', 'net9.0', 'net10.0'],
  'net6.0': ['net7.0', 'net8.0', 'net9.0', 'net10.0'],
  'net7.0': ['net8.0', 'net9.0', 'net10.0'],
  'net8.0': ['net9.0', 'net10.0'],
  'net9.0': ['net10.0'],
};

/** Net 5+ platform suffixes (NuGetFramework.IsNet5Era: Platform.ToLowerInvariant() appended) */
const NET_PLATFORM_SUFFIXES = ['windows', 'android', 'ios', 'maccatalyst', 'macos', 'tvos', 'browser'];

/**
 * Compute all TFMs (declared + derived) with status. Aligns with:
 * - NuGetFramework.GetShortFolderName() for normalized form
 * - DefaultFrameworkMappings compatibility: declaring a TFM yields derived runtimes that support it
 * - IsNet5Era: net5.0+ gets platform extensions (net6.0-windows etc.)
 */
export function computeAllTfmsWithStatus(declaredTfms: string[]): Map<string, 'compatible' | 'computed'> {
  const result = new Map<string, 'compatible' | 'computed'>();
  const declaredNormalized = new Set(declaredTfms.map(normalizeTfmForLookup).filter(Boolean));

  function add(tfm: string, status: 'compatible' | 'computed') {
    if (!tfm) {
      return;
    }
    const existing = result.get(tfm);
    if (existing === 'compatible') {
      return;
    }
    result.set(tfm, status);
  }

  for (const raw of declaredTfms) {
    const norm = normalizeTfmForLookup(raw);
    if (norm) {
      add(norm, 'compatible');
    }
  }

  for (const norm of declaredNormalized) {
    const derived = DERIVED_MAP[norm];
    if (derived) {
      for (const d of derived) {
        if (!declaredNormalized.has(d)) {
          add(d, 'computed');
        }
      }
    }
    // IsNet5Era: NetCoreApp Version.Major >= 5 -> add platform-specific TFMs (NuGetFramework branch for HasPlatform)
    const netMatch = norm.match(/^net(\d+)\.(\d+)$/);
    if (netMatch && !norm.includes('standard') && !norm.includes('coreapp')) {
      const major = parseInt(netMatch[1], 10);
      if (major >= VERSION_5_MAJOR) {
        const ver = `${netMatch[1]}.${netMatch[2]}`;
        for (const suffix of NET_PLATFORM_SUFFIXES) {
          const ext = `net${ver}-${suffix}`;
          if (!declaredNormalized.has(ext)) {
            add(ext, 'computed');
          }
        }
      }
    }
  }

  return result;
}
