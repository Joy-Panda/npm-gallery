import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/globals.css';
import type {
  DependencyAnalyzerData,
  DependencyAnalyzerNode,
  DependencyAnalyzerPayload,
} from '../types/analyzer';

interface VSCodeAPI {
  postMessage: (message: unknown) => void;
}

declare global {
  interface Window {
    acquireVsCodeApi?: () => VSCodeAPI;
  }
}

const vscode = window.acquireVsCodeApi?.();

type EditorTab = 'text' | 'analyzer';

const App: React.FC = () => {
  const [payload, setPayload] = useState<DependencyAnalyzerPayload | null>(null);
  const [activeTab, setActiveTab] = useState<EditorTab>('text');
  const [textValue, setTextValue] = useState('');
  const [search, setSearch] = useState('');
  const [onlyConflicts, setOnlyConflicts] = useState(false);
  const [directOnly, setDirectOnly] = useState(false);
  const [hideDevRoots, setHideDevRoots] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const lastDocumentTextRef = useRef('');

  useEffect(() => {
    const handler = (event: MessageEvent<{ type: string; data?: DependencyAnalyzerPayload }>) => {
      if (event.data.type === 'document' && event.data.data) {
        setPayload(event.data.data);
        setActiveTab(event.data.data.initialEditorTab || 'text');
        const documentText = event.data.data.manifestText || '';
        const previousDocumentText = lastDocumentTextRef.current;
        lastDocumentTextRef.current = documentText;
        setTextValue((current) => (current === previousDocumentText ? documentText : current));
      }
    };

    window.addEventListener('message', handler);
    vscode?.postMessage({ type: 'ready' });
    return () => window.removeEventListener('message', handler);
  }, []);

  useEffect(() => {
    if (activeTab !== 'text') {
      return;
    }

    if (textValue === lastDocumentTextRef.current) {
      return;
    }

    const handle = window.setTimeout(() => {
      vscode?.postMessage({ type: 'updateText', text: textValue });
    }, 250);

    return () => window.clearTimeout(handle);
  }, [textValue, activeTab]);

  const analyzer = payload?.dependencyAnalyzer || null;
  const filteredAnalyzer = useMemo(() => {
    if (!analyzer) return null;
    return filterDependencyAnalyzer(analyzer, {
      search,
      onlyConflicts,
      directOnly,
      hideDevRoots,
    });
  }, [analyzer, search, onlyConflicts, directOnly, hideDevRoots]);

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

  if (!payload) {
    return (
      <div className="editor-shell">
        <div className="empty-state">Loading package.json editor...</div>
      </div>
    );
  }

  return (
    <div className="editor-shell">
      <style>{styles}</style>
      <header className="editor-header">
        <div className="editor-chrome">
          <div className="editor-tabstrip">
            <button
              className={activeTab === 'text' ? 'editor-tab active' : 'editor-tab'}
              onClick={() => setActiveTab('text')}
            >
              Text
            </button>
            <button
              className={activeTab === 'analyzer' ? 'editor-tab active' : 'editor-tab'}
              onClick={() => setActiveTab('analyzer')}
            >
              Dependency Analyzer
            </button>
          </div>
          <div className="editor-statusline">
            <span>{payload.activeManifestPath?.split(/[\\/]/).pop() || 'package.json'}</span>
            {analyzer?.packageManager && <span>{analyzer.packageManager}</span>}
          </div>
        </div>
        <div className="toolbar">
          {activeTab === 'analyzer' && (
            <input
              className="search-input"
              placeholder="Filter dependency tree, versions, conflicts..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          )}
          <button className="action-btn" onClick={() => vscode?.postMessage({ type: 'refresh' })}>
            Refresh
          </button>
        </div>
      </header>

      {activeTab === 'text' ? (
        <div className="text-pane">
          <textarea
            className="editor-textarea"
            value={textValue}
            onChange={(event) => setTextValue(event.target.value)}
            spellCheck={false}
          />
        </div>
      ) : (
        <div className="analyzer-pane">
          <div className="manifest-meta">
            <span>{analyzer?.manifestName || 'package.json'}</span>
            <span>{analyzer?.packageManager || 'unknown'}</span>
            {payload.activeManifestPath && <span>{payload.activeManifestPath}</span>}
          </div>
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
                <div className="empty-state">No analyzer data available.</div>
              )}
            </section>
            <section className="panel">
              <h2>Conflicts</h2>
              {filteredAnalyzer ? (
                filteredAnalyzer.conflicts.length > 0 ? (
                  <div className="issue-list">
                    {filteredAnalyzer.conflicts.map((conflict) => (
                      <div key={conflict.name} className="issue-card">
                        <div className="issue-name conflict">{conflict.name}</div>
                        <div className="issue-specs">{conflict.versions.join('  •  ')}</div>
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
        </div>
      )}
    </div>
  );
};

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
  :root {
    --editor-strip: color-mix(in srgb, var(--vscode-tab-inactiveBackground, #1b1b1b) 88%, black);
    --editor-border: color-mix(in srgb, var(--vscode-widget-border, #2a2a2a) 78%, transparent);
    --editor-accent: var(--vscode-tab-activeBorder, var(--vscode-focusBorder, #3794ff));
    --editor-active-bg: color-mix(in srgb, var(--vscode-editor-background) 92%, white 8%);
    --editor-hover-bg: color-mix(in srgb, var(--vscode-list-hoverBackground, #2a2d2e) 86%, transparent);
  }
  body {
    margin: 0;
    padding: 0;
    background: var(--vscode-editor-background);
    color: var(--vscode-foreground);
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
  }
  .editor-shell {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--vscode-editor-background);
  }
  .editor-header {
    display: flex;
    flex-direction: column;
    border-bottom: 1px solid var(--editor-border);
    background: var(--editor-strip);
  }
  .editor-chrome {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 12px;
    min-height: 40px;
    padding: 0 10px;
    border-bottom: 1px solid var(--editor-border);
  }
  .editor-tabstrip {
    display: flex;
    align-items: flex-end;
    gap: 1px;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .editor-tabstrip::-webkit-scrollbar { display: none; }
  .editor-tab, .action-btn {
    appearance: none;
    border: 1px solid transparent;
    background: transparent;
    color: var(--vscode-tab-inactiveForeground, var(--vscode-foreground));
    padding: 9px 14px 10px;
    border-radius: 8px 8px 0 0;
    cursor: pointer;
    position: relative;
    white-space: nowrap;
  }
  .editor-tab:hover {
    background: var(--editor-hover-bg);
    color: var(--vscode-tab-activeForeground, var(--vscode-foreground));
  }
  .editor-tab.active {
    background: var(--editor-active-bg);
    color: var(--vscode-tab-activeForeground, var(--vscode-foreground));
    border-color: var(--editor-border);
    border-bottom-color: var(--editor-active-bg);
  }
  .editor-tab.active::before {
    content: '';
    position: absolute;
    left: 10px;
    right: 10px;
    top: 0;
    height: 2px;
    border-radius: 999px;
    background: var(--editor-accent);
  }
  .editor-statusline {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    padding: 0 0 10px;
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    white-space: nowrap;
  }
  .toolbar {
    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: flex-end;
    padding: 10px 12px;
    background: color-mix(in srgb, var(--vscode-editor-background) 94%, transparent);
  }
  .action-btn {
    border: 1px solid var(--editor-border);
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border-radius: 8px;
    padding: 8px 12px;
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
  .text-pane {
    flex: 1;
    padding: 0;
  }
  .editor-textarea {
    width: 100%;
    min-height: calc(100vh - 96px);
    resize: none;
    border: none;
    outline: none;
    background: transparent;
    color: var(--vscode-editor-foreground);
    padding: 20px 24px;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: var(--vscode-editor-font-size, 13px);
    line-height: 1.6;
    box-sizing: border-box;
  }
  .analyzer-pane { display: flex; flex-direction: column; }
  .manifest-meta {
    padding: 12px 16px 0;
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
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
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 16px;
    background: rgba(17, 22, 28, 0.72);
    padding: 16px;
    overflow: auto;
  }
  .panel h2 {
    margin: 0 0 16px;
    font-size: 14px;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: var(--vscode-descriptionForeground);
  }
  .tree { display: flex; flex-direction: column; gap: 4px; }
  .tree-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 10px;
    cursor: pointer;
  }
  .tree-row:hover { background: rgba(255,255,255,0.04); }
  .tree-row.conflict, .conflict-row code, .issue-name.conflict { color: #ff6b6b; }
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
  .issue-list { display: flex; flex-direction: column; gap: 10px; }
  .issue-card {
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 14px;
    background: rgba(255,255,255,0.03);
    padding: 12px 14px;
  }
  .issue-name { font-weight: 700; font-size: 14px; }
  .issue-specs, .issue-consumers, .consumer-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
    margin-top: 6px;
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
    .editor-chrome {
      align-items: stretch;
      flex-direction: column;
      padding-top: 8px;
    }
    .editor-statusline {
      padding: 0 4px 8px;
    }
  }
`;

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(<App />);
}
