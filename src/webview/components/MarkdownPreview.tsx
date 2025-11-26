import React from 'react';
import MarkdownPreviewComponent from '@uiw/react-markdown-preview';

interface MarkdownPreviewProps {
  source: string;
}

export const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({ source }) => {
  if (!source) {
    return <p className="empty-message">No README available</p>;
  }

  return (
    <div className="markdown-preview-wrapper">
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
