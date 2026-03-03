import type {
  PackageDetails,
  PackageInfo,
  SearchResult,
  SecurityInfo,
  VersionInfo,
  DependentsInfo,
  RequirementsInfo,
} from '../../types/package';
import { compareVersions } from '../../utils/version-utils';

type JsonObject = Record<string, unknown>;

export class ClojarsTransformer {
  transformSearchResult(raw: unknown, from: number, size: number): SearchResult {
    const items = this.readSearchItems(raw);
    return {
      packages: items.slice(0, size).map((item) => this.transformSearchItem(item)),
      total: from + items.length,
      hasMore: items.length > size,
    };
  }

  transformSearchItem(raw: JsonObject): PackageInfo {
    const name = this.readCoordinate(raw);
    return {
      name,
      version: this.readString(raw, ['version', 'latest_version']) || '0.0.0',
      description: this.readString(raw, ['description', 'desc']),
      author: this.readString(raw, ['username', 'owner_name', 'group_name']) ? { name: this.readString(raw, ['username', 'owner_name', 'group_name']) } : undefined,
      repository: this.readString(raw, ['scm', 'url']) ? { url: this.readString(raw, ['scm', 'url']) } : undefined,
      homepage: `https://clojars.org/${name}`,
      downloads: this.readNumber(raw, ['downloads', 'download_count', 'recent_downloads']),
    };
  }

  transformArtifactDetails(raw: JsonObject, downloads?: number, security?: SecurityInfo | null): PackageDetails {
    const name = this.readCoordinate(raw);
    const versions = this.readVersions(raw);
    const latestVersion = this.readString(raw, ['latest_version', 'version']) || versions[0]?.version || '0.0.0';
    const dependencies = this.readDependencyMap(raw, ['dependencies', 'deps']);

    return {
      name,
      version: latestVersion,
      description: this.readString(raw, ['description', 'desc']),
      homepage: `https://clojars.org/${name}`,
      repository: this.readString(raw, ['scm', 'url']) ? { url: this.readString(raw, ['scm', 'url']) } : undefined,
      license: this.readLicense(raw),
      downloads,
      versions,
      dependencies,
      requirements: this.buildRequirements(name, latestVersion, dependencies) || undefined,
      security: security || undefined,
      readme: this.readString(raw, ['description', 'desc']),
    };
  }

  transformVersions(raw: JsonObject): VersionInfo[] {
    return this.readVersions(raw);
  }

  transformDependents(_name: string, _version: string): DependentsInfo | null {
    return null;
  }

  private buildRequirements(
    name: string,
    version: string,
    dependencies?: Record<string, string>
  ): RequirementsInfo | null {
    const entries = Object.entries(dependencies || {});
    if (entries.length === 0) {
      return null;
    }

    return {
      system: 'maven',
      package: name.replace('/', ':'),
      version,
      sections: [
        {
          id: 'runtime',
          title: 'Runtime',
          items: entries.map(([depName, requirement]) => ({
            name: depName,
            requirement,
          })),
        },
      ],
      webUrl: `https://clojars.org/${name}`,
    };
  }

  private readSearchItems(raw: unknown): JsonObject[] {
    if (Array.isArray(raw)) {
      return raw.filter((item): item is JsonObject => !!item && typeof item === 'object');
    }

    if (!raw || typeof raw !== 'object') {
      return [];
    }

    for (const key of ['results', 'items', 'data']) {
      const value = (raw as JsonObject)[key];
      if (Array.isArray(value)) {
        return value.filter((item): item is JsonObject => !!item && typeof item === 'object');
      }
    }

    return [];
  }

  private readCoordinate(raw: JsonObject): string {
    const explicit = this.readString(raw, ['jar_name', 'artifact_id', 'name']);
    const group = this.readString(raw, ['group_name', 'group_id']);
    if (group && explicit) {
      if (explicit.includes('/')) {
        return explicit;
      }
      return `${group}/${explicit}`;
    }
    return explicit || 'unknown/unknown';
  }

  private readVersions(raw: JsonObject): VersionInfo[] {
    const versionsValue = raw.versions;
    if (Array.isArray(versionsValue)) {
      return versionsValue
        .map((item) => {
          if (typeof item === 'string') {
            return { version: item };
          }
          if (item && typeof item === 'object') {
            const version = this.readString(item as JsonObject, ['version', 'jar_version', 'name']);
            if (!version) {
              return null;
            }
            return {
              version,
              publishedAt: this.readString(item as JsonObject, ['created', 'created_at', 'release_date']),
            };
          }
          return null;
        })
        .filter((item): item is VersionInfo => !!item)
        .sort((a, b) => compareVersions(b.version, a.version));
    }

    const latestVersion = this.readString(raw, ['latest_version', 'version']);
    return latestVersion ? [{ version: latestVersion }] : [];
  }

  private readDependencyMap(raw: JsonObject, keys: string[]): Record<string, string> | undefined {
    for (const key of keys) {
      const value = raw[key];
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return Object.fromEntries(
          Object.entries(value as JsonObject)
            .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
        );
      }

      if (Array.isArray(value)) {
        const mapped = value
          .map((item) => {
            if (!item || typeof item !== 'object') {
              return null;
            }
            const obj = item as JsonObject;
            const depName = this.readString(obj, ['coord', 'name', 'dependency']);
            const requirement = this.readString(obj, ['version', 'requirement']) || '*';
            return depName ? [depName, requirement] as const : null;
          })
          .filter((entry): entry is readonly [string, string] => !!entry);
        if (mapped.length > 0) {
          return Object.fromEntries(mapped);
        }
      }
    }

    return undefined;
  }

  private readLicense(raw: JsonObject): string | undefined {
    const licenseValue = raw.license;
    if (typeof licenseValue === 'string') {
      return licenseValue;
    }
    if (Array.isArray(licenseValue)) {
      return licenseValue.find((item): item is string => typeof item === 'string');
    }
    return this.readString(raw, ['licenses', 'license_name']);
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
      if (typeof value === 'number' && Number.isFinite(value)) {
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
