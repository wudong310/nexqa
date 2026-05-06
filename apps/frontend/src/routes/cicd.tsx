import { CICDHistoryRow } from "@/components/cicd/cicd-history-row";
import { CronInput } from "@/components/cicd/cron-input";
import { HistoryFilters, HistorySummary } from "@/components/cicd/history-filters";
import { TriggerRuleCard } from "@/components/cicd/trigger-rule-card";
import {
  OutgoingWebhookRow,
  WebhookEndpointCard,
} from "@/components/cicd/webhook-config-card";
import { DiffItem } from "@/components/regression/diff-item";
import { DiffSummaryCards } from "@/components/regression/diff-summary-cards";
import { ImpactPanel } from "@/components/regression/impact-panel";
import { RegressionPlanCard } from "@/components/regression/regression-plan-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useCICDExecutions,
  useCreateTriggerRule,
  useDeleteTriggerRule,
  useRegenerateToken,
  useToggleTriggerRule,
  useTriggerRules,
  useWebhookConfig,
} from "@/hooks/use-cicd";
import {
  useApiDiff,
  useExecuteRegression,
  useGenerateRegression,
  useImpactAnalysis,
  useRegressionPlan,
} from "@/hooks/use-regression";
import type { ApiDiff, ImpactAnalysis } from "@/types/regression";
import type { Environment } from "@nexqa/shared";
import { useQuery } from "@tanstack/react-query";
import { useParams, useSearch } from "@tanstack/react-router";
import {
  Clock,
  GitCompare,
  History,
  Loader2,
  Plus,
  Sparkles,
  Upload,
  Webhook,
  Zap,
} from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";

// ── Auto Regression Tab ─────────────────────────────────

function AutoRegressionTab({ projectId }: { projectId: string }) {
  const [specContent, setSpecContent] = useState("");
  const [diffResult, setDiffResult] = useState<ApiDiff | null>(null);
  const [impactData, setImpactData] = useState<ImpactAnalysis | null>(null);
  const [regressionId, setRegressionId] = useState<string | undefined>();
  const [showImpact, setShowImpact] = useState(false);

  const diffMutation = useApiDiff(projectId);
  const generateMutation = useGenerateRegression(projectId);
  const executeMutation = useExecuteRegression(projectId);
  const { data: plan } = useRegressionPlan(projectId, regressionId);

  const handleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const text = await file.text();
      setSpecContent(text);
      diffMutation.mutate(
        { specContent: text, source: "manual" },
        {
          onSuccess: (data) => {
            setDiffResult(data);
            toast.success("API Diff 分析完成");
          },
          onError: (err) => toast.error(err.message),
        },
      );
    },
    [diffMutation],
  );

  const handleAnalyzeImpact = useCallback(async () => {
    if (!diffResult) return;
    try {
      const data = await api.post<ImpactAnalysis>(
        `/projects/api-diff/analyze-impact`,
        { projectId, diffId: diffResult.id },
      );
      setImpactData(data);
      setShowImpact(true);
    } catch {
      toast.error("影响分析失败");
    }
  }, [diffResult, projectId]);

  const handleGenerate = useCallback(() => {
    if (!diffResult) return;
    generateMutation.mutate(
      { diffId: diffResult.id, autoAdjust: true },
      {
        onSuccess: (data) => setRegressionId(data.regressionId),
        onError: (err) => toast.error(err.message),
      },
    );
  }, [diffResult, generateMutation]);

  const handleExecute = useCallback(() => {
    if (!regressionId) return;
    executeMutation.mutate(
      { regressionId },
      {
        onSuccess: () => toast.success("回归测试已开始执行"),
        onError: (err) => toast.error(err.message),
      },
    );
  }, [regressionId, executeMutation]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-teal-500" />
          AI 自动回归测试
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          检测 API 变更，分析影响范围，自动生成回归方案
        </p>
      </div>

      {/* Upload card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">API 文档对比</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <p className="text-xs text-muted-foreground mb-2">
                上传新版 API 文档（OpenAPI YAML/JSON）与当前版本自动对比
              </p>
              <div className="flex items-center gap-2">
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept=".yaml,.yml,.json"
                    className="hidden"
                    onChange={handleUpload}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="pointer-events-none"
                    asChild
                  >
                    <span>
                      <Upload className="h-3.5 w-3.5 mr-1.5" />
                      上传新版文档
                    </span>
                  </Button>
                </label>
                {diffMutation.isPending && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> 分析中...
                  </span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Diff results */}
      {diffResult && (
        <div className="space-y-4">
          <DiffSummaryCards diff={diffResult} />
          <div className="space-y-3">
            {diffResult.added.map((item) => (
              <DiffItem key={`add-${item.path}`} type="added" item={item} />
            ))}
            {diffResult.removed.map((item) => (
              <DiffItem key={`rm-${item.path}`} type="removed" item={item} />
            ))}
            {diffResult.modified.map((item) => (
              <DiffItem
                key={`mod-${item.path}`}
                type="modified"
                item={item}
                onViewImpact={handleAnalyzeImpact}
              />
            ))}
          </div>

          {/* Impact panel */}
          {showImpact && impactData && (
            <ImpactPanel impact={impactData} />
          )}

          {/* Generate button */}
          <Button
            className="bg-teal-600 hover:bg-teal-700 text-white"
            onClick={handleGenerate}
            disabled={generateMutation.isPending}
          >
            {generateMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
            ) : (
              <Sparkles className="h-4 w-4 mr-1.5" />
            )}
            AI 生成回归方案
          </Button>
        </div>
      )}

      {/* Plan */}
      {plan && (
        <RegressionPlanCard
          plan={plan}
          onExecute={handleExecute}
          onSaveAsPlan={() => toast.info("保存为方案（待实现）")}
          onAdjust={() => toast.info("调整后执行（待实现）")}
        />
      )}
    </div>
  );
}

// ── Webhook Tab ─────────────────────────────────────────

function WebhookTab({ projectId }: { projectId: string }) {
  const { data: config } = useWebhookConfig(projectId);
  const regenerateMutation = useRegenerateToken(projectId);

  return (
    <div className="space-y-6">
      <WebhookEndpointCard
        config={config}
        projectId={projectId}
        onRegenerateToken={() =>
          regenerateMutation.mutate(undefined, {
            onSuccess: () => toast.success("Token 已重新生成"),
          })
        }
      />

      {/* Outgoing webhooks */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              发送端点 (Outgoing Webhook)
            </CardTitle>
            <Button variant="outline" size="sm" className="text-xs">
              <Plus className="h-3 w-3 mr-1" /> 添加通知
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            测试完成后向以下 URL 发送结果通知。
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {config?.outgoing && config.outgoing.length > 0 ? (
            config.outgoing.map((wh) => (
              <OutgoingWebhookRow
                key={wh.id}
                webhook={wh}
                onEdit={() => {}}
                onTest={() => toast.info("测试发送（待实现）")}
                onToggle={() => {}}
                onDelete={() => {}}
              />
            ))
          ) : (
            <p className="text-xs text-muted-foreground text-center py-4">
              暂未配置通知 Webhook
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Trigger Rules Tab ───────────────────────────────────

function TriggerRulesTab({ projectId }: { projectId: string }) {
  const { data: rules = [] } = useTriggerRules(projectId);
  const toggleMutation = useToggleTriggerRule(projectId);
  const deleteMutation = useDeleteTriggerRule(projectId);
  const createMutation = useCreateTriggerRule(projectId);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTriggerType, setNewTriggerType] = useState("api-change");
  const [newActionType, setNewActionType] = useState("regression");
  const [newEnvSlug, setNewEnvSlug] = useState("test");
  const [newCron, setNewCron] = useState("0 8 * * *");

  const handleCreate = useCallback(() => {
    createMutation.mutate(
      {
        name: newName,
        enabled: true,
        trigger: {
          type: newTriggerType as "api-change" | "schedule" | "webhook" | "manual",
          config: newTriggerType === "schedule" ? { cron: newCron } : {},
        },
        action: {
          type: newActionType as "smoke" | "regression" | "full" | "security" | "custom-plan",
          environmentSlug: newEnvSlug,
        },
        notification: {
          webhookIds: [],
          condition: "failure-only",
        },
      },
      {
        onSuccess: () => {
          setShowNew(false);
          toast.success("规则已创建");
        },
      },
    );
  }, [createMutation, newName, newTriggerType, newActionType, newEnvSlug, newCron]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">触发规则</CardTitle>
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => setShowNew(true)}
            >
              <Plus className="h-3 w-3 mr-1" /> 新建规则
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            定义何时自动触发测试执行
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {rules.length > 0 ? (
            rules.map((rule) => (
              <TriggerRuleCard
                key={rule.id}
                rule={rule}
                onToggle={(enabled) =>
                  toggleMutation.mutate({ id: rule.id, enabled })
                }
                onEdit={() => {}}
                onDelete={() =>
                  deleteMutation.mutate(rule.id, {
                    onSuccess: () => toast.success("规则已删除"),
                  })
                }
              />
            ))
          ) : (
            <EmptyState
              icon={<Zap className="h-10 w-10" />}
              title="还没有触发规则"
              description="配置触发规则，让测试自动执行"
              action={
                <Button
                  size="sm"
                  onClick={() => setShowNew(true)}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> 新建规则
                </Button>
              }
            />
          )}
        </CardContent>
      </Card>

      {/* New Rule Dialog */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>新建触发规则</DialogTitle>
            <DialogDescription>
              配置自动触发测试的规则
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>规则名称</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="API 变更自动回归"
              />
            </div>
            <div className="space-y-1.5">
              <Label>触发类型</Label>
              <Select value={newTriggerType} onValueChange={setNewTriggerType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="api-change">API 文档变更</SelectItem>
                  <SelectItem value="schedule">定时触发</SelectItem>
                  <SelectItem value="webhook">Webhook 触发</SelectItem>
                  <SelectItem value="manual">手动触发</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {newTriggerType === "schedule" && (
              <CronInput value={newCron} onChange={setNewCron} />
            )}
            <div className="space-y-1.5">
              <Label>执行动作</Label>
              <Select value={newActionType} onValueChange={setNewActionType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="regression">AI 自动回归</SelectItem>
                  <SelectItem value="smoke">一键冒烟</SelectItem>
                  <SelectItem value="security">安全扫描</SelectItem>
                  <SelectItem value="full">完整测试</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>目标环境 (slug)</Label>
              <Input
                value={newEnvSlug}
                onChange={(e) => setNewEnvSlug(e.target.value)}
                placeholder="test"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>
              取消
            </Button>
            <Button onClick={handleCreate} disabled={!newName || createMutation.isPending}>
              {createMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              )}
              创建规则
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Execution History Tab ───────────────────────────────

function ExecutionHistoryTab({ projectId }: { projectId: string }) {
  const [triggerType, setTriggerType] = useState("all");
  const [result, setResult] = useState("all");
  const [timeRange, setTimeRange] = useState("7d");

  const { data: executions = [], isLoading } = useCICDExecutions(projectId, {
    triggerType,
    result,
    timeRange,
  });

  const timeLabels: Record<string, string> = {
    "7d": "最近 7 天",
    "30d": "最近 30 天",
    "90d": "最近 90 天",
    all: "全部",
  };

  return (
    <div className="space-y-4">
      <HistoryFilters
        triggerType={triggerType}
        setTriggerType={setTriggerType}
        result={result}
        setResult={setResult}
        timeRange={timeRange}
        setTimeRange={setTimeRange}
      />

      <div className="space-y-2">
        {isLoading ? (
          <p className="text-xs text-muted-foreground text-center py-8">
            加载中...
          </p>
        ) : executions.length === 0 ? (
          <EmptyState
            icon={<Clock className="h-10 w-10" />}
            title="还没有 CI/CD 执行记录"
            description="配置触发规则或通过 Webhook 触发第一次自动执行"
            action={
              <Button size="sm" variant="outline">
                <Zap className="h-3.5 w-3.5 mr-1" /> 配置触发规则
              </Button>
            }
          />
        ) : (
          executions.map((exec) => (
            <CICDHistoryRow
              key={exec.id}
              execution={exec}
              onView={() => {}}
            />
          ))
        )}
      </div>

      {executions.length > 0 && (
        <HistorySummary
          executions={executions}
          timeRangeLabel={timeLabels[timeRange] ?? timeRange}
        />
      )}
    </div>
  );
}

// ── CI/CD Page ──────────────────────────────────────────

export function CICDPage() {
  const { projectId } = useParams({ from: "/p/$projectId/cicd" });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">CI/CD 集成</h1>
        <p className="text-sm text-muted-foreground mt-1">
          配置 Webhook、触发规则和查看执行历史
        </p>
      </div>

      <Tabs defaultValue="regression" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="regression" className="gap-1.5 text-xs">
            <GitCompare className="h-3.5 w-3.5" />
            自动回归
          </TabsTrigger>
          <TabsTrigger value="webhook" className="gap-1.5 text-xs">
            <Webhook className="h-3.5 w-3.5" />
            Webhook
          </TabsTrigger>
          <TabsTrigger value="rules" className="gap-1.5 text-xs">
            <Zap className="h-3.5 w-3.5" />
            触发规则
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5 text-xs">
            <History className="h-3.5 w-3.5" />
            执行历史
          </TabsTrigger>
        </TabsList>

        <TabsContent value="regression" className="mt-6">
          <AutoRegressionTab projectId={projectId} />
        </TabsContent>
        <TabsContent value="webhook" className="mt-6">
          <WebhookTab projectId={projectId} />
        </TabsContent>
        <TabsContent value="rules" className="mt-6">
          <TriggerRulesTab projectId={projectId} />
        </TabsContent>
        <TabsContent value="history" className="mt-6">
          <ExecutionHistoryTab projectId={projectId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
