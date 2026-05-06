import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { QualityRisk } from "@/types/trend-analysis";
import { AlertOctagon, AlertTriangle, Info, RotateCw } from "lucide-react";
import { Line, LineChart, ResponsiveContainer } from "recharts";

function MiniSparkline({
  data,
  prediction,
  color,
  height = 32,
}: {
  data: number[];
  prediction?: number;
  color: string;
  height?: number;
}) {
  const chartData = data.map((v, i) => ({ idx: i, value: Math.round(v * 100) }));
  if (prediction !== undefined) {
    chartData.push({ idx: data.length, value: Math.round(prediction * 100) });
  }

  const strokeColor =
    color === "red"
      ? "#ef4444"
      : color === "amber"
        ? "#f59e0b"
        : "#3b82f6";

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={strokeColor}
            strokeWidth={1.5}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function RiskAlertCard({
  risk,
  onDismiss,
  onAction,
}: {
  risk: QualityRisk;
  onDismiss: (id: string) => void;
  onAction?: () => void;
}) {
  const levelConfig = {
    high: { color: "red", Icon: AlertOctagon, label: "高风险" },
    medium: { color: "amber", Icon: AlertTriangle, label: "中风险" },
    low: { color: "blue", Icon: Info, label: "低风险" },
  };

  const { color, Icon, label } = levelConfig[risk.level];

  return (
    <Card
      className={cn(
        "border-l-4",
        color === "red" && "border-l-red-500",
        color === "amber" && "border-l-amber-500",
        color === "blue" && "border-l-blue-500",
      )}
    >
      <CardContent className="pt-4 space-y-3">
        {/* Title */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <Icon
              className={cn(
                "h-4 w-4 shrink-0 mt-0.5",
                color === "red" && "text-red-500",
                color === "amber" && "text-amber-500",
                color === "blue" && "text-blue-500",
              )}
            />
            <div>
              <p className="text-sm font-semibold">{risk.title}</p>
              <Badge
                variant="outline"
                className={cn(
                  "mt-1 text-[10px]",
                  color === "red" && "border-red-300 text-red-700 dark:border-red-700 dark:text-red-300",
                  color === "amber" && "border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300",
                  color === "blue" && "border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-300",
                )}
              >
                {label}
              </Badge>
            </div>
          </div>
        </div>

        {/* Sparkline */}
        {risk.trend.length > 1 && (
          <MiniSparkline
            data={risk.trend}
            prediction={risk.prediction}
            color={color}
          />
        )}

        {/* Causes */}
        <div className="space-y-1">
          <p className="text-xs font-medium">主要原因:</p>
          <ul className="space-y-0.5 pl-4">
            {risk.causes.map((c, i) => (
              <li key={i} className="text-xs text-muted-foreground list-disc">
                {c.description}
              </li>
            ))}
          </ul>
        </div>

        {/* Suggestion */}
        <p className="text-xs text-teal-600 dark:text-teal-400">
          💡 {risk.suggestion}
        </p>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground"
            onClick={() => onDismiss(risk.id)}
          >
            忽略
          </Button>
          {risk.actionLabel && onAction && (
            <Button size="sm" className="text-xs" onClick={onAction}>
              {risk.actionLabel}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function QualityRiskSection({
  risks,
  onDismiss,
  onRefresh,
  lastAnalyzedAt,
}: {
  risks: QualityRisk[];
  onDismiss: (id: string) => void;
  onRefresh: () => void;
  lastAnalyzedAt?: string;
}) {
  if (risks.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          AI 质量风险预警
        </h3>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {lastAnalyzedAt && <span>最后分析: {lastAnalyzedAt}</span>}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onRefresh}
          >
            <RotateCw className="h-3 w-3" />
          </Button>
        </div>
      </div>
      <div className="space-y-3">
        {risks.map((risk) => (
          <RiskAlertCard
            key={risk.id}
            risk={risk}
            onDismiss={onDismiss}
          />
        ))}
      </div>
    </div>
  );
}
