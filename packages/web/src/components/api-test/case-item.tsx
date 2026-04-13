import { TagBadges, safeTags } from "@/components/tag-editor";
import { Button } from "@/components/ui/button";
import { ApiChangeBadge } from "@/components/api-management/api-change-badge";
import type { TestCase, TestResult } from "@nexqa/shared";
import { CheckCircle, Trash2, XCircle } from "lucide-react";

interface CaseItemProps {
  testCase: TestCase;
  latestResult: TestResult | null;
  isSelected: boolean;
  onSelect: (tc: TestCase) => void;
  onDelete: (id: string) => void;
}

export function CaseItem({
  testCase: tc,
  latestResult: latest,
  isSelected,
  onSelect,
  onDelete,
}: CaseItemProps) {
  return (
    <div
      className={`ml-8 mr-2 rounded border mb-1 cursor-pointer transition-colors ${
        isSelected ? "ring-2 ring-primary" : "hover:bg-accent/30"
      }`}
      onClick={() => onSelect(tc)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) =>
        (e.key === "Enter" || e.key === " ") && onSelect(tc)
      }
    >
      <div className="flex items-center justify-between px-3 py-1.5">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-sm truncate">
            {tc.name.includes(" - ")
              ? tc.name.split(" - ").slice(1).join(" - ")
              : tc.name}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {tc.apiChangeFlag && <ApiChangeBadge flag={tc.apiChangeFlag} />}
          {latest ? (
            latest.passed ? (
              <span className="flex items-center gap-0.5 text-xs text-green-600">
                <CheckCircle className="h-3 w-3" />
                {latest.response.status} {latest.response.duration}ms
              </span>
            ) : (
              <span className="flex items-center gap-0.5 text-xs text-red-600">
                <XCircle className="h-3 w-3" />
                {latest.response.status} {latest.response.duration}ms
              </span>
            )
          ) : (
            <span className="text-xs text-muted-foreground">未执行</span>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(tc.id);
            }}
            title="删除用例"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
      <div className="px-3 pb-1.5">
        <TagBadges tags={safeTags(tc.tags)} compact />
      </div>
    </div>
  );
}
