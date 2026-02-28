import React from 'react';
import { ChevronDown, Database, FolderKanban } from 'lucide-react';
import { useVSCode } from '../context/VSCodeContext';
import type { SourceType, ProjectType } from '../../types/project';
import { PROJECT_SOURCE_MAP } from '../../types/project';

interface SourceSelectorProps {
  compact?: boolean;
}

export const SourceSelector: React.FC<SourceSelectorProps> = ({ compact = false }) => {
  const { sourceInfo, changeSource, changeProjectType, getSourceDisplayName, getProjectTypeDisplayName } = useVSCode();
  const [isOpen, setIsOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  const detectedTypes = sourceInfo.detectedProjectTypes ?? [];
  const hasMultipleProjectTypes = detectedTypes.length > 1;

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSourceChange = (source: SourceType) => {
    changeSource(source);
    setIsOpen(false);
  };

  const handleProjectTypeChange = (projectType: ProjectType) => {
    changeProjectType(projectType);
    setIsOpen(false);
  };

  const sourcesForCurrentType = (PROJECT_SOURCE_MAP[sourceInfo.currentProjectType] ?? []).filter(
    s => sourceInfo.availableSources.includes(s)
  );
  const filteredSources = sourcesForCurrentType.length > 0 ? sourcesForCurrentType : sourceInfo.availableSources;

  if (filteredSources.length === 0 && !hasMultipleProjectTypes) {
    return null;
  }

  const hasMultipleSources = filteredSources.length > 1;

  return (
    <div className="source-selector" ref={dropdownRef}>
      {hasMultipleProjectTypes && (
        <div className="source-selector-project-tabs">
          {detectedTypes.map((type) => (
            <button
              key={type}
              type="button"
              className={`source-selector-project-tab ${type === sourceInfo.currentProjectType ? 'active' : ''}`}
              onClick={() => handleProjectTypeChange(type)}
              title={getProjectTypeDisplayName(type)}
            >
              <FolderKanban size={12} />
              {getProjectTypeDisplayName(type)}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        className="source-selector-button"
        onClick={() => (hasMultipleSources || hasMultipleProjectTypes) && setIsOpen(!isOpen)}
        title={`${getSourceDisplayName(sourceInfo.currentSource)} (${getProjectTypeDisplayName(sourceInfo.currentProjectType)})`}
        style={{ cursor: hasMultipleSources || hasMultipleProjectTypes ? 'pointer' : 'default' }}
      >
        <Database size={14} />
        {!compact && (
          <span className="source-selector-label">
            {getSourceDisplayName(sourceInfo.currentSource)}
          </span>
        )}
        {(hasMultipleSources || hasMultipleProjectTypes) && (
          <ChevronDown size={12} className={`chevron ${isOpen ? 'open' : ''}`} />
        )}
      </button>

      {isOpen && (
        <div className="source-selector-dropdown">
          <div className="source-selector-header">
            <span className="source-selector-project-type">
              {getProjectTypeDisplayName(sourceInfo.currentProjectType)}
            </span>
          </div>
          {filteredSources.map((source) => (
            <button
              key={source}
              type="button"
              className={`source-selector-option ${source === sourceInfo.currentSource ? 'active' : ''}`}
              onClick={() => handleSourceChange(source)}
            >
              <span className="source-name">{getSourceDisplayName(source)}</span>
              {source === sourceInfo.currentSource && (
                <span className="source-badge">Current</span>
              )}
            </button>
          ))}
        </div>
      )}

      <style>{`
        .source-selector {
          position: relative;
          display: inline-flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 6px;
        }

        .source-selector-project-tabs {
          display: inline-flex;
          gap: 2px;
          background: var(--vscode-input-background);
          border: 1px solid var(--vscode-input-border, transparent);
          border-radius: 4px;
          padding: 2px;
        }

        .source-selector-project-tab {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 8px;
          font-size: 11px;
          border: none;
          border-radius: 3px;
          background: transparent;
          color: var(--vscode-foreground);
          cursor: pointer;
          opacity: 0.85;
        }

        .source-selector-project-tab:hover {
          opacity: 1;
          background: var(--vscode-list-hoverBackground);
        }

        .source-selector-project-tab.active {
          background: var(--vscode-list-activeSelectionBackground);
          color: var(--vscode-list-activeSelectionForeground);
          opacity: 1;
        }

        .source-selector-button {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 4px 8px;
          background: var(--vscode-input-background);
          border: 1px solid var(--vscode-input-border, transparent);
          border-radius: 4px;
          color: var(--vscode-foreground);
          font-size: 11px;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .source-selector-button:hover {
          background: var(--vscode-list-hoverBackground);
          border-color: var(--vscode-focusBorder);
        }

        .source-selector-label {
          max-width: 100px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .chevron {
          transition: transform 0.2s ease;
          opacity: 0.7;
        }

        .chevron.open {
          transform: rotate(180deg);
        }

        .source-selector-dropdown {
          position: absolute;
          top: 100%;
          right: 0;
          margin-top: 4px;
          min-width: 160px;
          background: var(--vscode-dropdown-background);
          border: 1px solid var(--vscode-dropdown-border);
          border-radius: 6px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
          z-index: 1000;
          overflow: hidden;
        }

        .source-selector-header {
          padding: 8px 12px;
          border-bottom: 1px solid var(--vscode-widget-border);
          background: var(--vscode-sideBar-background);
        }

        .source-selector-project-type {
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          color: var(--vscode-descriptionForeground);
          letter-spacing: 0.5px;
        }

        .source-selector-option {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          padding: 8px 12px;
          background: transparent;
          border: none;
          color: var(--vscode-foreground);
          font-size: 12px;
          text-align: left;
          cursor: pointer;
          transition: background 0.15s ease;
        }

        .source-selector-option:hover {
          background: var(--vscode-list-hoverBackground);
        }

        .source-selector-option.active {
          background: var(--vscode-list-activeSelectionBackground);
          color: var(--vscode-list-activeSelectionForeground);
        }

        .source-name {
          flex: 1;
        }

        .source-badge {
          font-size: 10px;
          padding: 2px 6px;
          background: var(--vscode-badge-background);
          color: var(--vscode-badge-foreground);
          border-radius: 10px;
        }
      `}</style>
    </div>
  );
};
