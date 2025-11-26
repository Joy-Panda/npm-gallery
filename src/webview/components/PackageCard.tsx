import React, { useState } from "react";
import {
  Download,
  Package,
  Star,
  Scale,
  AlertTriangle,
  Plus,
} from "lucide-react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import type { PackageInfo } from "../../types/package";

interface PackageCardProps {
  package: PackageInfo;
  onClick: () => void;
  onInstall: (type: "dependencies" | "devDependencies") => void;
}

export const PackageCard: React.FC<PackageCardProps> = ({
  package: pkg,
  onClick,
  onInstall,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const formatDownloads = (count?: number) => {
    if (!count) return null;
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

  const formatBytes = (bytes?: number) => {
    if (!bytes) return null;
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${bytes}B`;
  };

  const handleInstallClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onInstall("dependencies");
  };

  const authorName = pkg.author
    ? typeof pkg.author === "string"
      ? pkg.author
      : pkg.author.name || ""
    : pkg.publisher?.username || "";

  const scorePercent = pkg.score ? Math.round(pkg.score.final * 100) : null;
  const downloads = formatDownloads(pkg.downloads);

  const cardStyles: React.CSSProperties = {
    background: isHovered
      ? "var(--vscode-list-hoverBackground)"
      : "transparent",
    borderColor: "transparent",
    cursor: "pointer",
    transition: "all 0.15s",
    borderRadius: "0px",
  };

  const contentStyles: React.CSSProperties = {
    display: "flex",
    alignItems: "flex-start",
    gap: "12px",
    padding: "8px",
  };

  const mainContentStyles: React.CSSProperties = {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  };

  const headerStyles: React.CSSProperties = {
    display: "flex",
    alignItems: "baseline",
    gap: "8px",
    flexWrap: "wrap",
  };

  const titleStyles: React.CSSProperties = {
    fontSize: "13px",
    fontWeight: 600,
    color: isHovered
      ? "var(--vscode-textLink-foreground)"
      : "var(--vscode-foreground)",
    transition: "color 0.15s",
    margin: 0,
  };

  const authorStyles: React.CSSProperties = {
    fontSize: "11px",
    color: "var(--vscode-descriptionForeground)",
  };

  const descriptionStyles: React.CSSProperties = {
    fontSize: "12px",
    color: "var(--vscode-descriptionForeground)",
    lineHeight: 1.5,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    margin: 0,
  };

  const statsStyles: React.CSSProperties = {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
    alignItems: "center",
  };

  const buttonStyles: React.CSSProperties = {
    opacity: isHovered ? 1 : 0,
    transition: "opacity 0.15s",
    flexShrink: 0,
  };

  const iconStyles: React.CSSProperties = {
    width: "12px",
    height: "12px",
  };

  return (
    <TooltipProvider>
      <Card
        style={cardStyles}
        onClick={onClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div style={contentStyles}>
          <div style={mainContentStyles}>
            {/* Header */}
            <div style={headerStyles}>
              <h3 style={titleStyles}>{pkg.name}</h3>
              {authorName && <span style={authorStyles}>by {authorName}</span>}
            </div>

            {/* Description */}
            {pkg.description && (
              <p style={descriptionStyles}>{pkg.description}</p>
            )}

            {/* Stats */}
            <div style={statsStyles}>
              <Badge variant="secondary" style={{ fontFamily: "monospace" }}>
                {pkg.version}
              </Badge>

              {downloads && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div>
                      <Badge variant="blue">
                        <Download style={iconStyles} />
                        {downloads}
                      </Badge>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    {pkg.downloads?.toLocaleString()} weekly downloads
                  </TooltipContent>
                </Tooltip>
              )}

              {pkg.bundleSize && (
                <Badge variant="purple">
                  <Package style={iconStyles} />
                  {formatBytes(pkg.bundleSize.gzip)}
                </Badge>
              )}

              {scorePercent !== null && (
                <Badge variant="green">
                  <Star style={iconStyles} />
                  {scorePercent}
                </Badge>
              )}

              {pkg.license && (
                <Badge variant="outline">
                  <Scale style={iconStyles} />
                  {pkg.license}
                </Badge>
              )}
            </div>

            {/* Deprecated */}
            {pkg.deprecated && (
              <Badge variant="warning">
                <AlertTriangle style={iconStyles} />
                Deprecated
              </Badge>
            )}
          </div>

          {/* Install Button */}
          <Button size="icon" style={buttonStyles} onClick={handleInstallClick}>
            <Plus style={{ width: "16px", height: "16px" }} />
          </Button>
        </div>
      </Card>
    </TooltipProvider>
  );
};
