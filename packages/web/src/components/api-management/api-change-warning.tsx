import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import type { ApiChangeFlag } from "@nexqa/shared";

interface ApiChangeWarningProps {
  flag: ApiChangeFlag;
  onViewChanges?: () => void;
}

/**
 * Inline warning bar for test case detail pages (方案 B).
 * More prominent than the badge version.
 */
export function ApiChangeWarning({ flag, onViewChanges }: ApiChangeWarningProps) {
  const isDeleted = flag.changeType === "deleted";

  return (
    <Alert
      variant="destructive"
      className={
        isDeleted
          ? "border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-800"
          : "border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800"
      }
    >
      <AlertTriangle
        className={`h-4 w-4 ${isDeleted ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`}
      />
      <AlertTitle
        className={`text-sm font-medium ${isDeleted ? "text-red-800 dark:text-red-200" : "text-amber-800 dark:text-amber-200"}`}
      >
        {isDeleted ? "关联 API 已被删除" : "关联 API 已变更，建议检查用例是否需要更新"}
      </AlertTitle>
      <AlertDescription className="flex items-center justify-between mt-1">
        <span className="text-xs text-muted-foreground">
          来源文档: {flag.documentName} · 变更于{" "}
          {new Date(flag.changedAt).toLocaleDateString("zh-CN")}
        </span>
        {onViewChanges && (
          <Button variant="outline" size="sm" className="h-6 text-xs" onClick={onViewChanges}>
            查看变更
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
