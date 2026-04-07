import type { ReportComparison } from "@/types/coverage";
import { ComparisonCard } from "./comparison-card";

interface ComparisonViewProps {
  comparison: ReportComparison;
}

export function ComparisonView({ comparison }: ComparisonViewProps) {
  return (
    <div className="space-y-6">
      {/* Summary delta */}
      <div className="text-xs text-muted-foreground">
        对比批次: #{comparison.previousBatchId.slice(0, 8)}
        {comparison.passRateDelta !== 0 && (
          <span className={comparison.passRateDelta > 0 ? "text-green-600 ml-2" : "text-red-600 ml-2"}>
            通过率 {comparison.passRateDelta > 0 ? "↑" : "↓"}
            {Math.abs(Math.round(comparison.passRateDelta * 100))}%
          </span>
        )}
      </div>

      {/* New failures */}
      {comparison.newFailures.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-red-600 dark:text-red-400 mb-2">
            新增失败 ({comparison.newFailures.length})
          </h4>
          <div className="space-y-2">
            {comparison.newFailures.map((item) => (
              <ComparisonCard key={item.caseId} type="new" item={item} />
            ))}
          </div>
        </div>
      )}

      {/* Fixed */}
      {comparison.fixedFailures.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-green-600 dark:text-green-400 mb-2">
            已修复 ({comparison.fixedFailures.length})
          </h4>
          <div className="space-y-2">
            {comparison.fixedFailures.map((item) => (
              <ComparisonCard key={item.caseId} type="fixed" item={item} />
            ))}
          </div>
        </div>
      )}

      {/* Ongoing */}
      {comparison.ongoingFailures.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-2">
            持续失败 ({comparison.ongoingFailures.length})
          </h4>
          <div className="space-y-2">
            {comparison.ongoingFailures.map((item) => (
              <ComparisonCard key={item.caseId} type="ongoing" item={item} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
