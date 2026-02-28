import React, { useEffect, useState } from 'react';
import { MarkdownPreview } from '../MarkdownPreview';
import type { PackageDetails } from '../../../types/package';

interface ReadmeTabProps {
  details: PackageDetails;
  onOpenExternal: (url: string) => void;
}

const readmeStyles = `
  .readme-wrapper {
    display: grid;
    grid-template-columns: minmax(0, 220px) minmax(0, 1fr);
    gap: 24px;
    align-items: start;
  }

  .readme-wrapper.readme-no-toc {
    grid-template-columns: minmax(0, 1fr);
  }

  .readme-wrapper.readme-no-toc .readme-content {
    max-width: none;
  }

  .readme-toc {
    position: sticky;
    top: 0;
    padding: 16px;
    border: 1px solid var(--vscode-widget-border);
    border-radius: 10px;
    background: var(--vscode-sideBar-background);
  }

  .readme-toc-title {
    margin: 0 0 12px 0;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--vscode-descriptionForeground);
  }

  .readme-toc-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .readme-toc-link {
    display: block;
    width: 100%;
    padding: 6px 8px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--vscode-textLink-foreground);
    text-align: left;
    cursor: pointer;
    font-size: 12px;
  }

  .readme-toc-link:hover {
    background: var(--vscode-list-hoverBackground);
  }

  .readme-content {
    max-width: 850px;
    min-width: 0;
  }

  .readme-toc-link.level-1 { padding-left: 8px; }
  .readme-toc-link.level-2 { padding-left: 20px; }
  .readme-toc-link.level-3 { padding-left: 32px; }
  .readme-toc-link.level-4 { padding-left: 44px; }
  .readme-toc-link.level-5 { padding-left: 56px; }
  .readme-toc-link.level-6 { padding-left: 68px; }

  @media (max-width: 900px) {
    .readme-wrapper {
      grid-template-columns: 1fr;
    }

    .readme-toc {
      position: static;
    }
  }
`;

export const ReadmeTab: React.FC<ReadmeTabProps> = ({ details, onOpenExternal }) => {
  const [headings, setHeadings] = useState<Array<{ id: string; text: string; level: number }>>([]);

  useEffect(() => {
    let cancelled = false;

    const loadHeadings = async () => {
      const nextHeadings = await extractHeadings(details.readme || '');
      if (!cancelled) {
        setHeadings(nextHeadings);
      }
    };

    loadHeadings().catch(() => {
      if (!cancelled) {
        setHeadings([]);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [details.readme]);

  return (
    <>
      <style>{readmeStyles}</style>
      <div className={`readme-wrapper${headings.length === 0 ? ' readme-no-toc' : ''}`}>
        {headings.length > 0 && (
          <aside className="readme-toc">
            <h3 className="readme-toc-title">Contents</h3>
            <div className="readme-toc-list">
              {headings.map((heading) => (
                <button
                  key={heading.id}
                  className={`readme-toc-link level-${heading.level}`}
                  onClick={() => {
                    document.getElementById(heading.id)?.scrollIntoView({
                      behavior: 'smooth',
                      block: 'start',
                    });
                  }}
                >
                  {heading.text}
                </button>
              ))}
            </div>
          </aside>
        )}
        <div className="readme-content">
          <MarkdownPreview
            source={details.readme || ''}
            containerId="package-readme-content"
            onOpenExternal={onOpenExternal}
            repository={details.repository}
          />
        </div>
      </div>
    </>
  );
};

async function extractHeadings(source: string): Promise<Array<{ id: string; text: string; level: number }>> {
  if (!source) {
    return [];
  }

  const [{ unified }, { default: remarkParse }, { visit }] = await Promise.all([
    import('unified'),
    import('remark-parse'),
    import('unist-util-visit'),
  ]);

  const tree = unified().use(remarkParse).parse(source) as any;
  const headings: Array<{ id: string; text: string; level: number }> = [];
  const seenIds = new Map<string, number>();

  visit(tree, 'heading', (node: any) => {
    const text = node.children
      .map((child: any) => (typeof child.value === 'string' ? child.value : ''))
      .join('')
      .trim();

    if (!text) {
      return;
    }

    const baseId = slugifyHeading(text);
    const count = seenIds.get(baseId) || 0;
    seenIds.set(baseId, count + 1);

    headings.push({
      id: count === 0 ? baseId : `${baseId}-${count}`,
      text,
      level: node.depth,
    });
  });

  return headings;
}

function slugifyHeading(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[`~!@#$%^&*()+=[\]{}|\\:;"'<>,.?/]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'section';
}
