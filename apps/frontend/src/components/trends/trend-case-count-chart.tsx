import type { TrendCaseCountPoint } from "@/types/coverage";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

interface TrendCaseCountChartProps {
  data: TrendCaseCountPoint[];
  height?: number;
}

function formatDate(date: string) {
  const d = new Date(date);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background p-3 shadow-md text-xs space-y-1">
      <p className="font-medium">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  );
}

export function TrendCaseCountChart({
  data,
  height = 200,
}: TrendCaseCountChartProps) {
  if (!data.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <p className="text-sm">暂无数据</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={formatDate} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip content={<CustomTooltip />} />
        <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 11 }} />
        <Bar
          dataKey="passed"
          name="通过"
          stackId="a"
          fill="hsl(142, 76%, 36%)"
        />
        <Bar
          dataKey="failed"
          name="失败"
          stackId="a"
          fill="hsl(0, 84%, 60%)"
        />
        <Bar
          dataKey="skipped"
          name="跳过"
          stackId="a"
          fill="hsl(45, 93%, 47%)"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
