import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { PackageDetails, NuGetFrameworkProduct } from '../../../types/package';

interface FrameworksTabProps {
  details: PackageDetails;
}

const styles = `
  .frameworks-wrapper {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .frameworks-section {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .frameworks-product-title {
    display: flex;
    align-items: center;
    font-size: 13px;
    font-weight: 600;
    color: var(--vscode-foreground);
    margin: 0;
    padding: 10px 0;
    border-bottom: 1px solid var(--vscode-widget-border);
    cursor: pointer;
    user-select: none;
    transition: background 0.15s;
  }

  .frameworks-product-title:hover {
    background: var(--vscode-list-hoverBackground);
    margin: 0 -10px;
    padding: 10px;
    border-radius: 6px;
  }

  .frameworks-title-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .frameworks-chevron {
    color: var(--vscode-descriptionForeground);
    flex-shrink: 0;
  }

  .frameworks-versions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    padding: 14px 0 4px 0;
    font-size: 12px;
  }

  .frameworks-version-item {
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
    padding: 5px 10px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
  }

  .frameworks-version-item.compatible {
    background: var(--vscode-inputValidation-infoBackground);
    color: var(--vscode-inputValidation-infoForeground, var(--vscode-foreground));
  }

  .frameworks-version-item.computed {
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
  }

  .frameworks-version-suffix {
    font-weight: 400;
    font-size: 11px;
    opacity: 0.9;
  }

  .frameworks-empty {
    padding: 32px;
    text-align: center;
    color: var(--vscode-descriptionForeground);
  }
`;

export const FrameworksTab: React.FC<FrameworksTabProps> = ({ details }) => {
  const frameworks = details.nugetFrameworks;
  const [expandedProducts, setExpandedProducts] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (frameworks?.length) {
      setExpandedProducts(
        frameworks.reduce<Record<string, boolean>>((acc, p) => {
          acc[p.product] = true;
          return acc;
        }, {})
      );
    }
  }, [frameworks]);

  if (!frameworks || frameworks.length === 0) {
    return (
      <>
        <style>{styles}</style>
        <div className="frameworks-empty">
          {details.name} {details.version} has no framework information.
        </div>
      </>
    );
  }

  return (
    <>
      <style>{styles}</style>
      <div className="frameworks-wrapper">
        <p style={{ margin: '0 0 12px 0', fontSize: 12, color: 'var(--vscode-descriptionForeground)' }}>
          Compatible and additional computed target framework versions.
        </p>
        {frameworks.map((product: NuGetFrameworkProduct) => {
          const isExpanded = expandedProducts[product.product] !== false;
          return (
            <section key={product.product} className="frameworks-section">
              <h3
                className="frameworks-product-title"
                onClick={() =>
                  setExpandedProducts((prev) => ({
                    ...prev,
                    [product.product]: !prev[product.product],
                  }))
                }
              >
                <div className="frameworks-title-left">
                  {isExpanded ? (
                    <ChevronDown size={16} className="frameworks-chevron" />
                  ) : (
                    <ChevronRight size={16} className="frameworks-chevron" />
                  )}
                  <span>{product.product}</span>
                </div>
              </h3>
              {isExpanded && (
                <div className="frameworks-versions">
                  {product.versions.map((v) => (
                    <span
                      key={`${product.product}-${v.version}`}
                      className={`frameworks-version-item ${v.status === 'compatible' ? 'compatible' : 'computed'}`}
                    >
                      <span>{v.version}</span>
                      <span className="frameworks-version-suffix">
                        {v.status === 'compatible' ? 'is compatible' : 'was computed'}
                      </span>
                    </span>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
};
