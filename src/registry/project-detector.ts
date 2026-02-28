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
      return { projects: [], detectedTypes: [], primary: 'unknown' };
    }

    // Scan each workspace folder
    for (const folder of workspaceFolders) {
      const detected = await this.detectProjectsInFolder(folder.uri.fsPath);
      projects.push(...detected);
    }

    // All detected project types in stable order (workspace-style: show multiple)
    const order: ProjectType[] = ['npm', 'maven', 'dotnet', 'go'];
    const unique = [...new Set(projects.map(p => p.type))].filter(
      (t): t is ProjectType => t !== 'unknown'
    );
    const detectedTypes = order.filter(t => unique.includes(t));
    const primary = detectedTypes[0] ?? 'unknown';

    return { projects, detectedTypes, primary };
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
        const found = await this.findConfigFile(folderPath, configFile, projectType as ProjectType);
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
   * For dotnet, fileName can be a glob like "*.csproj" or exact name like "packages.config"
   */
  private async findConfigFile(
    folderPath: string,
    fileName: string,
    projectType?: ProjectType
  ): Promise<string[]> {
    try {
      const exclude = projectType === 'dotnet'
        ? '**/node_modules/**,**/bin/**,**/obj/**'
        : '**/node_modules/**';
      const pattern = new vscode.RelativePattern(folderPath, fileName.startsWith('.') ? `**/*${fileName}` : `**/${fileName}`);
      const files = await vscode.workspace.findFiles(pattern, exclude, 10);
      return files.map(f => f.fsPath);
    } catch {
      return [];
    }
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
    if (lowerPath.endsWith('.csproj') || lowerPath.endsWith('.vbproj') || lowerPath.endsWith('.fsproj')) {
      return 'dotnet';
    }
    if (lowerPath.endsWith('packages.config') || lowerPath.endsWith('directory.packages.props') || lowerPath.endsWith('paket.dependencies')) {
      return 'dotnet';
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
