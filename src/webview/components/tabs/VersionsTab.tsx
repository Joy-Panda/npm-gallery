import React from 'react';
import type { DependencyType, PackageDetails, VersionInfo } from '../../../types/package';
import { InstallMenuButton } from '../InstallMenuButton';

interface VersionsTabProps {
  details: PackageDetails;
  onInstall: (type: DependencyType, version?: string) => void;
  formatRelativeTime: (dateString?: string) => string;
  formatFullDate: (dateString?: string) => string;
  supportedInstallTypes: DependencyType[];
  showInstall: boolean;
}

interface TagMeta {
  tone: string;
  label: string;
  description: string;
}

const TAG_ORDER = ['latest', 'lts', 'rc', 'next', 'beta', 'alpha', 'canary', 'dev', 'nightly'];

const TAG_META: Record<string, TagMeta> = {
  latest: {
    tone: 'stable',
    label: 'Production',
    description: 'Default install target',
  },
  lts: {
    tone: 'stable',
    label: 'Stable',
    description: 'Long-term support release',
  },
  rc: {
    tone: 'candidate',
    label: 'Release Candidate',
    description: 'Feature frozen, bug-fix focused',
  },
  next: {
    tone: 'preview',
    label: 'Preview',
    description: 'Next major preview release',
  },
  beta: {
    tone: 'beta',
    label: 'Beta',
    description: 'Public testing release',
  },
  alpha: {
    tone: 'alpha',
    label: 'Alpha',
    description: 'Early development release',
  },
  canary: {
    tone: 'canary',
    label: 'Canary',
    description: 'Continuously built unstable release',
  },
  dev: {
    tone: 'dev',
    label: 'Experimental',
    description: 'Development snapshot',
  },
  nightly: {
    tone: 'dev',
    label: 'Experimental',
    description: 'Nightly snapshot',
  },
};

const versionsStyles = `
  .versions-layout {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .versions-section {
    border: 1px solid var(--vscode-widget-border);
    border-radius: 12px;
    overflow: hidden;
    background: var(--vscode-editor-background);
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 16px;
    background: var(--vscode-sideBarSectionHeader-background);
    border-bottom: 1px solid var(--vscode-widget-border);
  }

  .section-title {
    margin: 0;
    font-size: 13px;
    font-weight: 700;
    color: var(--vscode-foreground);
  }

  .section-subtitle {
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
  }

  .tags-list,
  .history-list {
    display: flex;
    flex-direction: column;
  }

  .tag-row,
  .history-row {
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) auto;
    gap: 12px;
    align-items: center;
    padding: 14px 16px;
    border-bottom: 1px solid var(--vscode-widget-border);
  }

  .tag-row:last-child,
  .history-row:last-child {
    border-bottom: none;
  }

  .tag-main,
  .history-main {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .tag-top,
  .history-top {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .tag-name {
    font-family: var(--vscode-editor-font-family);
    font-size: 13px;
    font-weight: 700;
    color: var(--vscode-foreground);
  }

  .tag-version,
  .history-version {
    font-family: var(--vscode-editor-font-family);
    font-size: 13px;
    color: var(--vscode-foreground);
    font-weight: 600;
  }

  .tag-badge,
  .history-tag {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 700;
    border: 1px solid transparent;
  }

  .tag-badge.stable,
  .history-tag.stable {
    background: rgba(34, 197, 94, 0.14);
    color: rgb(74, 222, 128);
    border-color: rgba(34, 197, 94, 0.24);
  }

  .tag-badge.candidate,
  .history-tag.candidate {
    background: rgba(245, 158, 11, 0.14);
    color: rgb(251, 191, 36);
    border-color: rgba(245, 158, 11, 0.24);
  }

  .tag-badge.preview,
  .history-tag.preview {
    background: rgba(234, 179, 8, 0.14);
    color: rgb(253, 224, 71);
    border-color: rgba(234, 179, 8, 0.24);
  }

  .tag-badge.beta,
  .history-tag.beta {
    background: rgba(249, 115, 22, 0.14);
    color: rgb(251, 146, 60);
    border-color: rgba(249, 115, 22, 0.24);
  }

  .tag-badge.alpha,
  .history-tag.alpha {
    background: rgba(239, 68, 68, 0.14);
    color: rgb(248, 113, 113);
    border-color: rgba(239, 68, 68, 0.24);
  }

  .tag-badge.canary,
  .tag-badge.dev,
  .history-tag.canary,
  .history-tag.dev {
    background: rgba(148, 163, 184, 0.14);
    color: rgb(203, 213, 225);
    border-color: rgba(148, 163, 184, 0.24);
  }

  .tag-description,
  .history-meta,
  .tag-published {
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
    line-height: 1.5;
  }

  .tag-side,
  .history-side {
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 6px;
    text-align: right;
  }

  .deprecated-tag {
    display: inline-flex;
    align-items: center;
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 700;
    background: rgba(239, 68, 68, 0.14);
    color: rgb(248, 113, 113);
    border: 1px solid rgba(239, 68, 68, 0.24);
  }

  .empty-section {
    padding: 48px 16px;
    text-align: center;
    font-size: 13px;
    color: var(--vscode-descriptionForeground);
  }

  @media (max-width: 760px) {
    .tag-row,
    .history-row {
      grid-template-columns: 1fr;
    }

    .tag-side,
    .history-side {
      align-items: flex-start;
      text-align: left;
    }
  }
`;

function normalizeTagName(tag: string): string {
  return tag.toLowerCase();
}

function getTagSortKey(tag: string): number {
  const normalized = normalizeTagName(tag);
  const directIndex = TAG_ORDER.indexOf(normalized);
  if (directIndex >= 0) {
    return directIndex;
  }
  if (normalized.startsWith('dev')) {
    return TAG_ORDER.indexOf('dev');
  }
  if (normalized.startsWith('nightly')) {
    return TAG_ORDER.indexOf('nightly');
  }
  if (normalized.startsWith('canary')) {
    return TAG_ORDER.indexOf('canary');
  }
  if (normalized.startsWith('alpha')) {
    return TAG_ORDER.indexOf('alpha');
  }
  if (normalized.startsWith('beta')) {
    return TAG_ORDER.indexOf('beta');
  }
  if (normalized.startsWith('rc')) {
    return TAG_ORDER.indexOf('rc');
  }
  if (normalized.startsWith('next')) {
    return TAG_ORDER.indexOf('next');
  }
  return TAG_ORDER.length + 1;
}

function getTagMeta(tag: string): TagMeta {
  const normalized = normalizeTagName(tag);
  const match =
    TAG_ORDER.find((candidate) => normalized === candidate || normalized.startsWith(candidate)) || 'dev';
  return TAG_META[match] || TAG_META.dev;
}

function buildVersionTagMap(distTags?: Record<string, string>): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const [tag, version] of Object.entries(distTags || {})) {
    const existing = map.get(version) || [];
    existing.push(tag);
    existing.sort((a, b) => {
      const diff = getTagSortKey(a) - getTagSortKey(b);
      return diff !== 0 ? diff : a.localeCompare(b);
    });
    map.set(version, existing);
  }
  return map;
}

function getCurrentTagRows(details: PackageDetails, versionsByNumber: Map<string, VersionInfo>) {
  return Object.entries(details.distTags || {})
    .map(([tag, version]) => ({
      tag,
      version,
      info: versionsByNumber.get(version),
      meta: getTagMeta(tag),
    }))
    .sort((a, b) => {
      const diff = getTagSortKey(a.tag) - getTagSortKey(b.tag);
      return diff !== 0 ? diff : a.tag.localeCompare(b.tag);
    });
}

export const VersionsTab: React.FC<VersionsTabProps> = ({
  details,
  onInstall,
  formatRelativeTime,
  formatFullDate,
  supportedInstallTypes,
  showInstall,
}) => {
  const versionsByNumber = new Map(details.versions.map((version) => [version.version, version]));
  const versionTagMap = buildVersionTagMap(details.distTags);
  const currentTags = getCurrentTagRows(details, versionsByNumber);

  return (
    <>
      <style>{versionsStyles}</style>
      <div className="versions-layout">
        <section className="versions-section">
          <div className="section-header">
            <div>
              <h3 className="section-title">Current Tags</h3>
              <div className="section-subtitle">Sorted by release stability</div>
            </div>
          </div>

          {currentTags.length > 0 ? (
            <div className="tags-list">
              {currentTags.map((entry) => (
                <div key={entry.tag} className="tag-row">
                  <div className="tag-main">
                    <div className="tag-top">
                      <span className={`tag-badge ${entry.meta.tone}`}>{entry.tag}</span>
                      <span className="tag-version">{entry.version}</span>
                    </div>
                    <div className="tag-description">
                      {entry.meta.label} - {entry.meta.description}
                    </div>
                  </div>

                  <div className="tag-side">
                    <div
                      className="tag-published"
                      title={entry.info?.publishedAt ? formatFullDate(entry.info.publishedAt) : ''}
                    >
                      {entry.info?.publishedAt ? formatRelativeTime(entry.info.publishedAt) : 'Unknown publish time'}
                    </div>
                  </div>

                  <div>
                    {showInstall && (
                      <InstallMenuButton
                        size="small"
                        label={`Install ${entry.version}`}
                        onInstall={(type) => onInstall(type, entry.version)}
                        supportedTypes={supportedInstallTypes}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-section">No dist-tags available</div>
          )}
        </section>

        <section className="versions-section">
          <div className="section-header">
            <div>
              <h3 className="section-title">Version History</h3>
              <div className="section-subtitle">Published versions in reverse chronological order</div>
            </div>
          </div>

          {details.versions && details.versions.length > 0 ? (
            <div className="history-list">
              {details.versions.map((version) => {
                const tags = versionTagMap.get(version.version) || [];
                return (
                  <div key={version.version} className="history-row">
                    <div className="history-main">
                      <div className="history-top">
                        <span className="history-version">{version.version}</span>
                        {tags.map((tag) => {
                          const meta = getTagMeta(tag);
                          return (
                            <span key={tag} className={`history-tag ${meta.tone}`}>
                              {tag}
                            </span>
                          );
                        })}
                        {version.deprecated && <span className="deprecated-tag">deprecated</span>}
                      </div>
                      <div className="history-meta" title={version.deprecated || ''}>
                        {version.deprecated || 'Published release'}
                      </div>
                    </div>

                    <div className="history-side">
                      <div
                        className="tag-published"
                        title={version.publishedAt ? formatFullDate(version.publishedAt) : ''}
                      >
                        {formatRelativeTime(version.publishedAt)}
                      </div>
                    </div>

                    <div>
                      {showInstall && (
                        <InstallMenuButton
                          size="small"
                          label={`Install ${version.version}`}
                          onInstall={(type) => onInstall(type, version.version)}
                          supportedTypes={supportedInstallTypes}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty-section">No version information available</div>
          )}
        </section>
      </div>
    </>
  );
};
