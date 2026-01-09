import { BaseSourceAdapter } from '../base/source-adapter.interface';
import { SourceCapability, CapabilityNotSupportedError } from '../base/capabilities';
import { SonatypeTransformer } from './sonatype-transformer';
import { LibrariesIoClient } from '../../api/libraries-io';
import type { SonatypeApiClient, MavenPOM, SonatypeArtifact } from '../../api/sonatype-api';
import type { OSVClient } from '../../api/osv';
import type { LibrariesIoDependenciesResponse } from '../../api/libraries-io';
import type {
  PackageInfo,
  PackageDetails,
  VersionInfo,
  SearchResult,
  SearchOptions,
  SearchSortBy,
  SearchFilter,
  CopyOptions,
  PackageRepository,
  SecurityInfo,
} from '../../types/package';
import { getSortValue, createFilterOption } from '../../types/package';
import type { SourceType, ProjectType } from '../../types/project';

/**
 * Sonatype Central Repository source adapter
 * Supports Maven and Gradle package management
 */
export class SonatypeSourceAdapter extends BaseSourceAdapter {
  readonly sourceType: SourceType = 'sonatype';
  readonly displayName = 'Sonatype Central';
  readonly projectType: ProjectType = 'maven';
  readonly supportedSortOptions: SearchSortBy[] = [
    /*createSortOption('score desc', 'Score'),
    createSortOption('timestamp desc', 'Published Date'),
    createSortOption('g asc', 'Group ID'),
    createSortOption('a asc', 'Artifact ID'),*/
  ];
  readonly supportedFilters: SearchFilter[] = [
    createFilterOption('groupId', 'Group ID', 'groupId (e.g., com.google.inject)'),
    createFilterOption('artifactId', 'Artifact ID', 'artifactId (e.g., guice)'),
    createFilterOption('tags', 'Tags', 'tags (comma-separated)'),
  ];

  private transformer: SonatypeTransformer;

  constructor(
    private client: SonatypeApiClient,
    private osvClient?: OSVClient,
    private librariesIoClient?: LibrariesIoClient
  ) {
    super();
    this.transformer = new SonatypeTransformer();
  }

  /**
   * Declare supported capabilities
   */
  getSupportedCapabilities(): SourceCapability[] {
    const capabilities: SourceCapability[] = [
      SourceCapability.SEARCH,
      SourceCapability.PACKAGE_INFO,
      SourceCapability.PACKAGE_DETAILS,
      SourceCapability.VERSIONS,
      SourceCapability.COPY, // Maven/Gradle use copy snippets
      SourceCapability.SUGGESTIONS,
      SourceCapability.DEPENDENCIES,
    ];
    
    // Add security capability if OSV client is available
    if (this.osvClient) {
      capabilities.push(SourceCapability.SECURITY);
    }
    
    return capabilities;
  }

  /**
   * Search for packages
   */
  async search(options: SearchOptions): Promise<SearchResult> {
    const { query, from = 0, size = 20, sortBy = 'relevance' } = options;

    // Parse query to extract filters and base query
    // Sonatype API format: "baseQuery g:groupId a:artifactId v:version"
    // Example: "com.google.guava groupId:com.google.guava artifactId:guava" -> "com.google.guava g:com.google.guava a:guava"
    const groupIdMatch = query.match(/\bgroupId:([^\s]+)/);
    const artifactIdMatch = query.match(/\bartifactId:([^\s]+)/);
    const tagsMatch = query.match(/\btags:([^\s]+)/);
    
    const groupId = groupIdMatch ? groupIdMatch[1] : undefined;
    const artifactId = artifactIdMatch ? artifactIdMatch[1] : undefined;
    const tags = tagsMatch ? tagsMatch[1] : undefined;
    
    // Remove filter qualifiers from query to get base query
    // Use global replace to remove all occurrences
    let baseQuery = query
      .replace(/\bgroupId:[^\s]+/g, '')
      .replace(/\bartifactId:[^\s]+/g, '')
      .replace(/\btags:[^\s]+/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    
    // Check if there are filters or base query
    const hasFilters = !!(groupId || artifactId || tags);
    const hasBaseQuery = baseQuery && baseQuery.trim().length > 0;
    
    // Allow search if there's a base query OR filters
    if (!hasBaseQuery && !hasFilters) {
      return { packages: [], total: 0, hasMore: false };
    }
    
    // Build search query in Sonatype API format
    // Format: "baseQuery g:groupId a:artifactId v:version"
    // Multiple conditions are separated by spaces
    let searchQuery = baseQuery;
    
    // If query looks like a coordinate (groupId:artifactId), parse it
    // This handles the case where user enters "groupId:artifactId" directly
    if (!groupId && !artifactId && query.includes(':') && !query.includes(' ')) {
      const parsed = this.client.parseCoordinate(query);
      if (parsed) {
        // If it's a coordinate, use Sonatype format with g: and a: prefixes
        if (parsed.version) {
          searchQuery = `g:${parsed.groupId} a:${parsed.artifactId} v:${parsed.version}`;
        } else {
          searchQuery = `g:${parsed.groupId} a:${parsed.artifactId}`;
        }
      }
    } else {
      // Build query with filters using space-separated format
      const parts: string[] = [];
      
      if (baseQuery) {
        parts.push(baseQuery);
      }
      
      if (groupId) {
        parts.push(`g:${groupId}`);
      }
      
      if (artifactId) {
        parts.push(`a:${artifactId}`);
      }
      
      if (tags) {
        // Tags might need special handling, for now just add as-is
        parts.push(`tags:${tags}`);
      }
      
      searchQuery = parts.join(' ').trim();
      
      // If no parts were added, use original query
      if (!searchQuery) {
        searchQuery = query;
      }
    }

    // Map sortBy to Sonatype API sort format
    // Sonatype API expects sort format like "timestamp desc", "score desc", "g asc", "a asc"
    // Reference: https://search.maven.org/solrsearch/select?q=guice&rows=20&wt=json&sort=timestamp+desc
    const sortValue = getSortValue(sortBy);
    let apiSort: string | undefined;
    
    // Sonatype API uses specific sort formats:
    // - 'score desc' for score (default, highest score first)
    // - 'timestamp desc' for published date (newest first)
    // - 'g asc' for groupId ascending (alphabetical)
    // - 'a asc' for artifactId ascending (alphabetical)
    // - 'name' maps to artifactId
    if (sortValue === 'name') {
      apiSort = 'a asc';
    } else if (sortValue && sortValue !== 'relevance') {
      // Use the sort value directly if it's already in Sonatype format (contains space and desc/asc)
      // Otherwise map common values to Sonatype format
      if (sortValue.includes(' ') && (sortValue.includes('desc') || sortValue.includes('asc'))) {
        apiSort = sortValue; // Already in correct format like "timestamp desc"
      } else {
        // Map common sort values to Sonatype format
        switch (sortValue) {
          case 'score':
            apiSort = 'score desc';
            break;
          case 'timestamp':
            apiSort = 'timestamp desc';
            break;
          case 'groupId':
            apiSort = 'g asc';
            break;
          case 'artifactId':
            apiSort = 'a asc';
            break;
          default:
            // For unknown values, try to use as-is (API may handle it)
            apiSort = sortValue;
        }
      }
    }
    // If sortValue is 'relevance' or undefined, apiSort remains undefined
    // This means we don't pass sort parameter, and API will use default sorting

    // Try primary search (Sonatype Central), fallback to Libraries.io if fails
    let result: SearchResult;
    try {
      const response = await this.client.search(searchQuery, { from, size, sort: apiSort });
      result = this.transformer.transformSearchResult(response, from, size);
    } catch (error) {
      // Fallback to Libraries.io if primary search fails
      if (this.librariesIoClient) {
        try {
          const page = Math.floor(from / size) + 1;
          const platform = LibrariesIoClient.getPlatformForProjectType(this.projectType);
          const librariesIoResponse = await this.librariesIoClient.search(query, platform, {
            page,
            per_page: size,
          });
          result = this.transformer.transformLibrariesIoSearchResult(librariesIoResponse, from, size);
        } catch (fallbackError) {
          // If both fail, return empty result
          return { packages: [], total: 0, hasMore: false };
        }
      } else {
        throw error;
      }
    }

    // Enhance search results with additional metadata from deps.dev
    // This is done in parallel for better performance
    try {
      const enhancementPromises = result.packages.map(async (pkg) => {
        try {
          const parsed = this.client.parseCoordinate(pkg.name);
          if (!parsed || !parsed.groupId || !parsed.artifactId) {
            return pkg;
          }

          // Try to fetch deps.dev package info for enhanced metadata
          const depsDevPackage = await this.client.getDepsDevPackage(parsed.groupId, parsed.artifactId);
          if (depsDevPackage) {
            // Enhance with deps.dev data
            const latestVersion = depsDevPackage.versions?.find(v => v.isDefault) || depsDevPackage.versions?.[0];
            if (latestVersion) {
              const depsDevVersion = await this.client.getDepsDevVersion(parsed.groupId, parsed.artifactId, latestVersion.versionKey.version);
              if (depsDevVersion) {
                // Extract license, links from deps.dev
                const license = depsDevVersion.licenses?.[0];
                let homepage: string | undefined;
                let repository: PackageRepository | undefined;
                
                if (depsDevVersion.links) {
                  for (const link of depsDevVersion.links) {
                    if (link.label === 'Homepage' || link.label === 'Website') {
                      homepage = link.url;
                    } else if (link.label === 'Repository' || link.label === 'Source') {
                      repository = { url: link.url };
                    } else if (!homepage && link.url) {
                      homepage = link.url;
                    }
                  }
                }

                // Try to get description from POM as fallback
                let description = pkg.description;
                if (!description) {
                  try {
                    const pom = await this.client.getPOM(parsed.groupId, parsed.artifactId, latestVersion.versionKey.version);
                    description = pom?.project?.description || pom?.project?.name;
                  } catch {
                    // Continue without POM description
                  }
                }

                // Update package info with enhanced data
                return {
                  ...pkg,
                  description: description,
                  license: pkg.license || license,
                  homepage: pkg.homepage || homepage,
                  repository: pkg.repository || repository,
                };
              }
            }
          }
        } catch {
          // Continue without enhancement if fetch fails
        }
        return pkg;
      });

      // Wait for all enhancements to complete (with timeout to avoid blocking)
      const enhancedPackages = await Promise.allSettled(enhancementPromises);
      const originalPackages = result.packages;
      result.packages = enhancedPackages.map((result, index) => 
        result.status === 'fulfilled' ? result.value : originalPackages[index]
      );
    } catch {
      // Continue without enhancement if batch fetch fails
    }

    // Client-side name sorting if needed (only if not already sorted by API)
    // Note: We already handled API sorting above, but 'name' sorting is done client-side
    const finalSortValue = getSortValue(sortBy);
    if (finalSortValue === 'name') {
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

    // Try to fetch deps.dev version info for enhanced metadata
    let depsDevVersion = null;
    try {
      depsDevVersion = await this.client.getDepsDevVersion(parsed.groupId, parsed.artifactId, artifact.v);
    } catch {
      // Continue without deps.dev info if fetch fails
    }

    // Try to fetch POM for additional info
    let pom: MavenPOM | null = null;
    try {
      pom = await this.client.getPOM(artifact.g, artifact.a, artifact.v);
    } catch {
      // Continue without POM if fetch fails
    }

    return this.transformer.transformPackageInfo({ 
      artifact, 
      pom: pom || undefined,
      depsDevVersion: depsDevVersion || undefined
    });
  }

  /**
   * Get detailed package info
   */
  async getPackageDetails(name: string, version?: string): Promise<PackageDetails> {
    const parsed = this.client.parseCoordinate(name);
    if (!parsed || !parsed.groupId || !parsed.artifactId) {
      throw new Error(`Invalid Maven coordinate: ${name}. Expected format: groupId:artifactId`);
    }

    // Try primary API (Sonatype Central + deps.dev), fallback to Libraries.io if fails
    try {
      // Get all versions first
      const versions = await this.client.getVersions(parsed.groupId, parsed.artifactId);
      
      // Determine which artifact to use
      let artifact: SonatypeArtifact | null = null;
      if (version) {
        // Find the specific version
        const versionArtifact = versions.find(v => v.v === version);
        if (versionArtifact) {
          artifact = versionArtifact;
        }
      }
      
      // If no specific version found or no version specified, use latest
      if (!artifact) {
        artifact = await this.client.getArtifact(parsed.groupId, parsed.artifactId);
        if (!artifact) {
          throw new Error(`Package not found: ${name}`);
        }
      }

      // Try to fetch deps.dev package and version info for enhanced metadata
      let depsDevPackage = null;
      let depsDevVersion = null;
      let dependencyTree = null;
      try {
        depsDevPackage = await this.client.getDepsDevPackage(artifact.g, artifact.a);
        depsDevVersion = await this.client.getDepsDevVersion(artifact.g, artifact.a, artifact.v);
        dependencyTree = await this.client.getDependencyTree(artifact.g, artifact.a, artifact.v);
      } catch {
        // Continue without deps.dev info if fetch fails
      }

      // Try to fetch POM for the specific version (fallback or for additional info)
      let pom: MavenPOM | null = null;
      try {
        pom = await this.client.getPOM(artifact.g, artifact.a, artifact.v);
      } catch {
        // Continue without POM if fetch fails
      }

      // Try to fetch security info from OSV API
      let security: SecurityInfo | undefined;
      if (this.supportsCapability(SourceCapability.SECURITY) && this.osvClient) {
        try {
          security = await this.osvClient.queryVulnerabilities(name, artifact.v, 'Maven');
        } catch {
          // Continue without security info if fetch fails
        }
      }

      return this.transformer.transformPackageDetails({ 
        artifact, 
        versions, 
        pom: pom || undefined,
        dependencyTree: dependencyTree || undefined,
        depsDevPackage: depsDevPackage || undefined,
        depsDevVersion: depsDevVersion || undefined,
        security: security || undefined
      });
    } catch (error) {
      // Fallback to Libraries.io if primary API fails
      if (this.librariesIoClient) {
        try {
          const platform = LibrariesIoClient.getPlatformForProjectType(this.projectType);
          const librariesIoProject = await this.librariesIoClient.getProject(platform, name);
          let dependencies: LibrariesIoDependenciesResponse | undefined;
          try {
            dependencies = await this.librariesIoClient.getDependencies(platform, name, version);
          } catch {
            // Continue without dependencies if fetch fails
          }
          return this.transformer.transformLibrariesIoProjectDetails(librariesIoProject, dependencies);
        } catch (fallbackError) {
          // If both fail, throw the original error
          throw error;
        }
      } else {
        throw error;
      }
    }
  }

  /**
   * Get security info
   */
  async getSecurityInfo(name: string, version: string): Promise<SecurityInfo | null> {
    if (!this.supportsCapability(SourceCapability.SECURITY)) {
      throw new CapabilityNotSupportedError(
        SourceCapability.SECURITY,
        this.sourceType
      );
    }

    if (!this.osvClient) {
      return null;
    }
    
    try {
      // Use Maven ecosystem for OSV API
      return await this.osvClient.queryVulnerabilities(name, version, 'Maven');
    } catch {
      return null;
    }
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
    } else if (format === 'grape') {
      // Grape (Groovy) format
      return this.generateGrapeSnippet(parsed.groupId, parsed.artifactId, version, scope);
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
   * Generate Grape (Groovy) dependency snippet
   * Grape uses @Grab annotation format: @Grab(group='groupId', module='artifactId', version='version')
   */
  private generateGrapeSnippet(
    groupId: string,
    artifactId: string,
    version: string,
    scope: string
  ): string {
    // Grape @Grab annotation format
    // Note: Grape doesn't have explicit scope support like Maven, but we can add it as a comment
    let snippet = `@Grab(group='${groupId}', module='${artifactId}', version='${version}')`;
    if (scope !== 'compile' && scope !== 'runtime') {
      snippet += ` // scope: ${scope}`;
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
