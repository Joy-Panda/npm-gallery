import * as vscode from 'vscode';
import type { ProjectType, ProjectInfo, DetectedProjects } from '../types/project';
import { PROJECT_CONFIG_FILES } from '../types/project';

/**
 * Project type detector
 * Scans workspace to detect project types based on config files
 */
export class ProjectDetector {
  /**
   * Detect all projects in the workspace
   */
  async detectProjects(): Promise<DetectedProjects> {
    const projects: ProjectInfo[] = [];

    // Get workspace folders
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return { projects: [], primary: 'unknown' };
    }

    // Scan each workspace folder
    for (const folder of workspaceFolders) {
      const detected = await this.detectProjectsInFolder(folder.uri.fsPath);
      projects.push(...detected);
    }

    // Determine primary project type (first detected, prioritized by order)
    const primary = this.determinePrimaryType(projects);

    return { projects, primary };
  }

  /**
   * Detect projects in a specific folder
   */
  private async detectProjectsInFolder(folderPath: string): Promise<ProjectInfo[]> {
    const projects: ProjectInfo[] = [];

    // Check for each project type
    for (const [projectType, configFiles] of Object.entries(PROJECT_CONFIG_FILES)) {
      if (projectType === 'unknown') continue;

      for (const configFile of configFiles) {
        const found = await this.findConfigFile(folderPath, configFile);
        if (found.length > 0) {
          // Add the first found config file for this type
          projects.push({
            type: projectType as ProjectType,
            configFile: found[0],
            workspacePath: folderPath,
          });
          break; // Only add one project per type per folder
        }
      }
    }

    return projects;
  }

  /**
   * Find config files matching pattern in folder
   */
  private async findConfigFile(folderPath: string, fileName: string): Promise<string[]> {
    try {
      const pattern = new vscode.RelativePattern(folderPath, `**/${fileName}`);
      const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 5);
      return files.map(f => f.fsPath);
    } catch {
      return [];
    }
  }

  /**
   * Determine primary project type from detected projects
   * Priority: npm > maven > go
   */
  private determinePrimaryType(projects: ProjectInfo[]): ProjectType {
    if (projects.length === 0) {
      return 'unknown';
    }

    // Priority order
    const priority: ProjectType[] = ['npm', 'maven', 'go'];

    for (const type of priority) {
      if (projects.some(p => p.type === type)) {
        return type;
      }
    }

    return projects[0].type;
  }

  /**
   * Detect project type for a specific file
   */
  detectProjectTypeForFile(filePath: string): ProjectType {
    const lowerPath = filePath.toLowerCase();

    if (lowerPath.endsWith('package.json')) {
      return 'npm';
    }
    if (lowerPath.endsWith('pom.xml')) {
      return 'maven';
    }
    if (lowerPath.endsWith('go.mod')) {
      return 'go';
    }

    return 'unknown';
  }

  /**
   * Check if a specific project type exists in workspace
   */
  async hasProjectType(type: ProjectType): Promise<boolean> {
    const configFiles = PROJECT_CONFIG_FILES[type];
    if (!configFiles || configFiles.length === 0) {
      return false;
    }

    for (const configFile of configFiles) {
      const files = await vscode.workspace.findFiles(
        `**/${configFile}`,
        '**/node_modules/**',
        1
      );
      if (files.length > 0) {
        return true;
      }
    }

    return false;
  }
}

// Singleton instance
let projectDetector: ProjectDetector | null = null;

/**
 * Get the project detector instance
 */
export function getProjectDetector(): ProjectDetector {
  if (!projectDetector) {
    projectDetector = new ProjectDetector();
  }
  return projectDetector;
}
