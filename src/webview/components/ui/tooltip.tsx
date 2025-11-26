import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

const TooltipProvider = TooltipPrimitive.Provider;

const Tooltip = TooltipPrimitive.Root;

const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className = '', style, sideOffset = 4, ...props }, ref) => {
  const baseStyles: React.CSSProperties = {
    zIndex: 50,
    overflow: 'hidden',
    borderRadius: '6px',
    background: 'var(--vscode-editorWidget-background)',
    border: '1px solid var(--vscode-widget-border)',
    padding: '6px 12px',
    fontSize: '12px',
    color: 'var(--vscode-foreground)',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
  };

  return (
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={className}
      style={{ ...baseStyles, ...style }}
      {...props}
    />
  );
});
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
