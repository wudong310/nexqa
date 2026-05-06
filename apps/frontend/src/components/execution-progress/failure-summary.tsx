import { cn } from "@/lib/utils";

interface FailureItem {
  id: string;
  caseName: string;
  method: string;
  path: string;
  stage: string;
  failType: string;
  isSecurity?: boolean;
}

interface FailureSummaryProps {
  failures: FailureItem[];
  onJump: (id: string) => void;
  className?: string;
}

export function FailureSummary({
  failures,
  onJump,
  className,
}: FailureSummaryProps) {
  if (failures.length === 0) return null;

  // Group by failure type for distribution bar
  const typeCounts = new Map<string, number>();
  for (const f of failures) {
    typeCounts.set(f.failType, (typeCounts.get(f.failType) ?? 0) + 1);
  }

  const typeEntries = [...typeCounts.entries()].sort((a, b) => b[1] - a[1]);
  const maxCount = Math.max(...typeEntries.map(([, c]) => c));

  return (
    <div
      className={cn(
        "border rounded-lg p-4 bg-red-50/50 dark:bg-red-950/20 border-red-200 dark:border-red-800 space-y-3",
        className,
      )}
    >
      <h3 className="text-sm font-medium text-red-700 dark:text-red-300 flex items-center gap-1.5">
        ❌ 失败摘要 ({failures.length} 个失败)
      </h3>

      {/* Type distribution */}
      <div className="space-y-1">
        <span className="text-[10px] text-muted-foreground">按类型分布:</span>
        <div className="flex items-end gap-2 h-6">
          {typeEntries.map(([type, count]) => (
            <div key={type} className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground">{type}</span>
              <div
                className="h-3 bg-red-400 dark:bg-red-600 rounded-sm min-w-[16px]"
                style={{
                  width: `${Math.max(16, (count / maxCount) * 80)}px`,
                }}
              />
              <span className="text-[10px] font-medium">{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Quick jump list */}
      <div className="space-y-1">
        <span className="text-[10px] text-muted-foreground">快速跳转:</span>
        {failures.map((f) => (
          <button
            key={f.id}
            type="button"
            className="w-full flex items-center gap-2 text-xs py-1 px-2 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-left transition-colors"
            onClick={() => onJump(f.id)}
          >
            <span className="text-red-600 shrink-0">❌</span>
            <span className="font-mono text-muted-foreground shrink-0 w-12">
              {f.method}
            </span>
            <span className="truncate flex-1">{f.caseName}</span>
            <span className="text-[10px] text-muted-foreground shrink-0">
              ({f.stage})
            </span>
            {f.isSecurity && (
              <span className="text-amber-600 font-medium text-[10px] shrink-0">
                ⚠️ 安全
              </span>
            )}
            <span className="text-[10px] text-primary shrink-0">查看 ▸</span>
          </button>
        ))}
      </div>
    </div>
  );
}
