import React from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import type { PackageDetails } from '../../../types/package';

interface DependenciesTabProps {
  details: PackageDetails;
  expandedSections: {
    runtime: boolean;
    dev: boolean;
    peer: boolean;
    optional?: boolean;
  };
  onToggleSection: (section: 'runtime' | 'dev' | 'peer' | 'optional') => void;
  onOpenPackageDetails: (packageName: string) => void;
}

const dependenciesStyles = `
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
`;

export const DependenciesTab: React.FC<DependenciesTabProps> = ({
  details,
  expandedSections,
  onToggleSection,
  onOpenPackageDetails,
}) => {
  const renderDependencyList = (dependencies: Record<string, string>) => (
    <div className="deps-list">
      {Object.entries(dependencies).map(([name, version]) => (
        <div key={name} className="dep-item" onClick={() => onOpenPackageDetails(name)}>
          <span className="dep-name">{name}</span>
          <div className="dep-right">
            <span className="dep-version">{version}</span>
            <ChevronRight size={14} />
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <>
      <style>{dependenciesStyles}</style>
      <div className="deps-wrapper">
      {/* Runtime Dependencies */}
      {details.dependencies && Object.keys(details.dependencies).length > 0 && (
        <div className="deps-section">
          <h3 
            className="deps-section-title"
            onClick={() => onToggleSection('runtime')}
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
          {expandedSections.runtime && renderDependencyList(details.dependencies)}
        </div>
      )}

      {/* Dev Dependencies */}
      {details.devDependencies && Object.keys(details.devDependencies).length > 0 && (
        <div className="deps-section">
          <h3 
            className="deps-section-title"
            onClick={() => onToggleSection('dev')}
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
          {expandedSections.dev && renderDependencyList(details.devDependencies)}
        </div>
      )}

      {/* Peer Dependencies */}
      {details.peerDependencies && Object.keys(details.peerDependencies).length > 0 && (
        <div className="deps-section">
          <h3 
            className="deps-section-title"
            onClick={() => onToggleSection('peer')}
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
          {expandedSections.peer && renderDependencyList(details.peerDependencies)}
        </div>
      )}

      {/* Optional Dependencies */}
      {details.optionalDependencies && Object.keys(details.optionalDependencies).length > 0 && (
        <div className="deps-section">
          <h3 
            className="deps-section-title"
            onClick={() => onToggleSection('optional')}
          >
            <div className="deps-title-left">
              {expandedSections.optional ? (
                <ChevronDown size={16} className="chevron-icon" />
              ) : (
                <ChevronRight size={16} className="chevron-icon" />
              )}
              <span className="deps-title-text">Optional Dependencies</span>
              <span className="deps-count">({Object.keys(details.optionalDependencies).length})</span>
            </div>
          </h3>
          {expandedSections.optional && renderDependencyList(details.optionalDependencies)}
        </div>
      )}

      {/* No Dependencies */}
      {(!details.dependencies || Object.keys(details.dependencies).length === 0) &&
       (!details.devDependencies || Object.keys(details.devDependencies).length === 0) &&
       (!details.peerDependencies || Object.keys(details.peerDependencies).length === 0) &&
       (!details.optionalDependencies || Object.keys(details.optionalDependencies).length === 0) && (
        <div className="empty-tab">{details.name} {details.version} has no dependencies.</div>
      )}
    </div>
    </>
  );
};
