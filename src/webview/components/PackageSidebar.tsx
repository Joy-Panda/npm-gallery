import React from 'react';
import { ShieldCheck, ShieldAlert } from 'lucide-react';
import type { PackageDetails } from '../../types/package';

interface PackageSidebarProps {
  details: PackageDetails;
  onOpenExternal: (url: string) => void;
  formatBytes: (bytes: number) => string;
  formatRelativeTime: (dateString?: string) => string;
  formatFullDate: (dateString?: string) => string;
}

const sidebarStyles = `
  .sidebar {
    width: 260px;
    flex-shrink: 0;
    padding: 20px 24px;
    border-left: 1px solid var(--vscode-widget-border);
    background: var(--vscode-sideBar-background);
    overflow-y: auto;
  }

  .sidebar-section {
    padding: 16px 0;
    border-bottom: 1px solid var(--vscode-widget-border);
  }

  .sidebar-section:first-child {
    padding-top: 0;
  }

  .sidebar-section:last-child {
    border-bottom: none;
  }

  .section-label {
    display: block;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--vscode-descriptionForeground);
    margin-bottom: 8px;
  }

  .version-text {
    font-family: var(--vscode-editor-font-family);
    font-size: 14px;
    font-weight: 500;
    color: var(--vscode-foreground);
  }

  .security-inline {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
  }

  .security-inline.secure {
    color: rgb(74, 222, 128);
  }

  .security-inline.warning {
    color: rgb(248, 113, 113);
  }

  .links-inline {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
  }

  .links-inline a {
    color: var(--vscode-textLink-foreground);
    font-size: 13px;
    cursor: pointer;
    text-decoration: none;
  }

  .links-inline a:hover {
    text-decoration: underline;
  }

  .info-inline {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .info-row {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
  }

  .info-row span:first-child {
    color: var(--vscode-descriptionForeground);
  }

  .info-row span:last-child {
    color: var(--vscode-foreground);
  }

  .keywords-inline {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .keyword-tag {
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
  }

  .keyword-tag::before {
    content: '#';
    opacity: 0.6;
  }
`;

export const PackageSidebar: React.FC<PackageSidebarProps> = ({
  details,
  onOpenExternal,
  formatBytes,
  formatRelativeTime,
  formatFullDate,
}) => {
  const isSecure = !details.security || details.security.summary.total === 0;
  const publishedAt = details.time?.[details.version] || details.versions?.find(
    (version) => version.version === details.version
  )?.publishedAt;
  const repoUrl = details.repository
    ? typeof details.repository === 'string'
      ? details.repository
      : details.repository.url?.replace(/^git\+/, '').replace(/\.git$/, '') || ''
    : '';

  return (
    <>
      <style>{sidebarStyles}</style>
      <aside className="sidebar">
      {/* Version */}
      <div className="sidebar-section">
        <span className="section-label">Version</span>
        <span className="version-text">{details.version}</span>
      </div>

      {/* Security */}
      <div className="sidebar-section">
        <span className="section-label">Security</span>
        <div className={`security-inline ${isSecure ? 'secure' : 'warning'}`}>
          {isSecure ? <ShieldCheck size={14} /> : <ShieldAlert size={14} />}
          <span>{isSecure ? 'No vulnerabilities' : `${details.security?.summary.total} vulnerabilities`}</span>
        </div>
      </div>

      {/* Resources */}
      <div className="sidebar-section">
        <span className="section-label">Resources</span>
        <div className="links-inline">
          <a onClick={() => onOpenExternal(`https://www.npmjs.com/package/${details.name}`)}>npm</a>
          {details.homepage && <a onClick={() => onOpenExternal(details.homepage!)}>Homepage</a>}
          {repoUrl && <a onClick={() => onOpenExternal(repoUrl)}>Repository</a>}
          {details.bugs?.url && <a onClick={() => onOpenExternal(details.bugs!.url!)}>Issues</a>}
        </div>
      </div>

      {/* Info */}
      {(details.bundleSize || (details.maintainers && details.maintainers.length > 0) || publishedAt) && (
        <div className="sidebar-section">
          <span className="section-label">Info</span>
          <div className="info-inline">
            {details.bundleSize?.dependencyCount !== undefined && (
              <div className="info-row">
                <span>Dependencies</span>
                <span>{details.bundleSize.dependencyCount}</span>
              </div>
            )}
            {details.bundleSize && (
              <div className="info-row">
                <span>Unpacked Size</span>
                <span>{formatBytes(details.bundleSize.size)}</span>
              </div>
            )}
            {details.maintainers && details.maintainers.length > 0 && (
              <div className="info-row">
                <span>Maintainers</span>
                <span>{details.maintainers.length}</span>
              </div>
            )}
            {publishedAt && (
              <div className="info-row">
                <span>Published</span>
                <span title={formatFullDate(publishedAt)}>
                  {formatRelativeTime(publishedAt)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Keywords */}
      {details.keywords && details.keywords.length > 0 && (
        <div className="sidebar-section">
          <span className="section-label">Keywords</span>
          <div className="keywords-inline">
            {details.keywords.slice(0, 10).map((keyword) => (
              <span key={keyword} className="keyword-tag">{keyword}</span>
            ))}
          </div>
        </div>
      )}
    </aside>
    </>
  );
};
