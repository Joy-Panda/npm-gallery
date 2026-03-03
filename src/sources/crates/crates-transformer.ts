import type {
  DependentsInfo,
  PackageDetails,
  PackageInfo,
  RequirementsInfo,
  SearchResult,
  VersionInfo,
} from '../../types/package';
import { compareVersions } from '../../utils/version-utils';
import type {
  CratesIoCrate,
  CratesIoDependency,
  CratesIoReverseDependenciesResponse,
  CratesIoSearchResponse,
  CratesIoVersion,
} from '../../api/crates-api';

export class CratesIoTransformer {
  transformSearchResult(raw: CratesIoSearchResponse): SearchResult {
    const crates = raw.crates || [];
    return {
      packages: crates.map((item) => this.transformSearchItem(item)),
      total: raw.meta?.total ?? crates.length,
      hasMore: crates.length > 0 && (raw.meta?.total ?? crates.length) > crates.length,
    };
  }

  transformSearchItem(item: CratesIoSearchResponse['crates'][number]): PackageInfo {
    return {
      name: item.id,
      version: item.max_stable_version || item.max_version || item.newest_version || '0.0.0',
      description: item.description,
      repository: item.repository ? { url: item.repository } : undefined,
      homepage: item.homepage || item.documentation,
      downloads: item.downloads,
      keywords: item.keywords,
    };
  }

  transformPackageInfo(raw: CratesIoCrate): PackageInfo {
    return {
      name: raw.id,
      version: raw.max_stable_version || raw.max_version || raw.newest_version || '0.0.0',
      description: raw.description,
      repository: raw.repository ? { url: raw.repository } : undefined,
      homepage: raw.homepage || raw.documentation,
      downloads: raw.downloads,
      keywords: raw.keywords,
    };
  }

  transformPackageDetails(
    raw: CratesIoCrate,
    versions: CratesIoVersion[],
    dependencies: CratesIoDependency[],
    requestedVersion?: string
  ): PackageDetails {
    const selectedVersion =
      (requestedVersion && versions.find((version) => version.num === requestedVersion)?.num) ||
      raw.max_stable_version ||
      raw.max_version ||
      versions[0]?.num ||
      '0.0.0';
    const selected = versions.find((version) => version.num === selectedVersion);
    const dependencyGroups = this.groupDependencies(dependencies);

    return {
      ...this.transformPackageInfo(raw),
      version: selectedVersion,
      license: selected?.license,
      readme: raw.description,
      versions: this.transformVersions(versions),
      dependencies: dependencyGroups.dependencies,
      devDependencies: dependencyGroups.devDependencies,
      optionalDependencies: dependencyGroups.optionalDependencies,
      requirements: this.buildRequirements(raw.id, selectedVersion, dependencies) || undefined,
      time: this.buildTimeMap(versions),
    };
  }

  transformVersions(raw: CratesIoVersion[]): VersionInfo[] {
    return [...raw]
      .map((version) => ({
        version: version.num,
        publishedAt: version.created_at || version.updated_at,
        deprecated: version.yanked ? 'Yanked' : undefined,
      }))
      .sort((a, b) => compareVersions(b.version, a.version));
  }

  transformDependents(
    name: string,
    version: string,
    raw: CratesIoReverseDependenciesResponse
  ): DependentsInfo | null {
    const versionsById = new Map(
      (raw.versions || []).map((item) => [item.crate, item.num || ''])
    );
    const directSample = (raw.dependencies || [])
      .map((item) => {
        const depName = item.crate_id;
        if (!depName) {
          return null;
        }
        return {
          package: {
            system: 'cargo',
            name: depName,
          },
          version: versionsById.get(depName) || item.req || '',
        };
      })
      .filter((item): item is NonNullable<typeof item> => !!item);

    if (directSample.length === 0) {
      return null;
    }

    return {
      package: {
        system: 'cargo',
        name,
      },
      version,
      totalCount: raw.meta?.total ?? directSample.length,
      directCount: raw.meta?.total ?? directSample.length,
      indirectCount: 0,
      directSample,
      indirectSample: [],
      webUrl: `https://crates.io/crates/${name}/reverse_dependencies`,
    };
  }

  private groupDependencies(dependencies: CratesIoDependency[]): {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
  } {
    const runtime: Record<string, string> = {};
    const dev: Record<string, string> = {};
    const optional: Record<string, string> = {};

    for (const dependency of dependencies) {
      if (!dependency.crate_id) {
        continue;
      }
      if (dependency.optional) {
        optional[dependency.crate_id] = dependency.req || '*';
        continue;
      }
      if (dependency.kind === 'dev' || dependency.kind === 'build') {
        dev[dependency.crate_id] = dependency.req || '*';
        continue;
      }
      runtime[dependency.crate_id] = dependency.req || '*';
    }

    return {
      dependencies: Object.keys(runtime).length > 0 ? runtime : undefined,
      devDependencies: Object.keys(dev).length > 0 ? dev : undefined,
      optionalDependencies: Object.keys(optional).length > 0 ? optional : undefined,
    };
  }

  private buildRequirements(
    name: string,
    version: string,
    dependencies: CratesIoDependency[]
  ): RequirementsInfo | null {
    const sections = [
      this.buildRequirementSection(
        'runtime',
        'Runtime',
        dependencies.filter((dependency) => dependency.kind !== 'dev' && dependency.kind !== 'build' && !dependency.optional)
      ),
      this.buildRequirementSection(
        'development',
        'Development',
        dependencies.filter((dependency) => dependency.kind === 'dev' || dependency.kind === 'build')
      ),
      this.buildRequirementSection(
        'optional',
        'Optional',
        dependencies.filter((dependency) => dependency.optional),
        true
      ),
    ].filter((section): section is NonNullable<typeof section> => !!section);

    if (sections.length === 0) {
      return null;
    }

    return {
      system: 'cargo',
      package: name,
      version,
      sections,
      webUrl: `https://crates.io/crates/${name}`,
    };
  }

  private buildRequirementSection(
    id: string,
    title: string,
    dependencies: CratesIoDependency[],
    optional = false
  ): RequirementsInfo['sections'][number] | null {
    if (dependencies.length === 0) {
      return null;
    }

    return {
      id,
      title,
      items: dependencies
        .filter((dependency) => !!dependency.crate_id)
        .map((dependency) => ({
          name: dependency.crate_id,
          requirement: dependency.req || '*',
          optional,
        })),
    };
  }

  private buildTimeMap(versions: CratesIoVersion[]): Record<string, string> | undefined {
    const entries = versions
      .filter((version) => version.created_at || version.updated_at)
      .map((version) => [version.num, version.created_at || version.updated_at!] as const);
    return entries.length > 0 ? Object.fromEntries(entries) : undefined;
  }
}
