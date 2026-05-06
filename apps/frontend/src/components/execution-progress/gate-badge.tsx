import { cn } from "@/lib/utils";
import { Shield, ShieldCheck, ShieldX } from "lucide-react";

interface GateBadgeProps {
  result: "passed" | "failed" | "skipped" | "pending";
  className?: string;
}

const gateStyles: Record<GateBadgeProps["result"], string> = {
  passed:
    "bg-green-100 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800",
  failed:
    "bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800",
  skipped:
    "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-900 dark:text-gray-400 dark:border-gray-700",
  pending:
    "bg-muted text-muted-foreground border-muted animate-pulse",
};

const gateIcons: Record<GateBadgeProps["result"], React.ReactNode> = {
  passed: <ShieldCheck className="h-3.5 w-3.5" />,
  failed: <ShieldX className="h-3.5 w-3.5" />,
  skipped: <Shield className="h-3.5 w-3.5" />,
  pending: <Shield className="h-3.5 w-3.5" />,
};

const gateLabels: Record<GateBadgeProps["result"], string> = {
  passed: "门禁通过",
  failed: "门禁失败",
  skipped: "门禁跳过",
  pending: "门禁等待中",
};

export function GateBadge({ result, className }: GateBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium border",
        gateStyles[result],
        className,
      )}
    >
      {gateIcons[result]}
      {gateLabels[result]}
    </span>
  );
}
