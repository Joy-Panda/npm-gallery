import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className = '', style, ...props }, ref) => {
  const baseStyles: React.CSSProperties = {
    display: 'inline-flex',
    height: '40px',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: '4px',
    borderBottom: '1px solid var(--vscode-widget-border)',
    background: 'transparent',
    padding: 0,
  };

  return (
    <TabsPrimitive.List
      ref={ref}
      className={className}
      style={{ ...baseStyles, ...style }}
      {...props}
    />
  );
});
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className = '', style, ...props }, ref) => {
  const baseStyles: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    whiteSpace: 'nowrap',
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: 500,
    color: 'var(--vscode-foreground)',
    transition: 'all 0.15s',
    borderBottom: '2px solid transparent',
    marginBottom: '-1px',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
  };

  return (
    <>
      <TabsPrimitive.Trigger
        ref={ref}
        className={`tabs-trigger ${className}`}
        style={{ ...baseStyles, ...style }}
        {...props}
      />
      <style>{`
        .tabs-trigger {
          color: var(--vscode-descriptionForeground);
        }
        .tabs-trigger:hover {
          color: var(--vscode-foreground);
          background: var(--vscode-list-hoverBackground);
        }
        .tabs-trigger[data-state="active"] {
          color: var(--vscode-foreground);
          border-bottom-color: var(--vscode-focusBorder);
        }
        .tabs-trigger:disabled {
          pointer-events: none;
          opacity: 0.5;
        }
      `}</style>
    </>
  );
});
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className = '', style, ...props }, ref) => {
  const baseStyles: React.CSSProperties = {
    marginTop: '16px',
  };

  return (
    <TabsPrimitive.Content
      ref={ref}
      className={className}
      style={{ ...baseStyles, ...style }}
      {...props}
    />
  );
});
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
