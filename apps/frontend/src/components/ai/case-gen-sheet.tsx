import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useCaseGen } from "@/hooks/use-case-gen";
import { useLlmGuard } from "@/hooks/use-llm-guard";
import type { CaseGenPhase, CaseGenPurpose, CaseGenStrategy } from "@/types/case-gen";
import { Link } from "@tanstack/react-router";
import { CheckCircle, ExternalLink, Loader2, RefreshCw, RotateCcw, Settings, Trash2, Wand2, XCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AIEmptyState } from "./ai-empty-state";
import { AIErrorState } from "./ai-error-state";
import { AISheetLayout } from "./ai-sheet-layout";

// ── Strategy Badge styles ───────────────────────────
const STRATEGY_STYLES: Record<CaseGenStrategy, { label: string; cls: string; tooltip: string }> = {
  positive: { label: "正向", cls: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300", tooltip: "验证接口在正常输入下返回预期结果" },
  negative: { label: "负向", cls: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300", tooltip: "验证接口对异常/非法输入的错误处理" },
  boundary: { label: "边界", cls: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300", tooltip: "验证接口在临界值（最大/最小/空值）下的行为" },
  destructive: { label: "破坏性", cls: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300", tooltip: "验证接口在极端条件下的稳定性（超大数据、特殊字符、并发等）" },
};
const ALL_STRATEGIES: CaseGenStrategy[] = ["positive", "negative", "boundary", "destructive"];
const DEFAULT_STRATEGIES: CaseGenStrategy[] = [...ALL_STRATEGIES];

// ── Purpose options ─────────────────────────────────
const PURPOSE_OPTIONS: Array<{ value: CaseGenPurpose; label: string; desc: string }> = [
  { value: "functional", label: "功能测试", desc: "验证 API 核心功能正确性" },
  { value: "auth", label: "鉴权测试", desc: "未登录、无权限、Token 过期等" },
  { value: "data-integrity", label: "数据完整性", desc: "验证数据一致性和约束" },
  { value: "security", label: "安全测试", desc: "SQL 注入、XSS、路径遍历等" },
  { value: "idempotent", label: "幂等性测试", desc: "重复请求结果一致、无副作用" },
  { value: "performance", label: "性能测试", desc: "响应时间、超时边界验证" },
];
const ALL_PURPOSES: CaseGenPurpose[] = PURPOSE_OPTIONS.map(p => p.value);
const DEFAULT_PURPOSES: CaseGenPurpose[] = [...ALL_PURPOSES];

// ── Methods that need data isolation ────────────────
const ISOLATION_METHODS = new Set(["DELETE", "PUT", "PATCH"]);

// ── Helpers ─────────────────────────────────────────
function toggleSet<T>(prev: Set<T>, val: T): Set<T> {
  const next = new Set(prev);
  next.has(val) ? next.delete(val) : next.add(val);
  return next;
}

// ── Props ───────────────────────────────────────────
interface CaseGenSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  endpoints: Array<{ id: string; method: string; path: string; name?: string }>;
}

// ── Component ───────────────────────────────────────
export function CaseGenSheet({ open, onOpenChange, projectId, endpoints }: CaseGenSheetProps) {
  const {
    isGenerating, generatedCases, genError, endpointStates,
    currentEndpointIndex, totalEndpoints,
    generate, abort, adoptCasesByEndpoint, retryEndpoint, retryFailed, reset,
  } = useCaseGen(projectId);

  const { isConfigured: llmReady, isLoading: llmLoading } = useLlmGuard(open);

  const [phase, setPhase] = useState<CaseGenPhase>("config");
  const [selStrats, setSelStrats] = useState<Set<CaseGenStrategy>>(new Set(DEFAULT_STRATEGIES));
  const [selPurposes, setSelPurposes] = useState<Set<CaseGenPurpose>>(new Set(DEFAULT_PURPOSES));
  const [selCases, setSelCases] = useState<Set<string>>(new Set());
  const [adoptResult, setAdoptResult] = useState<{ adopted: number; failed: number } | null>(null);

  // Check if endpoints include DELETE/PUT/PATCH
  const needsIsolation = useMemo(
    () => endpoints.some((ep) => ISOLATION_METHODS.has(ep.method.toUpperCase())),
    [endpoints],
  );

  const canGenerate = llmReady && endpoints.length > 0 && selStrats.size > 0 && selPurposes.size > 0;

  const handleGenerate = useCallback(async () => {
    setPhase("analyzing");
    await generate(
      endpoints,
      [...selStrats],
      [...selPurposes],
      needsIsolation,
    );
  }, [generate, endpoints, selStrats, selPurposes, needsIsolation]);

  const handleAdopt = useCallback(async () => {
    const toAdopt = generatedCases.filter((c) => selCases.has(c._tempId));
    if (!toAdopt.length) return;
    setPhase("confirm");
    const result = await adoptCasesByEndpoint(toAdopt);
    setAdoptResult(result);
    setPhase("done");
  }, [generatedCases, selCases, adoptCasesByEndpoint]);

  const handleClose = useCallback(() => {
    onOpenChange(false);
    setTimeout(() => {
      reset(); setPhase("config");
      setSelStrats(new Set(DEFAULT_STRATEGIES)); setSelPurposes(new Set(DEFAULT_PURPOSES));
      setSelCases(new Set()); setAdoptResult(null);
    }, 300);
  }, [onOpenChange, reset]);

  const handleRetry = useCallback(() => { reset(); setPhase("config"); setAdoptResult(null); }, [reset]);

  const handleDiscard = useCallback(() => {
    handleClose();
  }, [handleClose]);

  const handleToggleAll = useCallback(() => {
    setSelCases(selCases.size === generatedCases.length
      ? new Set() : new Set(generatedCases.map((c) => c._tempId)));
  }, [selCases.size, generatedCases]);

  // Auto-transition: when all endpoints finish, select all cases and go to preview
  useEffect(() => {
    if (phase === "analyzing" && endpointStates.length > 0 && !isGenerating) {
      const allFinished = endpointStates.every((ep) => ep.status === "done" || ep.status === "failed");
      if (allFinished) {
        // Auto-select all generated cases
        if (generatedCases.length > 0) {
          setSelCases(new Set(generatedCases.map((c) => c._tempId)));
        }
        setPhase("preview");
      }
    }
  }, [phase, endpointStates, isGenerating, generatedCases]);

  // ── Description ─────────────────────────────────
  const desc: Record<CaseGenPhase, string> = {
    config: "确认端点和测试类型，AI 将自动生成用例",
    analyzing: currentEndpointIndex < totalEndpoints
      ? `正在生成第 ${currentEndpointIndex + 1}/${totalEndpoints} 个接口的测试用例...`
      : "生成完成，正在整理...",
    preview: generatedCases.length > 0 ? `已生成 ${generatedCases.length} 条用例，选择要采纳的用例` : "生成完成",
    confirm: "正在采纳选中的用例...",
    done: "用例已写入系统",
  };

  // ── Footer ──────────────────────────────────────
  const footerMap: Record<CaseGenPhase, React.ReactNode> = {
    config: (<>
      <Button variant="outline" size="sm" onClick={handleClose}>取消</Button>
      <Button size="sm" onClick={handleGenerate} disabled={!canGenerate}
        className="bg-indigo-500 hover:bg-indigo-600 text-white gap-1.5">
        <Wand2 className="h-3.5 w-3.5" />开始生成
      </Button>
    </>),
    analyzing: <Button variant="outline" size="sm" onClick={() => { abort(); setPhase("config"); }}>取消</Button>,
    preview: genError
      ? <Button variant="outline" size="sm" onClick={handleClose}>关闭</Button>
      : (<>
        {endpointStates.some(ep => ep.status === "failed") && (
          <Button variant="outline" size="sm" onClick={() => { setPhase("analyzing"); retryFailed(); }} className="gap-1.5 text-amber-600">
            <RotateCcw className="h-3.5 w-3.5" />重试失败项 ({endpointStates.filter(ep => ep.status === "failed").length})
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={handleRetry} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />重新生成
        </Button>
        <Button variant="outline" size="sm" onClick={handleDiscard} className="gap-1.5 text-destructive hover:text-destructive">
          <Trash2 className="h-3.5 w-3.5" />丢弃
        </Button>
        <Button size="sm" onClick={handleAdopt} disabled={!selCases.size}
          className="bg-indigo-500 hover:bg-indigo-600 text-white gap-1.5">
          <CheckCircle className="h-3.5 w-3.5" />采纳{selCases.size > 0 ? ` (${selCases.size})` : ""}
        </Button>
      </>),
    confirm: <Button size="sm" disabled className="gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" />采纳中...</Button>,
    done: <Button variant="outline" size="sm" onClick={handleClose}>关闭</Button>,
  };

  return (
    <AISheetLayout open={open} onOpenChange={(v) => { if (!v) handleClose(); }}
      title="AI 用例生成" titleIcon={<Wand2 className="h-5 w-5 text-indigo-500" />}
      description={desc[phase]} width="L" footer={footerMap[phase]}>

      {/* ── Config ───────────────────────────────── */}
      {phase === "config" && (llmLoading
        ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        : !llmReady
        ? <AIEmptyState icon={<Settings className="h-6 w-6 text-muted-foreground" />}
            title="尚未配置 AI 模型"
            description="用例生成需要配置 LLM 模型。请前往全局设置页面完成配置。"
            action={
              <Button variant="outline" size="sm" asChild>
                <Link to="/settings">
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                  前往配置
                </Link>
              </Button>
            } />
        : endpoints.length === 0
        ? <AIEmptyState icon={<Wand2 className="h-6 w-6 text-muted-foreground" />}
            title="暂无 API 端点" description="请先为项目添加 API 端点，再使用 AI 用例生成" />
        : <>
            {/* Endpoint list (read-only) */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                已选端点（{endpoints.length}）
              </p>
              <div className="space-y-1.5 max-h-[240px] overflow-y-auto">
                {endpoints.map((ep) => (
                  <div key={ep.id} className="flex items-center gap-3 rounded-md border bg-card p-2.5">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono shrink-0">{ep.method.toUpperCase()}</Badge>
                    <span className="text-sm font-mono truncate flex-1">{ep.path}</span>
                    {ep.name && <span className="text-xs text-muted-foreground truncate max-w-[140px]">{ep.name}</span>}
                  </div>
                ))}
              </div>
            </div>

            {/* Strategy selection */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">测试策略</p>
              <div className="flex flex-wrap gap-3">
                {ALL_STRATEGIES.map((s) => (
                  <label key={s} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={selStrats.has(s)} onCheckedChange={() => setSelStrats((p) => toggleSet(p, s))} />
                    <Badge variant="secondary" className={`text-xs ${STRATEGY_STYLES[s].cls}`} title={STRATEGY_STYLES[s].tooltip}>{STRATEGY_STYLES[s].label}</Badge>
                  </label>
                ))}
              </div>
            </div>

            {/* Purpose selection */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">测试目的</p>
              <div className="grid grid-cols-2 gap-2">
                {PURPOSE_OPTIONS.map((p) => (
                  <label key={p.value} className="flex items-center gap-2.5 rounded-md border bg-card p-2.5 cursor-pointer hover:bg-accent/50 transition-colors">
                    <Checkbox checked={selPurposes.has(p.value)} onCheckedChange={() => setSelPurposes((prev) => toggleSet(prev, p.value))} />
                    <div className="min-w-0">
                      <span className="text-sm font-medium">{p.label}</span>
                      <p className="text-[11px] text-muted-foreground truncate">{p.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
              {selPurposes.size === 0 && (
                <p className="text-xs text-destructive">请至少选择一个测试目的</p>
              )}
            </div>

            {/* Data isolation hint */}
            {needsIsolation && (
              <div className="rounded-md border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/50 p-3">
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  ℹ️ DELETE/PUT/PATCH 用例将自动使用测试 UUID（如 00000000-test-...），不会影响真实数据
                </p>
              </div>
            )}
          </>
      )}

      {/* ── Analyzing ────────────────────────────── */}
      {phase === "analyzing" && (
        <div className="space-y-4">
          {/* 进度条 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {currentEndpointIndex < totalEndpoints
                  ? `正在生成 ${currentEndpointIndex + 1}/${totalEndpoints}`
                  : `已完成 ${totalEndpoints}/${totalEndpoints}`}
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                {totalEndpoints > 0 ? Math.round((Math.min(currentEndpointIndex, totalEndpoints) / totalEndpoints) * 100) : 0}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-indigo-500 transition-all duration-500"
                style={{ width: `${totalEndpoints > 0 ? (Math.min(currentEndpointIndex, totalEndpoints) / totalEndpoints) * 100 : 0}%` }}
              />
            </div>
          </div>

          {/* 端点列表 */}
          <div className="space-y-1.5 max-h-[360px] overflow-y-auto">
            {endpointStates.map((ep) => (
              <div key={ep.endpointId} className="flex items-center gap-3 rounded-md border bg-card p-2.5">
                {/* 状态图标 */}
                {ep.status === "pending" && <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30 shrink-0" />}
                {ep.status === "generating" && <Loader2 className="h-4 w-4 animate-spin text-indigo-500 shrink-0" />}
                {ep.status === "done" && <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />}
                {ep.status === "failed" && <XCircle className="h-4 w-4 text-destructive shrink-0" />}

                {/* 方法 + 路径 */}
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono shrink-0">{ep.method.toUpperCase()}</Badge>
                <span className="text-sm font-mono truncate flex-1">{ep.path}</span>

                {/* 右侧状态 */}
                {ep.status === "done" && (
                  <span className="text-xs text-green-600 dark:text-green-400 shrink-0">{ep.cases.length} 条</span>
                )}
                {ep.status === "failed" && (
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-destructive shrink-0"
                    onClick={() => retryEndpoint(ep.endpointId)}>
                    <RotateCcw className="h-3 w-3 mr-1" />重试
                  </Button>
                )}
                {ep.status === "generating" && (
                  <span className="text-xs text-indigo-500 shrink-0">生成中...</span>
                )}
                {ep.status === "pending" && (
                  <span className="text-xs text-muted-foreground shrink-0">等待</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Preview ──────────────────────────────── */}
      {phase === "preview" && (<>
        {genError && (/LLM not configured|尚未配置/i.test(genError.message)
          ? <AIEmptyState icon={<Settings className="h-6 w-6 text-muted-foreground" />}
              title="尚未配置 AI 模型"
              description="用例生成需要配置 LLM 模型。请前往全局设置页面完成配置。"
              action={
                <Button variant="outline" size="sm" asChild>
                  <Link to="/settings">
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                    前往配置
                  </Link>
                </Button>
              } />
          : <AIErrorState message={genError.message} onRetry={handleGenerate} />
        )}
        {!genError && generatedCases.length === 0 && (
          <AIEmptyState icon={<Wand2 className="h-6 w-6 text-muted-foreground" />}
            title="未生成任何用例" description="AI 未能为所选端点生成测试用例，请尝试调整策略或选择其他端点" />
        )}
        {!genError && generatedCases.length > 0 && (
          <div className="space-y-4">
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer pb-1 border-b">
              <Checkbox checked={selCases.size === generatedCases.length} onCheckedChange={handleToggleAll} />
              全选（{selCases.size}/{generatedCases.length}）
            </label>

            <div className="space-y-3 max-h-[360px] overflow-y-auto">
              {endpointStates.filter(ep => ep.cases.length > 0 || ep.status === "failed").map((ep) => (
                <div key={ep.endpointId} className="space-y-1.5">
                  {/* 分组头部 */}
                  <div className="flex items-center gap-2 py-1">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">{ep.method.toUpperCase()}</Badge>
                    <span className="text-xs font-mono text-muted-foreground truncate flex-1">{ep.path}</span>
                    {ep.status === "done" && <span className="text-xs text-green-600">{ep.cases.length} 条</span>}
                    {ep.status === "failed" && (
                      <Button variant="ghost" size="sm" className="h-5 px-2 text-[10px] text-destructive"
                        onClick={() => retryEndpoint(ep.endpointId)}>
                        <RotateCcw className="h-3 w-3 mr-1" />重试
                      </Button>
                    )}
                  </div>

                  {/* 该 endpoint 的用例 */}
                  {ep.cases.map((tc) => (
                    <label key={tc._tempId} className="flex items-start gap-3 rounded-md border bg-card p-2.5 cursor-pointer hover:bg-accent/50 transition-colors ml-4">
                      <Checkbox checked={selCases.has(tc._tempId)} onCheckedChange={() => setSelCases((p) => toggleSet(p, tc._tempId))} className="mt-0.5" />
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium truncate">{tc.name}</span>
                          <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 shrink-0 ${STRATEGY_STYLES[tc.strategy]?.cls ?? ""}`}>
                            {STRATEGY_STYLES[tc.strategy]?.label ?? tc.strategy}
                          </Badge>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </>)}

      {/* ── Confirm ──────────────────────────────── */}
      {phase === "confirm" && (
        <div className="flex flex-col items-center gap-3 py-10">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
          <p className="text-sm text-muted-foreground">正在采纳 {selCases.size} 条用例...</p>
        </div>
      )}

      {/* ── Done ─────────────────────────────────── */}
      {phase === "done" && adoptResult && (
        <div className="flex flex-col items-center gap-4 py-10 text-center">
          <div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-950 flex items-center justify-center">
            <CheckCircle className="h-6 w-6 text-green-500" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-sm font-semibold">采纳完成</h3>
            <p className="text-sm text-muted-foreground">
              成功采纳 <span className="font-medium text-foreground">{adoptResult.adopted}</span> 条用例
              {adoptResult.failed > 0 && <span className="text-destructive">，{adoptResult.failed} 条失败</span>}
            </p>
          </div>
        </div>
      )}
    </AISheetLayout>
  );
}
