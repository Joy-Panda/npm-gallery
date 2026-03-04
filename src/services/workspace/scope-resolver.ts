import * as path from 'path';
import * as vscode from 'vscode';
import type { WorkspacePackageScope } from '../../types/package';

export function resolveWorkspacePackageScope(uri: vscode.Uri): WorkspacePackageScope | undefined {
  const fileName = uri.fsPath.split(/[/\\]/).pop()?.toLowerCase();
  if (
    fileName === 'package.json' ||
    fileName === 'composer.json' ||
    fileName === 'gemfile' ||
    fileName === 'deps.edn' ||
    fileName === 'project.clj' ||
    fileName === 'cargo.toml' ||
    fileName === 'go.mod' ||
    fileName === 'cpanfile' ||
    fileName === 'pubspec.yaml' ||
    fileName === 'description' ||
    fileName === 'pom.xml' ||
    fileName === 'build.gradle' ||
    fileName === 'build.gradle.kts' ||
    fileName === 'directory.packages.props' ||
    fileName === 'paket.dependencies' ||
    fileName === 'packages.config' ||
    fileName?.endsWith('.csproj') ||
    fileName?.endsWith('.vbproj') ||
    fileName?.endsWith('.fsproj') ||
    fileName?.endsWith('.cake')
  ) {
    return { manifestPath: uri.fsPath };
  }
  if (fileName === 'composer.lock') {
    return { manifestPath: uri.fsPath.replace(/composer\.lock$/i, 'composer.json') };
  }
  if (fileName === 'gemfile.lock') {
    return { manifestPath: uri.fsPath.replace(/gemfile\.lock$/i, 'Gemfile') };
  }
  if (fileName === 'cargo.lock') {
    return { manifestPath: uri.fsPath.replace(/cargo\.lock$/i, 'Cargo.toml') };
  }
  if (fileName === 'cpanfile.snapshot') {
    return { manifestPath: uri.fsPath.replace(/cpanfile\.snapshot$/i, 'cpanfile') };
  }
  if (fileName === 'pubspec.lock') {
    return { manifestPath: uri.fsPath.replace(/pubspec\.lock$/i, 'pubspec.yaml') };
  }
  if (fileName?.endsWith('.rproj')) {
    return { manifestPath: path.join(path.dirname(uri.fsPath), 'DESCRIPTION') };
  }
  return undefined;
}
