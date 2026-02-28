import type {
  PackageInfo,
  PackageDetails,
  VersionInfo,
  SearchResult,
  PackageAuthor,
  NuGetDependencyGroup,
  NuGetFrameworkProduct,
  NuGetFrameworkVersion,
} from '../../types/package';
import type {
  NuGetSearchResponse,
  NuGetSearchResultItem,
  NuGetSearchResultVersion,
  NuGetRegistrationIndex,
  NuGetRegistrationLeaf,
} from '../../api/nuget-api';
import { computeAllTfmsWithStatus, normalizedTfmToDisplay } from './nuget-tfm-compat';

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === null || v === undefined) {
    return [];
  }
  return Array.isArray(v) ? v : [v];
}

function firstAuthor(authors: string | string[] | undefined): PackageAuthor | undefined {
  const a = asArray(authors);
  if (a.length === 0) {
    return undefined;
  }
  return { name: a[0] };
}

/**
 * Transform NuGet API responses to unified package types
 */
export class NuGetTransformer {
  transformSearchResult(raw: NuGetSearchResponse, from: number, _size: number): SearchResult {
    const packages: PackageInfo[] = raw.data.map((item) => this.transformSearchItem(item));
    return {
      packages,
      total: raw.totalHits,
      hasMore: from + raw.data.length < raw.totalHits,
    };
  }

  transformSearchItem(item: NuGetSearchResultItem): PackageInfo {
    const tags = asArray(item.tags).filter(Boolean);
    return {
      name: item.id,
      version: item.version,
      description: item.description || item.summary,
      keywords: tags.length ? tags : undefined,
      license: undefined, // NuGet search doesn't expose license in list; could be in registration
      author: firstAuthor(item.authors),
      publisher: item.owners ? { username: asArray(item.owners)[0] || item.id } : undefined,
      repository: item.projectUrl ? { url: item.projectUrl } : undefined,
      homepage: item.projectUrl,
      downloads: item.totalDownloads,
    };
  }

  transformPackageInfo(item: NuGetSearchResultItem): PackageInfo {
    return this.transformSearchItem(item);
  }

  transformVersionInfo(v: NuGetSearchResultVersion): VersionInfo {
    return {
      version: v.version,
      dist: v.downloads !== undefined ? { unpackedSize: v.downloads } : undefined,
    };
  }

  transformPackageDetails(
    item: NuGetSearchResultItem,
    registrationIndex?: NuGetRegistrationIndex | null
  ): PackageDetails {
    const versions: VersionInfo[] = (registrationIndex
      ? this.versionsFromRegistration(registrationIndex)
      : item.versions.map((v) => this.transformVersionInfo(v))
    ).sort((a, b) => compareSemVer(b.version, a.version));

    const dependencies: Record<string, string> = {};
    let nugetDependencyGroups: NuGetDependencyGroup[] | undefined;
    let nugetFrameworks: NuGetFrameworkProduct[] | undefined;

    if (registrationIndex) {
      // Use leaf for the displayed version (item.version), not just last in first page
      const leaf = this.getLeafForVersion(registrationIndex, item.version) ?? this.getLatestLeaf(registrationIndex);
      const groups = leaf?.catalogEntry?.dependencyGroups;
      if (groups?.length) {
        nugetDependencyGroups = groups.map((g) => ({
          targetFramework: formatTargetFrameworkDisplay(g.targetFramework),
          dependencies: (g.dependencies || []).map((d) => ({
            id: d.id,
            range: d.range || '*',
          })),
        }));
        for (const group of groups) {
          for (const dep of group.dependencies || []) {
            dependencies[dep.id] = dep.range || '*';
          }
        }
        nugetFrameworks = buildFrameworkProductsWithComputed(groups.map((g) => g.targetFramework || ''));
      }
    }

    return {
      ...this.transformPackageInfo(item),
      versions,
      dependencies: Object.keys(dependencies).length ? dependencies : undefined,
      nugetDependencyGroups,
      nugetFrameworks,
      repository: item.projectUrl ? { url: item.projectUrl } : undefined,
      homepage: item.projectUrl,
    };
  }

  private versionsFromRegistration(index: NuGetRegistrationIndex): VersionInfo[] {
    const out: VersionInfo[] = [];
    for (const page of index.items || []) {
      for (const leaf of page.items || []) {
        const entry = leaf.catalogEntry ?? (leaf as unknown as NuGetRegistrationLeaf).catalogEntry;
        if (entry?.version) {
          out.push({
            version: entry.version,
            publishedAt: entry.published,
          });
        }
      }
    }
    return out;
  }

  /** Find the registration leaf for a specific package version (walk all pages). */
  private getLeafForVersion(index: NuGetRegistrationIndex, version: string): NuGetRegistrationLeaf | null {
    const want = version.trim().toLowerCase();
    for (const page of index.items || []) {
      for (const leaf of page.items || []) {
        const entry = (leaf as NuGetRegistrationLeaf).catalogEntry;
        if (entry?.version && entry.version.toLowerCase() === want) {
          return leaf as NuGetRegistrationLeaf;
        }
      }
    }
    return null;
  }

  private getLatestLeaf(index: NuGetRegistrationIndex): NuGetRegistrationLeaf | null {
    let last: NuGetRegistrationLeaf | null = null;
    for (const page of index.items || []) {
      const items = page.items || [];
      if (items.length > 0) {
        last = items[items.length - 1] as NuGetRegistrationLeaf;
      }
    }
    return last;
  }

  transformVersions(versions: NuGetSearchResultVersion[]): VersionInfo[] {
    return versions.map((v) => this.transformVersionInfo(v));
  }
}

function compareSemVer(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const va = pa[i] ?? 0;
    const vb = pb[i] ?? 0;
    if (va !== vb) {
      return va - vb;
    }
  }
  return 0;
}

/**
 * Map NuGet TFM to display name.
 * API format: .NETFramework4.6, .NETStandard1.3, MonoAndroid1.0, Xamarin.iOS1.0
 * Short form: net46, netstandard1.3
 */
function formatTargetFrameworkDisplay(tfm: string | undefined): string {
  if (!tfm || !tfm.trim()) {
    return '(any)';
  }
  const s = tfm.trim();
  // net46, net461 -> .NET Framework 4.6, 4.6.1 (short form, no dots)
  const net4 = s.match(/^net(4\d*)$/i);
  if (net4) {
    const v = net4[1];
    const ver = v.length <= 1 ? v : v[0] + '.' + (v.length === 2 ? v[1] : v.slice(1).replace(/(\d)(?=\d)/g, '$1.'));
    return `.NET Framework ${ver}`;
  }
  // net5.0, net6.0-windows, net8.0-android (short form with optional platform suffix)
  const netWithPlatform = s.match(/^net(\d+\.\d+(?:-\w+)*)$/i);
  if (netWithPlatform) {
    return `.NET ${netWithPlatform[1]}`;
  }
  // API style: .NETFramework4.6, .NETStandard1.3, MonoAndroid1.0, Xamarin.iOS1.0
  const match = s.match(/^(.+?)(\d+(?:\.\d+)*)$/);
  const prefix = match ? match[1] : s;
  const version = match ? match[2] : '';
  const productDisplay: Record<string, string> = {
    '.NETFramework': '.NET Framework',
    '.NETStandard': '.NET Standard',
    '.NETPlatform': '.NET Platform',
    '.NETCore': '.NET Core',
    'MonoAndroid': 'MonoAndroid',
    'MonoMac': 'MonoMac',
    'MonoTouch': 'MonoTouch',
    'Tizen': 'Tizen',
    'UAP': 'Universal Windows Platform',
    'Xamarin.iOS': 'Xamarin.iOS',
    'Xamarin.Mac': 'Xamarin.Mac',
    'Xamarin.TVOS': 'Xamarin.TVOS',
    'Xamarin.WatchOS': 'Xamarin.WatchOS',
  };
  const lowerPrefix = prefix.toLowerCase();
  const productNamesLower: Record<string, string> = {
    net: '.NET',
    netcoreapp: '.NET Core',
    netstandard: '.NET Standard',
    netframework: '.NET Framework',
    netplatform: '.NET Platform',
    monoandroid: 'MonoAndroid',
    monomac: 'MonoMac',
    monotouch: 'MonoTouch',
    tizen: 'Tizen',
    uap: 'Universal Windows Platform',
    xamarinios: 'Xamarin.iOS',
    xamarinmac: 'Xamarin.Mac',
    xamarintvos: 'Xamarin.TVOS',
    xamarinwatchos: 'Xamarin.WatchOS',
  };
  const product =
    productDisplay[prefix] ??
    productNamesLower[lowerPrefix] ??
    (prefix.charAt(0) === '.' ? prefix.slice(1).replace(/([A-Z])/g, ' $1').trim() : prefix);
  return version ? `${product} ${version}` : product;
}

/** Canonical display names so "xamarin.mac" and "Xamarin.Mac" merge and show as one */
const CANONICAL_PRODUCT_NAMES: Record<string, string> = {
  'xamarin.ios': 'Xamarin.iOS',
  'xamarin.mac': 'Xamarin.Mac',
  'xamarintvos': 'Xamarin.TVOS',
  'xamarin.tvos': 'Xamarin.TVOS',
  'xamarinwatchos': 'Xamarin.WatchOS',
  'xamarin.watchos': 'Xamarin.WatchOS',
  'monoandroid': 'MonoAndroid',
  'monomac': 'MonoMac',
  'monotouch': 'MonoTouch',
  '.net': '.NET',
  '.net core': '.NET Core',
  '.net standard': '.NET Standard',
  '.net framework': '.NET Framework',
  '.net platform': '.NET Platform',
  'universal windows platform': 'Universal Windows Platform',
  tizen: 'Tizen',
};

/** Normalize version for display so "20" -> "2.0" for Mono/Xamarin (avoids duplicate entries) */
function normalizeFrameworkVersionForDisplay(version: string, productKey: string): string {
  if (/^\d{2}$/.test(version) && (productKey.includes('xamarin') || productKey.includes('mono'))) {
    return `${version[0]}.${version[1]}`;
  }
  return version;
}

/** Group TFMs by product and build NuGetFrameworkProduct[] (compatible + computed from compat map) */
function buildFrameworkProductsWithComputed(declaredTfms: string[]): NuGetFrameworkProduct[] {
  const tfmsWithStatus = computeAllTfmsWithStatus(declaredTfms);
  const byProduct = new Map<string, { displayName: string; versions: NuGetFrameworkVersion[] }>();

  for (const [normalized, status] of tfmsWithStatus) {
    const displayTfm = normalizedTfmToDisplay(normalized);
    const display = formatTargetFrameworkDisplay(displayTfm || normalized);
    const firstSpace = display.indexOf(' ');
    const rawProduct = firstSpace > 0 ? display.slice(0, firstSpace) : display;
    const rawVersion = firstSpace > 0 ? display.slice(firstSpace + 1) : (displayTfm || normalized);
    const productKey = rawProduct.toLowerCase().trim();
    const product = CANONICAL_PRODUCT_NAMES[productKey] ?? rawProduct;
    const version = normalizeFrameworkVersionForDisplay(rawVersion, productKey);
    let entry = byProduct.get(productKey);
    if (!entry) {
      entry = { displayName: product, versions: [] };
      byProduct.set(productKey, entry);
    }
    const existing = entry.versions.find((v) => v.version === version);
    if (existing) {
      if (status === 'compatible') {
        existing.status = 'compatible';
      }
    } else {
      entry.versions.push({ version, status });
    }
  }

  return Array.from(byProduct.values())
    .map(({ displayName, versions }) => ({
      product: displayName,
      versions: versions.sort((a, b) => a.version.localeCompare(b.version, undefined, { numeric: true })),
    }))
    .sort((a, b) => a.product.localeCompare(b.product));
}
