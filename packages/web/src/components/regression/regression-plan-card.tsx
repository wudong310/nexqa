import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { AutoRegressionResult } from "@/types/regression";
import { ClipboardList, Pencil, Play, Save, Settings, Sparkles, Wrench } from "lucide-react";

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <Badge
      variant="outline"
      className={
        pct >= 85
          ? "border-green-300 text-green-700 dark:border-green-700 dark:text-green-300"
          : pct >= 70
            ? "border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300"
            : "border-red-300 text-red-700 dark:border-red-700 dark:text-red-300"
      }
    >
      置信度 {pct}%
    </Badge>
  );
}

function PlanSection({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

function PlanTree({ items }: { items: string[] }) {
  return (
    <div className="ml-4 space-y-0.5 text-xs">
      {items.map((item, i) => (
        <div key={i}>
          {i < items.length - 1 ? "├" : "└"} {item}
        </div>
      ))}
    </div>
  );
}

export function RegressionPlanCard({
  plan,
  onExecute,
  onSaveAsPlan,
  onAdjust,
}: {
  plan: AutoRegressionResult;
  onExecute: () => void;
  onSaveAsPlan: () => void;
  onAdjust: () => void;
}) {
  return (
    <Card className="border-teal-200 dark:border-teal-800 bg-teal-50/10 dark:bg-teal-950/10">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-teal-100 dark:bg-teal-950/50 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-teal-500" />
            </div>
            <div>
              <CardTitle className="text-base">AI 回归方案</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                基于 {plan.changeSummary.modified} 个修改接口 +{" "}
                {plan.changeSummary.added} 个新增接口生成
              </p>
            </div>
          </div>
          <ConfidenceBadge value={plan.confidence} />
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <PlanSection
          icon={<ClipboardList className="h-3.5 w-3.5" />}
          title="回归范围"
        >
          <PlanTree
            items={[
              `直接受影响用例: ${plan.directCases.length} 个`,
              `间接受影响链: ${plan.indirectChains.length} 条`,
              `冒烟用例: ${plan.smokeCases.length} 个`,
              `新增用例: ${plan.newCases.length} 个`,
            ]}
          />
        </PlanSection>

        <PlanSection
          icon={<Wrench className="h-3.5 w-3.5" />}
          title="自动调整"
        >
          <PlanTree
            items={
              plan.adjustments.length > 0
                ? plan.adjustments.map((a) => `✅ ${a.description}`)
                : ["(无需自动调整)"]
            }
          />
        </PlanSection>

        <PlanSection
          icon={<Settings className="h-3.5 w-3.5" />}
          title="执行配置"
        >
          <PlanTree
            items={[
              `并发: ${plan.execution.concurrency} (回归串行)`,
              `重试: ${plan.execution.retryOnFail} 次`,
              `门禁: 通过率 ≥ ${plan.execution.minPassRate}%`,
            ]}
          />
        </PlanSection>
      </CardContent>

      <CardFooter className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onSaveAsPlan}>
          <Save className="h-3.5 w-3.5 mr-1.5" />
          保存为方案
        </Button>
        <Button variant="outline" size="sm" onClick={onAdjust}>
          <Pencil className="h-3.5 w-3.5 mr-1.5" />
          调整后执行
        </Button>
        <Button
          size="sm"
          className="bg-teal-600 hover:bg-teal-700 text-white"
          onClick={onExecute}
        >
          <Play className="h-3.5 w-3.5 mr-1.5" />
          直接执行
        </Button>
      </CardFooter>
    </Card>
  );
}
