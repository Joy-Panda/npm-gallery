import React, { useState, useEffect } from 'react';
import {
  ShieldCheck, ShieldAlert,
  Layers, Loader2, BookOpen,
  GitBranch
} from 'lucide-react';
import type { DependencyType, PackageDetails, Vulnerability } from '../../types/package';
import { useVSCode } from '../context/VSCodeContext';
import { PackageHeader } from './PackageHeader';
import { PackageSidebar } from './PackageSidebar';
import { ReadmeTab } from './tabs/ReadmeTab';
import { VersionsTab } from './tabs/VersionsTab';
import { DependenciesTab } from './tabs/DependenciesTab';
import { SecurityTab } from './tabs/SecurityTab';
import { DependentsTab } from './tabs/DependentsTab';
import { RequirementsTab } from './tabs/RequirementsTab';

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
  const { sourceInfo } = useVSCode();
  const [details, setDetails] = useState<PackageDetails | null>(initialData || null);
  const [activeTab, setActiveTab] = useState<'readme' | 'versions' | 'dependencies' | 'requirements' | 'dependents' | 'security'>('readme');
  /** When true, opened from vulnerability CodeLens — show only Security tab, no full package details */
  const [securityOnlyView, setSecurityOnlyView] = useState(false);

  // In the standalone details panel, sourceInfo may not be populated yet.
  // If security data is already present on the details payload, still show the tab.
  const supportsSecurity =
    sourceInfo.supportedCapabilities.includes('security') || !!details?.security;
  const supportsInstallation = sourceInfo.supportedCapabilities.includes('installation');
  const supportedInstallTypes: DependencyType[] =
    sourceInfo.currentProjectType === 'npm'
      ? ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']
      : ['dependencies'];
  const [isLoading, setIsLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [expandedSections, setExpandedSections] = useState<{
    runtime: boolean;
    dev: boolean;
    peer: boolean;
    optional?: boolean;
  }>({
    runtime: true,
    dev: true,
    peer: true,
    optional: true,
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
          setSecurityOnlyView(!!message.securityOnlyView);
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

  const install = (type: DependencyType, version?: string) => {
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

  const openPackageDetails = (packageName: string) => {
    vscode.postMessage({ type: 'openPackageDetails', packageName });
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

  const depsCount = details.dependencies ? Object.keys(details.dependencies).length : 0;
  const isSecure = !details.security || details.security.summary.total === 0;

  // Opened from vulnerability CodeLens: only show Security tab (no full package details/tabs/sidebar).
  // Do not require supportsSecurity — package-details webview may not receive sourceInfo, and we already have security data for the installed version.
  if (securityOnlyView) {
    return (
      <>
        <style>{styles}</style>
        <div className="package-view security-only-view">
          <div className="security-only-header">
            {isSecure ? <ShieldCheck size={20} /> : <ShieldAlert size={20} />}
            <span className="security-only-title">
              Vulnerabilities — {details.name}@{details.version}
            </span>
          </div>
          <div className="tab-content security-only-content">
            <SecurityTab
              details={details}
              expandedVulnerabilities={expandedVulnerabilities}
              expandedSeverityTypes={expandedSeverityTypes}
              onToggleVulnerability={toggleVulnerability}
              onToggleSeverityType={toggleSeverityType}
              onOpenExternal={openExternal}
              formatRelativeTime={formatRelativeTime}
              groupVulnerabilitiesBySeverity={groupVulnerabilitiesBySeverity}
            />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{styles}</style>
      <div className="package-view">
        <PackageHeader
          details={details}
          installing={installing}
          onInstall={install}
          formatDownloads={formatDownloads}
          formatBytes={formatBytes}
          supportedInstallTypes={supportedInstallTypes}
          showInstall={supportsInstallation}
          installTargetLabel={
            sourceInfo.installTarget
              ? `${sourceInfo.installTarget.label} (${sourceInfo.installTarget.packageManager})`
              : undefined
          }
        />

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
                <span className="tab-badge">{depsCount}</span>
              </button>
              <button
                className={`tab ${activeTab === 'requirements' ? 'active' : ''}`}
                onClick={() => setActiveTab('requirements')}
              >
                <Layers size={14} />
                Requirements
                <span className="tab-badge">
                  {details.requirements
                    ? details.requirements.sections.reduce((count, section) => count + section.items.length, 0)
                    : 0}
                </span>
              </button>
              {details.dependents && (
                <button
                  className={`tab ${activeTab === 'dependents' ? 'active' : ''}`}
                  onClick={() => setActiveTab('dependents')}
                >
                  <GitBranch size={14} />
                  Dependents
                  <span className="tab-badge">{details.dependents.totalCount}</span>
                </button>
              )}
              {supportsSecurity && (
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
              )}
            </div>

            {/* Tab Content */}
            <div className="tab-content">
              {activeTab === 'readme' && <ReadmeTab details={details} onOpenExternal={openExternal} />}
              {activeTab === 'versions' && (
                <VersionsTab
                  details={details}
                  onInstall={install}
                  formatRelativeTime={formatRelativeTime}
                  formatFullDate={formatFullDate}
                  supportedInstallTypes={supportedInstallTypes}
                  showInstall={supportsInstallation}
                />
              )}
              {activeTab === 'dependencies' && (
                <DependenciesTab
                  details={details}
                  expandedSections={expandedSections}
                  onToggleSection={(section) => setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }))}
                  onOpenPackageDetails={openPackageDetails}
                />
              )}
              {activeTab === 'requirements' && (
                <RequirementsTab details={details} />
              )}
              {activeTab === 'dependents' && (
                <DependentsTab
                  details={details}
                  onOpenPackageDetails={openPackageDetails}
                />
              )}
              {activeTab === 'security' && supportsSecurity && (
                <SecurityTab
                  details={details}
                  expandedVulnerabilities={expandedVulnerabilities}
                  expandedSeverityTypes={expandedSeverityTypes}
                  onToggleVulnerability={toggleVulnerability}
                  onToggleSeverityType={toggleSeverityType}
                  onOpenExternal={openExternal}
                  formatRelativeTime={formatRelativeTime}
                  groupVulnerabilitiesBySeverity={groupVulnerabilitiesBySeverity}
                />
              )}
            </div>
          </main>

          <PackageSidebar
            details={details}
            detectedPackageManager={sourceInfo.detectedPackageManager}
            onOpenExternal={openExternal}
            formatBytes={formatBytes}
            formatRelativeTime={formatRelativeTime}
            formatFullDate={formatFullDate}
          />
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
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: thin;
    white-space: nowrap;
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
    flex-shrink: 0;
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

  .security-only-view {
    display: flex;
    flex-direction: column;
  }

  .security-only-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 24px;
    background: var(--vscode-editor-background);
    border-bottom: 1px solid var(--vscode-widget-border);
    flex-shrink: 0;
  }

  .security-only-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--vscode-foreground);
  }

  .security-only-content {
    flex: 1;
    min-height: 0;
  }
`;
