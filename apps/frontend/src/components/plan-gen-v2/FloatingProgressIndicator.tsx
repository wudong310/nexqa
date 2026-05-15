/**
 * FloatingProgressIndicator — 浮动进度指示器
 *
 * fixed 定位在页面右下角，显示正在生成的任务进度
 * 点击重新打开 PlanGenV2Dialog
 */

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { PlanGenRecord } from "@/types/plan-gen-v2";
import { Loader2 } from "lucide-react";

// ── Types ───────────────────────────────────────────

interface FloatingProgressIndicatorProps {
  record: PlanGenRecord | null;
  onClick: () => void;
}

// ── Component ───────────────────────────────────────

export function FloatingProgressIndicator({
  record,
  onClick,
}: FloatingProgressIndicatorProps) {
  if (!record) return null;

  return (
    <div
      className="fixed bottom-20 right-4 z-50 animate-in slide-in-from-bottom-4 fade-in duration-200"
      onClick={onClick}
    >
      <Button
        variant="outline"
        className="h-10 px-4 gap-2 shadow-lg bg-card border hover:bg-accent cursor-pointer"
      >
        <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
        <span className="text-xs truncate max-w-[150px]">
          {record.intent}
        </span>
      </Button>
    </div>
  );
}
