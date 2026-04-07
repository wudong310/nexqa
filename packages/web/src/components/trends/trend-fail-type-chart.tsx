import type { TrendFailTypePoint } from "@/types/coverage";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

const FAIL_TYPE_COLORS: Record<string, string> = {
  status_mismatch: "hsl(0, 84%, 60%)",
  schema_violation: "hsl(271, 91%, 65%)",
  body_mismatch: "hsl(25, 95%, 53%)",
  timeout: "hsl(45, 93%, 47%)",
  network_error: "hsl(0, 0%, 45%)",
  auth_failure: "hsl(199, 89%, 48%)",
  variable_error: "hsl(280, 67%, 52%)",
  chain_dependency: "hsl(340, 82%, 52%)",
};

const FAIL_TYPE_LABELS: Record<string, string> = {
  status_mismatch: "状态码不匹配",
  schema_violation: "Schema 错误",
  body_mismatch: "响应体不匹配",
  timeout: "超时",
  network_error: "连接失败",
  auth_failure: "鉴权错误",
  variable_error: "变量错误",
  chain_dependency: "链依赖失败",
};

interface TrendFailTypeChartProps {
  data: TrendFailTypePoint[];
  height?: number;
}

function formatDate(date: string) {
  const d = new Date(date);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function TrendFailTypeChart({
  data,
  height = 200,
}: TrendFailTypeChartProps) {
  if (!data.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <p className="text-sm">暂无数据</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={formatDate} />
        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
        <Tooltip
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            return (
              <div className="rounded-lg border bg-background p-3 shadow-md text-xs space-y-1">
                <p className="font-medium">{label}</p>
                {payload
                  .filter((p) => (p.value as number) > 0)
                  .map((p) => (
                    <p key={p.dataKey as string} style={{ color: p.color as string }}>
                      {FAIL_TYPE_LABELS[p.dataKey as string] ?? p.dataKey}: {p.value as number}
                    </p>
                  ))}
              </div>
            );
          }}
        />
        <Legend
          iconType="line"
          iconSize={14}
          wrapperStyle={{ fontSize: 11 }}
          formatter={(value: string) => FAIL_TYPE_LABELS[value] ?? value}
        />
        {Object.keys(FAIL_TYPE_COLORS).map((type) => (
          <Area
            key={type}
            type="monotone"
            dataKey={type}
            name={type}
            stackId="1"
            stroke={FAIL_TYPE_COLORS[type]}
            fill={FAIL_TYPE_COLORS[type]}
            fillOpacity={0.3}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
