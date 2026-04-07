import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { priorityColor } from "@/components/tag-filter-bar";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { TestCase, TestPlan } from "@nexqa/shared";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Loader2,
  Pencil,
  Play,
} from "lucide-react";
import { useMemo, useState } from "react";

// ── Label maps ──────────────────────────────────────

const PURPOSE_LABELS: Record<string, string> = {
  functional: "功能",
  auth: "鉴权",
  "data-integrity": "数据完整性",
  security: "安全",
  idempotent: "幂等",
  performance: "性能",
};

const STRATEGY_LABELS: Record<string, string> = {
  positive: "正向",
  negative: "反向",
  boundary: "边界值",
  destructive: "破坏性",
};

const PHASE_LABELS: Record<string, string> = {
  smoke: "冒烟",
  regression: "回归",
  full: "完整",
  targeted: "定向",
};

// ── Helpers ─────────────────────────────────────────

function matchesPlanSelection(tc: TestCase, plan: TestPlan): boolean {
  const tags = plan.selection?.tags;
  if (!tags) return true;

  const tcTags =
    tc.tags && typeof tc.tags === "object" && !Array.isArray(tc.tags)
      ? tc.tags
      : null;
  if (!tcTags) return false;

  if (tags.purpose?.length) {
    const tp = Array.isArray(tcTags.purpose) ? tcTags.purpose : [];
    if (!tags.purpose.some((p) => tp.includes(p))) return false;
  }
  if (tags.strategy?.length) {
    const ts = Array.isArray(tcTags.strategy) ? tcTags.strategy : [];
    if (!tags.strategy.some((s) => ts.includes(s))) return false;
  }
  if (tags.phase?.length) {
    const tph = Array.isArray(tcTags.phase) ? tcTags.phase : [];
    if (!tags.phase.some((p) => tph.includes(p))) return false;
  }
  if (tags.priority?.length) {
    if (!tags.priority.includes(tcTags.priority as never)) return false;
  }

  return true;
}

/** Group cases by endpoint (method + path) */
function groupByEndpoint(
  cases: TestCase[],
): Map<string, { method: string; path: string; cases: TestCase[] }> {
  const groups = new Map<
    string,
    { method: string; path: string; cases: TestCase[] }
  >();
  for (const tc of cases) {
    const key = `${tc.request.method} ${tc.request.path}`;
    if (!groups.has(key)) {
      groups.set(key, {
        method: tc.request.method,
        path: tc.request.path,
        cases: [],
      });
    }
    groups.get(key)!.cases.push(tc);
  }
  return groups;
}

// ── Component ───────────────────────────────────────

interface PlanDetailViewProps {
  plan: TestPlan;
  projectId: string;
  onBack: () => void;
  onEdit: () => void;
  onExecute: () => void;
  isExecuting: boolean;
}

export function PlanDetailView({
  plan,
  projectId,
  onBack,
  onEdit,
  onExecute,
  isExecuting,
}: PlanDetailViewProps) {
  const { data: allCases = [] } = useQuery<TestCase[]>({
    queryKey: ["test-cases", projectId],
    queryFn: () => api.get(`/test-cases?projectId=${projectId}`),
  });

  const matchedCases = allCases.filter((tc) => matchesPlanSelection(tc, plan));

  // #12: Group by endpoint
  const grouped = useMemo(
    () => groupByEndpoint(matchedCases),
    [matchedCases],
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          className="h-8 w-8"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold truncate">{plan.name}</h2>
          {plan.description && (
            <p className="text-sm text-muted-foreground">{plan.description}</p>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5 mr-1" />
          编辑
        </Button>
        <Button size="sm" onClick={onExecute} disabled={isExecuting}>
          {isExecuting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
          ) : (
            <Play className="h-3.5 w-3.5 mr-1" />
          )}
          执行方案
        </Button>
      </div>

      {/* Configuration */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* 筛选条件 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">筛选条件</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <FilterSection
              label="测试目的"
              values={plan.selection?.tags?.purpose}
              labelMap={PURPOSE_LABELS}
            />
            <FilterSection
              label="测试策略"
              values={plan.selection?.tags?.strategy}
              labelMap={STRATEGY_LABELS}
            />
            <FilterSection
              label="执行阶段"
              values={plan.selection?.tags?.phase}
              labelMap={PHASE_LABELS}
            />
            <FilterSection
              label="优先级"
              values={plan.selection?.tags?.priority}
              colorFn={priorityColor}
            />
            {!plan.selection?.tags?.purpose?.length &&
              !plan.selection?.tags?.strategy?.length &&
              !plan.selection?.tags?.phase?.length &&
              !plan.selection?.tags?.priority?.length && (
                <p className="text-xs text-muted-foreground">
                  全部用例（无筛选条件）
                </p>
              )}
          </CardContent>
        </Card>

        {/* 执行配置 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">执行配置</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-y-3 text-sm">
              <ConfigRow
                label="并发数"
                value={String(plan.execution?.concurrency ?? 3)}
              />
              <ConfigRow
                label="门禁策略"
                value={
                  plan.execution?.stopOnGateFail ? "失败中止" : "继续执行"
                }
              />
              <ConfigRow
                label="通过率阈值"
                value={`${Math.round((plan.criteria?.minPassRate ?? 0.95) * 100)}%`}
              />
              <ConfigRow
                label="P0 失败上限"
                value={String(plan.criteria?.maxP0Fails ?? 0)}
              />
              <ConfigRow
                label="P1 失败上限"
                value={String(plan.criteria?.maxP1Fails ?? 3)}
              />
              <ConfigRow
                label="失败重试"
                value={`${plan.execution?.retryOnFail ?? 0} 次`}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Separator />

      {/* #12: Grouped case preview */}
      <div>
        <h3 className="text-sm font-medium mb-3">
          匹配用例预览
          <Badge variant="secondary" className="ml-2 text-[10px]">
            {matchedCases.length} 个
          </Badge>
        </h3>
        {matchedCases.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            没有匹配的用例。调整筛选条件或先生成用例。
          </p>
        ) : (
          <div className="border rounded-md overflow-hidden">
            {[...grouped.entries()].map(([key, group]) => (
              <EndpointGroup
                key={key}
                method={group.method}
                path={group.path}
                cases={group.cases}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Endpoint Group ──────────────────────────────────

const methodColors: Record<string, string> = {
  GET: "text-blue-600",
  POST: "text-green-600",
  PUT: "text-amber-600",
  PATCH: "text-orange-600",
  DELETE: "text-red-600",
};

function EndpointGroup({
  method,
  path,
  cases,
}: {
  method: string;
  path: string;
  cases: TestCase[];
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b last:border-0">
      <button
        type="button"
        className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted/50 text-left"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
        )}
        <span
          className={cn(
            "font-mono font-medium w-14 shrink-0",
            methodColors[method],
          )}
        >
          {method}
        </span>
        <span className="font-mono text-muted-foreground truncate flex-1">
          {path}
        </span>
        <Badge variant="secondary" className="text-[10px] h-4 shrink-0">
          {cases.length}
        </Badge>
      </button>
      {expanded && (
        <div className="divide-y bg-muted/20">
          {cases.map((tc) => (
            <div
              key={tc.id}
              className="flex items-center gap-3 px-8 py-1.5 text-xs"
            >
              <span className="truncate flex-1 font-medium">{tc.name}</span>
              {tc.tags &&
                typeof tc.tags === "object" &&
                !Array.isArray(tc.tags) &&
                "priority" in tc.tags && (
                  <Badge
                    variant="outline"
                    className={`text-[10px] h-4 ${priorityColor(String(tc.tags.priority))}`}
                  >
                    {String(tc.tags.priority)}
                  </Badge>
                )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────

function FilterSection({
  label,
  values,
  labelMap,
  colorFn,
}: {
  label: string;
  values?: string[];
  labelMap?: Record<string, string>;
  colorFn?: (v: string) => string;
}) {
  if (!values?.length) return null;
  return (
    <div className="space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-1">
        {values.map((v) => (
          <Badge
            key={v}
            variant="secondary"
            className={`text-[10px] h-5 ${colorFn?.(v) ?? ""}`}
          >
            {labelMap?.[v] ?? v}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-xs font-medium">{value}</span>
    </>
  );
}
