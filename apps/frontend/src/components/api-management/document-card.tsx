import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { ApiDocument } from "@nexqa/shared";
import { ChevronDown, ChevronRight, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";

const FORMAT_LABELS: Record<string, string> = {
  openapi3: "OpenAPI 3.x",
  swagger2: "Swagger 2.0",
  "postman-v2": "Postman",
  har: "HAR",
  curl: "cURL",
};

interface DocumentCardProps {
  document: ApiDocument;
  defaultOpen?: boolean;
  onUpdate?: () => void;
  onDelete?: () => void;
  children: React.ReactNode;
}

export function DocumentCard({
  document: doc,
  defaultOpen = false,
  onUpdate,
  onDelete,
  children,
}: DocumentCardProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="border rounded-lg">
        <CollapsibleTrigger asChild>
          <div
            className={cn(
              "flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-muted/50",
              open && "border-b",
            )}
          >
            {open ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}

            <span className="text-sm font-semibold truncate flex-1">
              {doc.name}
            </span>

            <Badge variant="secondary" className="text-[10px] shrink-0">
              {FORMAT_LABELS[doc.format] ?? doc.format}
            </Badge>

            <Badge
              variant="secondary"
              className="text-[10px] shrink-0 bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300 border-0"
            >
              {doc.endpointCount} 端点
            </Badge>

            {/* Action buttons — stop propagation to avoid toggling */}
            <div
              className="flex items-center gap-1 shrink-0"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              {onUpdate && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={onUpdate}
                  title="更新文档"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              )}
              {onDelete && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={onDelete}
                  title="删除文档"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-2 py-1">{children}</div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
