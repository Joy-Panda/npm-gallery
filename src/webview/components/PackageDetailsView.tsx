import React, { useState, useEffect } from 'react';
import { MarkdownPreview } from './MarkdownPreview';
import {
  Download, Package, Star, Scale, User,
  ShieldCheck, ShieldAlert,
  Layers, Loader2, Plus, BookOpen,
  GitBranch, ChevronRight, ChevronDown
} from 'lucide-react';
import type { PackageDetails, Vulnerability } from '../../types/package';

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
  const [activeTab, setActiveTab] = useState<'readme' | 'versions' | 'dependencies' | 'security'>('readme');
  const [isLoading, setIsLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [expandedSections, setExpandedSections] = useState<{
    runtime: boolean;
    dev: boolean;
    peer: boolean;
  }>({
    runtime: true,
    dev: true,
    peer: true,
  });
  const [expandedVulnerabilities, setExpandedVulnerabilities] = useState<Set<number>>(new Set());
  const [expandedSeverityTypes, setExpandedSeverityTypes] = useState<Set<string>>(new Set());

  // Default expand first severity type
  useEffect(() => {
    if (details?.security?.vulnerabilities && details.security.vulnerabilities.length > 0) {
      const severityTypes = ['critical', 'high', 'moderate', 'low', 'info'];
      const firstType = severityTypes.find(type => 
        details.security!.vulnerabilities.some(v => v.severity === type)
      );
      if (firstType) {
        setExpandedSeverityTypes(new Set([firstType]));
      }
    }
  }, [details?.security?.vulnerabilities]);

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

  const toggleVulnerability = (vulnId: number) => {
    setExpandedVulnerabilities(prev => {
      const newSet = new Set(prev);
      if (newSet.has(vulnId)) {
        newSet.delete(vulnId);
      } else {
        newSet.add(vulnId);
      }
      return newSet;
    });
  };

  const toggleSeverityType = (severity: string) => {
    setExpandedSeverityTypes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(severity)) {
        newSet.delete(severity);
      } else {
        // Close all other types and open this one
        newSet.clear();
        newSet.add(severity);
      }
      return newSet;
    });
  };

  // Group vulnerabilities by severity
  const groupVulnerabilitiesBySeverity = (vulnerabilities: Vulnerability[]) => {
    const groups: Record<string, Vulnerability[]> = {};
    vulnerabilities.forEach((vuln) => {
      if (!groups[vuln.severity]) {
        groups[vuln.severity] = [];
      }
      groups[vuln.severity].push(vuln);
    });
    return groups;
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

  const formatRelativeTime = (dateString?: string): string => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diffInSeconds < 60) return 'just now';
    
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes} minute${diffInMinutes > 1 ? 's' : ''} ago`;
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 30) return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;
    
    const diffInMonths = Math.floor(diffInDays / 30);
    if (diffInMonths < 12) return `${diffInMonths} month${diffInMonths > 1 ? 's' : ''} ago`;
    
    const diffInYears = Math.floor(diffInMonths / 12);
    return `${diffInYears} year${diffInYears > 1 ? 's' : ''} ago`;
  };

  const formatFullDate = (dateString?: string): string => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
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
                {details.versions && details.versions.length > 0 && (
                  <span className="tab-badge">{details.versions.length}</span>
                )}
              </button>
              <button
                className={`tab ${activeTab === 'dependencies' ? 'active' : ''}`}
                onClick={() => setActiveTab('dependencies')}
              >
                <Layers size={14} />
                Dependencies
                {depsCount > 0 && <span className="tab-badge">{depsCount}</span>}
              </button>
              <button
                className={`tab ${activeTab === 'security' ? 'active' : ''}`}
                onClick={() => setActiveTab('security')}
              >
                {isSecure ? <ShieldCheck size={14} /> : <ShieldAlert size={14} />}
                Security
                {details.security && details.security.summary.total > 0 && (
                  <span className="tab-badge">{details.security.summary.total}</span>
                )}
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
                                onClick={() => install('dependencies', v.version)}
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
              )}

              {activeTab === 'dependencies' && (
                <div className="deps-wrapper">
                  {/* Runtime Dependencies */}
                  {details.dependencies && Object.keys(details.dependencies).length > 0 && (
                    <div className="deps-section">
                      <h3 
                        className="deps-section-title"
                        onClick={() => setExpandedSections(prev => ({ ...prev, runtime: !prev.runtime }))}
                      >
                        <div className="deps-title-left">
                          {expandedSections.runtime ? (
                            <ChevronDown size={16} className="chevron-icon" />
                          ) : (
                            <ChevronRight size={16} className="chevron-icon" />
                          )}
                          <span className="deps-title-text">Runtime Dependencies</span>
                          <span className="deps-count">({Object.keys(details.dependencies).length})</span>
                        </div>
                      </h3>
                      {expandedSections.runtime && (
                        <div className="deps-list">
                          {Object.entries(details.dependencies).map(([name, version]) => (
                            <div key={name} className="dep-item" onClick={() => openExternal(`https://www.npmjs.com/package/${name}`)}>
                              <span className="dep-name">{name}</span>
                              <div className="dep-right">
                                <span className="dep-version">{version}</span>
                                <ChevronRight size={14} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Dev Dependencies */}
                  {details.devDependencies && Object.keys(details.devDependencies).length > 0 && (
                    <div className="deps-section">
                      <h3 
                        className="deps-section-title"
                        onClick={() => setExpandedSections(prev => ({ ...prev, dev: !prev.dev }))}
                      >
                        <div className="deps-title-left">
                          {expandedSections.dev ? (
                            <ChevronDown size={16} className="chevron-icon" />
                          ) : (
                            <ChevronRight size={16} className="chevron-icon" />
                          )}
                          <span className="deps-title-text">Dev Dependencies</span>
                          <span className="deps-count">({Object.keys(details.devDependencies).length})</span>
                        </div>
                      </h3>
                      {expandedSections.dev && (
                        <div className="deps-list">
                          {Object.entries(details.devDependencies).map(([name, version]) => (
                            <div key={name} className="dep-item" onClick={() => openExternal(`https://www.npmjs.com/package/${name}`)}>
                              <span className="dep-name">{name}</span>
                              <div className="dep-right">
                                <span className="dep-version">{version}</span>
                                <ChevronRight size={14} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Peer Dependencies */}
                  {details.peerDependencies && Object.keys(details.peerDependencies).length > 0 && (
                    <div className="deps-section">
                      <h3 
                        className="deps-section-title"
                        onClick={() => setExpandedSections(prev => ({ ...prev, peer: !prev.peer }))}
                      >
                        <div className="deps-title-left">
                          {expandedSections.peer ? (
                            <ChevronDown size={16} className="chevron-icon" />
                          ) : (
                            <ChevronRight size={16} className="chevron-icon" />
                          )}
                          <span className="deps-title-text">Peer Dependencies</span>
                          <span className="deps-count">({Object.keys(details.peerDependencies).length})</span>
                        </div>
                      </h3>
                      {expandedSections.peer && (
                        <div className="deps-list">
                          {Object.entries(details.peerDependencies).map(([name, version]) => (
                            <div key={name} className="dep-item" onClick={() => openExternal(`https://www.npmjs.com/package/${name}`)}>
                              <span className="dep-name">{name}</span>
                              <div className="dep-right">
                                <span className="dep-version">{version}</span>
                                <ChevronRight size={14} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* No Dependencies */}
                  {(!details.dependencies || Object.keys(details.dependencies).length === 0) &&
                   (!details.devDependencies || Object.keys(details.devDependencies).length === 0) &&
                   (!details.peerDependencies || Object.keys(details.peerDependencies).length === 0) && (
                    <div className="empty-tab">No dependencies</div>
                  )}
                </div>
              )}

              {activeTab === 'security' && (
                <div className="security-wrapper">
                  {details.security && details.security.summary.total > 0 ? (
                    <>
                      {/* Security Summary */}
                      <div className="security-summary">
                        <h3 className="security-summary-title">Security Overview</h3>
                        <div className="security-stats">
                          {details.security.summary.critical > 0 && (
                            <div 
                              className={`security-stat critical ${expandedSeverityTypes.has('critical') ? 'expanded' : ''}`}
                              onClick={() => toggleSeverityType('critical')}
                            >
                              <span className="security-stat-label">Critical</span>
                              <span className="security-stat-value">{details.security.summary.critical}</span>
                              {expandedSeverityTypes.has('critical') ? (
                                <ChevronDown size={16} />
                              ) : (
                                <ChevronRight size={16} />
                              )}
                            </div>
                          )}
                          {details.security.summary.high > 0 && (
                            <div 
                              className={`security-stat high ${expandedSeverityTypes.has('high') ? 'expanded' : ''}`}
                              onClick={() => toggleSeverityType('high')}
                            >
                              <span className="security-stat-label">High</span>
                              <span className="security-stat-value">{details.security.summary.high}</span>
                              {expandedSeverityTypes.has('high') ? (
                                <ChevronDown size={16} />
                              ) : (
                                <ChevronRight size={16} />
                              )}
                            </div>
                          )}
                          {details.security.summary.moderate > 0 && (
                            <div 
                              className={`security-stat moderate ${expandedSeverityTypes.has('moderate') ? 'expanded' : ''}`}
                              onClick={() => toggleSeverityType('moderate')}
                            >
                              <span className="security-stat-label">Moderate</span>
                              <span className="security-stat-value">{details.security.summary.moderate}</span>
                              {expandedSeverityTypes.has('moderate') ? (
                                <ChevronDown size={16} />
                              ) : (
                                <ChevronRight size={16} />
                              )}
                            </div>
                          )}
                          {details.security.summary.low > 0 && (
                            <div 
                              className={`security-stat low ${expandedSeverityTypes.has('low') ? 'expanded' : ''}`}
                              onClick={() => toggleSeverityType('low')}
                            >
                              <span className="security-stat-label">Low</span>
                              <span className="security-stat-value">{details.security.summary.low}</span>
                              {expandedSeverityTypes.has('low') ? (
                                <ChevronDown size={16} />
                              ) : (
                                <ChevronRight size={16} />
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Vulnerabilities List */}
                      <div className="vulnerabilities-list">
                        <h3 className="vulnerabilities-title">Vulnerabilities</h3>
                        {(() => {
                          const grouped = groupVulnerabilitiesBySeverity(details.security.vulnerabilities);
                          const severityOrder = ['critical', 'high', 'moderate', 'low', 'info'];
                          
                          return severityOrder.map(severity => {
                            const vulns = grouped[severity] || [];
                            if (vulns.length === 0) return null;
                            const isExpanded = expandedSeverityTypes.has(severity);
                            
                            return (
                              <div key={severity} className="vulnerability-severity-group">
                                {isExpanded && vulns.map((vuln) => {
                                  const isVulnExpanded = expandedVulnerabilities.has(vuln.id);
                                  const vulnId = vuln.url ? vuln.url.split('/').pop() || vuln.id.toString() : vuln.id.toString();
                                  
                                  return (
                                    <div key={vuln.id} className={`vulnerability-row ${vuln.severity}`}>
                                      <div 
                                        className="vulnerability-row-header"
                                        onClick={() => toggleVulnerability(vuln.id)}
                                      >
                                        <div className="vulnerability-row-indicator" />
                                        <div className="vulnerability-row-content">
                                          <div className="vulnerability-row-id">
                                            {vuln.url ? (
                                              <a 
                                                href="#" 
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  openExternal(vuln.url!);
                                                }}
                                                className="vulnerability-id-link"
                                              >
                                                {vulnId}
                                              </a>
                                            ) : (
                                              <span>{vulnId}</span>
                                            )}
                                          </div>
                                          <div className="vulnerability-row-title">{vuln.title}</div>
                                          {vuln.published && (
                                            <div className="vulnerability-row-published">
                                              {formatRelativeTime(vuln.published)}
                                            </div>
                                          )}
                                          {vuln.patchedVersions && (
                                            <div className="vulnerability-row-fix">
                                              <span className="fix-available-badge">Fix available</span>
                                            </div>
                                          )}
                                          <div className="vulnerability-row-severity">
                                            <div className={`vulnerability-severity-badge-inline ${vuln.severity}`}>
                                              {vuln.cvss ? (
                                                <span>
                                                  Severity - {vuln.cvss.score.toFixed(1)} ({vuln.severity.charAt(0).toUpperCase() + vuln.severity.slice(1)})
                                                </span>
                                              ) : (
                                                <span>Severity - {vuln.severity.charAt(0).toUpperCase() + vuln.severity.slice(1)}</span>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                      {isVulnExpanded && (
                                        <div className="vulnerability-row-details">
                                          {vuln.vulnerableVersions && (
                                            <div className="vulnerability-info">
                                              <span className="vulnerability-info-label">Vulnerable Versions:</span>
                                              <span className="vulnerability-info-value">{vuln.vulnerableVersions}</span>
                                            </div>
                                          )}
                                          {vuln.patchedVersions && (
                                            <div className="vulnerability-info">
                                              <span className="vulnerability-info-label">Patched Versions:</span>
                                              <span className="vulnerability-info-value">{vuln.patchedVersions}</span>
                                            </div>
                                          )}
                                          {vuln.details && (
                                            <div className="vulnerability-details">
                                              <div className="vulnerability-details-content">
                                                <MarkdownPreview source={vuln.details} />
                                              </div>
                                            </div>
                                          )}
                                          {vuln.recommendation && (
                                            <div className="vulnerability-recommendation">
                                              <strong>Recommendation:</strong> {vuln.recommendation}
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </>
                  ) : (
                    <div className="security-empty">
                      <ShieldCheck size={48} className="security-empty-icon" />
                      <h3 className="security-empty-title">No Vulnerabilities Found</h3>
                      <p className="security-empty-text">This package appears to be secure with no known vulnerabilities.</p>
                    </div>
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
            {(details.bundleSize || (details.maintainers && details.maintainers.length > 0) || (details.versions && details.versions.length > 0 && details.versions[0].publishedAt)) && (
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
                  {details.versions && details.versions.length > 0 && details.versions[0].publishedAt && (
                    <div className="info-row">
                      <span>Published</span>
                      <span title={formatFullDate(details.versions[0].publishedAt)}>
                        {formatRelativeTime(details.versions[0].publishedAt)}
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

  /* Dependencies */
  .deps-wrapper {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .deps-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .deps-section-title {
    display: flex;
    align-items: center;
    font-size: 14px;
    font-weight: 600;
    color: var(--vscode-foreground);
    margin: 0;
    padding: 8px 0;
    border-bottom: 1px solid var(--vscode-widget-border);
    cursor: pointer;
    user-select: none;
    transition: background 0.15s;
  }

  .deps-section-title:hover {
    background: var(--vscode-list-hoverBackground);
    margin: 0 -8px;
    padding: 8px;
    border-radius: 4px;
  }

  .deps-title-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .chevron-icon {
    color: var(--vscode-descriptionForeground);
    flex-shrink: 0;
    transition: transform 0.2s;
  }

  .deps-title-text {
    color: var(--vscode-foreground);
  }

  .deps-count {
    font-size: 12px;
    font-weight: 500;
    color: var(--vscode-descriptionForeground);
    opacity: 0.8;
  }

  .deps-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    animation: slideDown 0.2s ease-out;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      max-height: 0;
    }
    to {
      opacity: 1;
      max-height: 1000px;
    }
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

  .dep-name:hover {
    text-decoration: underline;
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

  /* Security Tab */
  .security-wrapper {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .security-summary {
    padding: 20px;
    background: var(--vscode-sideBar-background);
    border-radius: 8px;
    border: 1px solid var(--vscode-widget-border);
  }

  .security-summary-title {
    margin: 0 0 16px 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--vscode-foreground);
  }

  .security-stats {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
  }

  .security-stat {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 16px;
    background: var(--vscode-editor-inactiveSelectionBackground);
    border-radius: 6px;
    min-width: 100px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .security-stat:hover {
    background: var(--vscode-list-hoverBackground);
  }

  .security-stat.expanded {
    border-color: var(--vscode-focusBorder);
  }

  .security-stat.critical {
    background: linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(239, 68, 68, 0.05));
    border: 1px solid rgba(239, 68, 68, 0.3);
  }

  .security-stat.high {
    background: linear-gradient(135deg, rgba(249, 115, 22, 0.15), rgba(249, 115, 22, 0.05));
    border: 1px solid rgba(249, 115, 22, 0.3);
  }

  .security-stat.moderate {
    background: linear-gradient(135deg, rgba(234, 179, 8, 0.15), rgba(234, 179, 8, 0.05));
    border: 1px solid rgba(234, 179, 8, 0.3);
  }

  .security-stat.low {
    background: linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(59, 130, 246, 0.05));
    border: 1px solid rgba(59, 130, 246, 0.3);
  }

  .security-stat-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--vscode-descriptionForeground);
  }

  .security-stat-value {
    font-size: 24px;
    font-weight: 700;
    color: var(--vscode-foreground);
  }

  .security-stat.critical .security-stat-value {
    color: rgb(239, 68, 68);
  }

  .security-stat.high .security-stat-value {
    color: rgb(249, 115, 22);
  }

  .security-stat.moderate .security-stat-value {
    color: rgb(234, 179, 8);
  }

  .security-stat.low .security-stat-value {
    color: rgb(59, 130, 246);
  }

  .vulnerabilities-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .vulnerabilities-title {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--vscode-foreground);
  }

  .vulnerability-card {
    padding: 20px;
    background: var(--vscode-sideBar-background);
    border-radius: 8px;
    border: 1px solid var(--vscode-widget-border);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .vulnerability-card.critical {
    border-left: 4px solid rgb(239, 68, 68);
  }

  .vulnerability-card.high {
    border-left: 4px solid rgb(249, 115, 22);
  }

  .vulnerability-card.moderate {
    border-left: 4px solid rgb(234, 179, 8);
  }

  .vulnerability-card.low {
    border-left: 4px solid rgb(59, 130, 246);
  }

  .vulnerability-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .vulnerability-severity-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.3px;
  }

  .vulnerability-severity-badge .severity-text {
    text-transform: none;
  }

  .vulnerability-card.critical .vulnerability-severity-badge {
    background: rgb(220, 38, 38);
    color: rgb(255, 255, 255);
    border: none;
  }

  .vulnerability-card.high .vulnerability-severity-badge {
    background: rgb(249, 115, 22);
    color: rgb(255, 255, 255);
    border: none;
  }

  .vulnerability-card.moderate .vulnerability-severity-badge {
    background: rgb(234, 179, 8);
    color: rgb(0, 0, 0);
    border: none;
  }

  .vulnerability-card.low .vulnerability-severity-badge {
    background: rgb(59, 130, 246);
    color: rgb(255, 255, 255);
    border: none;
  }

  .vulnerability-link-btn {
    padding: 6px 12px;
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border: none;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }

  .vulnerability-link-btn:hover {
    background: var(--vscode-button-secondaryHoverBackground);
  }

  .vulnerability-title {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: var(--vscode-foreground);
  }

  .vulnerability-info {
    display: flex;
    gap: 8px;
    font-size: 13px;
  }

  .vulnerability-info-label {
    color: var(--vscode-descriptionForeground);
    font-weight: 500;
  }

  .vulnerability-info-value {
    color: var(--vscode-foreground);
    font-family: var(--vscode-editor-font-family);
  }

  .vulnerability-recommendation {
    padding: 12px;
    background: var(--vscode-editor-inactiveSelectionBackground);
    border-radius: 6px;
    font-size: 13px;
    line-height: 1.6;
    color: var(--vscode-foreground);
  }

  .vulnerability-recommendation strong {
    color: var(--vscode-foreground);
  }

  .vulnerability-cvss {
    display: flex;
    gap: 8px;
    font-size: 13px;
  }

  .vulnerability-details {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--vscode-widget-border);
  }

  .vulnerability-details-content {
    font-size: 13px;
    line-height: 1.6;
    color: var(--vscode-foreground);
  }

  .vulnerability-details-content .markdown-preview-wrapper {
    margin: 0;
  }

  .vulnerability-details-content .markdown-preview-wrapper .wmde-markdown {
    font-size: 13px !important;
    line-height: 1.6 !important;
  }

  .vulnerability-details-content .markdown-preview-wrapper .wmde-markdown h1,
  .vulnerability-details-content .markdown-preview-wrapper .wmde-markdown h2,
  .vulnerability-details-content .markdown-preview-wrapper .wmde-markdown h3,
  .vulnerability-details-content .markdown-preview-wrapper .wmde-markdown h4 {
    margin-top: 16px !important;
    margin-bottom: 8px !important;
    font-size: 14px !important;
  }

  .vulnerability-details-content .markdown-preview-wrapper .wmde-markdown p {
    margin: 8px 0 !important;
  }

  .vulnerability-details-content .markdown-preview-wrapper .wmde-markdown ul,
  .vulnerability-details-content .markdown-preview-wrapper .wmde-markdown ol {
    margin: 8px 0 !important;
    padding-left: 1.5em !important;
  }

  .security-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 64px 24px;
    text-align: center;
  }

  .security-empty-icon {
    color: rgb(74, 222, 128);
    margin-bottom: 16px;
  }

  .security-empty-title {
    margin: 0 0 8px 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--vscode-foreground);
  }

  .security-empty-text {
    margin: 0;
    font-size: 14px;
    color: var(--vscode-descriptionForeground);
    max-width: 400px;
  }

  .vulnerability-severity-group {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .vulnerability-row {
    display: flex;
    flex-direction: column;
    background: var(--vscode-sideBar-background);
    border-bottom: 1px solid var(--vscode-widget-border);
  }

  .vulnerability-row:last-child {
    border-bottom: none;
  }

  .vulnerability-row-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    cursor: pointer;
    transition: background 0.15s;
  }

  .vulnerability-row-header:hover {
    background: var(--vscode-list-hoverBackground);
  }

  .vulnerability-row-indicator {
    width: 4px;
    height: 100%;
    min-height: 40px;
    flex-shrink: 0;
  }

  .vulnerability-row.critical .vulnerability-row-indicator {
    background: rgb(239, 68, 68);
  }

  .vulnerability-row.high .vulnerability-row-indicator {
    background: rgb(249, 115, 22);
  }

  .vulnerability-row.moderate .vulnerability-row-indicator {
    background: rgb(234, 179, 8);
  }

  .vulnerability-row.low .vulnerability-row-indicator {
    background: rgb(59, 130, 246);
  }

  .vulnerability-row-content {
    display: flex;
    align-items: center;
    gap: 16px;
    flex: 1;
    flex-wrap: wrap;
    font-size: 13px;
  }

  .vulnerability-row-id {
    min-width: 150px;
    font-family: var(--vscode-editor-font-family);
  }

  .vulnerability-id-link {
    color: var(--vscode-textLink-foreground);
    text-decoration: underline;
    cursor: pointer;
  }

  .vulnerability-id-link:hover {
    color: var(--vscode-textLink-activeForeground);
  }

  .vulnerability-row-package {
    min-width: 120px;
    color: var(--vscode-foreground);
  }

  .vulnerability-row-title {
    flex: 1;
    min-width: 200px;
    color: var(--vscode-foreground);
  }

  .vulnerability-row-published {
    min-width: 100px;
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
  }

  .vulnerability-row-fix {
    min-width: 100px;
  }

  .fix-available-badge {
    display: inline-block;
    padding: 4px 8px;
    background: var(--vscode-editor-inactiveSelectionBackground);
    border-radius: 4px;
    font-size: 11px;
    color: var(--vscode-foreground);
  }

  .vulnerability-row-severity {
    min-width: 180px;
  }

  .vulnerability-severity-badge-inline {
    display: inline-block;
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 600;
  }

  .vulnerability-severity-badge-inline.critical {
    background: rgb(220, 38, 38);
    color: rgb(255, 255, 255);
  }

  .vulnerability-severity-badge-inline.high {
    background: rgb(249, 115, 22);
    color: rgb(255, 255, 255);
  }

  .vulnerability-severity-badge-inline.moderate {
    background: rgb(234, 179, 8);
    color: rgb(0, 0, 0);
  }

  .vulnerability-severity-badge-inline.low {
    background: rgb(59, 130, 246);
    color: rgb(255, 255, 255);
  }

  .vulnerability-row-details {
    padding: 16px 16px 16px 32px;
    background: var(--vscode-editor-inactiveSelectionBackground);
    border-top: 1px solid var(--vscode-widget-border);
  }
`;
