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
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useApiEndpoint } from "@/hooks/use-api-documents";
import { LinkedCaseItem } from "./linked-case-item";
import { ParamsTable } from "./params-table";
import { JsonPreview } from "./json-preview";
import { AlertTriangle, FileText, Pencil, Plus, Trash2 } from "lucide-react";

interface EndpointDetailSheetProps {
  endpointId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete?: (id: string) => void;
  onCreateCase?: (endpointId: string) => void;
}

export function EndpointDetailSheet({
  endpointId,
  open,
  onOpenChange,
  onDelete,
  onCreateCase,
}: EndpointDetailSheetProps) {
  const { data: detail, isLoading, error } = useApiEndpoint(endpointId ?? "");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[520px] sm:w-[600px] overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center justify-between">
            <SheetTitle className="text-base">端点详情</SheetTitle>
            {detail && (
              <div className="flex items-center gap-1">
                {onDelete && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => onDelete(detail.id)}
                    title="删除"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            )}
          </div>
        </SheetHeader>

        <div className="py-4 space-y-4">
          {/* Loading state */}
          {isLoading && (
            <div className="space-y-3">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-64" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-16 w-full" />
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="flex items-center gap-2 text-destructive text-sm p-3 bg-destructive/10 rounded-lg">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>加载详情失败：{error.message}</span>
            </div>
          )}

          {/* Normal state */}
          {detail && !isLoading && (
            <>
              {/* Header */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <MethodBadge method={detail.method} className="text-xs" />
                  <span className="font-mono text-sm font-medium">
                    {detail.path}
                  </span>
                </div>
                {detail.summary && (
                  <p className="text-sm text-muted-foreground">
                    {detail.summary}
                  </p>
                )}
              </div>

              <Separator />

              {/* Basic info */}
              <div className="space-y-2">
                <h4 className="text-xs font-medium text-muted-foreground">
                  基本信息
                </h4>
                <div className="grid grid-cols-[80px_1fr] gap-y-1 text-xs">
                  <span className="text-muted-foreground">Method</span>
                  <span className="font-mono">{detail.method}</span>
                  <span className="text-muted-foreground">Path</span>
                  <span className="font-mono">{detail.path}</span>
                  <span className="text-muted-foreground">Summary</span>
                  <span>{detail.summary || "-"}</span>
                </div>
              </div>

              <Separator />

              {/* Path params */}
              <ParamsTable params={detail.pathParams} title="Path 参数" />

              <Separator />

              {/* Query params */}
              <ParamsTable params={detail.queryParams} title="Query 参数" />

              <Separator />

              {/* Headers */}
              <ParamsTable params={detail.headers} title="Headers" />

              <Separator />

              {/* Request body */}
              <div className="space-y-1">
                <h4 className="text-xs font-medium text-muted-foreground">
                  Request Body
                </h4>
                {detail.body ? (
                  <div className="space-y-2">
                    <Badge variant="secondary" className="text-[10px]">
                      {detail.body.contentType}
                    </Badge>
                    <JsonPreview data={detail.body.schema ?? detail.body.example} />
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground/60 italic">无</p>
                )}
              </div>

              <Separator />

              {/* Responses */}
              <div className="space-y-1">
                <h4 className="text-xs font-medium text-muted-foreground">
                  Responses
                </h4>
                {detail.responses.length > 0 ? (
                  <div className="border rounded-md overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <th className="text-left px-3 py-1.5 font-medium w-20">
                            状态码
                          </th>
                          <th className="text-left px-3 py-1.5 font-medium">
                            说明
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.responses.map((resp) => (
                          <tr key={resp.status} className="border-b last:border-0">
                            <td className="px-3 py-1.5 font-mono">
                              <Badge
                                variant="outline"
                                className={
                                  resp.status < 300
                                    ? "text-green-600"
                                    : resp.status < 500
                                      ? "text-amber-600"
                                      : "text-red-600"
                                }
                              >
                                {resp.status}
                              </Badge>
                            </td>
                            <td className="px-3 py-1.5 text-muted-foreground">
                              {resp.description || "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground/60 italic">无</p>
                )}
              </div>

              <Separator />

              {/* Linked test cases */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-medium text-muted-foreground">
                    关联测试用例 ({detail.testCases?.length ?? 0})
                  </h4>
                  {onCreateCase && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-xs gap-1"
                      onClick={() => onCreateCase(detail.id)}
                    >
                      <Plus className="h-3 w-3" />
                      创建测试用例
                    </Button>
                  )}
                </div>

                {detail.testCases && detail.testCases.length > 0 ? (
                  <div className="border rounded-md">
                    {detail.testCases.map((tc) => (
                      <LinkedCaseItem key={tc.id} testCase={tc} />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={<FileText className="h-8 w-8" />}
                    title="暂无关联的测试用例"
                    action={
                      onCreateCase ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onCreateCase(detail.id)}
                        >
                          基于此 API 创建测试用例
                        </Button>
                      ) : undefined
                    }
                    className="py-8"
                  />
                )}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
