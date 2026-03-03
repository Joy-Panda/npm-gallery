import React from 'react';
import { Copy, Download, Package, Star, Scale, User } from 'lucide-react';
import type { DependencyType, PackageDetails } from '../../types/package';
import { InstallMenuButton } from './InstallMenuButton';
import { Button } from './ui/button';

interface PackageHeaderProps {
  details: PackageDetails;
  installing: boolean;
  onInstall: (type: DependencyType) => void;
  formatDownloads: (count: number) => string;
  formatBytes: (bytes: number) => string;
  supportedInstallTypes: DependencyType[];
  showInstall: boolean;
  installTargetLabel?: string;
  copyContextLabel?: string;
  onCopyAction?: () => void;
  copyActionLabel?: string;
  copyFormatOptions?: Array<{ value: string; label: string }>;
  selectedCopyFormat?: string;
  onCopyFormatChange?: (value: string) => void;
  downloadsLabel?: string;
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

  .nuget-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }

  .nuget-select {
    height: 32px;
    padding: 0 10px;
    border-radius: 6px;
    border: 1px solid var(--vscode-dropdown-border);
    background: var(--vscode-dropdown-background, var(--vscode-editor-background));
    color: var(--vscode-foreground);
    font-size: 12px;
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
  copyContextLabel,
  onCopyAction,
  copyActionLabel,
  copyFormatOptions,
  selectedCopyFormat,
  onCopyFormatChange,
  downloadsLabel,
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
            <span>
              {formatDownloads(details.downloads)}
              {downloadsLabel ? ` ${downloadsLabel}` : ''}
            </span>
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
      {(showInstall || onCopyAction) && (
        <div className="actions">
          {showInstall ? (
            <InstallMenuButton
              variant="primary"
              onInstall={onInstall}
              disabled={installing}
              loading={installing}
              supportedTypes={supportedInstallTypes}
            />
          ) : onCopyAction ? (
            <div className="nuget-actions">
              {copyFormatOptions && onCopyFormatChange && (
                <select
                  className="nuget-select"
                  value={selectedCopyFormat || ''}
                  onChange={(event) => onCopyFormatChange(event.target.value)}
                >
                  <option value="">Select format</option>
                  {copyFormatOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}
              <Button
                variant="default"
                onClick={onCopyAction}
                disabled={installing || (copyFormatOptions ? !selectedCopyFormat : false)}
              >
                <Copy size={14} />
                <span>{installing ? 'Copying...' : copyActionLabel || 'Copy snippet'}</span>
              </Button>
            </div>
          ) : null}
          {(installTargetLabel || copyContextLabel) && (
            <div className="install-target">
              {installTargetLabel ? `Install target: ${installTargetLabel}` : ''}
              {installTargetLabel && copyContextLabel ? ' • ' : ''}
              {copyContextLabel || ''}
            </div>
          )}
        </div>
      )}
    </header>
    </>
  );
};
