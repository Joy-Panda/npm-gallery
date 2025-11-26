import * as React from "react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'default', size = 'default', style, children, disabled, ...props }, ref) => {
    const baseStyles: React.CSSProperties = {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      whiteSpace: 'nowrap',
      borderRadius: '6px',
      fontSize: '13px',
      fontWeight: 500,
      transition: 'all 0.15s',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      border: 'none',
      outline: 'none',
    };

    const variantStyles: Record<string, React.CSSProperties> = {
      default: {
        background: 'var(--vscode-button-background)',
        color: 'var(--vscode-button-foreground)',
      },
      destructive: {
        background: 'var(--vscode-errorForeground)',
        color: 'white',
      },
      outline: {
        background: 'transparent',
        border: '1px solid var(--vscode-widget-border)',
        color: 'var(--vscode-foreground)',
      },
      secondary: {
        background: 'var(--vscode-button-secondaryBackground)',
        color: 'var(--vscode-button-secondaryForeground)',
      },
      ghost: {
        background: 'transparent',
        color: 'var(--vscode-foreground)',
      },
      link: {
        background: 'transparent',
        color: 'var(--vscode-textLink-foreground)',
        textDecoration: 'underline',
      },
    };

    const sizeStyles: Record<string, React.CSSProperties> = {
      default: {
        height: '32px',
        padding: '0 16px',
      },
      sm: {
        height: '28px',
        padding: '0 12px',
        fontSize: '12px',
        borderRadius: '4px',
      },
      lg: {
        height: '40px',
        padding: '0 24px',
      },
      icon: {
        height: '32px',
        width: '32px',
        padding: '0',
      },
    };

    return (
      <button
        ref={ref}
        className={className}
        style={{ ...baseStyles, ...variantStyles[variant], ...sizeStyles[size], ...style }}
        disabled={disabled}
        {...props}
      >
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";

export { Button };
