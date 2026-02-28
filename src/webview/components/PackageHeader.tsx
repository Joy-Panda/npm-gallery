import React from 'react';
import { Download, Package, Star, Scale, User } from 'lucide-react';
import type { DependencyType, PackageDetails } from '../../types/package';
import { InstallMenuButton } from './InstallMenuButton';

interface PackageHeaderProps {
  details: PackageDetails;
  installing: boolean;
  onInstall: (type: DependencyType) => void;
  formatDownloads: (count: number) => string;
  formatBytes: (bytes: number) => string;
  supportedInstallTypes: DependencyType[];
  showInstall: boolean;
  installTargetLabel?: string;
}

const headerStyles = `
  .header {
    padding: 24px 32px;
    background: linear-gradient(180deg, var(--vscode-sideBar-background) 0%, var(--vscode-editor-background) 100%);
    border-bottom: 1px solid var(--vscode-widget-border);
    flex-shrink: 0;
  }

  .header-top {
    margin-bottom: 12px;
  }

  .package-name {
    margin: 0;
    font-size: 28px;
    font-weight: 700;
    color: var(--vscode-foreground);
    letter-spacing: -0.5px;
  }

  .stats-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 16px;
  }

  .stat-item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: var(--vscode-editor-inactiveSelectionBackground);
    border-radius: 100px;
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
    border: 1px solid transparent;
    transition: all 0.15s;
  }

  .stat-item.highlight {
    background: linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(59, 130, 246, 0.05));
    color: rgb(96, 165, 250);
    border-color: rgba(59, 130, 246, 0.2);
  }

  .stat-item.success {
    background: linear-gradient(135deg, rgba(34, 197, 94, 0.15), rgba(34, 197, 94, 0.05));
    color: rgb(74, 222, 128);
    border-color: rgba(34, 197, 94, 0.2);
  }

  .description {
    margin: 0 0 20px 0;
    font-size: 14px;
    color: var(--vscode-descriptionForeground);
    line-height: 1.6;
    max-width: 700px;
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .install-target {
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
  }

`;

export const PackageHeader: React.FC<PackageHeaderProps> = ({
  details,
  installing,
  onInstall,
  formatDownloads,
  formatBytes,
  supportedInstallTypes,
  showInstall,
  installTargetLabel,
}) => {
  const authorName = details.author
    ? typeof details.author === 'string'
      ? details.author
      : details.author.name || 'Unknown'
    : null;

  return (
    <>
      <style>{headerStyles}</style>
      <header className="header">
      <div className="header-top">
        <h1 className="package-name">{details.name}</h1>
      </div>

      {/* Stats Row */}
      <div className="stats-row">
        {authorName && (
          <div className="stat-item">
            <User size={14} />
            <span>{authorName}</span>
          </div>
        )}
        {details.downloads !== undefined && (
          <div className="stat-item highlight">
            <Download size={14} />
            <span>{formatDownloads(details.downloads)}</span>
          </div>
        )}
        {details.bundleSize && (
          <div className="stat-item">
            <Package size={14} />
            <span>{formatBytes(details.bundleSize.gzip)}</span>
          </div>
        )}
        {details.score && (
          <div className="stat-item success">
            <Star size={14} />
            <span>{Math.round(details.score.final * 100)}</span>
          </div>
        )}
        {details.license && (
          <div className="stat-item">
            <Scale size={14} />
            <span>{details.license}</span>
          </div>
        )}
      </div>

      {/* Description */}
      <p className="description">{details.description || 'No description available'}</p>

      {/* Actions */}
      {showInstall && (
        <div className="actions">
          <InstallMenuButton
            variant="primary"
            onInstall={onInstall}
            disabled={installing}
            loading={installing}
            supportedTypes={supportedInstallTypes}
          />
          {installTargetLabel && <div className="install-target">Install target: {installTargetLabel}</div>}
        </div>
      )}
    </header>
    </>
  );
};
