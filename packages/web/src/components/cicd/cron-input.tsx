import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMemo } from "react";

const PRESETS = [
  { label: "每天 8:00", cron: "0 8 * * *" },
  { label: "每小时", cron: "0 * * * *" },
  { label: "每 6 小时", cron: "0 */6 * * *" },
  { label: "工作日 9:00", cron: "0 9 * * 1-5" },
];

function describeCron(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return "输入 Cron 表达式";
  const [min, hour, dom, month, dow] = parts;

  if (min === "0" && hour !== "*" && dom === "*" && month === "*") {
    if (dow === "*") return `每天 ${hour}:00`;
    if (dow === "1-5") return `工作日 ${hour}:00`;
  }
  if (min === "0" && hour === "*" && dom === "*" && month === "*" && dow === "*")
    return "每小时";
  if (
    min === "0" &&
    hour.startsWith("*/") &&
    dom === "*" &&
    month === "*" &&
    dow === "*"
  )
    return `每 ${hour.slice(2)} 小时`;

  return `Cron: ${cron}`;
}

export function CronInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const description = useMemo(() => describeCron(value), [value]);

  return (
    <div className="space-y-1.5">
      <Label>Cron 表达式</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0 8 * * *"
        className="font-mono text-xs"
      />
      <p className="text-xs text-muted-foreground">
        {description || "输入 Cron 表达式，如 0 8 * * * = 每天 08:00"}
      </p>
      <div className="flex gap-1.5 flex-wrap">
        {PRESETS.map((preset) => (
          <Button
            key={preset.cron}
            type="button"
            variant="outline"
            size="sm"
            className="text-[10px] h-6"
            onClick={() => onChange(preset.cron)}
          >
            {preset.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
