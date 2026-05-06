import type { TrendPassRatePoint } from "@/types/coverage";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { TrendingUp } from "lucide-react";

interface TrendPassRateChartProps {
  data: TrendPassRatePoint[];
  height?: number;
}

function formatDate(date: string) {
  const d = new Date(date);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: TrendPassRatePoint }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border bg-background p-3 shadow-md text-xs space-y-1">
      <p className="font-medium">{d.date}</p>
      <p>通过率: {(d.passRate * 100).toFixed(1)}%</p>
      <p>通过/总数: {d.passed}/{d.total}</p>
      <p>触发方式: {d.trigger === "manual" ? "手动" : d.trigger === "plan" ? "方案" : "CLI"}</p>
    </div>
  );
}

function CustomDot(props: { cx: number; cy: number; payload: TrendPassRatePoint }) {
  const { cx, cy, payload } = props;
  const color =
    payload.passRate >= 0.95
      ? "hsl(142, 76%, 36%)"
      : payload.passRate >= 0.8
        ? "hsl(45, 93%, 47%)"
        : "hsl(0, 84%, 60%)";
  return (
    <circle
      cx={cx}
      cy={cy}
      r={4}
      fill="hsl(var(--background))"
      stroke={color}
      strokeWidth={2}
    />
  );
}

export function TrendPassRateChart({
  data,
  height = 240,
}: TrendPassRateChartProps) {
  if (!data.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <TrendingUp className="h-10 w-10 mb-3 opacity-40" />
        <p className="text-sm">暂无趋势数据</p>
        <p className="text-xs mt-1">执行测试后，趋势将在这里展示</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11 }}
          className="text-muted-foreground"
          tickFormatter={formatDate}
        />
        <YAxis
          domain={[0.6, 1]}
          tick={{ fontSize: 11 }}
          className="text-muted-foreground"
          tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
        />
        <ReferenceLine
          y={0.95}
          stroke="hsl(var(--muted-foreground))"
          strokeDasharray="4 4"
          label={{
            value: "目标 95%",
            position: "right",
            fontSize: 10,
            fill: "hsl(var(--muted-foreground))",
          }}
        />
        <Tooltip content={<CustomTooltip />} />
        <Line
          type="monotone"
          dataKey="passRate"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          dot={<CustomDot cx={0} cy={0} payload={{ date: "", passRate: 0, batchId: "", trigger: "", total: 0, passed: 0 }} />}
          activeDot={{ r: 6, stroke: "hsl(var(--primary))", strokeWidth: 2 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
