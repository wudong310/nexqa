import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function HistoryFilters({
  triggerType,
  setTriggerType,
  result,
  setResult,
  timeRange,
  setTimeRange,
}: {
  triggerType: string;
  setTriggerType: (v: string) => void;
  result: string;
  setResult: (v: string) => void;
  timeRange: string;
  setTimeRange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-1.5">
        <Label className="text-xs text-muted-foreground">触发方式:</Label>
        <Select value={triggerType} onValueChange={setTriggerType}>
          <SelectTrigger className="h-7 w-28 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部</SelectItem>
            <SelectItem value="api-change">API 变更</SelectItem>
            <SelectItem value="schedule">定时</SelectItem>
            <SelectItem value="webhook">Webhook</SelectItem>
            <SelectItem value="manual">手动</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-1.5">
        <Label className="text-xs text-muted-foreground">结果:</Label>
        <Select value={result} onValueChange={setResult}>
          <SelectTrigger className="h-7 w-24 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部</SelectItem>
            <SelectItem value="pass">通过</SelectItem>
            <SelectItem value="fail">失败</SelectItem>
            <SelectItem value="error">错误</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-1.5">
        <Label className="text-xs text-muted-foreground">时间:</Label>
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="h-7 w-28 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">最近 7 天</SelectItem>
            <SelectItem value="30d">最近 30 天</SelectItem>
            <SelectItem value="90d">最近 90 天</SelectItem>
            <SelectItem value="all">全部</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

export function HistorySummary({
  executions,
  timeRangeLabel,
}: {
  executions: { result: string; passed: number; total: number; durationMs: number }[];
  timeRangeLabel: string;
}) {
  const total = executions.length;
  const passed = executions.filter((e) => e.result === "pass").length;
  const failed = executions.filter((e) => e.result === "fail").length;
  const errors = executions.filter((e) => e.result === "error").length;
  const avgPassRate =
    total > 0
      ? (executions.reduce(
          (s, e) => s + (e.total > 0 ? e.passed / e.total : 0),
          0,
        ) / total) * 100
      : 0;
  const avgDuration =
    total > 0
      ? executions.reduce((s, e) => s + e.durationMs, 0) / total
      : 0;

  return (
    <div className="rounded-lg bg-muted/30 border p-3 flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
      <span>
        {timeRangeLabel}:{" "}
        <strong className="text-foreground">{total}</strong> 次执行
      </span>
      <span>·</span>
      <span className="text-green-600">{passed} 通过</span>
      <span>·</span>
      <span className="text-red-600">{failed} 失败</span>
      <span>·</span>
      <span className="text-amber-600">{errors} 错误</span>
      <span className="flex-1" />
      <span>
        平均通过率:{" "}
        <strong className="text-foreground">{avgPassRate.toFixed(1)}%</strong>
      </span>
      <span>·</span>
      <span>
        平均耗时:{" "}
        <strong className="text-foreground">
          {avgDuration < 1000
            ? `${Math.round(avgDuration)}ms`
            : `${(avgDuration / 1000).toFixed(1)}s`}
        </strong>
      </span>
    </div>
  );
}
