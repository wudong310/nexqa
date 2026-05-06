import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MethodBadge } from "@/components/ui/method-badge";
import { ApiChangeBadge } from "./api-change-badge";
import { cn } from "@/lib/utils";
import type { ApiEndpoint, ApiChangeFlag } from "@nexqa/shared";
import { Eye, Trash2 } from "lucide-react";

interface EndpointListItemProps {
  endpoint: ApiEndpoint;
  testCaseCount: number;
  apiChangeFlag?: ApiChangeFlag;
  onView: () => void;
  onDelete?: () => void;
}

export function EndpointListItem({
  endpoint: ep,
  testCaseCount,
  apiChangeFlag,
  onView,
  onDelete,
}: EndpointListItemProps) {
  return (
    <div
      className="group flex items-center gap-2 py-1.5 px-2 rounded-md cursor-pointer transition-colors hover:bg-muted/50"
      onClick={onView}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onView()}
    >
      <MethodBadge method={ep.method} />

      <span className="font-mono text-xs truncate min-w-0 flex-shrink">
        {ep.path}
      </span>

      <span className="text-xs text-muted-foreground truncate max-w-[160px] hidden sm:inline">
        {ep.summary}
      </span>

      <div className="flex-1" />

      {apiChangeFlag && <ApiChangeBadge flag={apiChangeFlag} />}

      {!apiChangeFlag && testCaseCount > 0 && (
        <span className="text-xs text-muted-foreground shrink-0">
          {testCaseCount} 用例
        </span>
      )}

      {!apiChangeFlag && testCaseCount === 0 && (
        <span className="text-xs text-muted-foreground/50 shrink-0">
          0 用例
        </span>
      )}

      {/* Hover actions */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={(e) => {
            e.stopPropagation();
            onView();
          }}
          title="查看详情"
        >
          <Eye className="h-3 w-3" />
        </Button>
        {onDelete && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            title="删除端点"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
}
