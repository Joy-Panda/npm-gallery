import React from 'react';
import { ShieldCheck, ChevronRight, ChevronDown } from 'lucide-react';
import { MarkdownPreview } from '../MarkdownPreview';
import type { PackageDetails, Vulnerability } from '../../../types/package';

interface SecurityTabProps {
  details: PackageDetails;
  expandedVulnerabilities: Set<number>;
  expandedSeverityTypes: Set<string>;
  onToggleVulnerability: (vulnId: number) => void;
  onToggleSeverityType: (severity: string) => void;
  onOpenExternal: (url: string) => void;
  formatRelativeTime: (dateString?: string) => string;
  groupVulnerabilitiesBySeverity: (vulnerabilities: Vulnerability[]) => Record<string, Vulnerability[]>;
}

const securityStyles = `
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
`;

export const SecurityTab: React.FC<SecurityTabProps> = ({
  details,
  expandedVulnerabilities,
  expandedSeverityTypes,
  onToggleVulnerability,
  onToggleSeverityType,
  onOpenExternal,
  formatRelativeTime,
  groupVulnerabilitiesBySeverity,
}) => {
  if (!details.security || details.security.summary.total === 0) {
    return (
      <>
        <style>{securityStyles}</style>
        <div className="security-empty">
          <ShieldCheck size={48} className="security-empty-icon" />
          <h3 className="security-empty-title">No Vulnerabilities Found</h3>
          <p className="security-empty-text">This package appears to be secure with no known vulnerabilities.</p>
        </div>
      </>
    );
  }

  const grouped = groupVulnerabilitiesBySeverity(details.security.vulnerabilities);
  const severityOrder = ['critical', 'high', 'moderate', 'low', 'info'];

  return (
    <>
      <style>{securityStyles}</style>
      <div className="security-wrapper">
      {/* Security Summary */}
      <div className="security-summary">
        <h3 className="security-summary-title">Security Overview</h3>
        <div className="security-stats">
          {details.security.summary.critical > 0 && (
            <div 
              className={`security-stat critical ${expandedSeverityTypes.has('critical') ? 'expanded' : ''}`}
              onClick={() => onToggleSeverityType('critical')}
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
              onClick={() => onToggleSeverityType('high')}
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
              onClick={() => onToggleSeverityType('moderate')}
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
              onClick={() => onToggleSeverityType('low')}
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
        {severityOrder.map(severity => {
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
                      onClick={() => onToggleVulnerability(vuln.id)}
                    >
                      <div className="vulnerability-row-indicator" />
                      <div className="vulnerability-row-content">
                        <div className="vulnerability-row-id">
                          {vuln.url ? (
                            <a 
                              href="#" 
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenExternal(vuln.url!);
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
        })}
      </div>
    </div>
    </>
  );
};
