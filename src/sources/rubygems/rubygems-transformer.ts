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
  RubyGemsGemMetadata,
  RubyGemsReverseDependency,
  RubyGemsSearchResultItem,
  RubyGemsVersionInfo,
} from '../../api/rubygems-api';

export class RubyGemsTransformer {
  transformSearchResult(raw: RubyGemsSearchResultItem[], from: number, size: number): SearchResult {
    return {
      packages: raw.map((item) => this.transformSearchItem(item)),
      total: raw.length === size ? from + raw.length + 1 : from + raw.length,
      hasMore: raw.length === size,
    };
  }

  transformSearchItem(item: RubyGemsSearchResultItem): PackageInfo {
    return {
      name: item.name,
      version: item.version,
      description: item.info,
      author: item.authors ? { name: item.authors } : undefined,
      repository: item.source_code_uri ? { url: item.source_code_uri } : undefined,
      homepage: item.homepage_uri || item.project_uri || item.gem_uri,
      downloads: item.downloads,
    };
  }

  transformPackageInfo(raw: RubyGemsGemMetadata): PackageInfo {
    return {
      name: raw.name,
      version: raw.version,
      description: raw.info,
      license: raw.licenses?.[0],
      author: raw.authors ? { name: raw.authors } : undefined,
      repository: raw.source_code_uri ? { url: raw.source_code_uri } : undefined,
      homepage: raw.homepage_uri || raw.project_uri || raw.gem_uri,
      downloads: raw.downloads,
    };
  }

  transformPackageDetails(
    raw: RubyGemsGemMetadata,
    versions: RubyGemsVersionInfo[],
    requestedVersion?: string
  ): PackageDetails {
    const selectedVersion =
      (requestedVersion && versions.find((version) => version.number === requestedVersion)?.number) ||
      raw.version ||
      versions[0]?.number ||
      '0.0.0';

    const selectedDetails = versions.find((version) => version.number === selectedVersion);
    const dependencies = this.mapDependencies(raw.dependencies?.runtime);
    const devDependencies = this.mapDependencies(raw.dependencies?.development);

    return {
      ...this.transformPackageInfo(raw),
      version: selectedVersion,
      description: selectedDetails?.description || raw.info,
      license: selectedDetails?.licenses?.[0] || raw.licenses?.[0],
      readme: selectedDetails?.description || raw.info,
      versions: this.transformVersions(versions),
      dependencies,
      devDependencies,
      requirements: this.buildRequirements(raw, selectedVersion) || undefined,
      maintainers: raw.authors
        ? raw.authors
            .split(',')
            .map((name) => ({ name: name.trim() }))
            .filter((maintainer) => maintainer.name)
        : undefined,
      time: this.buildTimeMap(versions),
      bugs: raw.bug_tracker_uri ? { url: raw.bug_tracker_uri } : undefined,
      homepage: raw.homepage_uri || raw.project_uri || raw.gem_uri,
      repository: raw.source_code_uri ? { url: raw.source_code_uri } : undefined,
    };
  }

  transformVersions(raw: RubyGemsVersionInfo[]): VersionInfo[] {
    return [...raw]
      .map((version) => ({
        version: version.number,
        publishedAt: version.built_at || version.created_at,
        dist: version.downloads_count !== undefined
          ? { unpackedSize: version.downloads_count }
          : undefined,
      }))
      .sort((a, b) => compareVersions(b.version, a.version));
  }

  buildRequirements(raw: RubyGemsGemMetadata, version: string): RequirementsInfo | null {
    const sections = [
      this.mapRequirementSection('runtime', 'Runtime', raw.dependencies?.runtime),
      this.mapRequirementSection('development', 'Development', raw.dependencies?.development, true),
    ].filter((section): section is NonNullable<typeof section> => !!section);

    if (sections.length === 0) {
      return null;
    }

    return {
      system: 'rubygems',
      package: raw.name,
      version,
      sections,
      webUrl: raw.project_uri || raw.gem_uri || `https://rubygems.org/gems/${raw.name}`,
    };
  }

  transformDependents(name: string, version: string, raw: RubyGemsReverseDependency[]): DependentsInfo {
    const directSample = raw.map((item) => ({
      package: {
        system: 'rubygems',
        name: item.name,
      },
      version: '',
    }));

    return {
      package: {
        system: 'rubygems',
        name,
      },
      version,
      totalCount: directSample.length,
      directCount: directSample.length,
      indirectCount: 0,
      directSample,
      indirectSample: [],
      webUrl: `https://rubygems.org/gems/${name}/reverse_dependencies`,
    };
  }

  private mapDependencies(
    dependencies?: Array<{ name: string; requirements: string }>
  ): Record<string, string> | undefined {
    if (!dependencies || dependencies.length === 0) {
      return undefined;
    }

    return Object.fromEntries(
      dependencies.map((dependency) => [dependency.name, dependency.requirements || '*'])
    );
  }

  private mapRequirementSection(
    id: string,
    title: string,
    requirements?: Array<{ name: string; requirements: string }>,
    optional = false
  ): RequirementsInfo['sections'][number] | null {
    if (!requirements || requirements.length === 0) {
      return null;
    }

    return {
      id,
      title,
      items: requirements.map((dependency) => ({
        name: dependency.name,
        requirement: dependency.requirements || '*',
        optional,
      })),
    };
  }

  private buildTimeMap(versions: RubyGemsVersionInfo[]): Record<string, string> | undefined {
    const entries = versions
      .filter((version) => version.built_at || version.created_at)
      .map((version) => [version.number, version.built_at || version.created_at!] as const);

    return entries.length > 0 ? Object.fromEntries(entries) : undefined;
  }
}
