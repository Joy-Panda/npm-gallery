import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/globals.css';
import type {
  DependencyAnalyzerData,
  DependencyAnalyzerNode,
  DependencyAnalyzerPayload,
} from '../types/analyzer';
import type { WorkspaceProjectNode } from '../types/workspace';

interface VSCodeAPI {
  postMessage: (message: unknown) => void;
}

declare global {
  interface Window {
    acquireVsCodeApi?: () => VSCodeAPI;
  }
}

const vscode = window.acquireVsCodeApi?.();

type MainMode = 'workspace' | 'manifest';
type ManifestViewMode = 'analyzer' | 'text';

const App: React.FC = () => {
  const [data, setData] = useState<DependencyAnalyzerPayload | null>(null);
  const [mode, setMode] = useState<MainMode>('workspace');
  const [manifestViewMode, setManifestViewMode] = useState<ManifestViewMode>('analyzer');
  const [search, setSearch] = useState('');
  const [onlyConflicts, setOnlyConflicts] = useState(false);
  const [directOnly, setDirectOnly] = useState(false);
  const [hideDevRoots, setHideDevRoots] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    const handler = (event: MessageEvent<{ type: string; data?: DependencyAnalyzerPayload }>) => {
      if (event.data.type === 'analyzerData' && event.data.data) {
        setData(event.data.data);
        setMode(event.data.data.initialMode);
        setExpanded(new Set());
      }
    };

    window.addEventListener('message', handler);
    vscode?.postMessage({ type: 'ready' });
    return () => window.removeEventListener('message', handler);
  }, []);

  const filteredProjects = useMemo(() => {
    if (!data) return [];
    return data.workspaceGraph.projects.filter((project) =>
      matchesWorkspaceProject(project, search)
    );
  }, [data, search]);

  const filteredAnalyzer = useMemo(() => {
    if (!data?.dependencyAnalyzer) return null;
    return filterDependencyAnalyzer(data.dependencyAnalyzer, {
      search,
      onlyConflicts,
      directOnly,
      hideDevRoots,
    });
  }, [data, search, onlyConflicts, directOnly, hideDevRoots]);

  const toggle = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  if (!data) {
    return (
      <div className="analyzer-shell">
        <div className="empty-state">Loading analyzer...</div>
      </div>
    );
  }

  const manifestAnalyzer = data.dependencyAnalyzer;

  return (
    <div className="analyzer-shell">
      <style>{styles}</style>
      <header className="analyzer-header">
        <div className="top-tabs">
          <button
            className={mode === 'workspace' ? 'tab active' : 'tab'}
            onClick={() => setMode('workspace')}
          >
            Workspace Graph
          </button>
          <button
            className={mode === 'manifest' ? 'tab active' : 'tab'}
            onClick={() => setMode('manifest')}
            disabled={!manifestAnalyzer}
          >
            Manifest Analyzer
          </button>
        </div>
        <div className="toolbar">
          <input
            className="search-input"
            placeholder={
              mode === 'workspace'
                ? 'Filter projects, local deps, mismatches...'
                : 'Filter dependency tree, package names, versions, conflicts...'
            }
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <button className="action-btn" onClick={() => vscode?.postMessage({ type: 'refresh' })}>
            Refresh
          </button>
        </div>
      </header>

      {mode === 'workspace' ? (
        <div className="content-grid">
          <section className="panel">
            <h2>Projects</h2>
            <div className="project-list">
              {filteredProjects.map((project) => (
                <button
                  key={project.manifestPath}
                  className="project-card"
                  onClick={() => vscode?.postMessage({ type: 'openManifest', manifestPath: project.manifestPath })}
                >
                  <div className="project-name">{project.name}</div>
                  <div className="project-meta">
                    <span>{project.relativePath}</span>
                    <span>{project.tool}</span>
                  </div>
                  <div className="project-links">
                    <span>Local deps: {project.localDependencies.length}</span>
                    <span>Dependents: {project.localDependents.length}</span>
                  </div>
                </button>
              ))}
              {filteredProjects.length === 0 && <div className="empty-state">No matching projects.</div>}
            </div>
          </section>

          <section className="panel">
            <h2>Version Alignment Issues</h2>
            <div className="issue-list">
              {data.workspaceGraph.alignmentIssues
                .filter((issue) =>
                  !search ||
                  issue.packageName.toLowerCase().includes(search.toLowerCase()) ||
                  issue.specs.some((spec) => spec.toLowerCase().includes(search.toLowerCase()))
                )
                .map((issue) => (
                  <div key={issue.packageName} className="issue-card">
                    <div className="issue-header">
                      <div>
                        <div className="issue-name">{issue.packageName}</div>
                        <div className="issue-specs">{issue.specs.join('  •  ')}</div>
                      </div>
                      {issue.specs[0] && (
                        <button
                          className="mini-btn"
                          onClick={() =>
                            vscode?.postMessage({
                              type: 'alignDependency',
                              packageName: issue.packageName,
                              targetVersion: issue.specs[0],
                            })
                          }
                        >
                          Align
                        </button>
                      )}
                    </div>
                    <div className="issue-consumers">
                      {issue.consumers.map((consumer) => (
                        <div key={`${consumer.manifestPath}:${consumer.type}:${consumer.spec}`} className="consumer-row">
                          <span>{consumer.manifestName}</span>
                          <span>{consumer.type}</span>
                          <code>{consumer.spec}</code>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              {data.workspaceGraph.alignmentIssues.length === 0 && (
                <div className="empty-state">No version mismatches.</div>
              )}
            </div>
          </section>
        </div>
      ) : (
        <div className="manifest-shell">
          <div className="manifest-header">
            <div>
              <div className="manifest-title">{manifestAnalyzer?.manifestName || 'Manifest Analyzer'}</div>
              <div className="manifest-meta">
                <span>{manifestAnalyzer?.packageManager || 'unknown'}</span>
                {data.activeManifestPath && (
                  <span>{data.activeManifestPath}</span>
                )}
              </div>
            </div>
            <div className="top-tabs">
              <button
                className={manifestViewMode === 'analyzer' ? 'tab active' : 'tab'}
                onClick={() => setManifestViewMode('analyzer')}
              >
                Analyzer
              </button>
              <button
                className={manifestViewMode === 'text' ? 'tab active' : 'tab'}
                onClick={() => setManifestViewMode('text')}
              >
                package.json
              </button>
            </div>
          </div>

          {manifestViewMode === 'text' ? (
            <section className="panel code-panel">
              <pre className="code-block"><code>{data.manifestText || 'No package.json content available.'}</code></pre>
            </section>
          ) : (
            <>
              <div className="filter-bar">
                <label className="filter-chip">
                  <input
                    type="checkbox"
                    checked={onlyConflicts}
                    onChange={(event) => setOnlyConflicts(event.target.checked)}
                  />
                  <span>Only conflicts</span>
                </label>
                <label className="filter-chip">
                  <input
                    type="checkbox"
                    checked={directOnly}
                    onChange={(event) => setDirectOnly(event.target.checked)}
                  />
                  <span>Direct only</span>
                </label>
                <label className="filter-chip">
                  <input
                    type="checkbox"
                    checked={hideDevRoots}
                    onChange={(event) => setHideDevRoots(event.target.checked)}
                  />
                  <span>Hide dev roots</span>
                </label>
              </div>

              <div className="content-grid">
                <section className="panel">
                  <h2>Dependency Tree</h2>
                  {filteredAnalyzer ? (
                    filteredAnalyzer.nodes.length > 0 ? (
                      <DependencyTree nodes={filteredAnalyzer.nodes} expanded={expanded} onToggle={toggle} />
                    ) : (
                      <div className="empty-state">No dependencies match the current filter.</div>
                    )
                  ) : (
                    <div className="empty-state">Open a `package.json` project to inspect its dependency tree.</div>
                  )}
                </section>

                <section className="panel">
                  <h2>Conflicts</h2>
                  {filteredAnalyzer ? (
                    filteredAnalyzer.conflicts.length > 0 ? (
                      <div className="issue-list">
                        {filteredAnalyzer.conflicts.map((conflict) => (
                          <div key={conflict.name} className="issue-card">
                            <div className="issue-header">
                              <div className="issue-name conflict">{conflict.name}</div>
                              <div className="issue-specs">{conflict.versions.join('  •  ')}</div>
                            </div>
                            <div className="issue-consumers">
                              {conflict.occurrences.map((occurrence, index) => (
                                <div key={`${conflict.name}:${occurrence.version}:${index}`} className="consumer-row conflict-row">
                                  <code>{occurrence.version}</code>
                                  <span>{occurrence.path.join(' > ')}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="empty-state">No recursive version conflicts detected.</div>
                    )
                  ) : (
                    <div className="empty-state">No analyzer data available.</div>
                  )}
                </section>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

function matchesWorkspaceProject(project: WorkspaceProjectNode, search: string): boolean {
  if (!search) return true;
  const query = search.toLowerCase();
  return (
    project.name.toLowerCase().includes(query) ||
    project.relativePath.toLowerCase().includes(query) ||
    project.localDependencies.some((dep) => dep.toLowerCase().includes(query)) ||
    project.localDependents.some((dep) => dep.toLowerCase().includes(query))
  );
}

function filterDependencyAnalyzer(
  analyzer: DependencyAnalyzerData,
  options: {
    search: string;
    onlyConflicts: boolean;
    directOnly: boolean;
    hideDevRoots: boolean;
  }
): DependencyAnalyzerData {
  let rootNodes = analyzer.nodes;

  if (options.hideDevRoots) {
    rootNodes = rootNodes.filter((node) => node.dependencyType !== 'devDependencies');
  }

  if (options.directOnly) {
    rootNodes = rootNodes.map((node) => ({ ...node, children: [] }));
  }

  const query = options.search.trim().toLowerCase();
  const nodes = rootNodes
    .map((node) => filterDependencyNode(node, query, options.onlyConflicts))
    .filter((node): node is DependencyAnalyzerNode => node !== null);

  const conflicts = analyzer.conflicts.filter((conflict) => {
    if (options.onlyConflicts === false && !query) {
      return true;
    }

    const matchesQuery =
      !query ||
      conflict.name.toLowerCase().includes(query) ||
      conflict.versions.some((version) => version.toLowerCase().includes(query)) ||
      conflict.occurrences.some((occurrence) =>
        occurrence.path.some((segment) => segment.toLowerCase().includes(query))
      );

    return matchesQuery;
  });

  return {
    ...analyzer,
    nodes,
    conflicts,
  };
}

function filterDependencyNode(
  node: DependencyAnalyzerNode,
  query: string,
  onlyConflicts: boolean
): DependencyAnalyzerNode | null {
  const children = node.children
    .map((child) => filterDependencyNode(child, query, onlyConflicts))
    .filter((child): child is DependencyAnalyzerNode => child !== null);

  const selfMatches =
    !query ||
    node.name.toLowerCase().includes(query) ||
    node.version.toLowerCase().includes(query);
  const conflictMatches = !onlyConflicts || node.isConflict || children.length > 0;

  if ((!selfMatches && children.length === 0) || !conflictMatches) {
    return null;
  }

  return {
    ...node,
    children,
  };
}

const DependencyTree: React.FC<{
  nodes: DependencyAnalyzerNode[];
  expanded: Set<string>;
  onToggle: (id: string) => void;
  depth?: number;
}> = ({ nodes, expanded, onToggle, depth = 0 }) => {
  return (
    <div className="tree">
      {nodes.map((node) => {
        const isExpanded = expanded.has(node.id) || depth < 1;
        const hasChildren = node.children.length > 0;
        return (
          <div key={`${node.id}:${depth}`} className="tree-node">
            <div
              className={node.isConflict ? 'tree-row conflict' : 'tree-row'}
              style={{ paddingLeft: `${depth * 16}px` }}
              onClick={() => hasChildren && onToggle(node.id)}
            >
              <span className="tree-toggle">{hasChildren ? (isExpanded ? '▾' : '▸') : '•'}</span>
              <span className="tree-name">{node.name}</span>
              <span className="tree-version">{node.version}</span>
              {node.dependencyType && depth === 0 && (
                <span className="tree-type">{node.dependencyType}</span>
              )}
              {node.isConflict && <span className="tree-badge">conflict</span>}
            </div>
            {hasChildren && isExpanded && (
              <DependencyTree nodes={node.children} expanded={expanded} onToggle={onToggle} depth={depth + 1} />
            )}
          </div>
        );
      })}
    </div>
  );
};

const styles = `
  :root { color-scheme: dark; }
  body {
    margin: 0;
    padding: 0;
    background: var(--vscode-editor-background);
    color: var(--vscode-foreground);
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
  }
  .analyzer-shell {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background:
      radial-gradient(circle at top left, rgba(28, 131, 225, 0.08), transparent 28%),
      linear-gradient(180deg, var(--vscode-editor-background), var(--vscode-sideBar-background));
  }
  .analyzer-header, .manifest-header {
    position: sticky;
    top: 0;
    z-index: 2;
    padding: 16px;
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--vscode-widget-border);
    background: rgba(24, 24, 24, 0.88);
    backdrop-filter: blur(10px);
  }
  .manifest-shell {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .manifest-title { font-size: 16px; font-weight: 700; }
  .manifest-meta {
    margin-top: 4px;
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .top-tabs { display: flex; gap: 8px; }
  .tab, .action-btn, .mini-btn {
    appearance: none;
    border: 1px solid var(--vscode-button-border, transparent);
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    padding: 8px 12px;
    border-radius: 10px;
    cursor: pointer;
  }
  .tab.active {
    background: linear-gradient(135deg, rgba(24, 123, 213, 0.9), rgba(24, 123, 213, 0.58));
    color: white;
  }
  .toolbar {
    display: flex;
    gap: 8px;
    align-items: center;
    flex: 1;
    justify-content: flex-end;
  }
  .search-input {
    min-width: 260px;
    max-width: 420px;
    width: 100%;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid var(--vscode-input-border);
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
  }
  .filter-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 12px 16px 0;
  }
  .filter-chip {
    display: inline-flex;
    gap: 8px;
    align-items: center;
    padding: 6px 10px;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 999px;
    background: rgba(255,255,255,0.03);
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
  }
  .content-grid {
    display: grid;
    grid-template-columns: 1.1fr 0.9fr;
    gap: 16px;
    padding: 16px;
  }
  .panel {
    min-height: 0;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    background: rgba(17, 22, 28, 0.72);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
    padding: 16px;
    overflow: auto;
  }
  .code-panel { margin: 16px; }
  .code-block {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 12px;
    line-height: 1.6;
    color: var(--vscode-editor-foreground);
  }
  .panel h2 {
    margin: 0 0 16px;
    font-size: 14px;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: var(--vscode-descriptionForeground);
  }
  .project-list, .issue-list { display: flex; flex-direction: column; gap: 10px; }
  .project-card, .issue-card {
    text-align: left;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.03);
    color: inherit;
    padding: 12px 14px;
  }
  .project-card { cursor: pointer; }
  .project-name, .issue-name { font-weight: 700; font-size: 14px; }
  .project-meta, .project-links, .issue-specs, .consumer-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
    margin-top: 6px;
  }
  .issue-header { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
  .tree { display: flex; flex-direction: column; gap: 4px; }
  .tree-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 10px;
    cursor: pointer;
  }
  .tree-row:hover { background: rgba(255, 255, 255, 0.04); }
  .tree-row.conflict, .issue-name.conflict, .conflict-row code { color: #ff6b6b; }
  .tree-toggle { width: 14px; flex-shrink: 0; color: var(--vscode-descriptionForeground); }
  .tree-name { font-weight: 600; }
  .tree-version { color: var(--vscode-descriptionForeground); }
  .tree-type {
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 999px;
    padding: 2px 6px;
  }
  .tree-badge {
    margin-left: auto;
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 999px;
    background: rgba(255, 107, 107, 0.15);
    color: #ff6b6b;
  }
  .empty-state {
    padding: 16px;
    border: 1px dashed rgba(255,255,255,0.12);
    border-radius: 12px;
    color: var(--vscode-descriptionForeground);
    text-align: center;
  }
  @media (max-width: 900px) {
    .content-grid { grid-template-columns: 1fr; }
    .toolbar { width: 100%; justify-content: stretch; }
    .search-input { max-width: none; }
  }
`;

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(<App />);
}
