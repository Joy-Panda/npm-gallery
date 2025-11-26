import * as React from "react";

export interface SeparatorProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: 'horizontal' | 'vertical';
  decorative?: boolean;
}

const Separator = React.forwardRef<HTMLDivElement, SeparatorProps>(
  ({ className = '', style, orientation = "horizontal", decorative = true, ...props }, ref) => {
    const baseStyles: React.CSSProperties = {
      flexShrink: 0,
      background: 'var(--vscode-widget-border)',
      ...(orientation === "horizontal"
        ? { height: '1px', width: '100%' }
        : { height: '100%', width: '1px' }),
    };

    return (
      <div
        ref={ref}
        role={decorative ? 'none' : 'separator'}
        aria-orientation={decorative ? undefined : orientation}
        className={className}
        style={{ ...baseStyles, ...style }}
        {...props}
      />
    );
  }
);
Separator.displayName = "Separator";

export { Separator };
