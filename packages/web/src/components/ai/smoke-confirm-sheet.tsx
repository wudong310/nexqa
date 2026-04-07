import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { CorePath } from "@/types/ai";
import {
  CheckCircle,
  ExternalLink,
  Flame,
  Inbox,
  Loader2,
} from "lucide-react";
import { Link } from "@tanstack/react-router";

// ── Type badge color map ────────────────────────────

const TYPE_STYLES: Record<
  CorePath["type"],
  { label: string; className: string }
> = {
  auth: {
    label: "认证",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  },
  crud: {
    label: "CRUD",
    className:
      "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  },
  business: {
    label: "业务",
    className:
      "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  },
  health: {
    label: "健康",
    className:
      "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  },
};

// ── Props ───────────────────────────────────────────

interface SmokeConfirmSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: "analyzing" | "ready" | "executing";
  corePaths: CorePath[];
  totalCases: number;
  envName?: string;
  estimatedTime?: string;
  projectId?: string;
  onConfirm: () => void;
  onCancel: () => void;
  onError?: (error: Error) => void;
}

export function SmokeConfirmSheet({
  open,
  onOpenChange,
  status,
  corePaths,
  totalCases,
  envName,
  estimatedTime,
  projectId,
  onConfirm,
  onCancel,
  onError: _onError,
}: SmokeConfirmSheetProps) {
  const hasPaths = (corePaths ?? []).length > 0;
  const hasData = hasPaths && totalCases > 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[480px] sm:max-w-[480px] flex flex-col" side="right">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Flame className="h-5 w-5 text-orange-500" />
            AI 一键冒烟
          </SheetTitle>
          <SheetDescription>
            {status === "analyzing" && "正在分析项目 API，识别核心路径..."}
            {status === "ready" &&
              hasData &&
              `识别到 ${corePaths.length} 条核心路径，共 ${totalCases} 个冒烟用例`}
            {status === "ready" && !hasData && "分析完成"}
            {status === "executing" && "正在执行冒烟测试..."}
          </SheetDescription>
        </SheetHeader>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* ── Analyzing state ──────────────────────── */}
          {status === "analyzing" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
                <span className="text-sm">正在分析 API 文档...</span>
              </div>
              <Progress value={40} className="h-1.5" />
              <p className="text-xs text-muted-foreground">
                识别核心路径，匹配冒烟用例
              </p>
            </div>
          )}

          {/* ── Ready / Executing: has data ──────────── */}
          {(status === "ready" || status === "executing") && hasData && (
            <>
              {/* Summary bar */}
              <div className="flex items-center gap-3 rounded-md bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 px-3 py-2">
                <Flame className="h-4 w-4 text-orange-500 shrink-0" />
                <div className="flex-1 text-sm">
                  <span className="font-medium">{corePaths.length}</span> 条核心路径
                  <span className="mx-1.5 text-muted-foreground">·</span>
                  <span className="font-medium">{totalCases}</span> 个冒烟用例
                </div>
              </div>

              {/* Core paths list */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  核心路径
                </p>
                {(corePaths ?? []).map((path, i) => {
                  const style = TYPE_STYLES[path.type] ?? TYPE_STYLES.business;
                  return (
                    <div
                      key={i}
                      className="rounded-md border bg-card p-3 space-y-1.5"
                    >
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />
                        <span className="text-sm font-medium flex-1 truncate">
                          {path.name}
                        </span>
                        <Badge
                          variant="secondary"
                          className={`text-[10px] px-1.5 py-0 ${style.className}`}
                        >
                          {style.label}
                        </Badge>
                      </div>
                      <p className="text-xs font-mono text-muted-foreground pl-5.5 truncate">
                        {path.endpoints.join(" → ")}
                      </p>
                      {path.reason && (
                        <p className="text-xs text-muted-foreground pl-5.5">
                          {path.reason}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Env & time info */}
              {(envName || estimatedTime) && (
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  {envName && <span>环境: {envName}</span>}
                  {estimatedTime && <span>预计耗时: ~{estimatedTime}</span>}
                </div>
              )}
            </>
          )}

          {/* ── Ready: empty state (0 paths / 0 cases) ── */}
          {(status === "ready" || status === "executing") && !hasData && (
            <div className="flex flex-col items-center gap-4 py-10 text-center">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                <Inbox className="h-6 w-6 text-muted-foreground" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-sm font-semibold">暂无冒烟用例</h3>
                <p className="text-xs text-muted-foreground leading-relaxed max-w-[320px]">
                  当前项目暂无冒烟标记的测试用例，请先在 API 测试页为核心接口添加用例
                </p>
              </div>
              {projectId && (
                <Button variant="outline" size="sm" asChild>
                  <Link
                    to="/p/$projectId/api"
                    params={{ projectId }}
                  >
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                    前往 API 测试
                  </Link>
                </Button>
              )}
            </div>
          )}
        </div>

        {/* ── Footer actions ─────────────────────────── */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t shrink-0">
          <Button variant="outline" size="sm" onClick={onCancel}>
            {hasData ? "取消" : "关闭"}
          </Button>
          {hasData && (
            <Button
              size="sm"
              onClick={onConfirm}
              disabled={status === "analyzing" || status === "executing"}
              className="bg-orange-500 hover:bg-orange-600 text-white gap-1.5"
            >
              {status === "executing" ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  执行中...
                </>
              ) : (
                <>
                  <Flame className="h-3.5 w-3.5" />
                  开始执行
                </>
              )}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
