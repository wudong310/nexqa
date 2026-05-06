import { cn } from "@/lib/utils";
import { MethodBadge } from "@/components/ui/method-badge";
import type { ComparisonItem } from "@/types/coverage";

interface ComparisonCardProps {
  type: "new" | "fixed" | "ongoing";
  item: ComparisonItem;
}

const typeConfig = {
  new: {
    border: "border-l-red-500",
    badge: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
    label: "🔴 NEW",
  },
  fixed: {
    border: "border-l-green-500",
    badge: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
    label: "🟢 FIXED",
  },
  ongoing: {
    border: "border-l-gray-500",
    badge: "bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-300",
    label: "⚫ ONGOING",
  },
};

export function ComparisonCard({ type, item }: ComparisonCardProps) {
  const config = typeConfig[type];

  function statusText() {
    if (type === "new") {
      if (item.previousStatus === "new") return "新增用例，无历史";
      return `上次: ✅ 通过 → 本次: ❌ ${item.failType ?? "失败"}`;
    }
    if (type === "fixed") {
      return `上次: ❌ ${item.failType ?? "失败"} → 本次: ✅ 通过`;
    }
    return `连续 ${item.consecutiveFails ?? "N"} 次失败 · ${item.failType ?? ""}`;
  }

  return (
    <div
      className={cn(
        "border-l-4 rounded-r-lg border p-3 hover:-translate-y-0.5 hover:shadow-sm transition-all",
        config.border,
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        <span
          className={cn(
            "text-[10px] font-medium px-1.5 py-0.5 rounded",
            config.badge,
          )}
        >
          {config.label}
        </span>
        <span className="text-xs">
          {type === "new" || type === "ongoing" ? "❌" : "✅"}
        </span>
        <MethodBadge method={item.endpointMethod} />
        <span className="text-xs font-mono truncate">{item.endpointPath}</span>
        <span className="text-xs text-muted-foreground truncate">
          {item.caseName}
        </span>
        {item.isSecurity && (
          <span className="text-[10px] px-1 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 ml-auto shrink-0">
            ⚠️安全
          </span>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground pl-7">{statusText()}</p>
    </div>
  );
}
