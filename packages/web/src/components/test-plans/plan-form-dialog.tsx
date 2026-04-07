import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  PHASE_OPTIONS,
  PRIORITY_OPTIONS,
  PURPOSE_OPTIONS,
  STRATEGY_OPTIONS,
} from "@/components/tag-filter-bar";
import { api } from "@/lib/api";
import type { CreateTestPlan, TestPlan } from "@nexqa/shared";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { ChevronRight, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

// ── Types ───────────────────────────────────────────

interface PlanFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan?: TestPlan | null;
  onSubmit: (data: CreateTestPlan) => void;
  isPending: boolean;
}

interface PlanFormState {
  name: string;
  description: string;
  purposes: string[];
  strategies: string[];
  phases: string[];
  priorities: string[];
  environmentId: string | null;
  concurrency: number;
  stopOnGateFail: boolean;
  passThreshold: number;
  retryOnFail: number;
  timeoutMs: number;
  maxP0Fails: number;
  maxP1Fails: number;
}

const DEFAULT_STATE: PlanFormState = {
  name: "",
  description: "",
  purposes: [],
  strategies: [],
  phases: [],
  priorities: [],
  environmentId: null,
  concurrency: 3,
  stopOnGateFail: true,
  passThreshold: 95,
  retryOnFail: 0,
  timeoutMs: 30000,
  maxP0Fails: 0,
  maxP1Fails: 3,
};

// ── Helpers ─────────────────────────────────────────

function toggleInArray(arr: string[], val: string): string[] {
  return arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val];
}

function planToState(plan: TestPlan): PlanFormState {
  return {
    name: plan.name,
    description: plan.description,
    purposes: plan.selection?.tags?.purpose ?? [],
    strategies: plan.selection?.tags?.strategy ?? [],
    phases: plan.selection?.tags?.phase ?? [],
    priorities: plan.selection?.tags?.priority ?? [],
    environmentId: plan.execution?.environmentId ?? null,
    concurrency: plan.execution?.concurrency ?? 3,
    stopOnGateFail: plan.execution?.stopOnGateFail ?? true,
    passThreshold: Math.round((plan.criteria?.minPassRate ?? 0.95) * 100),
    retryOnFail: plan.execution?.retryOnFail ?? 0,
    timeoutMs: plan.execution?.timeoutMs ?? 30000,
    maxP0Fails: plan.criteria?.maxP0Fails ?? 0,
    maxP1Fails: plan.criteria?.maxP1Fails ?? 3,
  };
}

function stateToPayload(s: PlanFormState): CreateTestPlan {
  return {
    name: s.name,
    description: s.description,
    selection: {
      tags: {
        ...(s.purposes.length > 0 && { purpose: s.purposes as never[] }),
        ...(s.strategies.length > 0 && { strategy: s.strategies as never[] }),
        ...(s.phases.length > 0 && { phase: s.phases as never[] }),
        ...(s.priorities.length > 0 && { priority: s.priorities as never[] }),
      },
    },
    execution: {
      environmentId: s.environmentId,
      stages: true,
      concurrency: s.concurrency,
      retryOnFail: s.retryOnFail,
      timeoutMs: s.timeoutMs,
      stopOnGateFail: s.stopOnGateFail,
    },
    criteria: {
      minPassRate: s.passThreshold / 100,
      maxP0Fails: s.maxP0Fails,
      maxP1Fails: s.maxP1Fails,
    },
  };
}

// ── Environment type ────────────────────────────────

interface Environment {
  id: string;
  name: string;
  slug: string;
}

// ── Component ───────────────────────────────────────

export function PlanFormDialog({
  open,
  onOpenChange,
  plan,
  onSubmit,
  isPending,
}: PlanFormDialogProps) {
  const [form, setForm] = useState<PlanFormState>(DEFAULT_STATE);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Get projectId from route params (if available)
  let projectId = "";
  try {
    const params = useParams({ from: "/p/$projectId/plans" });
    projectId = params.projectId;
  } catch {
    // Route params not available — that's fine
  }

  // Fetch environments for the select
  const { data: environments = [] } = useQuery<Environment[]>({
    queryKey: ["environments", projectId],
    queryFn: () => api.get(`/environments?projectId=${projectId}`),
    enabled: !!projectId,
  });

  useEffect(() => {
    if (open) {
      setForm(plan ? planToState(plan) : DEFAULT_STATE);
      setAdvancedOpen(false);
    }
  }, [open, plan]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    onSubmit(stateToPayload(form));
  }

  const isEdit = !!plan;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {isEdit ? "编辑测试方案" : "新建测试方案"}
            </DialogTitle>
            <DialogDescription>
              {isEdit
                ? "修改测试方案的配置"
                : "创建一个可复用的测试执行配方"}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* 名称 */}
            <div className="grid gap-2">
              <Label htmlFor="plan-name">名称 *</Label>
              <Input
                id="plan-name"
                placeholder="如：冒烟快测、v2.1 回归"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            {/* 描述 */}
            <div className="grid gap-2">
              <Label htmlFor="plan-desc">描述</Label>
              <Textarea
                id="plan-desc"
                placeholder="方案的用途说明"
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                rows={2}
              />
            </div>

            {/* #11: Environment selection */}
            <div className="grid gap-2">
              <Label className="text-xs">执行环境</Label>
              <Select
                value={form.environmentId ?? "default"}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    environmentId: v === "default" ? null : v,
                  })
                }
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="选择环境" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">默认环境</SelectItem>
                  {environments.map((env) => (
                    <SelectItem key={env.id} value={env.id}>
                      {env.name} ({env.slug})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 筛选条件 */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">筛选条件</Label>

              {/* 目的 */}
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">测试目的</span>
                <div className="flex flex-wrap gap-1">
                  {PURPOSE_OPTIONS.map((opt) => (
                    <Badge
                      key={opt.value}
                      variant={
                        form.purposes.includes(opt.value)
                          ? "default"
                          : "outline"
                      }
                      className="cursor-pointer text-[11px] h-5"
                      onClick={() =>
                        setForm({
                          ...form,
                          purposes: toggleInArray(form.purposes, opt.value),
                        })
                      }
                    >
                      {opt.label}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* 策略 */}
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">测试策略</span>
                <div className="flex flex-wrap gap-1">
                  {STRATEGY_OPTIONS.map((opt) => (
                    <Badge
                      key={opt.value}
                      variant={
                        form.strategies.includes(opt.value)
                          ? "default"
                          : "outline"
                      }
                      className="cursor-pointer text-[11px] h-5"
                      onClick={() =>
                        setForm({
                          ...form,
                          strategies: toggleInArray(
                            form.strategies,
                            opt.value,
                          ),
                        })
                      }
                    >
                      {opt.label}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* 阶段 */}
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">执行阶段</span>
                <div className="flex flex-wrap gap-1">
                  {PHASE_OPTIONS.map((opt) => (
                    <Badge
                      key={opt.value}
                      variant={
                        form.phases.includes(opt.value) ? "default" : "outline"
                      }
                      className="cursor-pointer text-[11px] h-5"
                      onClick={() =>
                        setForm({
                          ...form,
                          phases: toggleInArray(form.phases, opt.value),
                        })
                      }
                    >
                      {opt.label}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* 优先级 */}
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">优先级</span>
                <div className="flex flex-wrap gap-1">
                  {PRIORITY_OPTIONS.map((opt) => (
                    <Badge
                      key={opt.value}
                      variant={
                        form.priorities.includes(opt.value)
                          ? "default"
                          : "outline"
                      }
                      className="cursor-pointer text-[11px] h-5"
                      onClick={() =>
                        setForm({
                          ...form,
                          priorities: toggleInArray(
                            form.priorities,
                            opt.value,
                          ),
                        })
                      }
                    >
                      {opt.label}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            {/* 执行配置 */}
            <div className="space-y-3 border-t pt-3">
              <Label className="text-sm font-medium">执行配置</Label>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="plan-concurrency" className="text-xs">
                    并发数
                  </Label>
                  <Input
                    id="plan-concurrency"
                    type="number"
                    min={1}
                    max={10}
                    value={form.concurrency}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        concurrency: Number(e.target.value) || 1,
                      })
                    }
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="plan-threshold" className="text-xs">
                    通过率阈值 (%)
                  </Label>
                  <Input
                    id="plan-threshold"
                    type="number"
                    min={0}
                    max={100}
                    value={form.passThreshold}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        passThreshold: Number(e.target.value) || 0,
                      })
                    }
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Switch
                  id="plan-stop"
                  checked={form.stopOnGateFail}
                  onCheckedChange={(v) =>
                    setForm({ ...form, stopOnGateFail: v })
                  }
                />
                <Label htmlFor="plan-stop" className="text-sm cursor-pointer">
                  门禁失败时中止执行
                </Label>
              </div>

              {/* #11: Advanced config collapsible */}
              <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
                <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                  <ChevronRight
                    className={`h-3 w-3 transition-transform ${advancedOpen ? "rotate-90" : ""}`}
                  />
                  高级配置
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label className="text-xs">失败重试次数</Label>
                      <Input
                        type="number"
                        min={0}
                        max={3}
                        value={form.retryOnFail}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            retryOnFail: Number(e.target.value) || 0,
                          })
                        }
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label className="text-xs">单用例超时 (ms)</Label>
                      <Input
                        type="number"
                        min={1000}
                        max={120000}
                        step={1000}
                        value={form.timeoutMs}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            timeoutMs: Number(e.target.value) || 30000,
                          })
                        }
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label className="text-xs">P0 失败上限</Label>
                      <Input
                        type="number"
                        min={0}
                        value={form.maxP0Fails}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            maxP0Fails: Number(e.target.value) || 0,
                          })
                        }
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label className="text-xs">P1 失败上限</Label>
                      <Input
                        type="number"
                        min={0}
                        value={form.maxP1Fails}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            maxP1Fails: Number(e.target.value) || 3,
                          })
                        }
                      />
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              取消
            </Button>
            <Button type="submit" disabled={!form.name.trim() || isPending}>
              {isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {isEdit ? "保存" : "创建"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
