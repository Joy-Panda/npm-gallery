import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, GitBranch, Users } from 'lucide-react';
import type { PackageDetails, DependentSampleItem } from '../../../types/package';

interface DependentsTabProps {
  details: PackageDetails;
  onOpenPackageDetails: (packageName: string) => void;
  onOpenExternal?: (url: string) => void;
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

  .dependents-nuget-heading {
    font-size: 13px;
    font-weight: 600;
    color: var(--vscode-foreground);
    margin: 0 0 8px 0;
  }

  .dependents-nuget-sub {
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
    margin-bottom: 12px;
  }

  .dependents-nuget-card {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px 16px;
    background: var(--vscode-sideBar-background);
    border: 1px solid var(--vscode-widget-border);
    border-radius: 8px;
    margin-bottom: 8px;
    cursor: pointer;
  }

  .dependents-nuget-card:hover {
    background: var(--vscode-list-hoverBackground);
  }

  .dependents-nuget-desc {
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
    line-height: 1.4;
  }

  .dependents-nuget-downloads {
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
  }

  .dependents-github-stars {
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
  }
`;

const formatDownloads = (count: number) => {
  if (count >= 1_000_000_000) return `${(count / 1_000_000_000).toFixed(1)}B`;
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toString();
};

export const DependentsTab: React.FC<DependentsTabProps> = ({
  details,
  onOpenPackageDetails,
  onOpenExternal,
}) => {
  const dependents = details.dependents;
  const nugetDependents = details.nugetDependents;
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

  if (nugetDependents && (nugetDependents.nugetPackages?.length > 0 || (nugetDependents.githubRepos?.length ?? 0) > 0)) {
    const totalNuGet = nugetDependents.totalNuGet ?? nugetDependents.nugetPackages.length;
    const totalGitHub = nugetDependents.totalGitHub ?? nugetDependents.githubRepos?.length ?? 0;
    return (
      <>
        <style>{styles}</style>
        <div className="dependents-wrapper">
          {nugetDependents.nugetPackages.length > 0 && (
            <section className="dependents-section">
              <h3 className="dependents-nuget-heading">
                NuGet packages ({totalNuGet})
              </h3>
              <p className="dependents-nuget-sub">
                Showing the top {Math.min(5, nugetDependents.nugetPackages.length)} NuGet packages that depend on {details.name}:
              </p>
              <div className="dependents-list">
                {nugetDependents.nugetPackages.slice(0, 5).map((pkg) => (
                  <div
                    key={pkg.name}
                    className="dependents-nuget-card"
                    onClick={() => onOpenPackageDetails(pkg.name)}
                  >
                    <span className="dependents-item-name">{pkg.name}</span>
                    {pkg.description && (
                      <span className="dependents-nuget-desc">{pkg.description}</span>
                    )}
                    {pkg.downloads !== undefined && (
                      <span className="dependents-nuget-downloads">Downloads: {formatDownloads(pkg.downloads)}</span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
          {(nugetDependents.githubRepos?.length ?? 0) > 0 && (
            <section className="dependents-section">
              <h3 className="dependents-nuget-heading">
                GitHub repositories ({totalGitHub})
              </h3>
              <p className="dependents-nuget-sub">
                Showing the top {Math.min(20, nugetDependents.githubRepos!.length)} popular GitHub repositories that depend on {details.name}:
              </p>
              <div className="dependents-list">
                {nugetDependents.githubRepos!.slice(0, 20).map((repo) => (
                  <div
                    key={repo.fullName ?? repo.name}
                    className="dependents-nuget-card"
                    onClick={() => repo.url && (onOpenExternal ? onOpenExternal(repo.url!) : window.open(repo.url))}
                    role={repo.url ? 'button' : undefined}
                  >
                    <span className="dependents-item-name">{repo.fullName ?? repo.name}</span>
                    {repo.description && (
                      <span className="dependents-nuget-desc">{repo.description}</span>
                    )}
                    {repo.stars !== undefined && (
                      <span className="dependents-github-stars">Stars: {formatDownloads(repo.stars)}</span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </>
    );
  }

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
