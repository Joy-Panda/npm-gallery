import type {
  PackageDetails,
  PackageInfo,
  RequirementsInfo,
  SearchResult,
  VersionInfo,
} from '../../types/package';

type JsonObject = Record<string, unknown>;

export class MetaCpanTransformer {
  transformSearchResult(raw: Record<string, unknown>): SearchResult {
    const hits = this.readHits(raw);
    return {
      packages: hits.map((hit) => this.transformSearchItem(hit)),
      total: this.readTotal(raw) ?? hits.length,
      hasMore: hits.length > 0 && (this.readTotal(raw) ?? hits.length) > hits.length,
    };
  }

  transformSearchItem(raw: JsonObject): PackageInfo {
    return {
      name: this.readString(raw, ['module', 'name']) || 'unknown',
      version: this.readString(raw, ['version']) || 'latest',
      description: this.readString(raw, ['abstract', 'description']),
      author: this.readString(raw, ['author']) ? { name: this.readString(raw, ['author']) } : undefined,
      homepage: this.readString(raw, ['documentation', 'website']),
      downloads: this.readNumber(raw, ['download_count']),
    };
  }

  transformPackageDetails(
    moduleInfo: JsonObject,
    releaseInfo: JsonObject | null,
    versions: VersionInfo[]
  ): PackageDetails {
    const dependencies = this.mapDependencies(releaseInfo, 'runtime');
    const devDependencies = this.mapDependencies(releaseInfo, 'test');
    const configureDependencies = this.mapDependencies(releaseInfo, 'configure');

    return {
      name: this.readString(moduleInfo, ['module', 'name']) || 'unknown',
      version: this.readString(moduleInfo, ['version']) || this.readString(releaseInfo || {}, ['version']) || 'latest',
      description: this.readString(moduleInfo, ['abstract', 'description']) || this.readString(releaseInfo || {}, ['abstract']),
      homepage: this.readString(moduleInfo, ['documentation']) || this.readString(releaseInfo || {}, ['website']),
      repository: this.readNestedString(releaseInfo || {}, ['resources', 'repository', 'url'])
        ? { url: this.readNestedString(releaseInfo || {}, ['resources', 'repository', 'url']) }
        : undefined,
      author: this.readString(moduleInfo, ['author']) ? { name: this.readString(moduleInfo, ['author']) } : undefined,
      license: this.readLicense(releaseInfo || {}),
      downloads: this.readNumber(releaseInfo || {}, ['download_count']),
      versions,
      dependencies,
      devDependencies: { ...(devDependencies || {}), ...(configureDependencies || {}) },
      readme: this.readString(releaseInfo || {}, ['abstract']),
      requirements: this.buildRequirements(moduleInfo, releaseInfo),
      time: this.readString(releaseInfo || {}, ['date'])
        ? { [this.readString(moduleInfo, ['version']) || 'latest']: this.readString(releaseInfo || {}, ['date'])! }
        : undefined,
    };
  }

  transformVersions(raw: Record<string, unknown>): VersionInfo[] {
    return this.readHits(raw).map((hit) => ({
      version: this.readString(hit, ['version']) || 'latest',
      publishedAt: this.readString(hit, ['date']),
    }));
  }

  private buildRequirements(moduleInfo: JsonObject, releaseInfo: JsonObject | null): RequirementsInfo | undefined {
    const items = this.readDependencyList(releaseInfo || {});
    if (items.length === 0) {
      return undefined;
    }

    return {
      system: 'cpan',
      package: this.readString(moduleInfo, ['module', 'name']) || 'unknown',
      version: this.readString(moduleInfo, ['version']) || 'latest',
      sections: [
        {
          id: 'runtime',
          title: 'Dependencies',
          items: items.map((item) => ({
            name: this.readString(item, ['module', 'relationship']) || 'unknown',
            requirement: this.readString(item, ['version']) || '*',
            optional: this.readString(item, ['phase']) !== 'runtime',
          })),
        },
      ],
      webUrl: `https://metacpan.org/pod/${this.readString(moduleInfo, ['module', 'name']) || 'unknown'}`,
    };
  }

  private mapDependencies(releaseInfo: JsonObject | null, phase: string): Record<string, string> | undefined {
    const items = this.readDependencyList(releaseInfo || {}).filter(
      (dependency) => this.readString(dependency, ['phase']) === phase
    );
    if (items.length === 0) {
      return undefined;
    }

    return Object.fromEntries(
      items
        .map((dependency) => {
          const name = this.readString(dependency, ['module', 'relationship']);
          if (!name || name === 'perl') {
            return null;
          }
          return [name, this.readString(dependency, ['version']) || '*'] as const;
        })
        .filter((entry): entry is readonly [string, string] => !!entry)
    );
  }

  private readHits(raw: Record<string, unknown>): JsonObject[] {
    const hits = (raw.hits as Record<string, unknown> | undefined)?.hits;
    if (!Array.isArray(hits)) {
      return [];
    }
    return hits
      .map((item) => (item && typeof item === 'object' ? ((item as JsonObject)._source as JsonObject) || (item as JsonObject) : null))
      .filter((item): item is JsonObject => !!item);
  }

  private readTotal(raw: Record<string, unknown>): number | undefined {
    const total = (raw.hits as Record<string, unknown> | undefined)?.total;
    if (typeof total === 'number') {
      return total;
    }
    if (total && typeof total === 'object' && typeof (total as JsonObject).value === 'number') {
      return (total as JsonObject).value as number;
    }
    return undefined;
  }

  private readDependencyList(raw: JsonObject): JsonObject[] {
    const list = raw.dependency;
    return Array.isArray(list)
      ? list.filter((item): item is JsonObject => !!item && typeof item === 'object')
      : [];
  }

  private readString(raw: JsonObject, keys: string[]): string | undefined {
    for (const key of keys) {
      const value = raw[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    return undefined;
  }

  private readNestedString(raw: JsonObject, path: string[]): string | undefined {
    let current: unknown = raw;
    for (const segment of path) {
      if (!current || typeof current !== 'object') {
        return undefined;
      }
      current = (current as JsonObject)[segment];
    }
    return typeof current === 'string' && current.trim() ? current.trim() : undefined;
  }

  private readNumber(raw: JsonObject, keys: string[]): number | undefined {
    for (const key of keys) {
      const value = raw[key];
      if (typeof value === 'number') {
        return value;
      }
    }
    return undefined;
  }

  private readLicense(raw: JsonObject): string | undefined {
    const license = raw.license;
    if (typeof license === 'string') {
      return license;
    }
    if (Array.isArray(license)) {
      return license.find((item): item is string => typeof item === 'string');
    }
    return undefined;
  }
}
