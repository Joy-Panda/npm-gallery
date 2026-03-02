import { BaseApiClient } from './base-client';
import { API_ENDPOINTS } from '../types/config';

export interface RubyGemsDependency {
  name: string;
  requirements: string;
}

export interface RubyGemsGemMetadata {
  name: string;
  version: string;
  info?: string;
  authors?: string;
  licenses?: string[];
  metadata?: Record<string, string>;
  downloads?: number;
  version_downloads?: number;
  project_uri?: string;
  gem_uri?: string;
  homepage_uri?: string;
  wiki_uri?: string;
  documentation_uri?: string;
  mailing_list_uri?: string;
  source_code_uri?: string;
  bug_tracker_uri?: string;
  changelog_uri?: string;
  dependencies?: {
    development?: RubyGemsDependency[];
    runtime?: RubyGemsDependency[];
  };
}

export interface RubyGemsVersionInfo {
  number: string;
  built_at?: string;
  created_at?: string;
  summary?: string;
  description?: string;
  downloads_count?: number;
  prerelease?: boolean;
  licenses?: string[];
  authors?: string;
  ruby_version?: string;
  rubygems_version?: string;
}

export interface RubyGemsSearchResultItem {
  name: string;
  version: string;
  info?: string;
  authors?: string;
  downloads?: number;
  version_downloads?: number;
  project_uri?: string;
  gem_uri?: string;
  homepage_uri?: string;
  source_code_uri?: string;
  documentation_uri?: string;
  bug_tracker_uri?: string;
}

export interface RubyGemsReverseDependency {
  name: string;
}

export class RubyGemsApiClient extends BaseApiClient {
  constructor() {
    super(API_ENDPOINTS.RUBYGEMS, 'rubygems');
  }

  async search(
    query: string,
    options: {
      page?: number;
      signal?: AbortSignal;
    } = {}
  ): Promise<RubyGemsSearchResultItem[]> {
    const { page = 1, signal } = options;
    return this.get<RubyGemsSearchResultItem[]>('/api/v1/search.json', {
      signal,
      params: {
        query,
        page,
      },
    });
  }

  async getGem(name: string, signal?: AbortSignal): Promise<RubyGemsGemMetadata> {
    return this.get<RubyGemsGemMetadata>(`/api/v1/gems/${encodeURIComponent(name)}.json`, {
      signal,
    });
  }

  async getVersions(name: string, signal?: AbortSignal): Promise<RubyGemsVersionInfo[]> {
    return this.get<RubyGemsVersionInfo[]>(`/api/v1/versions/${encodeURIComponent(name)}.json`, {
      signal,
    });
  }

  async getVersionDetails(
    name: string,
    version: string,
    signal?: AbortSignal
  ): Promise<RubyGemsVersionInfo> {
    return this.get<RubyGemsVersionInfo>(
      `/api/v2/rubygems/${encodeURIComponent(name)}/versions/${encodeURIComponent(version)}.json`,
      { signal }
    );
  }

  async getReverseDependencies(name: string, signal?: AbortSignal): Promise<RubyGemsReverseDependency[]> {
    return this.get<RubyGemsReverseDependency[]>(
      `/api/v1/gems/${encodeURIComponent(name)}/reverse_dependencies.json`,
      { signal }
    );
  }
}
