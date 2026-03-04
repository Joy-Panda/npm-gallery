import * as vscode from 'vscode';
import type { WorkspacePackageScope } from '../types/package';
import { provideCodeLensesForPackageJson } from './codelens/npm-codelens';
import { provideCodeLensesForComposerJson } from './codelens/composer-codelens';
import { provideCodeLensesForGemfile } from './codelens/ruby-codelens';
import {
  provideCodeLensesForPubspecYaml,
} from './codelens/pub-codelens';
import {
  provideCodeLensesForDescription,
  provideCodeLensesForRproj,
} from './codelens/r-codelens';
import {
  provideCodeLensesForDepsEdn,
  provideCodeLensesForProjectClj,
} from './codelens/clojure-codelens';
import { provideCodeLensesForCpanfile } from './codelens/metacpan-codelens';
import { provideCodeLensesForCargoToml } from './codelens/cargo-codelens';
import { provideCodeLensesForGoMod } from './codelens/go-codelens';
import {
  provideCodeLensesForGradle,
  provideCodeLensesForPomXml,
} from './codelens/sonatype-codelens';
import {
  provideCodeLensesForCake,
  provideCodeLensesForDirectoryPackagesProps,
  provideCodeLensesForPackagesConfig,
  provideCodeLensesForPaketDependencies,
  provideCodeLensesForProjectPackageReferences,
} from './codelens/nuget-codelens';

interface CodeLensCacheEntry {
  version: number;
  lenses: vscode.CodeLens[];
}

type CodeLensHandler = (
  document: vscode.TextDocument,
  text: string
) => Promise<vscode.CodeLens[]>;

type CodeLensRoute = {
  matches(fileName: string): boolean;
  handler: CodeLensHandler;
};

/**
 * Provides CodeLens for package updates in package.json, composer.json, Gemfile,
 * pom.xml, Gradle, NuGet manifests, and Cake (.cake) scripts.
 */
export class PackageCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  private securitySummaries = new Map<string, { total: number; critical: number; high: number }>();
  private codeLensCache = new Map<string, CodeLensCacheEntry>();
  private routes: CodeLensRoute[];

  constructor() {
    this.routes = [
      {
        matches: (fileName) => fileName.endsWith('package.json'),
        handler: (document, text) => provideCodeLensesForPackageJson(document, text, this.securitySummaries),
      },
      {
        matches: (fileName) => fileName.endsWith('composer.json'),
        handler: (document, text) => provideCodeLensesForComposerJson(document, text),
      },
      {
        matches: (fileName) => fileName.endsWith('gemfile'),
        handler: (document, text) => provideCodeLensesForGemfile(document, text),
      },
      {
        matches: (fileName) => fileName.endsWith('cpanfile'),
        handler: (document, text) => provideCodeLensesForCpanfile(document, text),
      },
      {
        matches: (fileName) => fileName.endsWith('pubspec.yaml'),
        handler: (document, text) => provideCodeLensesForPubspecYaml(document, text),
      },
      {
        matches: (fileName) => fileName.endsWith('description'),
        handler: (document, text) => provideCodeLensesForDescription(document, text),
      },
      {
        matches: (fileName) => fileName.endsWith('.rproj'),
        handler: (document) => provideCodeLensesForRproj(document),
      },
      {
        matches: (fileName) => fileName.endsWith('deps.edn'),
        handler: (document, text) => provideCodeLensesForDepsEdn(document, text),
      },
      {
        matches: (fileName) => fileName.endsWith('project.clj'),
        handler: (document, text) => provideCodeLensesForProjectClj(document, text),
      },
      {
        matches: (fileName) => fileName.endsWith('cargo.toml'),
        handler: (document, text) => provideCodeLensesForCargoToml(document, text),
      },
      {
        matches: (fileName) => fileName.endsWith('go.mod'),
        handler: (document, text) => provideCodeLensesForGoMod(document, text),
      },
      {
        matches: (fileName) => fileName.endsWith('pom.xml'),
        handler: (document, text) => provideCodeLensesForPomXml(document, text),
      },
      {
        matches: (fileName) => fileName.endsWith('build.gradle') || fileName.endsWith('build.gradle.kts'),
        handler: (document, text) => provideCodeLensesForGradle(document, text),
      },
      {
        matches: (fileName) => fileName.endsWith('directory.packages.props'),
        handler: (document, text) => provideCodeLensesForDirectoryPackagesProps(document, text, this.securitySummaries),
      },
      {
        matches: (fileName) => fileName.endsWith('packages.config'),
        handler: (document, text) => provideCodeLensesForPackagesConfig(document, text, this.securitySummaries),
      },
      {
        matches: (fileName) => fileName.endsWith('.csproj') || fileName.endsWith('.vbproj') || fileName.endsWith('.fsproj'),
        handler: (document, text) => provideCodeLensesForProjectPackageReferences(document, text, this.securitySummaries),
      },
      {
        matches: (fileName) => fileName.endsWith('paket.dependencies'),
        handler: (document, text) => provideCodeLensesForPaketDependencies(document, text),
      },
      {
        matches: (fileName) => fileName.endsWith('.cake'),
        handler: (document, text) => provideCodeLensesForCake(document, text),
      },
    ];
  }

  /**
   * Refresh CodeLenses
   */
  refresh(scope?: WorkspacePackageScope): void {
    this.invalidateCache(scope);
    this._onDidChangeCodeLenses.fire();
  }

  async provideCodeLenses(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): Promise<vscode.CodeLens[]> {
    const cacheKey = document.uri.toString();
    const cached = this.codeLensCache.get(cacheKey);
    if (cached && cached.version === document.version) {
      return cached.lenses;
    }

    const fileName = document.fileName.toLowerCase();
    const text = document.getText();
    const route = this.routes.find((entry) => entry.matches(fileName));
    if (!route) {
      return [];
    }

    const lenses = await route.handler(document, text);
    this.codeLensCache.set(cacheKey, { version: document.version, lenses });
    return lenses;
  }

  async resolveCodeLens(
    codeLens: vscode.CodeLens,
    _token: vscode.CancellationToken
  ): Promise<vscode.CodeLens> {
    return codeLens;
  }

  dispose(): void {
    this._onDidChangeCodeLenses.dispose();
  }

  private invalidateCache(scope?: WorkspacePackageScope): void {
    if (!scope?.manifestPath && !scope?.workspaceFolderPath) {
      this.codeLensCache.clear();
      return;
    }

    for (const key of this.codeLensCache.keys()) {
      const uri = vscode.Uri.parse(key);
      if (this.matchesScope(uri, scope)) {
        this.codeLensCache.delete(key);
      }
    }
  }

  private matchesScope(uri: vscode.Uri, scope: WorkspacePackageScope): boolean {
    if (scope.manifestPath) {
      return uri.fsPath === scope.manifestPath;
    }

    if (scope.workspaceFolderPath) {
      return vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath === scope.workspaceFolderPath;
    }

    return true;
  }

}
