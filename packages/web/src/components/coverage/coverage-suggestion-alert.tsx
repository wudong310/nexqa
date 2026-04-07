import { Button } from "@/components/ui/button";
import { Lightbulb } from "lucide-react";
import type { CoverageSuggestion } from "@/types/coverage";

interface CoverageSuggestionAlertProps {
  suggestions: CoverageSuggestion[];
  onAutoGenerate?: () => void;
}

export function CoverageSuggestionAlert({
  suggestions,
  onAutoGenerate,
}: CoverageSuggestionAlertProps) {
  if (suggestions.length === 0) return null;

  return (
    <div className="rounded-lg border bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900 p-4">
      <div className="flex items-start gap-3">
        <Lightbulb className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="flex-1 space-y-2">
          <h4 className="text-sm font-medium text-amber-800 dark:text-amber-300">
            覆盖率建议
          </h4>
          <ul className="text-xs text-amber-700 dark:text-amber-400 space-y-1">
            {suggestions.slice(0, 5).map((s, i) => (
              <li key={i}>• {s.message}</li>
            ))}
          </ul>
          {onAutoGenerate && (
            <div className="pt-1">
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-7 border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-950"
                onClick={onAutoGenerate}
              >
                一键补充建议用例 →
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
