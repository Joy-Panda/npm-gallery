import * as vscode from 'vscode';
import { getServices } from '../services';
import { provideHoverForDepsEdn, provideHoverForProjectClj } from './hover/clojure-hover';
import { provideHoverForComposer, provideHoverForComposerLock } from './hover/composer-hover';
import { provideHoverForCargoLock, provideHoverForCargoToml } from './hover/cargo-hover';
import { provideHoverForGoMod } from './hover/go-hover';
import { provideHoverForCpanfile, provideHoverForCpanfileSnapshot } from './hover/metacpan-hover';
import { provideHoverForPackageJson } from './hover/npm-hover';
import {
  provideHoverForCake,
  provideHoverForDirectoryPackagesProps,
  provideHoverForPackagesConfig,
  provideHoverForPaketDependencies,
  provideHoverForProjectPackageReference,
} from './hover/nuget-hover';
import { provideHoverForPubspecLock, provideHoverForPubspecYaml } from './hover/pub-hover';
import { provideHoverForDescription } from './hover/r-hover';
import { provideHoverForGemfile, provideHoverForGemfileLock } from './hover/ruby-hover';
import { provideHoverForGradle, provideHoverForPomXml } from './hover/sonatype-hover';

type HoverHandler = (
  document: vscode.TextDocument,
  position: vscode.Position,
  line: string
) => Promise<vscode.Hover | null>;

type HoverRoute = {
  matches: (fileName: string) => boolean;
  handler: HoverHandler;
};

/**
 * Provides hover information for packages in supported manifests.
 */
export class PackageHoverProvider implements vscode.HoverProvider {
  private readonly routes: HoverRoute[] = [
    {
      matches: (fileName) => fileName.endsWith('package.json'),
      handler: async (_document, position, line) =>
        provideHoverForPackageJson(line, position, getServices().getCurrentSourceType()),
    },
    {
      matches: (fileName) => fileName.endsWith('composer.json') || fileName.endsWith('composer.lock'),
      handler: async (document, position, line) =>
        document.fileName.toLowerCase().endsWith('composer.lock')
          ? provideHoverForComposerLock(document, position)
          : provideHoverForComposer(document, line, position),
    },
    {
      matches: (fileName) => fileName.endsWith('gemfile') || fileName.endsWith('gemfile.lock'),
      handler: async (_document, position, line) =>
        line !== undefined && _document.fileName.toLowerCase().endsWith('gemfile.lock')
          ? provideHoverForGemfileLock(line, position)
          : provideHoverForGemfile(line, position),
    },
    {
      matches: (fileName) => fileName.endsWith('cpanfile') || fileName.endsWith('cpanfile.snapshot'),
      handler: async (_document, position, line) =>
        _document.fileName.toLowerCase().endsWith('cpanfile.snapshot')
          ? provideHoverForCpanfileSnapshot(line, position)
          : provideHoverForCpanfile(line, position),
    },
    {
      matches: (fileName) => fileName.endsWith('pubspec.yaml') || fileName.endsWith('pubspec.lock'),
      handler: async (document, position, line) =>
        document.fileName.toLowerCase().endsWith('pubspec.lock')
          ? provideHoverForPubspecLock(document, position)
          : provideHoverForPubspecYaml(document, line, position),
    },
    {
      matches: (fileName) => fileName.endsWith('description'),
      handler: async (_document, position, line) => provideHoverForDescription(line, position),
    },
    {
      matches: (fileName) =>
        fileName.endsWith('directory.packages.props') ||
        fileName.endsWith('packages.config') ||
        fileName.endsWith('.csproj') ||
        fileName.endsWith('.vbproj') ||
        fileName.endsWith('.fsproj') ||
        fileName.endsWith('paket.dependencies') ||
        fileName.endsWith('.cake'),
      handler: async (document, position, line) =>
        document.fileName.toLowerCase().endsWith('directory.packages.props')
          ? provideHoverForDirectoryPackagesProps(line, position)
          : document.fileName.toLowerCase().endsWith('packages.config')
            ? provideHoverForPackagesConfig(line, position)
            : document.fileName.toLowerCase().endsWith('paket.dependencies')
              ? provideHoverForPaketDependencies(line, position)
              : document.fileName.toLowerCase().endsWith('.cake')
                ? provideHoverForCake(document, position)
                : provideHoverForProjectPackageReference(document, position),
    },
    {
      matches: (fileName) => fileName.endsWith('deps.edn'),
      handler: async (document, position) => provideHoverForDepsEdn(document, position),
    },
    {
      matches: (fileName) => fileName.endsWith('project.clj'),
      handler: async (_document, position, line) => provideHoverForProjectClj(line, position),
    },
    {
      matches: (fileName) => fileName.endsWith('cargo.toml') || fileName.endsWith('cargo.lock'),
      handler: async (document, position, line) =>
        document.fileName.toLowerCase().endsWith('cargo.lock')
          ? provideHoverForCargoLock(document, position)
          : provideHoverForCargoToml(document, line, position),
    },
    {
      matches: (fileName) => fileName.endsWith('go.mod'),
      handler: async (document, position, line) => provideHoverForGoMod(document, line, position),
    },
    {
      matches: (fileName) => fileName.endsWith('pom.xml'),
      handler: async (document, position) =>
        provideHoverForPomXml(document, position, getServices().getCurrentSourceType()),
    },
    {
      matches: (fileName) => fileName.endsWith('build.gradle') || fileName.endsWith('build.gradle.kts'),
      handler: async (document, position) =>
        provideHoverForGradle(document, position, getServices().getCurrentSourceType()),
    },
  ];

  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): Promise<vscode.Hover | null> {
    const fileName = document.fileName.toLowerCase();
    const line = document.lineAt(position.line).text;
    const route = this.routes.find((candidate) => candidate.matches(fileName));
    return route ? route.handler(document, position, line) : null;
  }
}
