import { cn } from "@/lib/utils";
import type { RootCauseCategory } from "@/types/ai";
import {
  Bug,
  FileWarning,
  KeyRound,
  RefreshCw,
  ServerCrash,
  Timer,
  HelpCircle,
  ArrowLeftRight,
  Database,
  GitBranch,
} from "lucide-react";

const config: Record<
  RootCauseCategory,
  { icon: React.ElementType; color: string; label: string; actionTarget: string }
> = {
  "api-bug": {
    icon: Bug,
    color: "text-red-600 dark:text-red-400",
    label: "API Bug",
    actionTarget: "开发",
  },
  "api-change": {
    icon: ArrowLeftRight,
    color: "text-orange-600 dark:text-orange-400",
    label: "API 变更",
    actionTarget: "测试",
  },
  "env-issue": {
    icon: ServerCrash,
    color: "text-amber-600 dark:text-amber-400",
    label: "环境问题",
    actionTarget: "运维",
  },
  "auth-expired": {
    icon: KeyRound,
    color: "text-amber-600 dark:text-amber-400",
    label: "认证过期",
    actionTarget: "运维",
  },
  "test-case-error": {
    icon: FileWarning,
    color: "text-blue-600 dark:text-blue-400",
    label: "用例问题",
    actionTarget: "测试",
  },
  "test-data-issue": {
    icon: Database,
    color: "text-blue-600 dark:text-blue-400",
    label: "测试数据",
    actionTarget: "测试",
  },
  flaky: {
    icon: RefreshCw,
    color: "text-gray-500 dark:text-gray-400",
    label: "不稳定",
    actionTarget: "测试",
  },
  "dependency-fail": {
    icon: GitBranch,
    color: "text-gray-500 dark:text-gray-400",
    label: "依赖失败",
    actionTarget: "开发",
  },
  timeout: {
    icon: Timer,
    color: "text-amber-600 dark:text-amber-400",
    label: "超时",
    actionTarget: "运维",
  },
  unknown: {
    icon: HelpCircle,
    color: "text-gray-500 dark:text-gray-400",
    label: "未知",
    actionTarget: "人工",
  },
};

export function CategoryGroupHeader({
  category,
  count,
}: {
  category: RootCauseCategory;
  count: number;
}) {
  const c = config[category] ?? config.unknown;
  const Icon = c.icon;

  return (
    <div className="flex items-center gap-2 pt-4 pb-2">
      <Icon className={cn("h-4 w-4", c.color)} />
      <h3 className={cn("text-sm font-semibold", c.color)}>
        {c.label} ({count})
      </h3>
      <span className="text-xs text-muted-foreground">
        — 需要{c.actionTarget}处理
      </span>
    </div>
  );
}

export { config as rootCauseCategoryConfig };
