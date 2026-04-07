import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { EndpointChange, EndpointModification } from "@/types/regression";
import { AlertTriangle, ChevronDown, ChevronRight, Info, Minus, Pencil, Plus } from "lucide-react";
import { useState } from "react";

function DiffCodeBlock({ changes }: { changes: EndpointModification["changes"] }) {
  return (
    <div className="font-mono text-xs bg-muted/50 rounded-lg p-3 space-y-0.5 overflow-x-auto">
      {changes.map((c, i) => (
        <div
          key={i}
          className={cn(
            "px-2 py-0.5 rounded",
            c.level === 1 && "text-red-600 dark:text-red-400 bg-red-50/50 dark:bg-red-950/20",
            c.level === 2 && "text-amber-600 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-950/20",
            c.level === 3 && "text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/20",
          )}
        >
          {c.level === 1 ? "⚠️" : c.level === 2 ? "⚡" : "ℹ️"} {c.text}
        </div>
      ))}
    </div>
  );
}

export function DiffItem({
  type,
  item,
  onViewImpact,
}: {
  type: "added" | "removed" | "modified";
  item: EndpointChange | EndpointModification;
  onViewImpact?: () => void;
}) {
  const [expanded, setExpanded] = useState(
    type === "modified" && "severity" in item && item.severity === "breaking",
  );

  const isModified = type === "modified" && "changes" in item;
  const modification = isModified ? (item as EndpointModification) : null;

  const badgeConfig = {
    added: { label: "新增", className: "border-green-300 text-green-700 dark:border-green-700 dark:text-green-300" },
    removed: { label: "删除", className: "border-red-300 text-red-700 dark:border-red-700 dark:text-red-300" },
    modified: { label: "修改", className: "border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300" },
  };

  const iconMap = {
    added: <Plus className="h-3.5 w-3.5 text-green-500" />,
    removed: <Minus className="h-3.5 w-3.5 text-red-500" />,
    modified: <Pencil className="h-3.5 w-3.5 text-amber-500" />,
  };

  return (
    <div className="rounded-lg border p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {iconMap[type]}
          <Badge variant="outline" className={cn("text-[10px]", badgeConfig[type].className)}>
            {badgeConfig[type].label}
          </Badge>
          <span className="text-sm font-mono font-semibold truncate">
            {item.method} {item.path}
          </span>
          {modification?.severity === "breaking" && (
            <Badge variant="destructive" className="text-[10px]">
              <AlertTriangle className="h-2.5 w-2.5 mr-0.5" /> Breaking
            </Badge>
          )}
        </div>
        {isModified && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs shrink-0"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </Button>
        )}
      </div>

      {/* Description for added/removed */}
      {"description" in item && item.description && (
        <p className="text-xs text-muted-foreground">{item.description}</p>
      )}

      {/* Changes detail for modified */}
      {expanded && modification && (
        <DiffCodeBlock changes={modification.changes} />
      )}

      {/* Impact link */}
      {onViewImpact && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs text-teal-600 dark:text-teal-400"
          onClick={onViewImpact}
        >
          查看影响 ▸
        </Button>
      )}
    </div>
  );
}
