import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, GitBranch, Users } from 'lucide-react';
import type { PackageDetails, DependentSampleItem } from '../../../types/package';

interface DependentsTabProps {
  details: PackageDetails;
  onOpenPackageDetails: (packageName: string) => void;
}

const styles = `
  .dependents-wrapper {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .dependents-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .dependents-section-title {
    display: flex;
    align-items: center;
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--vscode-foreground);
    padding: 8px 0;
    border-bottom: 1px solid var(--vscode-widget-border);
    cursor: pointer;
    user-select: none;
    transition: background 0.15s;
  }

  .dependents-section-title:hover {
    background: var(--vscode-list-hoverBackground);
    margin: 0 -8px;
    padding: 8px;
    border-radius: 4px;
  }

  .dependents-title-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .dependents-chevron {
    color: var(--vscode-descriptionForeground);
    flex-shrink: 0;
  }

  .dependents-count {
    font-size: 12px;
    font-weight: 500;
    color: var(--vscode-descriptionForeground);
    opacity: 0.8;
  }

  .dependents-list {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--vscode-widget-border);
    border-radius: 10px;
    overflow: hidden;
  }

  .dependents-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 12px 16px;
    background: var(--vscode-sideBar-background);
    border-bottom: 1px solid var(--vscode-widget-border);
    cursor: pointer;
  }

  .dependents-item:last-child {
    border-bottom: none;
  }

  .dependents-item:hover {
    background: var(--vscode-list-hoverBackground);
  }

  .dependents-item-name {
    font-size: 13px;
    color: var(--vscode-textLink-foreground);
    word-break: break-word;
  }

  .dependents-item-version {
    font-family: var(--vscode-editor-font-family);
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
    white-space: nowrap;
  }

  .dependents-empty {
    padding: 32px;
    text-align: center;
    color: var(--vscode-descriptionForeground);
    border: 1px solid var(--vscode-widget-border);
    border-radius: 10px;
  }
`;

export const DependentsTab: React.FC<DependentsTabProps> = ({
  details,
  onOpenPackageDetails,
}) => {
  const dependents = details.dependents;
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    direct: true,
    indirect: true,
  });

  useEffect(() => {
    setExpandedSections({
      direct: true,
      indirect: true,
    });
  }, [details.name, details.version]);

  if (!dependents || dependents.totalCount === 0) {
    return (
      <>
        <style>{styles}</style>
        <div className="dependents-empty">
          {details.name} {details.version} has no dependents.
        </div>
      </>
    );
  }

  const renderSampleList = (
    id: 'direct' | 'indirect',
    title: string,
    count: number,
    items: DependentSampleItem[],
    icon: React.ReactNode
  ) => {
    const isExpanded = expandedSections[id];

    return (
      <section className="dependents-section">
        <h3
          className="dependents-section-title"
          onClick={() =>
            setExpandedSections((prev) => ({
              ...prev,
              [id]: !prev[id],
            }))
          }
        >
          <div className="dependents-title-left">
            {isExpanded ? (
              <ChevronDown size={16} className="dependents-chevron" />
            ) : (
              <ChevronRight size={16} className="dependents-chevron" />
            )}
            {icon}
            <span>{title}</span>
            <span className="dependents-count">({count})</span>
          </div>
        </h3>
        {isExpanded && (
          <>
            {items.length > 0 ? (
              <div className="dependents-list">
                {items.map((item) => (
                  <div
                    key={`${item.package.system}:${item.package.name}@${item.version}`}
                    className="dependents-item"
                    onClick={() => onOpenPackageDetails(item.package.name)}
                  >
                    <span className="dependents-item-name">{item.package.name}</span>
                    <span className="dependents-item-version">{item.version}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="dependents-empty">No sampled dependents available.</div>
            )}
          </>
        )}
      </section>
    );
  };

  return (
    <>
      <style>{styles}</style>
      <div className="dependents-wrapper">
        {renderSampleList(
          'direct',
          'Direct Dependents',
          dependents.directCount,
          dependents.directSample,
          <Users size={16} />
        )}
        {renderSampleList(
          'indirect',
          'Indirect Dependents',
          dependents.indirectCount,
          dependents.indirectSample,
          <GitBranch size={16} />
        )}
      </div>
    </>
  );
};
