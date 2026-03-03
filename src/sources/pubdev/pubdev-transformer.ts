import type {
  PackageDetails,
  PackageInfo,
  PackageScore,
  RequirementsInfo,
} from '../../types/package';
import type { PubDevPackageResponse, PubDevScoreResponse } from '../../api/pub-dev-api';

export class PubDevTransformer {
  transformPackageInfo(raw: PubDevPackageResponse, score?: PubDevScoreResponse): PackageInfo {
    const latest = raw.latest;
    const pubspec = latest.pubspec || {};
    return {
      name: raw.name,
      version: latest.version,
      description: this.readString(pubspec, ['description']),
      author: this.readAuthor(pubspec),
      homepage: this.readString(pubspec, ['homepage', 'repository']),
      repository: this.readString(pubspec, ['repository']) ? { url: this.readString(pubspec, ['repository']) } : undefined,
      license: this.readString(pubspec, ['license']),
      downloads: score?.downloadCount30Days,
      score: this.buildScore(score),
      keywords: score?.tags,
    };
  }

  transformPackageDetails(
    raw: PubDevPackageResponse,
    score?: PubDevScoreResponse,
    requestedVersion?: string
  ): PackageDetails {
    const selected = raw.versions.find((version) => version.version === requestedVersion) || raw.latest;
    const pubspec = selected.pubspec || {};
    return {
      ...this.transformPackageInfo(raw, score),
      version: selected.version,
      readme: this.readString(pubspec, ['description']),
      versions: raw.versions.map((version) => ({
        version: version.version,
        publishedAt: version.published,
      })),
      dependencies: this.readDependencyMap(pubspec.dependencies),
      devDependencies: this.readDependencyMap(pubspec.dev_dependencies),
      requirements: this.buildRequirements(raw.name, selected.version, pubspec) || undefined,
      time: Object.fromEntries(
        raw.versions
          .filter((version) => !!version.published)
          .map((version) => [version.version, version.published!])
      ),
    };
  }

  private buildRequirements(
    name: string,
    version: string,
    pubspec: Record<string, unknown>
  ): RequirementsInfo | null {
    const environment = pubspec.environment;
    if (!environment || typeof environment !== 'object') {
      return null;
    }

    const items = Object.entries(environment as Record<string, unknown>)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
      .map(([envName, requirement]) => ({
        name: envName,
        requirement,
      }));

    if (items.length === 0) {
      return null;
    }

    return {
      system: 'pub',
      package: name,
      version,
      sections: [
        {
          id: 'environment',
          title: 'Environment',
          items,
        },
      ],
      webUrl: `https://pub.dev/packages/${name}`,
    };
  }

  private readDependencyMap(value: unknown): Record<string, string> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }

    const entries = Object.entries(value as Record<string, unknown>)
      .map(([name, spec]) => {
        if (typeof spec === 'string') {
          return [name, spec] as const;
        }
        if (spec && typeof spec === 'object' && typeof (spec as Record<string, unknown>).version === 'string') {
          return [name, (spec as Record<string, unknown>).version as string] as const;
        }
        return [name, 'sdk/path/git'] as const;
      });

    return entries.length > 0 ? Object.fromEntries(entries) : undefined;
  }

  private buildScore(score?: PubDevScoreResponse): PackageScore | undefined {
    if (!score || !score.maxPoints) {
      return undefined;
    }
    return {
      final: score.grantedPoints && score.maxPoints > 0
        ? Math.max(0, Math.min(1, score.grantedPoints / score.maxPoints))
        : 0,
      detail: {
        quality: score.grantedPoints || 0,
        popularity: Math.round((score.popularityScore || 0) * 100),
        maintenance: score.likeCount || 0,
      },
    };
  }

  private readAuthor(pubspec: Record<string, unknown>): { name: string } | undefined {
    const authors = pubspec.authors;
    if (Array.isArray(authors) && typeof authors[0] === 'string') {
      return { name: authors[0] };
    }
    const author = this.readString(pubspec, ['author']);
    return author ? { name: author } : undefined;
  }

  private readString(raw: Record<string, unknown>, keys: string[]): string | undefined {
    for (const key of keys) {
      const value = raw[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    return undefined;
  }
}
