import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import type { DependencyType } from '../../types/package';

interface InstallMenuButtonProps {
  onInstall: (type: DependencyType) => void;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  variant?: 'primary' | 'secondary';
  size?: 'default' | 'small' | 'icon';
  label?: string;
  supportedTypes?: DependencyType[];
}

const INSTALL_OPTIONS: Array<{ type: DependencyType; label: string }> = [
  { type: 'dependencies', label: 'Install' },
  { type: 'devDependencies', label: 'Install as Dev' },
  { type: 'peerDependencies', label: 'Install as Peer' },
  { type: 'optionalDependencies', label: 'Install as Optional' },
];

export const InstallMenuButton: React.FC<InstallMenuButtonProps> = ({
  onInstall,
  disabled = false,
  loading = false,
  className = '',
  variant = 'secondary',
  size = 'default',
  label = 'Install',
  supportedTypes = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'],
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, [isOpen]);

  const handleToggle = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (disabled || loading) {
      return;
    }
    setIsOpen((open) => !open);
  };

  const handleInstall = (event: React.MouseEvent, type: DependencyType) => {
    event.stopPropagation();
    setIsOpen(false);
    onInstall(type);
  };

  const classes = [
    'install-menu',
    `variant-${variant}`,
    `size-${size}`,
    disabled || loading ? 'disabled' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="install-menu-wrapper" ref={containerRef}>
      <button className={classes} onClick={handleToggle} disabled={disabled || loading}>
        {size === 'icon' ? <Plus size={16} /> : <Plus size={14} />}
        {size !== 'icon' && <span>{loading ? 'Installing...' : label}</span>}
        <ChevronDown size={size === 'small' ? 12 : 14} />
      </button>
      {isOpen && (
        <div className="install-menu-dropdown">
          {INSTALL_OPTIONS.filter((option) => supportedTypes.includes(option.type)).map((option) => (
            <button
              key={option.type}
              className="install-menu-item"
              onClick={(event) => handleInstall(event, option.type)}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

      <style>{`
        .install-menu-wrapper {
          position: relative;
          display: inline-flex;
        }

        .install-menu {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          border: none;
          cursor: pointer;
          transition: all 0.15s;
        }

        .install-menu.disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .install-menu.variant-primary {
          background: var(--vscode-button-background);
          color: var(--vscode-button-foreground);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        }

        .install-menu.variant-primary:hover:not(:disabled) {
          background: var(--vscode-button-hoverBackground);
        }

        .install-menu.variant-secondary {
          background: var(--vscode-button-secondaryBackground);
          color: var(--vscode-button-secondaryForeground);
        }

        .install-menu.variant-secondary:hover:not(:disabled) {
          background: var(--vscode-button-secondaryHoverBackground);
        }

        .install-menu.size-default {
          padding: 10px 20px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
        }

        .install-menu.size-small {
          padding: 6px 16px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 500;
        }

        .install-menu.size-icon {
          width: 34px;
          height: 34px;
          border-radius: 8px;
          padding: 0 6px;
          gap: 2px;
        }

        .install-menu-dropdown {
          position: absolute;
          top: calc(100% + 6px);
          right: 0;
          min-width: 170px;
          display: flex;
          flex-direction: column;
          padding: 6px;
          background: var(--vscode-editorWidget-background);
          border: 1px solid var(--vscode-widget-border);
          border-radius: 8px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
          z-index: 20;
        }

        .install-menu-item {
          border: none;
          background: transparent;
          color: var(--vscode-foreground);
          text-align: left;
          padding: 8px 10px;
          border-radius: 6px;
          font-size: 12px;
          cursor: pointer;
        }

        .install-menu-item:hover {
          background: var(--vscode-list-hoverBackground);
        }
      `}</style>
    </div>
  );
};
