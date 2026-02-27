import { BaseSourceAdapter } from '../base/source-adapter.interface';
import { SourceCapability, CapabilityNotSupportedError } from '../base/capabilities';
import { SonatypeTransformer } from './sonatype-transformer';
import type { SonatypeApiClient, MavenPOM } from '../../api/sonatype-api';
import type { DepsDevClient } from '../../api/deps-dev';
import type {
  PackageInfo,
  PackageDetails,
  VersionInfo,
  SearchResult,
  SearchOptions,
  SearchSortBy,
  CopyOptions,
} from '../../types/package';
import type { SourceType, ProjectType } from '../../types/project';

/**
 * Sonatype Central Repository source adapter
 * Supports Maven and Gradle package management
 */
export class SonatypeSourceAdapter extends BaseSourceAdapter {
  readonly sourceType: SourceType = 'sonatype';
  readonly displayName = 'Sonatype Central';
  readonly projectType: ProjectType = 'maven';
  readonly supportedSortOptions: SearchSortBy[] = ['relevance', 'name'];
  readonly supportedFilters: string[] = ['groupId', 'artifactId', 'packaging'];

  private transformer: SonatypeTransformer;

  constructor(private client: SonatypeApiClient, depsDevClient?: DepsDevClient) {
    super(depsDevClient);
    this.transformer = new SonatypeTransformer();
  }

  getEcosystem(): string {
    return 'maven';
  }

  /**
   * Declare supported capabilities
   */
  getSupportedCapabilities(): SourceCapability[] {
    return [
      SourceCapability.SEARCH,
      SourceCapability.PACKAGE_INFO,
      SourceCapability.PACKAGE_DETAILS,
      SourceCapability.VERSIONS,
      SourceCapability.COPY, // Maven/Gradle use copy snippets
      SourceCapability.SUGGESTIONS,
      SourceCapability.DEPENDENCIES,
      SourceCapability.DEPENDENTS,
      SourceCapability.REQUIREMENTS,
    ];
  }

  /**
   * Search for packages
   */
  async search(options: SearchOptions): Promise<SearchResult> {
    const { query, from = 0, size = 20 } = options;

    if (!query.trim()) {
      return { packages: [], total: 0, hasMore: false };
    }

    // Build search query
    let searchQuery = query;
    
    // If query looks like a coordinate (groupId:artifactId), parse it
    if (query.includes(':')) {
      const parsed = this.client.parseCoordinate(query);
      if (parsed) {
        if (parsed.version) {
          searchQuery = `g:${parsed.groupId} AND a:${parsed.artifactId} AND v:${parsed.version}`;
        } else {
          searchQuery = `g:${parsed.groupId} AND a:${parsed.artifactId}`;
        }
      }
    }

    const response = await this.client.search(searchQuery, { from, size });
    const result = this.transformer.transformSearchResult(response, from, size);

    // Client-side name sorting if needed
    if (options.sortBy === 'name') {
      result.packages = this.sortPackagesByName(result.packages);
    }

    return result;
  }

  /**
   * Get suggestions for autocomplete
   */
  async getSuggestions(query: string, limit: number = 10): Promise<PackageInfo[]> {
    const result = await this.search({ query, size: limit });
    return result.packages;
  }

  /**
   * Get basic package info
   */
  async getPackageInfo(name: string): Promise<PackageInfo> {
    const parsed = this.client.parseCoordinate(name);
    if (!parsed || !parsed.groupId || !parsed.artifactId) {
      throw new Error(`Invalid Maven coordinate: ${name}. Expected format: groupId:artifactId`);
    }

    const artifact = await this.client.getArtifact(parsed.groupId, parsed.artifactId);
    if (!artifact) {
      throw new Error(`Package not found: ${name}`);
    }

    // Try to fetch POM for additional info
    let pom: MavenPOM | null = null;
    try {
      pom = await this.client.getPOM(artifact.g, artifact.a, artifact.v);
    } catch {
      // Continue without POM if fetch fails
    }

    return this.transformer.transformPackageInfo({ artifact, pom: pom || undefined });
  }

  /**
   * Get detailed package info
   */
  async getPackageDetails(name: string, version?: string): Promise<PackageDetails> {
    const parsed = this.client.parseCoordinate(name);
    if (!parsed || !parsed.groupId || !parsed.artifactId) {
      throw new Error(`Invalid Maven coordinate: ${name}. Expected format: groupId:artifactId`);
    }

    const artifact = version
      ? await this.client.getArtifactVersion(parsed.groupId, parsed.artifactId, version)
      : await this.client.getArtifact(parsed.groupId, parsed.artifactId);
    if (!artifact) {
      throw new Error(`Package not found: ${name}${version ? `@${version}` : ''}`);
    }

    // Get all versions
    const versions = await this.client.getVersions(parsed.groupId, parsed.artifactId);

    // Try to fetch POM for additional info
    let pom: MavenPOM | null = null;
    try {
      pom = await this.client.getPOM(artifact.g, artifact.a, artifact.v);
    } catch {
      // Continue without POM if fetch fails
    }

    return this.transformer.transformPackageDetails({ artifact, versions, pom: pom || undefined });
  }

  /**
   * Get package versions
   */
  async getVersions(name: string): Promise<VersionInfo[]> {
    const parsed = this.client.parseCoordinate(name);
    if (!parsed || !parsed.groupId || !parsed.artifactId) {
      throw new Error(`Invalid Maven coordinate: ${name}. Expected format: groupId:artifactId`);
    }

    const versions = await this.client.getVersions(parsed.groupId, parsed.artifactId);
    return this.transformer.transformVersions(versions);
  }

  /**
   * Generate copy snippet for Maven or Gradle
   */
  getCopySnippet(packageName: string, options: CopyOptions): string {
    if (!this.supportsCapability(SourceCapability.COPY)) {
      throw new CapabilityNotSupportedError(SourceCapability.COPY, this.sourceType);
    }

    const parsed = this.client.parseCoordinate(packageName);
    if (!parsed || !parsed.groupId || !parsed.artifactId) {
      throw new Error(`Invalid Maven coordinate: ${packageName}. Expected format: groupId:artifactId`);
    }

    const { version = 'LATEST', scope = 'compile', format = 'xml' } = options;

    if (format === 'xml' || format === 'other') {
      // Maven POM format
      return this.generateMavenSnippet(parsed.groupId, parsed.artifactId, version, scope);
    } else if (format === 'gradle') {
      // Gradle format
      return this.generateGradleSnippet(parsed.groupId, parsed.artifactId, version, scope);
    } else if (format === 'sbt') {
      // SBT format
      return this.generateSbtSnippet(parsed.groupId, parsed.artifactId, version, scope);
    }

    // Default to Maven
    return this.generateMavenSnippet(parsed.groupId, parsed.artifactId, version, scope);
  }

  /**
   * Generate Maven dependency snippet
   */
  private generateMavenSnippet(
    groupId: string,
    artifactId: string,
    version: string,
    scope: string
  ): string {
    let snippet = `    <dependency>\n`;
    snippet += `        <groupId>${groupId}</groupId>\n`;
    snippet += `        <artifactId>${artifactId}</artifactId>\n`;
    snippet += `        <version>${version}</version>\n`;
    if (scope !== 'compile') {
      snippet += `        <scope>${scope}</scope>\n`;
    }
    snippet += `    </dependency>`;
    return snippet;
  }

  /**
   * Generate Gradle dependency snippet
   */
  private generateGradleSnippet(
    groupId: string,
    artifactId: string,
    version: string,
    scope: string
  ): string {
    let snippet = '';
    if (scope === 'compile' || scope === 'runtime') {
      snippet = `implementation '${groupId}:${artifactId}:${version}'`;
    } else if (scope === 'test') {
      snippet = `testImplementation '${groupId}:${artifactId}:${version}'`;
    } else if (scope === 'provided') {
      snippet = `compileOnly '${groupId}:${artifactId}:${version}'`;
    } else {
      snippet = `implementation '${groupId}:${artifactId}:${version}'`;
    }
    return snippet;
  }

  /**
   * Generate SBT dependency snippet
   */
  private generateSbtSnippet(
    groupId: string,
    artifactId: string,
    version: string,
    scope: string
  ): string {
    let snippet = '';
    if (scope === 'test') {
      snippet = `"${groupId}" % "${artifactId}" % "${version}" % Test`;
    } else {
      snippet = `"${groupId}" % "${artifactId}" % "${version}"`;
    }
    return snippet;
  }

  /**
   * Sort packages by name
   */
  private sortPackagesByName(packages: PackageInfo[]): PackageInfo[] {
    return [...packages].sort((a, b) => a.name.localeCompare(b.name));
  }
}
