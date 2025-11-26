import * as React from "react";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'outline' | 'blue' | 'purple' | 'green';
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className = '', variant = 'default', style, children, ...props }, ref) => {
    const baseStyles: React.CSSProperties = {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      borderRadius: '9999px',
      padding: '3px 10px',
      fontSize: '11px',
      fontWeight: 500,
      transition: 'all 0.15s',
      border: '1px solid transparent',
    };

    const variantStyles: Record<string, React.CSSProperties> = {
      default: {
        background: 'var(--vscode-badge-background)',
        color: 'var(--vscode-badge-foreground)',
      },
      secondary: {
        background: 'var(--vscode-button-secondaryBackground)',
        color: 'var(--vscode-button-secondaryForeground)',
      },
      success: {
        background: 'rgba(34, 197, 94, 0.15)',
        color: 'rgb(74, 222, 128)',
        borderColor: 'rgba(34, 197, 94, 0.3)',
      },
      warning: {
        background: 'rgba(245, 158, 11, 0.15)',
        color: 'rgb(251, 191, 36)',
        borderColor: 'rgba(245, 158, 11, 0.3)',
      },
      destructive: {
        background: 'rgba(239, 68, 68, 0.15)',
        color: 'rgb(248, 113, 113)',
        borderColor: 'rgba(239, 68, 68, 0.3)',
      },
      outline: {
        background: 'transparent',
        color: 'var(--vscode-descriptionForeground)',
        borderColor: 'var(--vscode-widget-border)',
      },
      blue: {
        background: 'rgba(59, 130, 246, 0.15)',
        color: 'rgb(96, 165, 250)',
        borderColor: 'rgba(59, 130, 246, 0.3)',
      },
      purple: {
        background: 'rgba(168, 85, 247, 0.15)',
        color: 'rgb(192, 132, 252)',
        borderColor: 'rgba(168, 85, 247, 0.3)',
      },
      green: {
        background: 'rgba(34, 197, 94, 0.15)',
        color: 'rgb(74, 222, 128)',
        borderColor: 'rgba(34, 197, 94, 0.3)',
      },
    };

    return (
      <span
        ref={ref}
        className={className}
        style={{ ...baseStyles, ...variantStyles[variant], ...style }}
        {...props}
      >
        {children}
      </span>
    );
  }
);
Badge.displayName = "Badge";

export { Badge };
