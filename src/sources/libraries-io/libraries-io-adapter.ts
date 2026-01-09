import { BaseSourceAdapter } from '../base/source-adapter.interface';
import { SourceCapability, CapabilityNotSupportedError } from '../base/capabilities';
import { LibrariesIoTransformer } from './libraries-io-transformer';
import { LibrariesIoClient } from '../../api/libraries-io';
import type { 
  LibrariesIoDependenciesResponse, 
  LibrariesIoProject, 
  LibrariesIoProjectResponse,
  LibrariesIoVersion 
} from '../../api/libraries-io';
import type { OSVClient } from '../../api/osv';
import type { SourceSelector } from '../../registry/source-selector';
import type {
  PackageInfo,
  PackageDetails,
  VersionInfo,
  SearchResult,
  SearchOptions,
  SearchSortBy,
  SearchFilter,
  CopyOptions,
  SecurityInfo,
} from '../../types/package';
import { createSortOption, getSortValue, createFilterOption } from '../../types/package';
import type { SourceType, ProjectType } from '../../types/project';

/**
 * Libraries.io source adapter
 * Supports Maven and other package management platforms
 */
export class LibrariesIoSourceAdapter extends BaseSourceAdapter {
  readonly sourceType: SourceType = 'libraries-io';
  readonly displayName = 'Libraries.io';
  readonly projectType: ProjectType = 'maven';
  readonly supportedSortOptions: SearchSortBy[] = [
    createSortOption('relevance', 'Relevance'),
    createSortOption('latest_release_published_at', 'Published Date'),
    createSortOption('rank', 'Rank'),
    createSortOption('stars', 'Stars'),
  ];
  readonly supportedFilters: SearchFilter[] = [
    createFilterOption('languages', 'Languages', 'languages (comma-separated, e.g., Java,JavaScript)'),
    createFilterOption('licenses', 'Licenses', 'licenses (comma-separated, e.g., MIT,Apache-2.0)'),
    createFilterOption('keywords', 'Keywords', 'keywords (comma-separated)'),
    createFilterOption('platforms', 'Platforms', 'platforms (comma-separated, e.g., Maven,NPM)'),
  ];          

  private transformer: LibrariesIoTransformer;
  private sourceSelector?: SourceSelector;

  constructor(
    private client: LibrariesIoClient,
    private osvClient?: OSVClient,
    sourceSelector?: SourceSelector
  ) {
    super();
    this.transformer = new LibrariesIoTransformer();
    this.sourceSelector = sourceSelector;
  }

  /**
   * Get the effective project type for determining platform
   * Uses current project type from source selector if available, otherwise falls back to adapter's projectType
   */
  private getEffectiveProjectType(): ProjectType {
    if (this.sourceSelector) {
      return this.sourceSelector.getCurrentProjectType();
    }
    return this.projectType;
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

    console.log(`[Libraries.io Adapter] search called with query: "${query}", from: ${from}, size: ${size}, sortBy: ${JSON.stringify(sortBy)}`);

    // Parse query to extract Libraries.io specific filters first to check if there are filters
    // Extract filters from query string (languages:, licenses:, keywords:, platforms:)
    const languagesMatch = query.match(/\blanguages:([^\s]+)/);
    const licensesMatch = query.match(/\blicenses:([^\s]+)/);
    const keywordsMatch = query.match(/\bkeywords:([^\s]+)/);
    const platformsMatch = query.match(/\bplatforms:([^\s]+)/);
    
    const languages = languagesMatch ? languagesMatch[1] : undefined;
    const licenses = licensesMatch ? licensesMatch[1] : undefined;
    const keywords = keywordsMatch ? keywordsMatch[1] : undefined;
    const platforms = platformsMatch ? platformsMatch[1] : undefined;
    
    // Remove filter qualifiers from query to get base query
    let baseQuery = query
      .replace(/\blanguages:[^\s]+/g, '')
      .replace(/\blicenses:[^\s]+/g, '')
      .replace(/\bkeywords:[^\s]+/g, '')
      .replace(/\bplatforms:[^\s]+/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    
    // Check if there are any filters
    const hasFilters = !!(languages || licenses || keywords || platforms);
    const hasBaseQuery = baseQuery && baseQuery.trim().length > 0;
    
    // Allow search if there's a base query OR filters
    if (!hasBaseQuery && !hasFilters) {
      console.log(`[Libraries.io Adapter] Query is empty and no filters, returning empty result`);
      return { packages: [], total: 0, hasMore: false };
    }
    
    // If base query is empty after removing filters but we have filters, use empty string
    if (!baseQuery && hasFilters) {
      baseQuery = '';
    }

    // Map sortBy to Libraries.io API sort format
    const sortValue = getSortValue(sortBy);
    let apiSort: string | undefined;
    
    // Libraries.io API supports sort parameters like:
    // - 'rank' for rank
    // - 'stars' for stars
    // - 'latest_release_published_at' for published date
    // - 'relevance' is default, no need to pass
    if (sortValue && sortValue !== 'relevance') {
      // Libraries.io uses the field name directly as sort parameter
      apiSort = sortValue;
    }

    try {
      const page = Math.floor(from / size) + 1;
      // Use effective project type to determine the correct platform
      const effectiveProjectType = this.getEffectiveProjectType();
      const defaultPlatform = LibrariesIoClient.getPlatformForProjectType(effectiveProjectType);
      
      // Use platforms filter if provided, otherwise use default platform
      const platform = platforms || defaultPlatform;
      
      console.log(`[Libraries.io Adapter] Effective project type: ${effectiveProjectType}, Platform: ${platform}, Sort: ${apiSort || 'relevance'}`);
      console.log(`[Libraries.io Adapter] Filters - languages: ${languages}, licenses: ${licenses}, keywords: ${keywords}`);
      
      const response = await this.client.search(baseQuery, platform, {
        page,
        per_page: size,
        sort: apiSort,
        languages,
        licenses,
        keywords,
        platforms, // Override platform if explicitly provided
      });
      
      console.log(`[Libraries.io Adapter] Search response type: ${Array.isArray(response) ? 'array' : 'object'}`);
      if (Array.isArray(response)) {
        console.log(`[Libraries.io Adapter] Response is array with ${response.length} items`);
      } else {
        console.log(`[Libraries.io Adapter] Response has projects: ${!!response.projects}, projects length: ${response.projects?.length || 0}`);
      }
      
      if (!response || (Array.isArray(response) && response.length === 0) || (!Array.isArray(response) && !response.projects)) {
        console.error(`[Libraries.io Adapter] Invalid or empty response:`, response);
        return { packages: [], total: 0, hasMore: false };
      }
      
      const result = this.transformer.transformSearchResult(response, from, size);
      console.log(`[Libraries.io Adapter] Search successful, transformed to ${result.packages.length} packages, total: ${result.total}`);
      return result;
    } catch (error) {
      // Log error and return empty result
      console.error(`[Libraries.io Adapter] Search failed:`, error);
      if (error instanceof Error) {
        console.error(`[Libraries.io Adapter] Error message: ${error.message}`);
        console.error(`[Libraries.io Adapter] Error stack: ${error.stack}`);
      }
      return { packages: [], total: 0, hasMore: false };
    }
  }

  /**
   * Get basic package info
   */
  async getPackageInfo(name: string): Promise<PackageInfo> {
    try {
      const effectiveProjectType = this.getEffectiveProjectType();
      const platform = LibrariesIoClient.getPlatformForProjectType(effectiveProjectType);
      const response = await this.client.getProject(platform, name);
      
      console.log(`[Libraries.io Adapter] getPackageInfo response type: ${'name' in response ? 'direct project' : 'wrapped'}`);
      
      // Handle both response formats
      const project = ('name' in response && 'platform' in response) 
        ? response as LibrariesIoProject
        : (response as LibrariesIoProjectResponse).project;
      
      if (!project) {
        throw new Error(`Project not found in response for ${name}`);
      }
      
      return this.transformer.transformProject(project);
    } catch (error) {
      console.error(`[Libraries.io Adapter] getPackageInfo failed:`, error);
      throw new Error(`Failed to fetch package info for ${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get detailed package info
   */
  async getPackageDetails(name: string, version?: string): Promise<PackageDetails> {
    try {
      const effectiveProjectType = this.getEffectiveProjectType();
      const platform = LibrariesIoClient.getPlatformForProjectType(effectiveProjectType);
      const response = await this.client.getProject(platform, name);
      
      console.log(`[Libraries.io Adapter] getPackageDetails response type: ${'name' in response ? 'direct project' : 'wrapped'}`);
      console.log(`[Libraries.io Adapter] getPackageDetails response:`, JSON.stringify(response, null, 2));
      
      // Extract project and versions from response
      let project: LibrariesIoProject;
      let versions: LibrariesIoVersion[] = [];
      
      if ('name' in response && 'platform' in response) {
        // Direct project object
        project = response as LibrariesIoProject;
        versions = (response as LibrariesIoProject & { versions?: LibrariesIoVersion[] }).versions || [];
      } else if ('project' in response && response.project) {
        // Wrapped in project field
        project = response.project;
        versions = response.versions || [];
      } else {
        console.error(`[Libraries.io Adapter] Invalid project response structure:`, response);
        throw new Error(`Invalid project response for ${name}`);
      }
      
      let dependencies: LibrariesIoDependenciesResponse | undefined;
      try {
        dependencies = await this.client.getDependencies(platform, name, version);
      } catch (depError) {
        console.log(`[Libraries.io Adapter] Failed to fetch dependencies:`, depError);
        // Continue without dependencies if fetch fails
      }

      let security: SecurityInfo | undefined;
      if (this.supportsCapability(SourceCapability.SECURITY) && this.osvClient) {
        try {
          const packageVersion = version || project.latest_release_number || project.latest_stable_release_number || '0.0.0';
          // Map effective project type to OSV ecosystem
          const ecosystem = effectiveProjectType === 'maven' ? 'Maven' : effectiveProjectType === 'npm' ? 'npm' : 'Maven';
          security = await this.osvClient.queryVulnerabilities(name, packageVersion, ecosystem);
        } catch (secError) {
          console.log(`[Libraries.io Adapter] Failed to fetch security info:`, secError);
          // Continue without security info
        }
      }

      // Create a normalized response object for transformer
      const normalizedResponse: LibrariesIoProjectResponse = {
        project,
        versions,
      };

      return this.transformer.transformProjectDetails(normalizedResponse, dependencies, security);
    } catch (error) {
      console.error(`[Libraries.io Adapter] getPackageDetails failed:`, error);
      if (error instanceof Error) {
        console.error(`[Libraries.io Adapter] Error message: ${error.message}`);
        console.error(`[Libraries.io Adapter] Error stack: ${error.stack}`);
      }
      throw new Error(`Failed to fetch package details for ${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get version list
   */
  async getVersions(name: string): Promise<VersionInfo[]> {
    try {
      const effectiveProjectType = this.getEffectiveProjectType();
      const platform = LibrariesIoClient.getPlatformForProjectType(effectiveProjectType);
      const response = await this.client.getProject(platform, name);
      
      // Extract project and versions from response
      let project: LibrariesIoProject;
      let versionsArray: LibrariesIoVersion[] = [];
      
      if ('name' in response && 'platform' in response) {
        // Direct project object
        project = response as LibrariesIoProject;
        versionsArray = (response as LibrariesIoProject & { versions?: LibrariesIoVersion[] }).versions || [];
      } else if ('project' in response && response.project) {
        // Wrapped in project field
        project = response.project;
        versionsArray = response.versions || [];
      } else {
        throw new Error(`Invalid project response for ${name}`);
      }
      
      return this.transformer.transformVersions(versionsArray, project);
    } catch (error) {
      console.error(`[Libraries.io Adapter] getVersions failed:`, error);
      throw new Error(`Failed to fetch versions for ${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Generate copy snippet for Maven or Gradle
   */
  getCopySnippet(packageName: string, options: CopyOptions): string {
    if (!this.supportsCapability(SourceCapability.COPY)) {
      throw new CapabilityNotSupportedError(SourceCapability.COPY, this.sourceType);
    }

    const parsed = this.client.parseMavenCoordinate(packageName);
    if (!parsed) {
      throw new Error(`Invalid Maven coordinate: ${packageName}. Expected format: groupId:artifactId`);
    }

    const { groupId, artifactId } = parsed;
    const { version = 'LATEST', scope = 'compile', format = 'xml' } = options;

    if (format === 'xml' || format === 'other') {
      // Maven POM format
      return this.generateMavenSnippet(groupId, artifactId, version, scope);
    } else if (format === 'gradle') {
      // Gradle format
      return this.generateGradleSnippet(groupId, artifactId, version, scope);
    } else if (format === 'sbt') {
      // SBT format
      return this.generateSbtSnippet(groupId, artifactId, version, scope);
    } else if (format === 'grape') {
      // Grape (Groovy) format
      return this.generateGrapeSnippet(groupId, artifactId, version, scope);
    }

    // Default to Maven
    return this.generateMavenSnippet(groupId, artifactId, version, scope);
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
    const scopeElement = scope !== 'compile' ? `\n  <scope>${scope}</scope>` : '';
    return `<dependency>
  <groupId>${groupId}</groupId>
  <artifactId>${artifactId}</artifactId>
  <version>${version}</version>${scopeElement}
</dependency>`;
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
    const scopePrefix = scope === 'test' ? 'test' : scope === 'runtime' ? 'runtime' : scope === 'provided' ? 'compileOnly' : '';
    const scopePart = scopePrefix ? `${scopePrefix} ` : '';
    return `${scopePart}implementation '${groupId}:${artifactId}:${version}'`;
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
    const scopePart = scope === 'test' ? 'Test' : scope === 'provided' ? 'Provided' : '';
    return `libraryDependencies += "${groupId}" % "${artifactId}" % "${version}"${scopePart ? ` % "${scopePart}"` : ''}`;
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
   * Get security information
   */
  async getSecurityInfo(name: string, version: string): Promise<SecurityInfo> {
    if (!this.supportsCapability(SourceCapability.SECURITY)) {
      throw new CapabilityNotSupportedError(SourceCapability.SECURITY, this.sourceType);
    }

    if (!this.osvClient) {
      throw new Error('OSV client not available');
    }

    // Map effective project type to OSV ecosystem
    const effectiveProjectType = this.getEffectiveProjectType();
    const ecosystem = effectiveProjectType === 'maven' ? 'Maven' : effectiveProjectType === 'npm' ? 'npm' : 'Maven';
    return this.osvClient.queryVulnerabilities(name, version, ecosystem);
  }
}
