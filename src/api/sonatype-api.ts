import { BaseApiClient } from './base-client';

/**
 * Sonatype Central Repository search response
 */
export interface SonatypeSearchResponse {
  response: {
    numFound: number;
    start: number;
    docs: SonatypeArtifact[];
  };
}

/**
 * Sonatype artifact document
 */
export interface SonatypeArtifact {
  id: string;
  g: string; // groupId
  a: string; // artifactId
  v: string; // version
  p: string; // packaging (jar, pom, etc.)
  timestamp: number;
  ec?: string[]; // extensions/classifiers
  tags?: string[];
  latestVersion?: string;
}

/**
 * Sonatype artifact details response
 */
export interface SonatypeArtifactDetails {
  response: {
    numFound: number;
    docs: SonatypeArtifact[];
  };
}

/**
 * Maven POM file structure (simplified)
 */
export interface MavenPOM {
  project: {
    groupId?: string;
    artifactId?: string;
    version?: string;
    name?: string;
    description?: string;
    url?: string;
    licenses?: {
      license?: Array<{
        name?: string;
        url?: string;
      }>;
    };
    developers?: {
      developer?: Array<{
        name?: string;
        email?: string;
        url?: string;
      }>;
    };
    dependencies?: {
      dependency?: Array<{
        groupId?: string;
        artifactId?: string;
        version?: string;
        scope?: string;
      }>;
    };
  };
}

/**
 * Client for Sonatype Central Repository API
 * Based on: https://central.sonatype.org/search/rest-api-guide/
 */
export class SonatypeApiClient extends BaseApiClient {
  constructor() {
    super('https://search.maven.org', 'sonatype');
  }

  /**
   * Search for artifacts
   * @param query Search query (e.g., "guice", "g:com.google.inject", "a:guice")
   * @param options Search options
   */
  async search(
    query: string,
    options: {
      from?: number;
      size?: number;
      core?: 'ga' | 'gav'; // ga = groupId/artifactId, gav = groupId/artifactId/version
    } = {}
  ): Promise<SonatypeSearchResponse> {
    const { from = 0, size = 20, core = 'ga' } = options;

    return this.get<SonatypeSearchResponse>('/solrsearch/select', {
      params: {
        q: query,
        rows: size,
        start: from,
        core,
        wt: 'json',
      },
    });
  }

  /**
   * Search by groupId
   */
  async searchByGroupId(groupId: string, options?: { from?: number; size?: number }): Promise<SonatypeSearchResponse> {
    return this.search(`g:${groupId}`, options);
  }

  /**
   * Search by artifactId
   */
  async searchByArtifactId(artifactId: string, options?: { from?: number; size?: number }): Promise<SonatypeSearchResponse> {
    return this.search(`a:${artifactId}`, options);
  }

  /**
   * Search by groupId and artifactId
   */
  async searchByCoordinates(
    groupId: string,
    artifactId: string,
    options?: { from?: number; size?: number }
  ): Promise<SonatypeSearchResponse> {
    return this.search(`g:${groupId} AND a:${artifactId}`, { ...options, core: 'gav' });
  }

  /**
   * Get all versions of an artifact
   */
  async getVersions(groupId: string, artifactId: string): Promise<SonatypeArtifact[]> {
    const response = await this.searchByCoordinates(groupId, artifactId, { size: 1000 });
    return response.response.docs;
  }

  /**
   * Get artifact details (latest version)
   */
  async getArtifact(groupId: string, artifactId: string): Promise<SonatypeArtifact | null> {
    const response = await this.searchByCoordinates(groupId, artifactId, { size: 1 });
    if (response.response.docs.length === 0) {
      return null;
    }
    return response.response.docs[0];
  }

  async getArtifactVersion(
    groupId: string,
    artifactId: string,
    version: string
  ): Promise<SonatypeArtifact | null> {
    const response = await this.search(`g:${groupId} AND a:${artifactId} AND v:${version}`, {
      size: 1,
      core: 'gav',
    });
    if (response.response.docs.length === 0) {
      return null;
    }
    return response.response.docs[0];
  }

  /**
   * Download POM file
   * @param groupId Group ID
   * @param artifactId Artifact ID
   * @param version Version
   */
  async getPOM(groupId: string, artifactId: string, version: string): Promise<MavenPOM | null> {
    try {
      // Convert groupId to path (e.g., com.google.inject -> com/google/inject)
      const groupPath = groupId.replace(/\./g, '/');
      const pomPath = `${groupPath}/${artifactId}/${version}/${artifactId}-${version}.pom`;

      // Get XML as text first
      // Use axios directly to get text response
      const response = await this.client.get('/remotecontent', {
        params: {
          filepath: pomPath,
        },
        headers: {
          Accept: 'application/xml, text/xml',
        },
        responseType: 'text',
      });

      // Parse XML to JSON (simple parsing, could be improved with xml2js)
      // response is already the data (BaseApiClient.get returns response.data)
      return this.parsePOM(response as unknown as string);
    } catch (error) {
      // If POM fetch fails, return null
      return null;
    }
  }

  /**
   * Simple XML to JSON parser for POM files
   * This is a basic implementation - for production, consider using xml2js
   */
  private parsePOM(xml: string): MavenPOM | null {
    try {
      // Very basic XML parsing - extract key fields using regex
      // For production, use a proper XML parser like xml2js
      const extractTag = (tag: string): string | undefined => {
        const regex = new RegExp(`<${tag}>(.*?)</${tag}>`, 's');
        const match = xml.match(regex);
        return match ? match[1].trim() : undefined;
      };

      const extractArray = (tag: string, parentTag: string): Array<Record<string, string | undefined>> => {
        const regex = new RegExp(`<${parentTag}>(.*?)</${parentTag}>`, 's');
        const match = xml.match(regex);
        if (!match) return [];
        
        const content = match[1];
        const items: Array<Record<string, string | undefined>> = [];
        const itemRegex = new RegExp(`<${tag}>(.*?)</${tag}>`, 'gs');
        let itemMatch;
        
        while ((itemMatch = itemRegex.exec(content)) !== null) {
          const itemContent = itemMatch[1];
          const item: Record<string, string | undefined> = {};
          const fieldRegex = /<(\w+)>(.*?)<\/\1>/gs;
          let fieldMatch;
          
          while ((fieldMatch = fieldRegex.exec(itemContent)) !== null) {
            item[fieldMatch[1]] = fieldMatch[2].trim();
          }
          
          if (Object.keys(item).length > 0) {
            items.push(item);
          }
        }
        
        return items;
      };

      const project: MavenPOM['project'] = {
        groupId: extractTag('groupId'),
        artifactId: extractTag('artifactId'),
        version: extractTag('version'),
        name: extractTag('name'),
        description: extractTag('description'),
        url: extractTag('url'),
      };

      // Extract licenses
      const licenses = extractArray('license', 'licenses');
      if (licenses.length > 0) {
        project.licenses = {
          license: licenses.map((lic) => ({
            name: lic.name,
            url: lic.url,
          })),
        };
      }

      // Extract developers
      const developers = extractArray('developer', 'developers');
      if (developers.length > 0) {
        project.developers = {
          developer: developers.map((dev) => ({
            name: dev.name,
            email: dev.email,
            url: dev.url,
          })),
        };
      }

      // Extract dependencies
      const dependencies = extractArray('dependency', 'dependencies');
      if (dependencies.length > 0) {
        project.dependencies = {
          dependency: dependencies.map((dep) => ({
            groupId: dep.groupId,
            artifactId: dep.artifactId,
            version: dep.version,
            scope: dep.scope,
          })),
        };
      }

      return { project };
    } catch {
      return null;
    }
  }

  /**
   * Parse Maven coordinate string (groupId:artifactId:version)
   */
  parseCoordinate(coordinate: string): { groupId: string; artifactId: string; version?: string } | null {
    const parts = coordinate.split(':');
    if (parts.length < 2) {
      return null;
    }
    return {
      groupId: parts[0],
      artifactId: parts[1],
      version: parts[2],
    };
  }

  /**
   * Format Maven coordinate
   */
  formatCoordinate(groupId: string, artifactId: string, version?: string): string {
    if (version) {
      return `${groupId}:${artifactId}:${version}`;
    }
    return `${groupId}:${artifactId}`;
  }
}
