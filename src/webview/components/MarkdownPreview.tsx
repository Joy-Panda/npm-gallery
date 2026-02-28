import React, { useEffect } from 'react';
import MarkdownPreviewComponent from '@uiw/react-markdown-preview';
import type { PackageRepository } from '../../types/package';

interface MarkdownPreviewProps {
  source: string;
  containerId?: string;
  onOpenExternal?: (url: string) => void;
  repository?: PackageRepository;
}

export const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({
  source,
  containerId,
  onOpenExternal,
  repository,
}) => {
  useEffect(() => {
    if (!containerId) {
      return;
    }

    const container = document.getElementById(containerId);
    if (!container) {
      return;
    }

    const seenIds = new Map<string, number>();
    const headings = Array.from(
      container.querySelectorAll('h1, h2, h3, h4, h5, h6')
    ) as HTMLElement[];

    headings.forEach((heading) => {
      const baseId = slugifyHeading(heading.textContent || '');
      const count = seenIds.get(baseId) || 0;
      seenIds.set(baseId, count + 1);
      heading.id = count === 0 ? baseId : `${baseId}-${count}`;
      heading.style.scrollMarginTop = '16px';
    });

    const links = Array.from(container.querySelectorAll('a[href]')) as HTMLAnchorElement[];
    links.forEach((link) => {
      const href = link.getAttribute('href');
      if (!href || href.startsWith('#')) {
        return;
      }

      const resolvedHref = resolveReadmeLink(href, repository);
      if (resolvedHref) {
        link.setAttribute('href', resolvedHref);
      }
    });

    const images = Array.from(container.querySelectorAll('img[src]')) as HTMLImageElement[];
    images.forEach((image) => {
      const src = image.getAttribute('src');
      if (!src) {
        return;
      }

      const resolvedSrc = resolveReadmeAsset(src, repository);
      if (resolvedSrc) {
        image.setAttribute('src', resolvedSrc);
      }
    });

    if (!onOpenExternal) {
      return;
    }

    const handleClick = (event: Event) => {
      const target = event.target as HTMLElement | null;
      const link = target?.closest('a') as HTMLAnchorElement | null;
      if (!link) {
        return;
      }

      const href = link.getAttribute('href');
      if (!href) {
        return;
      }

      event.preventDefault();

      if (href.startsWith('#')) {
        document.getElementById(decodeURIComponent(href.slice(1)))?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
        return;
      }

      const resolvedUrl = resolveReadmeLink(href, repository);
      if (resolvedUrl) {
        onOpenExternal(resolvedUrl);
      }
    };

    container.addEventListener('click', handleClick);
    return () => {
      container.removeEventListener('click', handleClick);
    };
  }, [source, containerId, onOpenExternal, repository]);

  if (!source) {
    return <p className="empty-message">No README available</p>;
  }

  return (
    <div className="markdown-preview-wrapper" id={containerId}>
      <MarkdownPreviewComponent
        source={source}
        style={{
          backgroundColor: 'transparent',
          color: 'var(--vscode-foreground)',
          fontFamily: 'var(--vscode-font-family)',
          fontSize: '14px',
          lineHeight: '1.6',
        }}
        wrapperElement={{
          'data-color-mode': 'dark',
        }}
      />
      <style>{`
        .markdown-preview-wrapper {
          line-height: 1.6;
        }

        .markdown-preview-wrapper .wmde-markdown {
          background: transparent !important;
          color: var(--vscode-foreground) !important;
          font-size: 14px !important;
        }

        /* Headings */
        .markdown-preview-wrapper .wmde-markdown h1,
        .markdown-preview-wrapper .wmde-markdown h2,
        .markdown-preview-wrapper .wmde-markdown h3,
        .markdown-preview-wrapper .wmde-markdown h4,
        .markdown-preview-wrapper .wmde-markdown h5,
        .markdown-preview-wrapper .wmde-markdown h6 {
          color: var(--vscode-foreground) !important;
          border-bottom-color: var(--vscode-widget-border) !important;
          margin-top: 24px !important;
          margin-bottom: 16px !important;
        }

        .markdown-preview-wrapper .wmde-markdown h1 {
          font-size: 2em !important;
          padding-bottom: 0.3em !important;
          border-bottom: 1px solid var(--vscode-widget-border) !important;
        }

        .markdown-preview-wrapper .wmde-markdown h2 {
          font-size: 1.5em !important;
          padding-bottom: 0.3em !important;
          border-bottom: 1px solid var(--vscode-widget-border) !important;
        }

        /* Code blocks */
        .markdown-preview-wrapper .wmde-markdown pre {
          background: var(--vscode-textCodeBlock-background, rgba(0, 0, 0, 0.2)) !important;
          border: 1px solid var(--vscode-widget-border) !important;
          border-radius: 6px !important;
          padding: 16px !important;
          margin: 16px 0 !important;
          overflow-x: auto !important;
        }

        .markdown-preview-wrapper .wmde-markdown pre code {
          background: transparent !important;
          padding: 0 !important;
          border-radius: 0 !important;
          font-size: 13px !important;
          line-height: 1.5 !important;
          white-space: pre !important;
          word-break: normal !important;
          overflow-wrap: normal !important;
        }

        /* Inline code */
        .markdown-preview-wrapper .wmde-markdown code {
          background: var(--vscode-textCodeBlock-background, rgba(0, 0, 0, 0.2)) !important;
          color: var(--vscode-foreground) !important;
          font-family: var(--vscode-editor-font-family, 'Consolas', 'Monaco', monospace) !important;
          font-size: 0.9em !important;
          padding: 2px 6px !important;
          border-radius: 4px !important;
        }

        /* Syntax highlighting colors - using VS Code theme-friendly colors */
        .markdown-preview-wrapper .wmde-markdown pre code .token.comment,
        .markdown-preview-wrapper .wmde-markdown pre code .token.prolog,
        .markdown-preview-wrapper .wmde-markdown pre code .token.doctype,
        .markdown-preview-wrapper .wmde-markdown pre code .token.cdata {
          color: #6a9955 !important;
        }

        .markdown-preview-wrapper .wmde-markdown pre code .token.punctuation {
          color: var(--vscode-foreground) !important;
        }

        .markdown-preview-wrapper .wmde-markdown pre code .token.property,
        .markdown-preview-wrapper .wmde-markdown pre code .token.tag,
        .markdown-preview-wrapper .wmde-markdown pre code .token.boolean,
        .markdown-preview-wrapper .wmde-markdown pre code .token.number,
        .markdown-preview-wrapper .wmde-markdown pre code .token.constant,
        .markdown-preview-wrapper .wmde-markdown pre code .token.symbol {
          color: #b5cea8 !important;
        }

        .markdown-preview-wrapper .wmde-markdown pre code .token.selector,
        .markdown-preview-wrapper .wmde-markdown pre code .token.attr-name,
        .markdown-preview-wrapper .wmde-markdown pre code .token.string,
        .markdown-preview-wrapper .wmde-markdown pre code .token.char,
        .markdown-preview-wrapper .wmde-markdown pre code .token.builtin {
          color: #ce9178 !important;
        }

        .markdown-preview-wrapper .wmde-markdown pre code .token.operator,
        .markdown-preview-wrapper .wmde-markdown pre code .token.entity,
        .markdown-preview-wrapper .wmde-markdown pre code .token.url,
        .markdown-preview-wrapper .wmde-markdown pre code .token.variable {
          color: #d4d4d4 !important;
        }

        .markdown-preview-wrapper .wmde-markdown pre code .token.atrule,
        .markdown-preview-wrapper .wmde-markdown pre code .token.attr-value,
        .markdown-preview-wrapper .wmde-markdown pre code .token.keyword {
          color: #569cd6 !important;
        }

        .markdown-preview-wrapper .wmde-markdown pre code .token.function,
        .markdown-preview-wrapper .wmde-markdown pre code .token.class-name {
          color: #dcdcaa !important;
        }

        .markdown-preview-wrapper .wmde-markdown pre code .token.regex,
        .markdown-preview-wrapper .wmde-markdown pre code .token.important {
          color: #d16969 !important;
        }

        /* Links */
        .markdown-preview-wrapper .wmde-markdown a {
          color: var(--vscode-textLink-foreground) !important;
          text-decoration: none !important;
        }

        .markdown-preview-wrapper .wmde-markdown a:hover {
          text-decoration: underline !important;
        }

        /* Blockquotes */
        .markdown-preview-wrapper .wmde-markdown blockquote {
          border-left: 4px solid var(--vscode-textBlockQuote-border, #444) !important;
          background: var(--vscode-textBlockQuote-background, rgba(0, 0, 0, 0.1)) !important;
          color: var(--vscode-foreground) !important;
          padding: 12px 16px !important;
          margin: 16px 0 !important;
          border-radius: 0 4px 4px 0 !important;
        }

        .markdown-preview-wrapper .wmde-markdown blockquote p {
          margin: 0 !important;
        }

        /* Tables */
        .markdown-preview-wrapper .wmde-markdown table {
          border-collapse: collapse !important;
          width: 100% !important;
          margin: 16px 0 !important;
        }

        .markdown-preview-wrapper .wmde-markdown table th,
        .markdown-preview-wrapper .wmde-markdown table td {
          border: 1px solid var(--vscode-widget-border) !important;
          padding: 8px 12px !important;
          text-align: left !important;
        }

        .markdown-preview-wrapper .wmde-markdown table th {
          background: var(--vscode-editor-inactiveSelectionBackground) !important;
          font-weight: 600 !important;
        }

        .markdown-preview-wrapper .wmde-markdown table tr {
          background: transparent !important;
        }

        .markdown-preview-wrapper .wmde-markdown table tr:nth-child(2n) {
          background: var(--vscode-list-hoverBackground) !important;
        }

        /* Lists */
        .markdown-preview-wrapper .wmde-markdown ul,
        .markdown-preview-wrapper .wmde-markdown ol {
          padding-left: 2em !important;
          margin: 16px 0 !important;
        }

        .markdown-preview-wrapper .wmde-markdown li {
          margin: 4px 0 !important;
        }

        /* Horizontal rule */
        .markdown-preview-wrapper .wmde-markdown hr {
          background: var(--vscode-widget-border) !important;
          height: 1px !important;
          border: none !important;
          margin: 24px 0 !important;
        }

        /* Images */
        .markdown-preview-wrapper .wmde-markdown img {
          max-width: 100% !important;
          border-radius: 4px !important;
        }

        /* Paragraphs */
        .markdown-preview-wrapper .wmde-markdown p {
          margin: 16px 0 !important;
        }

        .empty-message {
          text-align: center;
          color: var(--vscode-descriptionForeground);
          padding: 40px;
        }
      `}</style>
    </div>
  );
};

function slugifyHeading(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[`~!@#$%^&*()+=[\]{}|\\:;"'<>,.?/]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'section';
}

function resolveReadmeLink(href: string, repository?: PackageRepository): string | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) {
    return href;
  }

  const normalizedRepoUrl = normalizeRepositoryUrl(repository?.url);
  if (!normalizedRepoUrl) {
    return href;
  }

  try {
    const repo = new URL(normalizedRepoUrl);
    const repoPathSegments = repo.pathname.split('/').filter(Boolean);
    if (repoPathSegments.length < 2) {
      return href;
    }

    const repoRootSegments = repoPathSegments.slice(0, 2);
    const baseSegments = [
      ...repoRootSegments,
      ...splitPathSegments(repository?.directory),
    ];

    const [pathPart, hashPart = ''] = href.split('#');
    const relativeSegments = splitPathSegments(pathPart);
    const resolvedSegments = href.startsWith('/')
      ? [...repoRootSegments, ...relativeSegments]
      : applyRelativePath(baseSegments, relativeSegments, repoRootSegments.length);
    const repoRelativeSegments = resolvedSegments.slice(repoRootSegments.length);

    if (repo.hostname === 'github.com' && repoRelativeSegments.length > 0) {
      repo.pathname = `/${repoRootSegments[0]}/${repoRootSegments[1]}/blob/HEAD/${repoRelativeSegments.join('/')}`;
      repo.hash = hashPart ? `#${hashPart}` : '';
      repo.search = '';
      return repo.toString();
    }

    repo.pathname = `/${resolvedSegments.join('/')}`;
    repo.hash = hashPart ? `#${hashPart}` : '';
    repo.search = '';
    return repo.toString();
  } catch {
    return href;
  }
}

function resolveReadmeAsset(src: string, repository?: PackageRepository): string | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith('data:')) {
    return src;
  }

  const normalizedRepoUrl = normalizeRepositoryUrl(repository?.url);
  if (!normalizedRepoUrl) {
    return src;
  }

  try {
    const repo = new URL(normalizedRepoUrl);
    const repoPathSegments = repo.pathname.split('/').filter(Boolean);
    if (repoPathSegments.length < 2) {
      return src;
    }

    const repoRootSegments = repoPathSegments.slice(0, 2);
    const baseSegments = [
      ...repoRootSegments,
      ...splitPathSegments(repository?.directory),
    ];
    const relativeSegments = splitPathSegments(src);
    const resolvedSegments = src.startsWith('/')
      ? [...repoRootSegments, ...relativeSegments]
      : applyRelativePath(baseSegments, relativeSegments, repoRootSegments.length);
    const repoRelativeSegments = resolvedSegments.slice(repoRootSegments.length);

    if (repo.hostname === 'github.com' && repoRelativeSegments.length > 0) {
      return `https://raw.githubusercontent.com/${repoRootSegments[0]}/${repoRootSegments[1]}/HEAD/${repoRelativeSegments.join('/')}`;
    }

    repo.pathname = `/${resolvedSegments.join('/')}`;
    repo.search = '';
    repo.hash = '';
    return repo.toString();
  } catch {
    return src;
  }
}

function normalizeRepositoryUrl(url?: string): string | undefined {
  if (!url) {
    return undefined;
  }

  const shorthandMatch = url.match(/^(github|gitlab|bitbucket):(.+)$/i);
  if (shorthandMatch) {
    const hostMap: Record<string, string> = {
      github: 'github.com',
      gitlab: 'gitlab.com',
      bitbucket: 'bitbucket.org',
    };
    const host = hostMap[shorthandMatch[1].toLowerCase()];
    if (host) {
      return `https://${host}/${shorthandMatch[2].replace(/\.git$/, '')}`;
    }
  }

  if (url.startsWith('git+')) {
    return url.slice(4).replace(/\.git$/, '');
  }

  if (url.startsWith('git://')) {
    return `https://${url.slice('git://'.length).replace(/\.git$/, '')}`;
  }

  const sshMatch = url.match(/^git@([^:]+):(.+?)(?:\.git)?$/);
  if (sshMatch) {
    return `https://${sshMatch[1]}/${sshMatch[2]}`;
  }

  if (/^(github\.com|gitlab\.com|bitbucket\.org)\//i.test(url)) {
    return `https://${url.replace(/\.git$/, '')}`;
  }

  return url.replace(/\.git$/, '');
}

function splitPathSegments(path?: string): string[] {
  if (!path) {
    return [];
  }

  return path
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function applyRelativePath(baseSegments: string[], relativeSegments: string[], minLength: number): string[] {
  const result = [...baseSegments];

  for (const segment of relativeSegments) {
    if (segment === '.' || segment === '') {
      continue;
    }

    if (segment === '..') {
      if (result.length > minLength) {
        result.pop();
      }
      continue;
    }

    result.push(segment);
  }

  return result;
}
