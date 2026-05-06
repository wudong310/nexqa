import { Button } from "@/components/ui/button";
import { RefreshCw, XCircle } from "lucide-react";

// ── Props ───────────────────────────────────────────

export interface AIErrorStateProps {
  /** Heading text (default: "操作失败") */
  title?: string;
  /** Error message body */
  message: string;
  /** Callback for the retry button. If omitted, no retry button is shown. */
  onRetry?: () => void;
  /** Custom retry button label (default: "重试") */
  retryLabel?: string;
}

/**
 * Shared error-state component for AI sheets.
 *
 * Matches the existing pattern:
 *   XCircle icon → error title → message → optional retry button
 *
 * Two style variants are used across sheets:
 *  - Simple (analysis-sheet, plan-gen-sheet): XCircle + text + button
 *  - Circled (security-scan-sheet): icon inside a red circle + title + desc
 *
 * This component covers the simple variant (most common).
 * The circled variant can be achieved by passing a custom title.
 *
 * Usage:
 * ```tsx
 * <AIErrorState
 *   message={error.message}
 *   onRetry={() => refetch()}
 * />
 * ```
 */
export function AIErrorState({
  title = "操作失败",
  message,
  onRetry,
  retryLabel = "重试",
}: AIErrorStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 py-8">
      <XCircle className="h-10 w-10 text-destructive" />
      <div className="text-center space-y-1">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-sm text-destructive">
          {message || "发生未知错误，请重试"}
        </p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
