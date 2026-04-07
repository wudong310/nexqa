import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { TriggerRule } from "@/types/cicd";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Clock, MoreVertical, Zap } from "lucide-react";

function describeTrigger(trigger: TriggerRule["trigger"]): string {
  switch (trigger.type) {
    case "api-change":
      return "API 文档发生变更";
    case "schedule":
      return `定时: ${trigger.config.cron ?? "未设置"}`;
    case "webhook":
      return `Webhook (type=${trigger.config.webhookFilter ?? "*"})`;
    case "manual":
      return "手动触发";
    default:
      return "未知";
  }
}

function describeAction(action: TriggerRule["action"]): string {
  const labels: Record<string, string> = {
    smoke: "一键冒烟测试",
    regression: "AI 自动回归测试",
    full: "完整测试",
    security: "安全扫描",
    "custom-plan": "指定方案",
  };
  return labels[action.type] ?? action.type;
}

function describeNotification(notification: TriggerRule["notification"]): string {
  if (notification.condition === "none") return "无";
  const count = notification.webhookIds.length;
  if (count === 0) return "无";
  const cond = notification.condition === "always" ? "始终" : "仅失败";
  return `${count} 个渠道 (${cond})`;
}

export function TriggerRuleCard({
  rule,
  onToggle,
  onEdit,
  onDelete,
}: {
  rule: TriggerRule;
  onToggle: (enabled: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-4 space-y-3 transition-opacity",
        !rule.enabled && "opacity-60",
      )}
    >
      {/* Title */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap
            className={cn(
              "h-4 w-4",
              rule.enabled ? "text-blue-500" : "text-muted-foreground",
            )}
          />
          <span className="text-sm font-semibold">{rule.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={rule.enabled}
            onCheckedChange={onToggle}
            className="scale-75"
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>✏️ 编辑</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={onDelete}
              >
                🗑️ 删除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Details */}
      <div className="grid grid-cols-2 gap-y-1.5 text-xs">
        <div>
          <span className="text-muted-foreground font-medium">当: </span>
          {describeTrigger(rule.trigger)}
        </div>
        <div>
          <span className="text-muted-foreground font-medium">执行: </span>
          {describeAction(rule.action)}
        </div>
        <div>
          <span className="text-muted-foreground font-medium">环境: </span>
          {rule.action.environmentSlug || "由参数指定"}
        </div>
        <div>
          <span className="text-muted-foreground font-medium">通知: </span>
          {describeNotification(rule.notification)}
        </div>
      </div>

      {/* Last triggered */}
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground pt-1 border-t">
        <Clock className="h-3 w-3" />
        <span>
          最近触发:{" "}
          {rule.lastTriggered
            ? `${rule.lastTriggered} · ${
                rule.lastResult === "pass"
                  ? "✅ 通过"
                  : rule.lastResult === "fail"
                    ? "❌ 失败"
                    : "⚠️ 错误"
              }`
            : "从未"}
        </span>
      </div>
    </div>
  );
}
