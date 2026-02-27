import axios from 'axios';
import { BaseApiClient } from './base-client';
import type {
  DependentsInfo,
  EcosystemName,
  RequirementsInfo,
  RequirementItem,
  RequirementSection,
} from '../types/package';

type DepsDevSystem = Exclude<EcosystemName, 'unknown'>;

interface DepsDevVersionResponse {
  versionKey?: {
    system?: string;
    name?: string;
    version?: string;
  };
}

interface DepsDevRequirementsResponse extends DepsDevVersionResponse {
  requirements?: Array<{
    versionKey?: {
      system?: string;
      name?: string;
      version?: string;
    };
    requirement?: string;
    relation?: string;
    scope?: string;
    optional?: boolean;
    classifier?: string;
    type?: string;
    exclusions?: Array<{
      name?: string;
    }>;
  }>;
  npm?: DepsDevRequirementsTreeResponse;
  maven?: DepsDevRequirementsTreeResponse;
  [key: string]: unknown;
}

interface DepsDevRequirementsTreeResponse {
  parent?: {
    system?: string;
    name?: string;
    version?: string;
  };
  dependencies?:
    | Record<string, Array<{ name?: string; requirement?: string; version?: string }>>
    | Array<{
        name?: string;
        requirement?: string;
        version?: string;
        scope?: string;
        optional?: boolean | string;
        classifier?: string;
        type?: string;
        exclusions?: Array<{ name?: string } | string>;
      }>;
  dependencyManagement?: Array<{
    name?: string;
    requirement?: string;
    version?: string;
    scope?: string;
    optional?: boolean | string;
    classifier?: string;
    type?: string;
    exclusions?: Array<{ name?: string } | string>;
  }>;
  bundled?: Array<string | { name?: string; requirement?: string; version?: string }>;
}

export class DepsDevClient extends BaseApiClient {
  private webClient = axios.create({
    baseURL: 'https://deps.dev',
    timeout: 10000,
    headers: {
      Accept: 'application/json',
      'User-Agent': 'npm-gallery-vscode/1.0.0',
    },
  });

  constructor() {
    super('https://api.deps.dev', 'deps-dev');
  }

  buildDependentsWebUrl(system: DepsDevSystem, name: string, version: string): string {
    return `https://deps.dev/_/s/${system}/p/${encodeURIComponent(name)}/v/${encodeURIComponent(version)}/dependents`;
  }

  async getDependents(system: DepsDevSystem, name: string, version: string): Promise<DependentsInfo | null> {
    const response = await this.webClient.get<DependentsInfo>(
      this.getDependentsWebPath(system, name, version)
    );

    return {
      ...response.data,
      webUrl: this.buildDependentsWebUrl(system, name, version),
    };
  }

  async getRequirements(system: DepsDevSystem, name: string, version: string): Promise<RequirementsInfo | null> {
    const response = await this.getRequirementsDetails(system, name, version);
    if (!response) {
      return null;
    }

    const sections = this.extractRequirementSections(response, system);

    return {
      system: response.versionKey?.system || system.toUpperCase(),
      package: response.versionKey?.name || name,
      version: response.versionKey?.version || version,
      sections,
      webUrl: this.buildRequirementsWebUrl(system, name, version),
    };
  }

  buildRequirementsWebUrl(system: DepsDevSystem, name: string, version: string): string {
    if (system === 'npm') {
      return `https://deps.dev/npm/${encodeURIComponent(name)}/${encodeURIComponent(version)}/dependencies`;
    }

    return `https://deps.dev/_/s/${system}/p/${encodeURIComponent(name)}/v/${encodeURIComponent(version)}/dependencies`;
  }

  private getDependentsWebPath(system: DepsDevSystem, name: string, version: string): string {
    return `/_/s/${system}/p/${encodeURIComponent(name)}/v/${encodeURIComponent(version)}/dependents`;
  }

  private async getRequirementsDetails(
    system: DepsDevSystem,
    name: string,
    version: string
  ): Promise<DepsDevRequirementsResponse | null> {
    try {
      return await this.get<DepsDevRequirementsResponse>(
        `/v3/systems/${system}/packages/${encodeURIComponent(name)}/versions/${encodeURIComponent(version)}:requirements`
      );
    } catch {
      try {
        return await this.get<DepsDevRequirementsResponse>(
          `/v3alpha/systems/${system}/packages/${encodeURIComponent(name)}/versions/${encodeURIComponent(version)}:requirements`
        );
      } catch {
        return null;
      }
    }
  }

  private groupRequirements(
    requirements: NonNullable<DepsDevRequirementsResponse['requirements']>
  ): RequirementSection[] {
    const grouped = new Map<string, RequirementItem[]>();

    for (const requirement of requirements) {
      const relation = requirement.relation || 'requirements';
      const current = grouped.get(relation) || [];
      current.push({
        name: requirement.versionKey?.name || '',
        requirement: requirement.requirement,
        version: requirement.versionKey?.version,
        scope: requirement.scope,
        optional: requirement.optional,
        classifier: requirement.classifier,
        type: requirement.type,
        exclusions: requirement.exclusions?.map((item) => item.name || '').filter(Boolean),
      });
      grouped.set(relation, current);
    }

    return Array.from(grouped.entries()).map(([id, items]) => ({
      id,
      title: this.humanizeRelation(id),
      items: items.filter((item) => item.name),
    }));
  }

  private extractRequirementSections(
    response: DepsDevRequirementsResponse,
    system: DepsDevSystem
  ): RequirementSection[] {
    if (response.requirements && response.requirements.length > 0) {
      return this.groupRequirements(response.requirements);
    }

    switch (system) {
      case 'npm':
        return this.parseNpmRequirementsResponse(response.npm);
      case 'maven':
        return this.parseMavenRequirementsResponse(response.maven);
      default:
        return [];
    }
  }

  private parseNpmRequirementsResponse(
    ecosystemData: DepsDevRequirementsTreeResponse | undefined
  ): RequirementSection[] {
    if (!ecosystemData || !ecosystemData.dependencies || Array.isArray(ecosystemData.dependencies)) {
      return [];
    }

    const sections: RequirementSection[] = [];

    for (const [sectionId, items] of Object.entries(ecosystemData.dependencies)) {
      const normalizedItems = items
        .map((item) => ({
          name: item.name || '',
          requirement: item.requirement,
          version: item.version,
        }))
        .filter((item) => item.name);

      if (normalizedItems.length > 0) {
        sections.push({
          id: sectionId,
          title: this.humanizeRelation(sectionId),
          items: normalizedItems,
        });
      }
    }

    if (ecosystemData.bundled && ecosystemData.bundled.length > 0) {
      const bundledItems = ecosystemData.bundled
        .map((item) =>
          typeof item === 'string'
            ? { name: item }
            : {
                name: item.name || '',
                requirement: item.requirement,
                version: item.version,
              }
        )
        .filter((item) => item.name);

      if (bundledItems.length > 0) {
        sections.push({
          id: 'bundled',
          title: 'Bundled',
          items: bundledItems,
        });
      }
    }

    return sections;
  }

  private parseMavenRequirementsResponse(
    ecosystemData: DepsDevRequirementsTreeResponse | undefined
  ): RequirementSection[] {
    if (!ecosystemData) {
      return [];
    }

    const sections: RequirementSection[] = [];

    if (ecosystemData.parent?.name) {
      sections.push({
        id: 'parent',
        title: 'Parent',
        items: [
          {
            name: ecosystemData.parent.name,
            version: ecosystemData.parent.version,
          },
        ],
      });
    }

    if (Array.isArray(ecosystemData.dependencies)) {
      const dependencyItems = ecosystemData.dependencies
        .map((item) => this.normalizeTreeRequirementItem(item))
        .filter((item) => item.name);

      if (dependencyItems.length > 0) {
        sections.push({
          id: 'dependencies',
          title: 'Dependencies',
          items: dependencyItems,
        });
      }
    }

    if (ecosystemData.dependencyManagement && ecosystemData.dependencyManagement.length > 0) {
      const dependencyManagementItems = ecosystemData.dependencyManagement
        .map((item) => this.normalizeTreeRequirementItem(item))
        .filter((item) => item.name);

      if (dependencyManagementItems.length > 0) {
        sections.push({
          id: 'dependencyManagement',
          title: 'Dependency Management',
          items: dependencyManagementItems,
        });
      }
    }

    return sections;
  }

  private normalizeTreeRequirementItem(item: {
    name?: string;
    requirement?: string;
    version?: string;
    scope?: string;
    optional?: boolean | string;
    classifier?: string;
    type?: string;
    exclusions?: Array<{ name?: string } | string>;
  }): RequirementItem {
    return {
      name: item.name || '',
      requirement: item.requirement,
      version: item.version,
      scope: item.scope,
      optional: item.optional === true || item.optional === 'true',
      classifier: item.classifier || undefined,
      type: item.type || undefined,
      exclusions: item.exclusions
        ?.map((entry) => (typeof entry === 'string' ? entry : entry.name || ''))
        .filter(Boolean),
    };
  }

  private humanizeRelation(relation: string): string {
    return relation
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }
}
