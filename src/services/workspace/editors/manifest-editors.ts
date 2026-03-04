import { parseCakeDirectives } from '../../../utils/cake-utils';
import { parseDescriptionDependencyField } from '../parsers/r-parser';
import { readXmlAttribute } from '../parsers/shared';

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeXml(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatDescriptionDependencyField(
  fieldName: string,
  entries: Array<{ name: string; versionSpecifier?: string }>
): string {
  const formattedEntries = entries.map((entry) => {
    if (!entry.versionSpecifier || entry.versionSpecifier === '*') {
      return entry.name;
    }
    return `${entry.name} (${entry.versionSpecifier})`;
  });

  if (formattedEntries.length === 1) {
    return `${fieldName}: ${formattedEntries[0]}`;
  }

  return `${fieldName}: ${formattedEntries[0]},\n    ${formattedEntries.slice(1).join(',\n    ')}`;
}

function rewriteDescriptionDependencyFields(
  text: string,
  packageId: string,
  rewriter: (
    entry: { name: string; versionSpecifier?: string }
  ) => { name: string; versionSpecifier?: string } | null
): string {
  const fieldPattern = /^(Depends|Imports|LinkingTo|Suggests|Enhances):\s*([^\n]*(?:\n[ \t]+[^\n]*)*)/gim;
  let changed = false;

  const updatedText = text.replace(fieldPattern, (full, fieldName: string, fieldBody: string) => {
    const entries = parseDescriptionDependencyField(fieldBody);
    if (entries.length === 0) {
      return full;
    }

    let fieldChanged = false;
    const nextEntries: Array<{ name: string; versionSpecifier?: string }> = [];
    for (const entry of entries) {
      if (entry.name.toLowerCase() !== packageId.toLowerCase()) {
        nextEntries.push(entry);
        continue;
      }

      const rewritten = rewriter(entry);
      if (rewritten) {
        nextEntries.push(rewritten);
      }
      fieldChanged = true;
    }

    if (!fieldChanged) {
      return full;
    }

    changed = true;
    if (nextEntries.length === 0) {
      return '';
    }

    return formatDescriptionDependencyField(fieldName, nextEntries);
  });

  if (!changed) {
    return text;
  }

  return updatedText.replace(/\n{3,}/g, '\n\n').trimEnd() + (text.endsWith('\n') ? '\n' : '');
}

export function updateMavenDependencyText(
  xml: string,
  groupId: string,
  artifactId: string,
  newVersion: string
): string {
  const dependencyRegex = new RegExp(
    `(<dependency>\\s*<groupId>${escapeXml(groupId)}</groupId>\\s*<artifactId>${escapeXml(artifactId)}</artifactId>\\s*<version>)([^<]+)(</version>)`,
    's'
  );

  return xml.replace(dependencyRegex, `$1${newVersion}$3`);
}

export function updateGradleDependencyText(
  text: string,
  groupId: string,
  artifactId: string,
  newVersion: string
): string {
  const escapedGroupId = escapeRegex(groupId);
  const escapedArtifactId = escapeRegex(artifactId);
  const gradleDepRegex = new RegExp(
    `((?:implementation|testImplementation|compileOnly|runtimeOnly|api|compile)\\s*(?:\\(\\s*)?['"]${escapedGroupId}:${escapedArtifactId}:)([^"'\\)\\s]+)((['"]\\s*\\)?)|['"])`,
    'g'
  );

  return text.replace(gradleDepRegex, `$1${newVersion}$3`);
}

export function updateCpmPackageText(xml: string, packageId: string, newVersion: string): string {
  const escapedId = escapeRegex(packageId);
  const re = new RegExp(`(<PackageVersion\\s+Include="${escapedId}"\\s+Version=")([^"]+)("\\s*/>)`, 'i');
  const updatedXml = xml.replace(re, `$1${newVersion}$3`);
  if (updatedXml !== xml) {
    return updatedXml;
  }

  const re2 = new RegExp(`(<PackageVersion\\s+Version=")([^"]+)("\\s+Include="${escapedId}"\\s*/>)`, 'i');
  return xml.replace(re2, `$1${newVersion}$3`);
}

export function removeCpmPackageText(xml: string, packageId: string): string {
  const escapedId = escapeRegex(packageId);
  return xml
    .replace(
      new RegExp(`^[ \\t]*<PackageVersion\\s+Include="${escapedId}"\\s+Version="[^"]+"\\s*/>\\s*\\r?\\n?`, 'im'),
      ''
    )
    .replace(
      new RegExp(`^[ \\t]*<PackageVersion\\s+Version="[^"]+"\\s+Include="${escapedId}"\\s*/>\\s*\\r?\\n?`, 'im'),
      ''
    );
}

export function updatePaketDependencyText(text: string, packageId: string, newVersion: string): string {
  const escapedId = escapeRegex(packageId);
  const re = new RegExp(`^(\\s*nuget\\s+${escapedId}\\s+)([^\\s~]+)([^\\n]*)`, 'im');
  return text.replace(re, `$1${newVersion}$3`);
}

export function removePaketDependencyText(text: string, packageId: string): string {
  const escapedId = escapeRegex(packageId);
  return text.replace(new RegExp(`^\\s*nuget\\s+${escapedId}\\b[^\\n]*\\r?\\n?`, 'im'), '');
}

export function updatePackagesConfigText(xml: string, packageId: string, newVersion: string): string {
  return xml.replace(/<package\b([^>]*?)\/?>/gi, (full, attrs: string) => {
    const id = readXmlAttribute(attrs, 'id');
    const version = readXmlAttribute(attrs, 'version');
    if (!id || !version || id.toLowerCase() !== packageId.toLowerCase()) {
      return full;
    }
    return full.replace(/(\bversion\s*=\s*")([^"]+)(")/i, `$1${newVersion}$3`);
  });
}

export function removePackagesConfigText(xml: string, packageId: string): string {
  return xml.replace(/^[ \t]*<package\b([^>]*?)\/?>\s*\r?\n?/gim, (full, attrs: string) => {
    const id = readXmlAttribute(attrs, 'id');
    if (!id || id.toLowerCase() !== packageId.toLowerCase()) {
      return full;
    }
    return '';
  });
}

export function updateProjectPackageReferenceText(xml: string, packageId: string, newVersion: string): string {
  return xml.replace(
    /<PackageReference\b([^>]*?)\/>|<PackageReference\b([^>]*?)>([\s\S]*?)<\/PackageReference>/gi,
    (full, selfClosingAttrs: string, blockAttrs: string, body: string = '') => {
      const attrs = (selfClosingAttrs ?? blockAttrs ?? '').trim();
      const id = readXmlAttribute(attrs, 'Include') || readXmlAttribute(attrs, 'Update');
      if (!id || id.toLowerCase() !== packageId.toLowerCase()) {
        return full;
      }

      if (/\bVersion\s*=\s*"[^"]*"/i.test(attrs)) {
        return full.replace(/(\bVersion\s*=\s*")([^"]+)(")/i, `$1${newVersion}$3`);
      }

      if (/<Version>\s*[^<]*\s*<\/Version>/i.test(body)) {
        return full.replace(/(<Version>\s*)([^<]*)(\s*<\/Version>)/i, `$1${newVersion}$3`);
      }

      return full;
    }
  );
}

export function removeProjectPackageReferenceText(xml: string, packageId: string): string {
  return xml.replace(
    /^[ \t]*<PackageReference\b([^>]*?)\/>\s*\r?\n?|^[ \t]*<PackageReference\b([^>]*?)>[\s\S]*?<\/PackageReference>\s*\r?\n?/gim,
    (full, selfClosingAttrs: string, blockAttrs: string) => {
      const attrs = (selfClosingAttrs ?? blockAttrs ?? '').trim();
      const id = readXmlAttribute(attrs, 'Include') || readXmlAttribute(attrs, 'Update');
      if (!id || id.toLowerCase() !== packageId.toLowerCase()) {
        return full;
      }
      return '';
    }
  );
}

export function updateCakePackageText(
  text: string,
  packageId: string,
  newVersion: string,
  kind: 'addin' | 'tool'
): string {
  const directive = parseCakeDirectives(text).find(
    (entry) => entry.kind === kind && entry.packageId.toLowerCase() === packageId.toLowerCase()
  );
  if (!directive) {
    return text;
  }

  return directive.versionRange
    ? `${text.slice(0, directive.versionRange.start)}${newVersion}${text.slice(directive.versionRange.end)}`
    : `${text.slice(0, directive.end)}&version=${newVersion}${text.slice(directive.end)}`;
}

export function removeCakePackageText(text: string, packageId: string): string {
  const directive = parseCakeDirectives(text).find(
    (entry) => entry.packageId.toLowerCase() === packageId.toLowerCase()
  );
  if (!directive) {
    return text;
  }

  const lineStart = text.lastIndexOf('\n', directive.start) + 1;
  const lineEndIndex = text.indexOf('\n', directive.end);
  const lineEnd = lineEndIndex === -1 ? text.length : lineEndIndex + 1;
  return `${text.slice(0, lineStart)}${text.slice(lineEnd)}`;
}

export function updateDepsEdnDependencyText(text: string, packageId: string, newVersion: string): string {
  const escapedId = escapeRegex(packageId);
  const re = new RegExp(`(${escapedId}\\s+\\{[\\s\\S]*?:mvn/version\\s+")([^"]+)(")`, 'g');
  return text.replace(re, `$1${newVersion}$3`);
}

export function updateLeiningenDependencyText(text: string, packageId: string, newVersion: string): string {
  const escapedId = escapeRegex(packageId);
  const re = new RegExp(`(\\[${escapedId}\\s+")([^"]+)(")`, 'g');
  return text.replace(re, `$1${newVersion}$3`);
}

export function updateCargoDependencyText(text: string, packageId: string, newVersion: string): string {
  const escapedId = escapeRegex(packageId);
  let updatedText = text.replace(new RegExp(`(^\\s*${escapedId}\\s*=\\s*")([^"]+)(")`, 'gm'), `$1${newVersion}$3`);
  updatedText = updatedText.replace(
    new RegExp(`(^\\s*${escapedId}\\s*=\\s*\\{[^\\n\\r]*?version\\s*=\\s*")([^"]+)(")`, 'gm'),
    `$1${newVersion}$3`
  );
  return updatedText;
}

export function updateGoDependencyText(text: string, packageId: string, newVersion: string): string {
  const escapedId = escapeRegex(packageId);
  return text.replace(new RegExp(`(^\\s*(?:require\\s+)?${escapedId}\\s+)(v[^\\s]+)`, 'gm'), `$1${newVersion}`);
}

export function updatePerlDependencyText(text: string, packageId: string, newVersion: string): string {
  const escapedId = escapeRegex(packageId);
  let updatedText = text.replace(
    new RegExp(`((?:requires|recommends|suggests)\\s+['"]${escapedId}['"]\\s*,\\s*['"])([^'"]+)(['"])`, 'g'),
    `$1${newVersion}$3`
  );
  if (updatedText === text) {
    updatedText = text.replace(
      new RegExp(`((?:requires|recommends|suggests)\\s+['"]${escapedId}['"])(\\s*;)`, 'g'),
      `$1, '${newVersion}'$2`
    );
  }
  return updatedText;
}

export function removePerlDependencyText(text: string, packageId: string): string {
  const escapedId = escapeRegex(packageId);
  return text.replace(new RegExp(`^\\s*(?:requires|recommends|suggests)\\s+['"]${escapedId}['"][^\\n]*\\r?\\n?`, 'gm'), '');
}

export function updatePubspecDependencyText(text: string, packageId: string, newVersion: string): string {
  const escapedId = escapeRegex(packageId);
  let updatedText = text.replace(new RegExp(`(^\\s{2}${escapedId}:\\s*)([^#\\n\\r]+)`, 'gm'), `$1${newVersion}`);
  updatedText = updatedText.replace(
    new RegExp(`(^\\s{2}${escapedId}:\\s*\\{[^\\n\\r]*?version:\\s*)([^,}\\n\\r]+)`, 'gm'),
    `$1${newVersion}`
  );
  return updatedText;
}

export function updateRDependencyText(text: string, packageId: string, newVersion: string): string {
  return rewriteDescriptionDependencyFields(text, packageId, (entry) => ({ ...entry, versionSpecifier: `>= ${newVersion}` }));
}

export function removeRDependencyText(text: string, packageId: string): string {
  return rewriteDescriptionDependencyFields(text, packageId, () => null);
}
