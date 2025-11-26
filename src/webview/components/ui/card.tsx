import * as React from "react";

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className = '', style, ...props }, ref) => {
  const baseStyles: React.CSSProperties = {
    borderRadius: '8px',
    border: '1px solid var(--vscode-widget-border)',
    background: 'var(--vscode-editor-background)',
    color: 'var(--vscode-foreground)',
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
  };

  return (
    <div
      ref={ref}
      className={className}
      style={{ ...baseStyles, ...style }}
      {...props}
    />
  );
});
Card.displayName = "Card";

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className = '', style, ...props }, ref) => {
  const baseStyles: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '16px',
  };

  return (
    <div
      ref={ref}
      className={className}
      style={{ ...baseStyles, ...style }}
      {...props}
    />
  );
});
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className = '', style, ...props }, ref) => {
  const baseStyles: React.CSSProperties = {
    fontWeight: 600,
    lineHeight: 1,
    letterSpacing: '-0.01em',
  };

  return (
    <h3
      ref={ref}
      className={className}
      style={{ ...baseStyles, ...style }}
      {...props}
    />
  );
});
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className = '', style, ...props }, ref) => {
  const baseStyles: React.CSSProperties = {
    fontSize: '13px',
    color: 'var(--vscode-descriptionForeground)',
  };

  return (
    <p
      ref={ref}
      className={className}
      style={{ ...baseStyles, ...style }}
      {...props}
    />
  );
});
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className = '', style, ...props }, ref) => {
  const baseStyles: React.CSSProperties = {
    padding: '0 16px 16px 16px',
  };

  return (
    <div
      ref={ref}
      className={className}
      style={{ ...baseStyles, ...style }}
      {...props}
    />
  );
});
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className = '', style, ...props }, ref) => {
  const baseStyles: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    padding: '0 16px 16px 16px',
  };

  return (
    <div
      ref={ref}
      className={className}
      style={{ ...baseStyles, ...style }}
      {...props}
    />
  );
});
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
