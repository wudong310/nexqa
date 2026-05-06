import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MethodBadge } from "@/components/ui/method-badge";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { ApiDiffResult } from "@/types/api-management";
import { AlertTriangle, CheckCircle, Loader2, Minus, Plus } from "lucide-react";

interface ChangeDiffSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  diff: ApiDiffResult | null;
  isConfirming?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ChangeDiffSheet({
  open,
  onOpenChange,
  diff,
  isConfirming = false,
  onConfirm,
  onCancel,
}: ChangeDiffSheetProps) {
  if (!diff) return null;

  const hasChanges =
    diff.summary.added > 0 ||
    diff.summary.removed > 0 ||
    diff.summary.modified > 0;

  const hasBreaking = diff.summary.breaking > 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[520px] sm:w-[600px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>API 变更检测</SheetTitle>
        </SheetHeader>

        <div className="py-4 space-y-4">
          {/* No changes */}
          {!hasChanges && (
            <div className="flex flex-col items-center justify-center py-12">
              <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
              <h3 className="text-base font-medium">没有检测到变更</h3>
              <p className="text-sm text-muted-foreground mt-1">
                文档内容与已存储版本一致，无需更新
              </p>
              <Button variant="outline" className="mt-6" onClick={onCancel}>
                关闭
              </Button>
            </div>
          )}

          {/* Has changes */}
          {hasChanges && (
            <>
              <p className="text-sm">
                检测到文档「{diff.documentName}」有{" "}
                <span className="font-semibold">
                  {diff.summary.added + diff.summary.removed + diff.summary.modified}
                </span>{" "}
                处变更：
              </p>

              {/* Added */}
              {diff.added.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 bg-green-50 dark:bg-green-950/30 border-b">
                    <span className="w-2 h-2 rounded-full bg-green-500" />
                    <span className="text-sm font-medium text-green-700 dark:text-green-300">
                      新增 ({diff.added.length})
                    </span>
                  </div>
                  <div className="divide-y">
                    {diff.added.map((item) => (
                      <div
                        key={item.tempId}
                        className="flex items-center gap-2 px-3 py-2 text-xs"
                      >
                        <MethodBadge method={item.endpoint.method} />
                        <span className="font-mono">{item.endpoint.path}</span>
                        <span className="text-muted-foreground truncate">
                          {item.endpoint.summary}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Modified */}
              {diff.modified.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-950/30 border-b">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
                      修改 ({diff.modified.length})
                    </span>
                  </div>
                  <div className="divide-y">
                    {diff.modified.map((item) => (
                      <div key={item.endpointId} className="px-3 py-2 space-y-1">
                        <div className="flex items-center gap-2 text-xs">
                          <MethodBadge method={item.endpoint.method} />
                          <span className="font-mono">{item.endpoint.path}</span>
                          {item.severity === "breaking" && (
                            <Badge
                              variant="destructive"
                              className="text-[9px] h-4"
                            >
                              Breaking
                            </Badge>
                          )}
                        </div>
                        {item.changes.map((c, i) => (
                          <p
                            key={i}
                            className="text-xs text-muted-foreground ml-6"
                          >
                            <span className="mr-1">
                              {c.type === "added" ? "+" : c.type === "removed" ? "-" : "~"}
                            </span>
                            {c.detail}
                            {c.breaking && (
                              <span className="ml-1 text-red-500">(breaking)</span>
                            )}
                          </p>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Removed */}
              {diff.removed.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-950/30 border-b">
                    <span className="w-2 h-2 rounded-full bg-red-500" />
                    <span className="text-sm font-medium text-red-700 dark:text-red-300">
                      删除 ({diff.removed.length})
                    </span>
                  </div>
                  <div className="divide-y">
                    {diff.removed.map((item) => (
                      <div
                        key={item.tempId}
                        className="flex items-center gap-2 px-3 py-2 text-xs"
                      >
                        <MethodBadge method={item.endpoint.method} />
                        <span className="font-mono line-through text-muted-foreground">
                          {item.endpoint.path}
                        </span>
                        <span className="text-muted-foreground truncate">
                          {item.endpoint.summary}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Breaking Changes warning */}
              {hasBreaking && (
                <Alert
                  variant="destructive"
                  className="border-red-300 dark:border-red-800"
                >
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Breaking Changes</AlertTitle>
                  <AlertDescription className="text-xs space-y-1 mt-1">
                    {diff.removed.map((r) => (
                      <p key={r.tempId}>
                        • {r.endpoint.method} {r.endpoint.path} 被删除，关联测试用例将失效
                      </p>
                    ))}
                    {diff.modified
                      .filter((m) => m.severity === "breaking")
                      .map((m) => (
                        <p key={m.endpointId}>
                          • {m.endpoint.method} {m.endpoint.path}{" "}
                          {m.changes
                            .filter((c) => c.breaking)
                            .map((c) => c.detail)
                            .join("、")}
                        </p>
                      ))}
                  </AlertDescription>
                </Alert>
              )}

              {/* Affected cases */}
              {diff.affectedCases.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">
                    受影响的测试用例 ({diff.affectedCases.length})：
                  </h4>
                  <div className="border rounded-md divide-y">
                    {diff.affectedCases.map((ac) => (
                      <div
                        key={ac.testCaseId}
                        className="flex items-center gap-2 px-3 py-2 text-xs"
                      >
                        <span>• {ac.testCaseName}</span>
                        <Badge
                          variant="outline"
                          className={
                            ac.impactType === "deleted"
                              ? "text-red-600 text-[9px] h-4"
                              : "text-amber-600 text-[9px] h-4"
                          }
                        >
                          {ac.impactType === "deleted"
                            ? "API 已删除"
                            : "待更新"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <Separator />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={onCancel} disabled={isConfirming}>
                  取消
                </Button>
                <Button onClick={onConfirm} disabled={isConfirming}>
                  {isConfirming && (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  )}
                  确认更新
                </Button>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
