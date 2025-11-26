import * as React from "react";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', style, type, disabled, ...props }, ref) => {
    const baseStyles: React.CSSProperties = {
      display: 'flex',
      height: '32px',
      width: '100%',
      borderRadius: '6px',
      border: '1px solid var(--vscode-input-border, var(--vscode-widget-border))',
      background: 'var(--vscode-input-background)',
      color: 'var(--vscode-input-foreground)',
      padding: '0 12px',
      fontSize: '13px',
      transition: 'border-color 0.15s, box-shadow 0.15s',
      outline: 'none',
      cursor: disabled ? 'not-allowed' : 'text',
      opacity: disabled ? 0.5 : 1,
    };

    return (
      <input
        type={type}
        className={className}
        style={{ ...baseStyles, ...style }}
        ref={ref}
        disabled={disabled}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
