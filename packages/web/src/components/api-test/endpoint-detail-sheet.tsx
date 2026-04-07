import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { methodColor } from "@/utils/api-test-helpers";
import type { ApiEndpoint } from "@nexqa/shared";
import { Pencil, Trash2 } from "lucide-react";
import { Suspense, lazy } from "react";

const MonacoEditor = lazy(() =>
  import("@monaco-editor/react").then((m) => ({ default: m.default })),
);

interface EndpointDetailSheetProps {
  endpoint: ApiEndpoint | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingEndpoint: boolean;
  onSetEditingEndpoint: (editing: boolean) => void;
  editorValue: string;
  onEditorChange: (value: string) => void;
  onSave: () => void;
  onDelete: (id: string) => void;
  onCancelEdit: () => void;
  resolvedTheme: string;
}

export function EndpointDetailSheet({
  endpoint,
  open,
  onOpenChange,
  editingEndpoint,
  onSetEditingEndpoint,
  editorValue,
  onEditorChange,
  onSave,
  onDelete,
  onCancelEdit,
  resolvedTheme,
}: EndpointDetailSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        {endpoint && (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <span
                  className={`text-xs font-bold px-1.5 py-0.5 rounded ${methodColor(endpoint.method)}`}
                >
                  {endpoint.method}
                </span>
                <span className="font-mono text-sm">{endpoint.path}</span>
              </SheetTitle>
              <SheetDescription>
                {endpoint.summary || "接口详情"}
              </SheetDescription>

              {/* 结构化信息卡片 */}
              {!editingEndpoint && (
                <div className="mt-3 space-y-3 text-xs overflow-auto max-h-[calc(100vh-220px)]">
                  {/* Path 参数 */}
                  {endpoint.pathParams.length > 0 && (
                    <div>
                      <div className="font-medium mb-1 text-foreground">
                        路径参数
                      </div>
                      <div className="space-y-1">
                        {endpoint.pathParams.map((p, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-2 px-2 py-1 bg-muted/50 rounded"
                          >
                            <code className="font-mono text-primary">
                              {p.name}
                            </code>
                            <span className="text-muted-foreground">
                              {p.type}
                            </span>
                            {p.required && (
                              <span className="text-red-500 text-[10px]">
                                必填
                              </span>
                            )}
                            {p.description && (
                              <span className="text-muted-foreground truncate">
                                — {p.description}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Query 参数 */}
                  {endpoint.queryParams.length > 0 && (
                    <div>
                      <div className="font-medium mb-1 text-foreground">
                        查询参数
                      </div>
                      <div className="space-y-1">
                        {endpoint.queryParams.map((p, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-2 px-2 py-1 bg-muted/50 rounded"
                          >
                            <code className="font-mono text-primary">
                              {p.name}
                            </code>
                            <span className="text-muted-foreground">
                              {p.type}
                            </span>
                            {p.required && (
                              <span className="text-red-500 text-[10px]">
                                必填
                              </span>
                            )}
                            {p.description && (
                              <span className="text-muted-foreground truncate">
                                — {p.description}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Headers */}
                  {endpoint.headers.length > 0 && (
                    <div>
                      <div className="font-medium mb-1 text-foreground">
                        请求头
                      </div>
                      <div className="space-y-1">
                        {endpoint.headers.map((h, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-2 px-2 py-1 bg-muted/50 rounded"
                          >
                            <code className="font-mono text-primary">
                              {h.name}
                            </code>
                            <span className="text-muted-foreground">
                              {h.type}
                            </span>
                            {h.required && (
                              <span className="text-red-500 text-[10px]">
                                必填
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* 请求体 */}
                  {endpoint.body && (
                    <div>
                      <div className="font-medium mb-1 text-foreground">
                        请求体
                        <span className="ml-2 font-normal text-muted-foreground">
                          {endpoint.body.contentType}
                        </span>
                      </div>
                      {endpoint.body.schema != null && (
                        <pre className="text-[11px] font-mono bg-muted/50 rounded p-2 overflow-auto max-h-40">
                          {JSON.stringify(endpoint.body.schema, null, 2)}
                        </pre>
                      )}
                      {endpoint.body.example != null && (
                        <div className="mt-1">
                          <span className="text-muted-foreground">示例：</span>
                          <pre className="text-[11px] font-mono bg-muted/50 rounded p-2 overflow-auto max-h-32 mt-0.5">
                            {JSON.stringify(endpoint.body.example, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                  {/* 响应 */}
                  {endpoint.responses.length > 0 && (
                    <div>
                      <div className="font-medium mb-1 text-foreground">
                        响应
                      </div>
                      <div className="space-y-1">
                        {endpoint.responses.map((r, i) => (
                          <div
                            key={i}
                            className="px-2 py-1 bg-muted/50 rounded"
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className={`font-mono font-bold ${
                                  r.status >= 200 && r.status < 300
                                    ? "text-green-600"
                                    : r.status >= 400
                                      ? "text-red-600"
                                      : "text-yellow-600"
                                }`}
                              >
                                {r.status}
                              </span>
                              {r.description && (
                                <span className="text-muted-foreground">
                                  {r.description}
                                </span>
                              )}
                            </div>
                            {r.example != null && (
                              <pre className="text-[11px] font-mono mt-1 overflow-auto max-h-24">
                                {JSON.stringify(r.example, null, 2)}
                              </pre>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center gap-1 pt-2">
                {editingEndpoint ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onCancelEdit}
                    >
                      取消
                    </Button>
                    <Button size="sm" onClick={onSave}>
                      保存
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onSetEditingEndpoint(true)}
                    >
                      <Pencil className="h-3 w-3 mr-1" />
                      编辑 JSON
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive border-destructive/50"
                      onClick={() => onDelete(endpoint.id)}
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      删除
                    </Button>
                  </>
                )}
              </div>
            </SheetHeader>

            {/* 编辑模式才显示 Monaco */}
            {editingEndpoint && (
              <div className="flex-1 overflow-hidden">
                <Suspense
                  fallback={<div className="p-4">加载编辑器...</div>}
                >
                  <MonacoEditor
                    height="calc(100vh - 140px)"
                    language="json"
                    theme={resolvedTheme === "dark" ? "vs-dark" : "light"}
                    value={editorValue}
                    onChange={(v) => onEditorChange(v || "")}
                    options={{
                      minimap: { enabled: false },
                      fontSize: 13,
                      lineNumbers: "on",
                      scrollBeyondLastLine: false,
                      automaticLayout: true,
                    }}
                  />
                </Suspense>
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
