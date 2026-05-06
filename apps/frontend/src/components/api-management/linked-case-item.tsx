import { cn } from "@/lib/utils";
import type { TestCase } from "@nexqa/shared";
import { CheckCircle, XCircle } from "lucide-react";
import { ApiChangeBadge } from "./api-change-badge";

interface LinkedCaseItemProps {
  testCase: TestCase;
  onClick?: () => void;
}

export function LinkedCaseItem({ testCase: tc, onClick }: LinkedCaseItemProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between px-3 py-2 rounded-md cursor-pointer transition-colors hover:bg-muted/50 border-b last:border-0",
      )}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onClick?.()}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="text-sm truncate">{tc.name}</span>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {tc.apiChangeFlag && <ApiChangeBadge flag={tc.apiChangeFlag} />}

        <span className="text-xs text-muted-foreground">
          {tc.updatedAt
            ? new Date(tc.updatedAt).toLocaleDateString("zh-CN")
            : ""}
        </span>
      </div>
    </div>
  );
}
