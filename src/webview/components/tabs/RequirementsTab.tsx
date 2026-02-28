import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { PackageDetails, RequirementItem, RequirementSection } from '../../../types/package';

interface RequirementsTabProps {
  details: PackageDetails;
}

const styles = `
  .requirements-wrapper {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .requirements-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .requirements-title {
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

  .requirements-title:hover {
    background: var(--vscode-list-hoverBackground);
    margin: 0 -8px;
    padding: 8px;
    border-radius: 4px;
  }

  .requirements-title-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .requirements-chevron {
    color: var(--vscode-descriptionForeground);
    flex-shrink: 0;
  }

  .requirements-list {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--vscode-widget-border);
    border-radius: 10px;
    overflow: hidden;
  }

  .requirements-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 12px 16px;
    background: var(--vscode-sideBar-background);
    border-bottom: 1px solid var(--vscode-widget-border);
  }

  .requirements-item:last-child {
    border-bottom: none;
  }

  .requirements-left {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .requirements-name {
    color: var(--vscode-textLink-foreground);
    font-size: 13px;
    word-break: break-word;
  }

  .requirements-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
  }

  .requirements-right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .requirements-version {
    font-family: var(--vscode-editor-font-family);
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
  }

  .requirements-empty {
    padding: 32px;
    text-align: center;
    color: var(--vscode-descriptionForeground);
    border: 1px solid var(--vscode-widget-border);
    border-radius: 10px;
  }
`;

export const RequirementsTab: React.FC<RequirementsTabProps> = ({ details }) => {
  const requirements = details.requirements;
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!requirements) {
      setExpandedSections({});
      return;
    }

    setExpandedSections(
      requirements.sections.reduce<Record<string, boolean>>((acc, section) => {
        acc[section.id] = true;
        return acc;
      }, {})
    );
  }, [requirements]);

  if (!requirements || requirements.sections.length === 0) {
    return (
      <>
        <style>{styles}</style>
        <div className="requirements-empty">
          {details.name} {details.version} has no requirements.
        </div>
      </>
    );
  }

  return (
    <>
      <style>{styles}</style>
      <div className="requirements-wrapper">
        {requirements.sections.map((section) => (
          <section key={section.id} className="requirements-section">
            <h3
              className="requirements-title"
              onClick={() =>
                setExpandedSections((prev) => ({
                  ...prev,
                  [section.id]: !prev[section.id],
                }))
              }
            >
              <div className="requirements-title-left">
                {expandedSections[section.id] ? (
                  <ChevronDown size={16} className="requirements-chevron" />
                ) : (
                  <ChevronRight size={16} className="requirements-chevron" />
                )}
                <span>{section.title}</span>
                <span>({section.items.length})</span>
              </div>
            </h3>
            {expandedSections[section.id] && (
              <div className="requirements-list">
                {section.items.map((item) => (
                  <div
                    key={`${section.id}:${item.name}:${item.version || item.requirement || ''}`}
                    className="requirements-item"
                  >
                    <div className="requirements-left">
                      <span className="requirements-name">{item.name}</span>
                      <div className="requirements-meta">
                        {renderMeta(section, item).map((meta) => (
                          <span key={meta}>{meta}</span>
                        ))}
                      </div>
                    </div>
                    <div className="requirements-right">
                      <span className="requirements-version">{item.requirement || item.version || '—'}</span>
                      <ChevronRight size={14} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </>
  );
};

function renderMeta(section: RequirementSection, item: RequirementItem): string[] {
  const meta: string[] = [section.id];
  if (item.scope) meta.push(`scope:${item.scope}`);
  if (item.type) meta.push(`type:${item.type}`);
  if (item.classifier) meta.push(`classifier:${item.classifier}`);
  if (item.optional) meta.push('optional');
  if (item.exclusions && item.exclusions.length > 0) meta.push(`exclusions:${item.exclusions.length}`);
  return meta;
}
