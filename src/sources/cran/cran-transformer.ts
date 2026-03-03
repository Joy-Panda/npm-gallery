import type {
  PackageDetails,
  PackageInfo,
  RequirementsInfo,
  SearchResult,
  VersionInfo,
} from '../../types/package';

type JsonObject = Record<string, unknown>;

export class CranTransformer {
  transformSearchResult(raw: Array<Record<string, unknown>>): SearchResult {
    return {
      packages: raw.map((item) => this.transformSearchItem(item)),
      total: raw.length,
      hasMore: false,
    };
  }

  transformSearchItem(raw: JsonObject): PackageInfo {
    return {
      name: this.readString(raw, ['package', 'Package']) || 'unknown',
      version: this.readString(raw, ['version', 'Version']) || 'latest',
      description: this.readString(raw, ['description', 'Description']),
      author: this.readString(raw, ['maintainer', 'Maintainer']) ? { name: this.readString(raw, ['maintainer', 'Maintainer']) } : undefined,
      homepage: this.readString(raw, ['repository', 'url', 'URL']),
      downloads: this.readNumber(raw, ['downloads', 'count']),
    };
  }

  transformPackageDetails(raw: JsonObject, downloads?: number): PackageDetails {
    const version = this.readString(raw, ['version', 'Version']) || 'latest';
    return {
      ...this.transformSearchItem(raw),
      version,
      license: this.readString(raw, ['license', 'License']),
      downloads: downloads ?? this.readNumber(raw, ['downloads']),
      readme: this.readString(raw, ['description', 'Description']),
      versions: this.transformVersions(raw),
      dependencies: this.parseDependencyField(this.readString(raw, ['Depends', 'Imports', 'LinkingTo'])),
      devDependencies: this.parseDependencyField(this.readString(raw, ['Suggests', 'Enhances'])),
      requirements: this.buildRequirements(raw, version) || undefined,
    };
  }

  transformVersions(raw: JsonObject): VersionInfo[] {
    const version = this.readString(raw, ['version', 'Version']) || 'latest';
    const publishedAt = this.readString(raw, ['Date/Publication', 'published']);
    return [{ version, publishedAt }];
  }

  buildRequirements(raw: JsonObject, version: string): RequirementsInfo | null {
    const sections = [
      this.buildSection('runtime', 'Runtime', this.readString(raw, ['Depends', 'Imports', 'LinkingTo'])),
      this.buildSection('development', 'Development', this.readString(raw, ['Suggests', 'Enhances']), true),
    ].filter((section): section is NonNullable<typeof section> => !!section);

    if (sections.length === 0) {
      return null;
    }

    const name = this.readString(raw, ['package', 'Package']) || 'unknown';
    return {
      system: 'cran',
      package: name,
      version,
      sections,
      webUrl: `https://cran.r-project.org/package=${name}`,
    };
  }

  private buildSection(
    id: string,
    title: string,
    field?: string,
    optional = false
  ): RequirementsInfo['sections'][number] | null {
    const parsed = this.parseDependencyField(field);
    if (!parsed) {
      return null;
    }

    return {
      id,
      title,
      items: Object.entries(parsed).map(([name, requirement]) => ({
        name,
        requirement,
        optional,
      })),
    };
  }

  private parseDependencyField(field?: string): Record<string, string> | undefined {
    if (!field) {
      return undefined;
    }

    const entries = field
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const match = item.match(/^([A-Za-z0-9.]+)\s*(?:\(([^)]+)\))?/);
        if (!match || match[1] === 'R') {
          return null;
        }
        return [match[1], match[2]?.trim() || '*'] as const;
      })
      .filter((entry): entry is readonly [string, string] => !!entry);

    return entries.length > 0 ? Object.fromEntries(entries) : undefined;
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

  private readNumber(raw: JsonObject, keys: string[]): number | undefined {
    for (const key of keys) {
      const value = raw[key];
      if (typeof value === 'number') {
        return value;
      }
      if (typeof value === 'string') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
    }
    return undefined;
  }
}
