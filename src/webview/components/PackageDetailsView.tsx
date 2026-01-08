import React, { useState, useEffect } from 'react';
import { MarkdownPreview } from './MarkdownPreview';
import {
  Download, Package, Star, Scale, User,
  ShieldCheck, ShieldAlert,
  Layers, Loader2, Plus, BookOpen,
  GitBranch, ChevronRight
} from 'lucide-react';
import type { PackageDetails } from '../../types/package';

interface VSCodeAPI {
  postMessage: (message: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
}

interface PackageDetailsViewProps {
  vscode: VSCodeAPI;
  initialData?: PackageDetails;
}

export const PackageDetailsView: React.FC<PackageDetailsViewProps> = ({ vscode, initialData }) => {
  const [details, setDetails] = useState<PackageDetails | null>(initialData || null);
  const [activeTab, setActiveTab] = useState<'readme' | 'versions' | 'dependencies'>('readme');
  const [isLoading, setIsLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      switch (message.type) {
        case 'packageDetails':
          setDetails(message.data);
          setIsLoading(false);
          setError(null);
          break;
        case 'error':
          setError(message.message);
          setIsLoading(false);
          break;
        case 'installSuccess':
          setInstalling(false);
          break;
        case 'installError':
          setInstalling(false);
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    vscode.postMessage({ type: 'ready' });
    return () => window.removeEventListener('message', handleMessage);
  }, [vscode]);

  const install = (type: 'dependencies' | 'devDependencies', version?: string) => {
    if (!details) return;
    setInstalling(true);
    vscode.postMessage({
      type: 'install',
      packageName: details.name,
      options: { type, version },
    });
    setTimeout(() => setInstalling(false), 2000);
  };

  const openExternal = (url: string) => {
    vscode.postMessage({ type: 'openExternal', url });
  };

  const formatDownloads = (count: number) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

  const formatBytes = (bytes: number) => {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
  };

  if (isLoading) {
    return (
      <>
        <style>{styles}</style>
        <div className="loading-screen">
          <div className="loading-content">
            <Loader2 size={40} className="spinner" />
            <span>Loading package details...</span>
          </div>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <style>{styles}</style>
        <div className="error-screen">
          <ShieldAlert size={40} />
          <span>{error}</span>
        </div>
      </>
    );
  }

  if (!details) {
    return (
      <>
        <style>{styles}</style>
        <div className="loading-screen">
          <span>No package data</span>
        </div>
      </>
    );
  }

  const authorName = details.author
    ? typeof details.author === 'string'
      ? details.author
      : details.author.name || 'Unknown'
    : null;

  const repoUrl = details.repository
    ? typeof details.repository === 'string'
      ? details.repository
      : details.repository.url?.replace(/^git\+/, '').replace(/\.git$/, '') || ''
    : '';

  const depsCount = details.dependencies ? Object.keys(details.dependencies).length : 0;
  const isSecure = !details.security || details.security.summary.total === 0;

  return (
    <>
      <style>{styles}</style>
      <div className="package-view">
        {/* Header */}
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
          <div className="actions">
            <button className="btn primary" onClick={() => install('dependencies')} disabled={installing}>
              {installing ? <Loader2 size={14} className="spinner" /> : <Plus size={14} />}
              {installing ? 'Installing...' : 'Install'}
            </button>
            <button className="btn secondary" onClick={() => install('devDependencies')} disabled={installing}>
              Install as Dev
            </button>
          </div>
        </header>

        {/* Content */}
        <div className="content">
          {/* Main Area */}
          <main className="main">
            {/* Tabs */}
            <div className="tabs">
              <button
                className={`tab ${activeTab === 'readme' ? 'active' : ''}`}
                onClick={() => setActiveTab('readme')}
              >
                <BookOpen size={14} />
                Readme
              </button>
              <button
                className={`tab ${activeTab === 'versions' ? 'active' : ''}`}
                onClick={() => setActiveTab('versions')}
              >
                <GitBranch size={14} />
                Versions
              </button>
              <button
                className={`tab ${activeTab === 'dependencies' ? 'active' : ''}`}
                onClick={() => setActiveTab('dependencies')}
              >
                <Layers size={14} />
                Dependencies
                {depsCount > 0 && <span className="tab-badge">{depsCount}</span>}
              </button>
            </div>

            {/* Tab Content */}
            <div className="tab-content">
              {activeTab === 'readme' && (
                <div className="readme-wrapper">
                  <MarkdownPreview source={details.readme || ''} />
                </div>
              )}

              {activeTab === 'versions' && (
                <div className="versions-list">
                  {details.versions && details.versions.length > 0 ? (
                    details.versions.slice(0, 50).map((v) => (
                      <div key={v.version} className="version-item">
                        <div className="version-info">
                          <span className="version-number">{v.version}</span>
                          {v.tag && <span className="version-tag">{v.tag}</span>}
                          {v.deprecated && <span className="deprecated-tag">deprecated</span>}
                        </div>
                        <button className="btn-small" onClick={() => install('dependencies', v.version)}>
                          Install
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="empty-tab">No version information available</div>
                  )}
                </div>
              )}

              {activeTab === 'dependencies' && (
                <div className="deps-list">
                  {details.dependencies && Object.keys(details.dependencies).length > 0 ? (
                    Object.entries(details.dependencies).map(([name, version]) => (
                      <div key={name} className="dep-item" onClick={() => openExternal(`https://www.npmjs.com/package/${name}`)}>
                        <span className="dep-name">{name}</span>
                        <div className="dep-right">
                          <span className="dep-version">{version}</span>
                          <ChevronRight size={14} />
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="empty-tab">No dependencies</div>
                  )}
                </div>
              )}
            </div>
          </main>

          {/* Sidebar */}
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
                <a onClick={() => openExternal(`https://www.npmjs.com/package/${details.name}`)}>npm</a>
                {details.homepage && <a onClick={() => openExternal(details.homepage!)}>Homepage</a>}
                {repoUrl && <a onClick={() => openExternal(repoUrl)}>Repository</a>}
                {details.bugs?.url && <a onClick={() => openExternal(details.bugs!.url!)}>Issues</a>}
              </div>
            </div>

            {/* Info */}
            {(details.bundleSize || (details.maintainers && details.maintainers.length > 0)) && (
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
        </div>
      </div>
    </>
  );
};

const styles = `
  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    padding: 0;
    font-family: var(--vscode-font-family);
    background: var(--vscode-editor-background);
    color: var(--vscode-foreground);
  }

  .spinner {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .loading-screen, .error-screen {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    gap: 16px;
    color: var(--vscode-descriptionForeground);
  }

  .error-screen {
    color: var(--vscode-errorForeground);
  }

  .package-view {
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* Header */
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
    gap: 10px;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 10px 20px;
    border: none;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn.primary {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }

  .btn.primary:hover:not(:disabled) {
    background: var(--vscode-button-hoverBackground);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  }

  .btn.secondary {
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
  }

  .btn.secondary:hover:not(:disabled) {
    background: var(--vscode-button-secondaryHoverBackground);
  }

  /* Content Layout */
  .content {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  /* Main Area */
  .main {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 0;
  }

  .tabs {
    display: flex;
    gap: 4px;
    padding: 0 24px;
    background: var(--vscode-editor-background);
    border-bottom: 1px solid var(--vscode-widget-border);
    flex-shrink: 0;
  }

  .tab {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 14px 18px;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--vscode-descriptionForeground);
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    transition: all 0.15s;
  }

  .tab:hover {
    color: var(--vscode-foreground);
    background: var(--vscode-list-hoverBackground);
  }

  .tab.active {
    border-bottom-color: var(--vscode-focusBorder);
    color: var(--vscode-foreground);
  }

  .tab-badge {
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    padding: 2px 8px;
    border-radius: 100px;
    font-size: 10px;
    font-weight: 600;
  }

  .tab-content {
    flex: 1;
    overflow-y: auto;
    padding: 24px;
  }

  .readme-wrapper {
    max-width: 850px;
  }

  /* Versions */
  .versions-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .version-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-radius: 8px;
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

  .version-number {
    font-family: var(--vscode-editor-font-family);
    font-size: 13px;
    color: var(--vscode-foreground);
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

  .btn-small {
    padding: 6px 14px;
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border: none;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    opacity: 0;
    transition: all 0.15s;
  }

  .version-item:hover .btn-small {
    opacity: 1;
  }

  .btn-small:hover {
    background: var(--vscode-button-secondaryHoverBackground);
  }

  /* Dependencies */
  .deps-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .dep-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.1s;
  }

  .dep-item:hover {
    background: var(--vscode-list-hoverBackground);
  }

  .dep-name {
    color: var(--vscode-textLink-foreground);
    font-size: 13px;
  }

  .dep-right {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--vscode-descriptionForeground);
  }

  .dep-version {
    font-family: var(--vscode-editor-font-family);
    font-size: 12px;
  }

  .empty-tab {
    text-align: center;
    color: var(--vscode-descriptionForeground);
    padding: 48px;
    font-size: 13px;
  }

  /* Sidebar */
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
