import React from 'react';
import type { PackageDetails } from '../../../types/package';

interface VersionsTabProps {
  details: PackageDetails;
  onInstall: (type: 'dependencies' | 'devDependencies', version?: string) => void;
  formatRelativeTime: (dateString?: string) => string;
  formatFullDate: (dateString?: string) => string;
}

const versionsStyles = `
  .versions-wrapper {
    width: 100%;
  }

  .versions-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  .versions-table thead {
    border-bottom: 1px solid var(--vscode-widget-border);
  }

  .versions-table th {
    text-align: left;
    padding: 12px 16px;
    font-weight: 600;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--vscode-descriptionForeground);
    background: var(--vscode-sideBarSectionHeader-background);
  }

  .versions-table th:last-child {
    text-align: right;
  }

  .version-row {
    border-bottom: 1px solid var(--vscode-widget-border);
    transition: background 0.1s;
  }

  .version-row:hover {
    background: var(--vscode-list-hoverBackground);
  }

  .version-row:last-child {
    border-bottom: none;
  }

  .version-cell,
  .published-cell,
  .tag-cell,
  .action-cell {
    padding: 12px 16px;
    vertical-align: middle;
  }

  .version-cell-content {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .version-number {
    font-family: var(--vscode-editor-font-family);
    font-size: 13px;
    color: var(--vscode-foreground);
    font-weight: 500;
  }

  .version-tag {
    background: linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(59, 130, 246, 0.05));
    color: rgb(96, 165, 250);
    padding: 3px 10px;
    border-radius: 100px;
    font-size: 10px;
    font-weight: 600;
    border: 1px solid rgba(59, 130, 246, 0.2);
  }

  .deprecated-tag {
    background: linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(239, 68, 68, 0.05));
    color: rgb(248, 113, 113);
    padding: 3px 10px;
    border-radius: 100px;
    font-size: 10px;
    font-weight: 600;
    border: 1px solid rgba(239, 68, 68, 0.2);
  }

  .tag-empty {
    color: var(--vscode-descriptionForeground);
    opacity: 0.5;
  }

  .published-cell {
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
    cursor: help;
  }

  .tag-cell {
    text-align: center;
  }

  .action-cell {
    text-align: right;
  }

  .btn-small {
    padding: 6px 16px;
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border: none;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }

  .version-row:hover .btn-small {
    background: var(--vscode-button-secondaryHoverBackground);
  }

  .btn-small:hover {
    background: var(--vscode-button-secondaryHoverBackground);
  }

  .empty-tab-cell {
    padding: 48px;
    text-align: center;
  }

  .empty-tab {
    text-align: center;
    color: var(--vscode-descriptionForeground);
    padding: 48px;
    font-size: 13px;
  }
`;

export const VersionsTab: React.FC<VersionsTabProps> = ({
  details,
  onInstall,
  formatRelativeTime,
  formatFullDate,
}) => {
  return (
    <>
      <style>{versionsStyles}</style>
      <div className="versions-wrapper">
      <table className="versions-table">
        <thead>
          <tr>
            <th>Version</th>
            <th>Published</th>
            <th>Tag</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {details.versions && details.versions.length > 0 ? (
            details.versions.map((v) => (
              <tr key={v.version} className="version-row">
                <td className="version-cell">
                  <div className="version-cell-content">
                    <span className="version-number">{v.version}</span>
                    {v.deprecated && (
                      <span className="deprecated-tag" title={v.deprecated}>
                        deprecated
                      </span>
                    )}
                  </div>
                </td>
                <td className="published-cell" title={v.publishedAt ? formatFullDate(v.publishedAt) : ''}>
                  {formatRelativeTime(v.publishedAt)}
                </td>
                <td className="tag-cell">
                  {v.tag ? <span className="version-tag">{v.tag}</span> : <span className="tag-empty">—</span>}
                </td>
                <td className="action-cell">
                  <button
                    className="btn-small"
                    onClick={() => onInstall('dependencies', v.version)}
                  >
                    Install
                  </button>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={4} className="empty-tab-cell">
                <div className="empty-tab">No version information available</div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
    </>
  );
};
