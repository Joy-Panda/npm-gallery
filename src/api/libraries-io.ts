import { BaseApiClient } from './base-client';
import { API_ENDPOINTS } from '../types/config';

/**
 * Libraries.io API response types
 */
export interface LibrariesIoProject {
  id: number;
  name: string;
  platform: string;
  description?: string;
  homepage?: string;
  repository_url?: string;
  licenses?: string;
  repository_license?: string;
  normalized_licenses?: string[];
  keywords?: string[];
  language?: string;
  stars?: number;
  forks?: number;
  dependents_count?: number;
  latest_release_number?: string;
  latest_release_published_at?: string;
  latest_stable_release_number?: string;
  latest_stable_release_published_at?: string;
  versions_count?: number;
  score?: number;
  status?: string | null;
  deprecation_reason?: string | null;
}

export interface LibrariesIoVersion {
  number: string;
  published_at: string;
  spdx_expression?: string;
  original_license?: string[];
}

export interface LibrariesIoProjectResponse {
  project?: LibrariesIoProject;
  versions?: LibrariesIoVersion[];
}

/**
 * Libraries.io getProject API can return either:
 * 1. An array with a single project object: [LibrariesIoProject & { versions?: LibrariesIoVersion[] }]
 * 2. A project object directly with versions array: LibrariesIoProject & { versions?: LibrariesIoVersion[] }
 * 3. An object with project and versions fields: { project: LibrariesIoProject, versions: LibrariesIoVersion[] }
 */
export type LibrariesIoProjectResult = 
  | (LibrariesIoProject & { versions?: LibrariesIoVersion[] })
  | LibrariesIoProjectResponse
  | (LibrariesIoProject & { versions?: LibrariesIoVersion[] })[];

export interface LibrariesIoSearchResponse {
  total?: number;
  page?: number;
  per_page?: number;
  projects?: LibrariesIoProject[];
}

/**
 * Libraries.io search API can return either:
 * 1. An array of projects directly: LibrariesIoProject[]
 * 2. An object with projects array: { total, page, per_page, projects: LibrariesIoProject[] }
 */
export type LibrariesIoSearchResult = LibrariesIoProject[] | LibrariesIoSearchResponse;

export interface LibrariesIoDependency {
  name: string;
  platform: string;
  requirements?: string;
  latest?: string;
  deprecated?: boolean;
  outdated?: boolean;
}

export interface LibrariesIoDependenciesResponse {
  name: string;
  platform: string;
  version: string;
  dependencies: LibrariesIoDependency[];
}

/**
 * Client for Libraries.io API
 * Documentation: https://libraries.io/api
 */
export class LibrariesIoClient extends BaseApiClient {
  private apiKey: string | null = null;

  constructor() {
    super(API_ENDPOINTS.LIBRARIES_IO || 'https://libraries.io/api', 'libraries-io');
  }

  /**
   * Set API key (optional, but recommended for higher rate limits)
   */
  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  /**
   * Get query parameters with API key if available
   */
  private getParams(additionalParams?: Record<string, string>): Record<string, string> {
    const params: Record<string, string> = { ...additionalParams };
    if (this.apiKey) {
      params.api_key = this.apiKey;
    }
    return params;
  }

  /**
   * Search for projects
   * Note: Libraries.io API returns an array of projects directly, not wrapped in an object
   */
  async search(
    query: string,
    platform: string = 'Maven',
    options?: {
      page?: number;
      per_page?: number;
      sort?: string;
      languages?: string;
      licenses?: string;
      keywords?: string;
      platforms?: string; // Override default platform if provided
    }
  ): Promise<LibrariesIoSearchResult> {
    // Build params object
    // Libraries.io API uses URL query parameters separated by &
    // Example: https://libraries.io/search?languages=HTML&q=flat
    const params = this.getParams({
      q: query,
      // Use platforms filter if provided, otherwise use default platform
      platforms: options?.platforms || platform,
      page: String(options?.page || 1),
      per_page: String(options?.per_page || 30),
      // Only add optional parameters if they are provided
      ...(options?.sort ? { sort: options.sort } : {}),
      ...(options?.languages ? { languages: options.languages } : {}),
      ...(options?.licenses ? { licenses: options.licenses } : {}),
      ...(options?.keywords ? { keywords: options.keywords } : {}),
    });

    const queryString = new URLSearchParams(params).toString();
    const url = `/search?${queryString}`;
    
    // Print the full request URL
    const fullUrl = `${this.client.defaults.baseURL}${url}`;
    console.log(`[Libraries.io] Request URL: ${fullUrl}`);
    
    // Libraries.io search API returns an array directly
    return this.get<LibrariesIoSearchResult>(url);
  }

  /**
   * Get project details
   * Note: Libraries.io API returns project object directly with versions array
   */
  async getProject(platform: string, name: string): Promise<LibrariesIoProjectResult> {
    const params = this.getParams();
    const queryString = new URLSearchParams(params).toString();
    const url = `/${platform}/${encodeURIComponent(name)}?${queryString}`;
    
    // Print the full request URL
    const fullUrl = `${this.client.defaults.baseURL}${url}`;
    console.log(`[Libraries.io] getProject Request URL: ${fullUrl}`);
    
    return this.get<LibrariesIoProjectResult>(url);
  }

  /**
   * Get project dependencies
   */
  async getDependencies(
    platform: string,
    name: string,
    version?: string
  ): Promise<LibrariesIoDependenciesResponse> {
    const params = this.getParams();
    if (version) {
      params.version = version;
    }
    const queryString = new URLSearchParams(params).toString();
    return this.get<LibrariesIoDependenciesResponse>(
      `/${platform}/${encodeURIComponent(name)}/dependencies?${queryString}`
    );
  }

  /**
   * Parse Maven coordinate to Libraries.io format
   * Libraries.io uses format: groupId:artifactId
   */
  parseMavenCoordinate(coordinate: string): { groupId: string; artifactId: string } | null {
    const parts = coordinate.split(':');
    if (parts.length >= 2) {
      return {
        groupId: parts[0],
        artifactId: parts[1],
      };
    }
    return null;
  }

  /**
   * Convert Maven coordinate to Libraries.io project name
   * Libraries.io uses format: groupId:artifactId
   */
  mavenCoordinateToName(groupId: string, artifactId: string): string {
    return `${groupId}:${artifactId}`;
  }

  /**
   * Map project type to Libraries.io platform name
   * Based on Libraries.io supported platforms: https://libraries.io/api/platforms
   */
  static getPlatformForProjectType(projectType: string): string {
    const platformMap: Record<string, string> = {
      'npm': 'NPM',
      'maven': 'Maven',
      'go': 'Go',
      'python': 'Pypi',
      'ruby': 'Rubygems',
      'rust': 'Cargo',
      'php': 'Packagist',
      'csharp': 'NuGet',
      'dart': 'Pub',
      'elixir': 'Hex',
      'haskell': 'Hackage',
      'clojure': 'Clojars',
      'r': 'CRAN',
      'perl': 'CPAN',
      'swift': 'SwiftPM',
      'elm': 'Elm',
      'julia': 'Julia',
      'd': 'Dub',
      'nim': 'Nimble',
      'haxe': 'Haxelib',
      'purescript': 'PureScript',
    };
    
    return platformMap[projectType.toLowerCase()] || 'NPM'; // Default to NPM
  }
}
