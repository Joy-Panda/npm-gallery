import React, { useState } from 'react';
import { usePackageDetails } from '../hooks/usePackageDetails';
import { useVSCode } from '../context/VSCodeContext';
import { MarkdownPreview } from './MarkdownPreview';

interface PackageDetailsProps {
  packageName: string;
  onBack: () => void;
}

export const PackageDetails: React.FC<PackageDetailsProps> = ({ packageName, onBack }) => {
  const { packageDetails, isLoading, error } = usePackageDetails(packageName);
  const { installPackage, openExternal } = useVSCode();
  const [activeTab, setActiveTab] = useState<'readme' | 'versions' | 'deps'>('readme');
  const [installing, setInstalling] = useState(false);

  const handleInstall = async (type: 'dependencies' | 'devDependencies') => {
    setInstalling(true);
    installPackage(packageName, { type, version: packageDetails?.version });
    setTimeout(() => setInstalling(false), 1000);
  };

  const formatBytes = (bytes: number) => {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
  };

  const formatDownloads = (count: number) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

  if (isLoading || !packageDetails) {
    return (
      <div className="package-details">
        <div className="loading-container">
          <div className="loading-spinner">
            <span className="codicon codicon-loading codicon-modifier-spin"></span>
          </div>
          <span>Loading package details...</span>
        </div>
        <style>{styles}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div className="package-details">
        <div className="back-button" onClick={onBack}>
          <span className="codicon codicon-arrow-left"></span>
          Back to Search
        </div>
        <div className="error-container">
          <span className="codicon codicon-error"></span>
          <span>{error}</span>
        </div>
        <style>{styles}</style>
      </div>
    );
  }

  const depsCount = packageDetails.dependencies ? Object.keys(packageDetails.dependencies).length : 0;

  return (
    <div className="package-details">
      {/* Back Button */}
      <div className="back-button" onClick={onBack}>
        <span className="codicon codicon-arrow-left"></span>
        Back to Search
      </div>

      {/* Main Layout - VS Code Extension Style */}
      <div className="details-layout">
        {/* Left Sidebar - Package Info */}
        <div className="sidebar">
          {/* Package Title */}
          <div className="package-title">
            <h1>{packageDetails.name}</h1>
            <p className="description">{packageDetails.description}</p>
          </div>

          {/* Stats Cards */}
          {(packageDetails.downloads || packageDetails.bundleSize || packageDetails.score) && (
            <div className="stats-cards">
              {packageDetails.downloads !== undefined && (
                <div className="stat-card downloads">
                  <div className="stat-card-icon">
                    <span className="codicon codicon-arrow-circle-down"></span>
                  </div>
                  <div className="stat-card-content">
                    <span className="stat-card-value">{formatDownloads(packageDetails.downloads)}</span>
                    <span className="stat-card-label">Weekly Downloads</span>
                  </div>
                </div>
              )}
              {packageDetails.bundleSize && (
                <div className="stat-card size">
                  <div className="stat-card-icon">
                    <span className="codicon codicon-file-zip"></span>
                  </div>
                  <div className="stat-card-content">
                    <span className="stat-card-value">{formatBytes(packageDetails.bundleSize.gzip)}</span>
                    <span className="stat-card-label">Gzipped</span>
                  </div>
                </div>
              )}
              {packageDetails.score && (
                <div className="stat-card score">
                  <div className="stat-card-icon">
                    <span className="codicon codicon-star-full"></span>
                  </div>
                  <div className="stat-card-content">
                    <span className="stat-card-value">{Math.round(packageDetails.score.final * 100)}%</span>
                    <span className="stat-card-label">Quality Score</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="actions">
            <button
              className="action-btn primary"
              onClick={() => handleInstall('dependencies')}
              disabled={installing}
            >
              <span className="codicon codicon-add"></span>
              {installing ? 'Installing...' : 'Install'}
            </button>
            <button
              className="action-btn secondary"
              onClick={() => handleInstall('devDependencies')}
              disabled={installing}
            >
              Install as Dev
            </button>
          </div>

          {/* Package Metadata */}
          <div className="metadata">
            <div className="meta-section">
              <h3>Details</h3>
              <dl className="meta-list">
                <div className="meta-row">
                  <dt>Version</dt>
                  <dd className="version-badge">{packageDetails.version}</dd>
                </div>
                {packageDetails.license && (
                  <div className="meta-row">
                    <dt>License</dt>
                    <dd>{packageDetails.license}</dd>
                  </div>
                )}
                {packageDetails.author && (
                  <div className="meta-row">
                    <dt>Author</dt>
                    <dd>
                      {typeof packageDetails.author === 'string'
                        ? packageDetails.author
                        : packageDetails.author.name || 'Unknown'}
                    </dd>
                  </div>
                )}
                {packageDetails.bundleSize?.dependencyCount && (
                  <div className="meta-row">
                    <dt>Dependencies</dt>
                    <dd>{packageDetails.bundleSize.dependencyCount}</dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Security Status */}
            {packageDetails.security && (
              <div className="meta-section">
                <h3>Security</h3>
                <div className={`security-status ${packageDetails.security.summary.total > 0 ? 'warning' : 'safe'}`}>
                  <span className={`codicon ${packageDetails.security.summary.total > 0 ? 'codicon-warning' : 'codicon-pass'}`}></span>
                  <span>
                    {packageDetails.security.summary.total === 0
                      ? 'No known vulnerabilities'
                      : `${packageDetails.security.summary.total} vulnerabilities found`}
                  </span>
                </div>
              </div>
            )}

            {/* Links */}
            <div className="meta-section">
              <h3>Links</h3>
              <div className="links">
                <a onClick={() => openExternal(`https://www.npmjs.com/package/${packageName}`)}>
                  <span className="codicon codicon-link-external"></span>
                  npm
                </a>
                {packageDetails.homepage && (
                  <a onClick={() => openExternal(packageDetails.homepage!)}>
                    <span className="codicon codicon-home"></span>
                    Homepage
                  </a>
                )}
                {packageDetails.repository && (
                  <a onClick={() => openExternal(typeof packageDetails.repository === 'string' ? packageDetails.repository : packageDetails.repository?.url || '')}>
                    <span className="codicon codicon-github"></span>
                    Repository
                  </a>
                )}
              </div>
            </div>

            {/* Dependencies Summary */}
            {depsCount > 0 && (
              <div className="meta-section">
                <h3>Dependencies</h3>
                <p className="deps-count">{depsCount} dependencies</p>
                <button className="text-btn" onClick={() => setActiveTab('deps')}>
                  View all →
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Content - README/Tabs */}
        <div className="content">
          <div className="tabs">
            <button
              className={`tab ${activeTab === 'readme' ? 'active' : ''}`}
              onClick={() => setActiveTab('readme')}
            >
              Readme
            </button>
            <button
              className={`tab ${activeTab === 'versions' ? 'active' : ''}`}
              onClick={() => setActiveTab('versions')}
            >
              Versions
            </button>
            <button
              className={`tab ${activeTab === 'deps' ? 'active' : ''}`}
              onClick={() => setActiveTab('deps')}
            >
              Dependencies
            </button>
          </div>

          <div className="tab-content">
            {activeTab === 'readme' && (
              <div className="readme">
                <MarkdownPreview source={packageDetails.readme || ''} />
              </div>
            )}

            {activeTab === 'versions' && (
              <div className="versions">
                {packageDetails.versions?.slice(0, 30).map((v) => (
                  <div key={v.version} className="version-item">
                    <div className="version-info">
                      <span className="v-number">{v.version}</span>
                      {v.tag && <span className="v-tag">{v.tag}</span>}
                      {v.deprecated && <span className="v-deprecated">deprecated</span>}
                    </div>
                    <button
                      className="install-version-btn"
                      onClick={() => {
                        installPackage(packageName, { type: 'dependencies', version: v.version });
                      }}
                    >
                      Install
                    </button>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'deps' && (
              <div className="deps">
                {packageDetails.dependencies && Object.keys(packageDetails.dependencies).length > 0 ? (
                  <div className="dep-list">
                    {Object.entries(packageDetails.dependencies).map(([name, version]) => (
                      <div key={name} className="dep-item">
                        <span className="dep-name">{name}</span>
                        <span className="dep-version">{version}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="no-deps">No dependencies</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{styles}</style>
    </div>
  );
};

const styles = `
  .package-details {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .loading-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 48px;
    color: var(--vscode-descriptionForeground);
  }

  .loading-spinner .codicon {
    font-size: 24px;
  }

  .error-container {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 16px;
    color: var(--vscode-errorForeground);
    background: var(--vscode-inputValidation-errorBackground);
    border-radius: 4px;
    margin: 12px;
  }

  .back-button {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    color: var(--vscode-textLink-foreground);
    cursor: pointer;
    font-size: 12px;
    border-bottom: 1px solid var(--vscode-widget-border);
    flex-shrink: 0;
  }

  .back-button:hover {
    background: var(--vscode-list-hoverBackground);
  }

  .details-layout {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  /* Sidebar */
  .sidebar {
    width: 280px;
    flex-shrink: 0;
    padding: 16px;
    border-right: 1px solid var(--vscode-widget-border);
    overflow-y: auto;
    background: var(--vscode-sideBar-background);
  }

  .package-title h1 {
    font-size: 18px;
    font-weight: 600;
    margin: 0 0 8px 0;
    color: var(--vscode-foreground);
    word-break: break-word;
  }

  .package-title .description {
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
    margin: 0;
    line-height: 1.5;
  }

  /* Stats Cards */
  .stats-cards {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 16px 0;
  }

  .stat-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    border-radius: 8px;
    background: var(--vscode-editor-inactiveSelectionBackground);
  }

  .stat-card-icon {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    flex-shrink: 0;
  }

  .stat-card-icon .codicon {
    font-size: 18px;
  }

  .stat-card-content {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .stat-card-value {
    font-size: 16px;
    font-weight: 600;
    color: var(--vscode-foreground);
  }

  .stat-card-label {
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
  }

  .stat-card.downloads {
    background: rgba(59, 130, 246, 0.12);
    border: 1px solid rgba(59, 130, 246, 0.25);
  }

  .stat-card.downloads .stat-card-icon {
    background: rgba(59, 130, 246, 0.2);
    color: var(--vscode-textLink-foreground);
  }

  .stat-card.downloads .stat-card-value {
    color: var(--vscode-textLink-foreground);
    font-size: 18px;
  }

  .stat-card.size {
    background: rgba(139, 92, 246, 0.1);
  }

  .stat-card.size .stat-card-icon {
    background: rgba(139, 92, 246, 0.2);
    color: rgb(167, 139, 250);
  }

  .stat-card.size .stat-card-value {
    color: rgb(167, 139, 250);
  }

  .stat-card.score {
    background: rgba(34, 197, 94, 0.1);
  }

  .stat-card.score .stat-card-icon {
    background: rgba(34, 197, 94, 0.2);
    color: var(--vscode-testing-iconPassed);
  }

  .stat-card.score .stat-card-value {
    color: var(--vscode-testing-iconPassed);
  }

  /* Actions */
  .actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 16px 0;
  }

  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 16px;
    border: none;
    border-radius: 4px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }

  .action-btn.primary {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }

  .action-btn.primary:hover:not(:disabled) {
    background: var(--vscode-button-hoverBackground);
  }

  .action-btn.secondary {
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
  }

  .action-btn.secondary:hover:not(:disabled) {
    background: var(--vscode-button-secondaryHoverBackground);
  }

  .action-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* Metadata */
  .metadata {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .meta-section h3 {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--vscode-descriptionForeground);
    margin: 0 0 10px 0;
  }

  .meta-list {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .meta-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    font-size: 12px;
  }

  .meta-row dt {
    color: var(--vscode-descriptionForeground);
    flex-shrink: 0;
  }

  .meta-row dd {
    margin: 0;
    color: var(--vscode-foreground);
    text-align: right;
    word-break: break-word;
  }

  .version-badge {
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 11px;
    font-family: var(--vscode-editor-font-family);
  }

  /* Security Status */
  .security-status {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px;
    border-radius: 6px;
    font-size: 12px;
  }

  .security-status.safe {
    background: rgba(35, 134, 54, 0.15);
    color: var(--vscode-testing-iconPassed);
  }

  .security-status.warning {
    background: rgba(212, 59, 59, 0.15);
    color: var(--vscode-testing-iconFailed);
  }

  /* Links */
  .links {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .links a {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--vscode-textLink-foreground);
    font-size: 12px;
    cursor: pointer;
    padding: 4px 0;
  }

  .links a:hover {
    text-decoration: underline;
  }

  .deps-count {
    margin: 0;
    font-size: 12px;
    color: var(--vscode-foreground);
  }

  .text-btn {
    background: none;
    border: none;
    color: var(--vscode-textLink-foreground);
    cursor: pointer;
    padding: 4px 0;
    font-size: 12px;
    margin-top: 4px;
  }

  .text-btn:hover {
    text-decoration: underline;
  }

  /* Content Area */
  .content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 0;
  }

  .tabs {
    display: flex;
    gap: 0;
    border-bottom: 1px solid var(--vscode-widget-border);
    padding: 0 16px;
    flex-shrink: 0;
    background: var(--vscode-editor-background);
  }

  .tab {
    padding: 12px 16px;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--vscode-foreground);
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    opacity: 0.7;
    transition: all 0.15s;
  }

  .tab:hover {
    opacity: 1;
    background: var(--vscode-list-hoverBackground);
  }

  .tab.active {
    border-bottom-color: var(--vscode-focusBorder);
    color: var(--vscode-foreground);
    opacity: 1;
  }

  .tab-content {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    background: var(--vscode-editor-background);
  }

  /* Readme */
  .readme {
    max-width: 800px;
  }

  /* Versions */
  .versions {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .version-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-radius: 4px;
    transition: background 0.1s;
  }

  .version-item:hover {
    background: var(--vscode-list-hoverBackground);
  }

  .version-info {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .v-number {
    font-family: var(--vscode-editor-font-family);
    font-size: 13px;
    color: var(--vscode-foreground);
  }

  .v-tag {
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 10px;
    font-weight: 500;
  }

  .v-deprecated {
    color: var(--vscode-errorForeground);
    font-size: 11px;
    font-style: italic;
  }

  .install-version-btn {
    padding: 4px 12px;
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border: none;
    border-radius: 4px;
    font-size: 11px;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .version-item:hover .install-version-btn {
    opacity: 1;
  }

  .install-version-btn:hover {
    background: var(--vscode-button-secondaryHoverBackground);
  }

  /* Dependencies */
  .dep-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .dep-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 12px;
    border-radius: 4px;
    transition: background 0.1s;
  }

  .dep-item:hover {
    background: var(--vscode-list-hoverBackground);
  }

  .dep-name {
    color: var(--vscode-textLink-foreground);
    font-size: 13px;
  }

  .dep-version {
    font-family: var(--vscode-editor-font-family);
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
  }

  .no-deps {
    text-align: center;
    color: var(--vscode-descriptionForeground);
    padding: 40px;
    font-size: 13px;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .codicon-modifier-spin {
    animation: spin 1s linear infinite;
  }
`;
