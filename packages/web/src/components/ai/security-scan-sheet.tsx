import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { SecurityStatusResponse, SecurityTestType } from "@/types/security";
import type { Environment } from "@nexqa/shared";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  ExternalLink,
  Inbox,
  Loader2,
  RefreshCw,
  ShieldAlert,
  X,
} from "lucide-react";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";

const SCAN_TYPES: {
  type: SecurityTestType;
  label: string;
  defaultOn: boolean;
}[] = [
  { type: "sql-injection", label: "SQL 注入", defaultOn: true },
  { type: "xss", label: "XSS", defaultOn: true },
  { type: "idor", label: "IDOR 越权", defaultOn: true },
  { type: "auth-bypass", label: "认证绕过", defaultOn: true },
  { type: "info-disclosure", label: "信息泄露", defaultOn: true },
  { type: "rate-limit", label: "速率限制", defaultOn: true },
  { type: "ssrf", label: "SSRF", defaultOn: false },
  { type: "overflow", label: "溢出测试", defaultOn: false },
  { type: "path-traversal", label: "路径遍历", defaultOn: false },
  { type: "mass-assignment", label: "批量赋值", defaultOn: false },
];

// ── Scan Phase Card ─────────────────────────────────

function ScanPhaseCard({
  phase,
  status,
  summary,
  progress,
  detail,
}: {
  phase: string;
  status: "done" | "running" | "waiting";
  summary?: string;
  progress?: { current: number; total: number };
  detail?: string;
}) {
  return (
    <Card
      className={cn(
        "transition-colors",
        status === "running" && "border-red-200 dark:border-red-800",
        status === "done" &&
          "border-green-200 dark:border-green-800 bg-green-50/20 dark:bg-green-950/10",
        status === "waiting" && "opacity-60",
      )}
    >
      <CardContent className="py-3 px-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">{phase}</span>
          {status === "done" && (
            <Badge
              variant="outline"
              className="text-[10px] text-green-600 border-green-300"
            >
              <CheckCircle className="h-2.5 w-2.5 mr-0.5" /> 完成
            </Badge>
          )}
          {status === "running" && (
            <Badge
              variant="outline"
              className="text-[10px] text-red-600 border-red-300"
            >
              <Loader2 className="h-2.5 w-2.5 mr-0.5 animate-spin" /> 进行中
            </Badge>
          )}
          {status === "waiting" && (
            <Badge
              variant="outline"
              className="text-[10px] text-muted-foreground"
            >
              <Clock className="h-2.5 w-2.5 mr-0.5" /> 等待
            </Badge>
          )}
        </div>

        {summary && (
          <p className="text-xs text-muted-foreground">{summary}</p>
        )}

        {progress && (
          <div className="space-y-1">
            <Progress
              value={(progress.current / progress.total) * 100}
              className="h-1.5"
            />
            <p className="text-[10px] text-muted-foreground">
              {progress.current}/{progress.total} 用例已生成
            </p>
          </div>
        )}

        {detail && (
          <p className="text-[10px] font-mono text-muted-foreground truncate">
            {detail}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main Sheet ──────────────────────────────────────

interface SecurityScanSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  environments: Environment[];
  onStartScan: (
    environmentId: string,
    testTypes: SecurityTestType[],
  ) => void;
  isScanning: boolean;
  scanStatus?: SecurityStatusResponse;
  onViewReport?: () => void;
  onCancel?: () => void;
  onRetry?: () => void;
  projectId?: string;
}

export function SecurityScanSheet({
  open,
  onOpenChange,
  environments,
  onStartScan,
  isScanning,
  scanStatus,
  onViewReport,
  onCancel,
  onRetry,
  projectId,
}: SecurityScanSheetProps) {
  const [selectedEnvId, setSelectedEnvId] = useState<string>("");
  const [selectedTypes, setSelectedTypes] = useState<Set<SecurityTestType>>(
    () => new Set(SCAN_TYPES.filter((t) => t.defaultOn).map((t) => t.type)),
  );

  function toggleType(type: SecurityTestType) {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  const phase1Status = getPhaseStatus("analyzing");
  const phase2Status = getPhaseStatus("generating");
  const phase3Status = getPhaseStatus("executing");

  function getPhaseStatus(
    phase: "analyzing" | "generating" | "executing",
  ): "done" | "running" | "waiting" {
    if (!scanStatus) return "waiting";
    const order = ["analyzing", "generating", "executing"];
    const currentIdx = order.indexOf(scanStatus.status);
    const phaseIdx = order.indexOf(phase);
    if (scanStatus.status === "completed") return "done";
    if (scanStatus.status === "failed") {
      return phaseIdx <= currentIdx ? "done" : "waiting";
    }
    if (phaseIdx < currentIdx) return "done";
    if (phaseIdx === currentIdx) return "running";
    return "waiting";
  }

  const showConfig = !isScanning && !scanStatus;
  const showProgress = isScanning || (scanStatus && scanStatus.status !== "completed" && scanStatus.status !== "failed");
  const showComplete = scanStatus?.status === "completed";
  const showFailed = scanStatus?.status === "failed";
  const hasEnvironments = environments.length > 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[600px] sm:max-w-[600px] flex flex-col" side="right">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-red-500" />
            AI 安全扫描
          </SheetTitle>
          <SheetDescription>
            {showConfig && "选择环境和测试类型，AI 将自动分析攻击面并生成安全用例"}
            {showProgress && "正在执行安全扫描..."}
            {showComplete && "安全扫描已完成"}
            {showFailed && "扫描执行失败"}
          </SheetDescription>
        </SheetHeader>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Config phase — no environments */}
          {showConfig && !hasEnvironments && (
            <div className="flex flex-col items-center gap-4 py-10 text-center">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                <Inbox className="h-6 w-6 text-muted-foreground" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-sm font-semibold">暂无可用环境</h3>
                <p className="text-xs text-muted-foreground leading-relaxed max-w-[320px]">
                  安全扫描需要在 dev/test 环境中执行，请先创建环境
                </p>
              </div>
              {projectId && (
                <Button variant="outline" size="sm" asChild>
                  <Link
                    to="/p/$projectId/environments"
                    params={{ projectId }}
                  >
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                    前往环境管理
                  </Link>
                </Button>
              )}
            </div>
          )}

          {/* Config phase — has environments */}
          {showConfig && hasEnvironments && (
            <div className="space-y-4">
              {/* Environment select */}
              <div className="space-y-2">
                <label className="text-sm font-medium">扫描环境</label>
                <Select
                  value={selectedEnvId}
                  onValueChange={setSelectedEnvId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择环境" />
                  </SelectTrigger>
                  <SelectContent>
                    {environments.map((env) => (
                      <SelectItem key={env.id} value={env.id}>
                        {env.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  安全测试只应在 dev/test 环境中执行
                </p>
              </div>

              {/* Test type selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium">测试类型</label>
                <div className="grid grid-cols-2 gap-2">
                  {SCAN_TYPES.map((st) => (
                    <label
                      key={st.type}
                      className="flex items-center gap-2 text-xs cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedTypes.has(st.type)}
                        onCheckedChange={() => toggleType(st.type)}
                      />
                      {st.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Progress phase */}
          {showProgress && (
            <div className="space-y-3">
              <ScanPhaseCard
                phase="阶段 1: 攻击面识别"
                status={phase1Status}
                summary={
                  scanStatus?.attackSurfaces
                    ? `分析了 ${scanStatus.attackSurfaces.length} 个接口，识别 ${scanStatus.attackSurfaces.reduce((s, a) => s + a.vectors.length, 0)} 个攻击向量`
                    : undefined
                }
              />
              <ScanPhaseCard
                phase="阶段 2: 生成安全用例"
                status={phase2Status}
                progress={
                  scanStatus?.progress?.phase === "generating"
                    ? {
                        current: scanStatus.progress.current,
                        total: scanStatus.progress.total,
                      }
                    : undefined
                }
                detail={scanStatus?.progress?.detail}
              />
              <ScanPhaseCard
                phase="阶段 3: 执行安全测试"
                status={phase3Status}
                progress={
                  scanStatus?.progress?.phase === "executing"
                    ? {
                        current: scanStatus.progress.current,
                        total: scanStatus.progress.total,
                      }
                    : undefined
                }
              />

              <p className="text-xs text-muted-foreground flex items-start gap-2">
                <span className="text-base leading-4">💡</span>
                AI 正在使用内置安全 Payload 库 + 智能分析生成安全测试用例。
                扫描完成后将生成安全报告。
              </p>
            </div>
          )}

          {/* Failed state */}
          {showFailed && (
            <div className="flex flex-col items-center gap-3 py-8">
              <div className="h-12 w-12 rounded-full bg-red-100 dark:bg-red-950/50 flex items-center justify-center">
                <X className="h-6 w-6 text-red-600" />
              </div>
              <div className="text-center space-y-1">
                <h3 className="text-sm font-semibold">扫描失败</h3>
                <p className="text-xs text-muted-foreground">
                  安全扫描执行过程中出错，请重试
                </p>
              </div>
              {onRetry && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onRetry}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  重试
                </Button>
              )}
            </div>
          )}

          {/* Complete phase */}
          {showComplete && (
            <div className="space-y-4 text-center">
              <div className="mx-auto h-12 w-12 rounded-full bg-green-100 dark:bg-green-950/50 flex items-center justify-center">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold">扫描完成</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  安全扫描已完成，点击查看安全报告
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t shrink-0">
          {showConfig && hasEnvironments && (
            <Button
              className="bg-red-500 hover:bg-red-600 text-white gap-1.5"
              size="sm"
              disabled={!selectedEnvId || selectedTypes.size === 0}
              onClick={() =>
                onStartScan(selectedEnvId, Array.from(selectedTypes))
              }
            >
              <ShieldAlert className="h-4 w-4" />
              开始扫描
            </Button>
          )}
          {showProgress && onCancel && (
            <Button
              variant="outline"
              size="sm"
              onClick={onCancel}
            >
              取消扫描
            </Button>
          )}
          {showComplete && onViewReport && (
            <Button
              className="bg-red-500 hover:bg-red-600 text-white gap-1.5"
              size="sm"
              onClick={onViewReport}
            >
              <ShieldAlert className="h-4 w-4" />
              查看安全报告
            </Button>
          )}
          {showFailed && onRetry && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRetry}
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              重试
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
