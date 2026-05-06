import { TagEditor } from "@/components/tag-editor";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { TestCase, TestCaseTags, TestResult } from "@nexqa/shared";
import { CheckCircle, Loader2, Play, Terminal, XCircle } from "lucide-react";
import { Suspense, lazy } from "react";

const MonacoEditor = lazy(() =>
  import("@monaco-editor/react").then((m) => ({ default: m.default })),
);

interface CaseDetailSheetProps {
  testCase: TestCase | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editorValue: string;
  onEditorChange: (value: string) => void;
  editingTags: TestCaseTags | null;
  onEditingTagsChange: (tags: TestCaseTags) => void;
  onSave: () => void;
  onExecute: () => void;
  isExecuting: boolean;
  execResult: TestResult | null;
  resolvedTheme: string;
}

export function CaseDetailSheet({
  testCase,
  open,
  onOpenChange,
  editorValue,
  onEditorChange,
  editingTags,
  onEditingTagsChange,
  onSave,
  onExecute,
  isExecuting,
  execResult,
  resolvedTheme,
}: CaseDetailSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        {testCase && (
          <>
            <SheetHeader>
              <SheetTitle>{testCase.name}</SheetTitle>
              <SheetDescription>测试用例详情</SheetDescription>
              {/* Tags + Actions — 水平平铺 */}
              <div className="flex items-center gap-2 pt-2 pb-1 flex-wrap">
                {editingTags && (
                  <TagEditor tags={editingTags} onChange={onEditingTagsChange} />
                )}
                <div className="flex items-center gap-1 ml-auto shrink-0">
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onSave}>
                    保存
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    onClick={onExecute}
                    disabled={isExecuting}
                  >
                    {isExecuting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                    ) : (
                      <Play className="h-3.5 w-3.5 mr-1" />
                    )}
                    执行
                  </Button>
                </div>
              </div>
            </SheetHeader>
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 min-h-0">
                <Suspense fallback={<div className="p-4">加载编辑器...</div>}>
                  <MonacoEditor
                    height="100%"
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

              {/* 执行结果 — 常驻显示 */}
              <div className="border-t shrink-0 max-h-[40vh] overflow-y-auto">
                {isExecuting ? (
                  <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>执行中...</span>
                  </div>
                ) : execResult && execResult.caseId === testCase.id ? (
                  <div className="p-3 bg-muted/50">
                    <div className="flex items-center gap-2 text-sm mb-1">
                      {execResult.passed ? (
                        <span className="text-green-600 font-medium flex items-center gap-1">
                          <CheckCircle className="h-4 w-4" /> 通过
                        </span>
                      ) : (
                        <span className="text-red-600 font-medium flex items-center gap-1">
                          <XCircle className="h-4 w-4" /> 失败
                        </span>
                      )}
                      <span className="font-mono">
                        {execResult.response.status}{" "}
                        {execResult.response.statusText}
                      </span>
                      <span className="text-muted-foreground">
                        {execResult.response.duration}ms
                      </span>
                      {execResult.failReason && (
                        <span className="text-red-600 text-xs">
                          {execResult.failReason}
                        </span>
                      )}
                    </div>
                    <pre className="text-xs font-mono whitespace-pre-wrap max-h-[200px] overflow-y-auto">
                      {JSON.stringify(execResult.response.body, null, 2).slice(
                        0,
                        2000,
                      )}
                    </pre>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                    <Terminal className="h-4 w-4" />
                    <span>点击"执行"运行测试用例</span>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
