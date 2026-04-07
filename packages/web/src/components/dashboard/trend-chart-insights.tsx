import { Button } from "@/components/ui/button";
import type { AITrendInsight } from "@/types/trend-analysis";
import { Loader2, Sparkles } from "lucide-react";
import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

interface TrendDataPoint {
  date: string;
  passRate: number;
}

function InsightMarkerLabel({
  viewBox,
  index,
  type,
}: {
  viewBox?: { cx?: number; cy?: number };
  index: number;
  type: AITrendInsight["type"];
}) {
  const cx = viewBox?.cx ?? 0;
  const cy = viewBox?.cy ?? 0;
  const colors = {
    improvement: "#22c55e",
    regression: "#f59e0b",
    anomaly: "#8b5cf6",
  };

  return (
    <g>
      <circle cx={cx} cy={cy - 16} r={10} fill={colors[type]} opacity={0.9} />
      <text
        x={cx}
        y={cy - 12}
        textAnchor="middle"
        fill="white"
        fontSize={10}
        fontWeight="bold"
      >
        {index}
      </text>
    </g>
  );
}

export function TrendChartWithInsights({
  data,
  insights,
  isAnalyzing,
  onAnalyze,
  timeRange,
  onTimeRangeChange,
}: {
  data: TrendDataPoint[];
  insights: AITrendInsight[];
  isAnalyzing: boolean;
  onAnalyze: () => void;
  timeRange: string;
  onTimeRangeChange: (range: string) => void;
}) {
  const chartData = useMemo(
    () =>
      data.map((d) => ({
        ...d,
        passRatePct: Math.round(d.passRate * 100),
      })),
    [data],
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">测试通过率趋势</h3>
        <div className="flex items-center gap-2">
          {["7d", "30d", "90d"].map((r) => (
            <Button
              key={r}
              variant={timeRange === r ? "default" : "outline"}
              size="sm"
              className="h-6 text-xs"
              onClick={() => onTimeRangeChange(r)}
            >
              {r === "7d" ? "7天" : r === "30d" ? "30天" : "90天"}
            </Button>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-xs gap-1.5"
            onClick={onAnalyze}
            disabled={isAnalyzing}
          >
            {isAnalyzing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5 text-violet-500" />
            )}
            AI 洞察
          </Button>
        </div>
      </div>

      {/* Chart */}
      <div className="w-full h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
            <XAxis dataKey="date" className="text-xs" tick={{ fontSize: 10 }} />
            <YAxis
              domain={[0, 100]}
              unit="%"
              className="text-xs"
              tick={{ fontSize: 10 }}
            />
            <RechartsTooltip
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: "1px solid hsl(var(--border))",
                background: "hsl(var(--background))",
              }}
              formatter={(value) => [`${value}%`, "通过率"]}
            />
            <Line
              type="monotone"
              dataKey="passRatePct"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />

            {/* AI insight annotations */}
            {insights.map((insight, i) => (
              <ReferenceDot
                key={insight.id}
                x={insight.date}
                y={Math.round(insight.passRate * 100)}
                r={0}
                label={
                  <InsightMarkerLabel
                    index={i + 1}
                    type={insight.type}
                  />
                }
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Insight summary list */}
      {insights.length > 0 && (
        <InsightSummaryList insights={insights} />
      )}
    </div>
  );
}

function InsightBadge({
  index,
  type,
}: {
  index: number;
  type: AITrendInsight["type"];
}) {
  const colors = {
    improvement: "bg-green-500",
    regression: "bg-amber-500",
    anomaly: "bg-violet-500",
  };

  return (
    <span
      className={`${colors[type]} h-5 w-5 rounded-full text-[10px] font-bold text-white flex items-center justify-center shrink-0`}
    >
      {index}
    </span>
  );
}

function InsightSummaryList({
  insights,
}: {
  insights: AITrendInsight[];
}) {
  return (
    <div className="space-y-3 pt-4 border-t">
      <h4 className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
        <Sparkles className="h-3 w-3 text-violet-500" />
        AI 洞察摘要
      </h4>
      {insights.map((insight, i) => (
        <div key={insight.id} className="flex items-start gap-3 text-xs">
          <InsightBadge index={i + 1} type={insight.type} />
          <div className="space-y-0.5 min-w-0">
            <p className="font-medium">
              标注 {i + 1} ({insight.date}): {insight.title}
            </p>
            <p className="text-muted-foreground">{insight.analysis}</p>
            {insight.suggestion && (
              <p className="text-teal-600 dark:text-teal-400">
                💡 {insight.suggestion}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
