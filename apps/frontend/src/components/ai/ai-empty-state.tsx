import { Inbox } from "lucide-react";

// ── Props ───────────────────────────────────────────

export interface AIEmptyStateProps {
  /** Custom icon (default: Inbox). Rendered inside a 48×48 muted circle. */
  icon?: React.ReactNode;
  /** Heading text (e.g. "暂无冒烟用例") */
  title: string;
  /** Descriptive guidance (e.g. "请先为项目添加 API 端点") */
  description: string;
  /** Optional action slot (e.g. a "前往环境管理" button) */
  action?: React.ReactNode;
}

/**
 * Shared empty-state placeholder for AI sheets.
 *
 * Matches the existing pattern used across all 5 AI sheets:
 *   Icon circle → Title → Description → Optional action
 *
 * Usage:
 * ```tsx
 * <AIEmptyState
 *   title="暂无分析结果"
 *   description="请先执行批量测试，再使用 AI 分析失败原因"
 *   action={
 *     <Button variant="outline" size="sm" asChild>
 *       <Link to="/p/$projectId/api" params={{ projectId }}>
 *         <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
 *         前往测试用例
 *       </Link>
 *     </Button>
 *   }
 * />
 * ```
 */
export function AIEmptyState({
  icon,
  title,
  description,
  action,
}: AIEmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center">
      <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
        {icon ?? <Inbox className="h-6 w-6 text-muted-foreground" />}
      </div>
      <div className="space-y-1.5">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground leading-relaxed max-w-[320px]">
          {description}
        </p>
      </div>
      {action}
    </div>
  );
}
