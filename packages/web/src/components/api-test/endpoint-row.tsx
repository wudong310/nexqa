import { CaseItem } from "@/components/api-test/case-item";
import { Button } from "@/components/ui/button";
import { methodColor } from "@/utils/api-test-helpers";
import type { ApiEndpoint, TestCase, TestResult } from "@nexqa/shared";
import {
  ChevronDown,
  ChevronRight,
  Eye,
  Square,
  SquareCheck,
  Trash2,
} from "lucide-react";
import type React from "react";

interface EndpointRowProps {
  endpoint: ApiEndpoint;
  cases: TestCase[];
  collapsed: boolean;
  onToggle: (epId: string) => void;
  checked: boolean;
  onCheck: (epId: string, e: React.MouseEvent) => void;
  onView: (ep: ApiEndpoint) => void;
  onDeleteEndpoint: (id: string) => void;
  confirmingDelete: boolean;
  onConfirmDelete: (id: string | null) => void;
  getLatestResult: (caseId: string) => TestResult | null;
  selectedCaseId: string | null;
  onSelectCase: (tc: TestCase) => void;
  onDeleteCase: (id: string) => void;
}

export function EndpointRow({
  endpoint: ep,
  cases: groupCases,
  collapsed,
  onToggle,
  checked,
  onCheck,
  onView,
  onDeleteEndpoint,
  confirmingDelete,
  onConfirmDelete,
  getLatestResult,
  selectedCaseId,
  onSelectCase,
  onDeleteCase,
}: EndpointRowProps) {
  const passed = groupCases.filter(
    (tc) => getLatestResult(tc.id)?.passed === true,
  ).length;
  const failed = groupCases.filter(
    (tc) => getLatestResult(tc.id)?.passed === false,
  ).length;

  return (
    <div>
      {/* 接口行 — 用 div 替代 button 避免嵌套 */}
      <div className="flex items-start gap-1 group px-2">
        <div
          className="shrink-0 p-1 mt-1.5 text-muted-foreground hover:text-foreground cursor-pointer"
          onClick={(e) => onCheck(ep.id, e)}
          role="checkbox"
          aria-checked={checked}
          tabIndex={0}
          onKeyDown={(e) =>
            (e.key === "Enter" || e.key === " ") &&
            onCheck(ep.id, e as unknown as React.MouseEvent)
          }
        >
          {checked ? (
            <SquareCheck className="h-3.5 w-3.5 text-primary" />
          ) : (
            <Square className="h-3.5 w-3.5" />
          )}
        </div>
        <div
          className="flex-1 px-1 py-1.5 rounded hover:bg-accent/50 transition-colors min-w-0 cursor-pointer select-none"
          onClick={() => onToggle(ep.id)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) =>
            (e.key === "Enter" || e.key === " ") && onToggle(ep.id)
          }
        >
          <div className="flex items-center gap-2">
            {collapsed ? (
              <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 shrink-0" />
            )}
            <span
              className={`text-xs font-bold px-1.5 py-0.5 rounded shrink-0 ${methodColor(ep.method)}`}
            >
              {ep.method}
            </span>
            <span className="text-xs font-mono truncate">{ep.path}</span>
            <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={(e) => {
                  e.stopPropagation();
                  onView(ep);
                }}
                title="查看详情"
              >
                <Eye className="h-3.5 w-3.5" />
              </Button>
              {confirmingDelete ? (
                <div
                  className="flex items-center gap-0.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1.5 text-xs text-destructive hover:text-destructive"
                    onClick={() => onDeleteEndpoint(ep.id)}
                  >
                    确认
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1.5 text-xs"
                    onClick={() => onConfirmDelete(null)}
                  >
                    取消
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={(e) => {
                    e.stopPropagation();
                    onConfirmDelete(ep.id);
                  }}
                  title="删除接口"
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              )}
            </div>
            <div className="flex items-center gap-1.5 ml-auto shrink-0">
              {passed > 0 && (
                <span className="text-xs text-green-600">{passed}✓</span>
              )}
              {failed > 0 && (
                <span className="text-xs text-red-600">{failed}✗</span>
              )}
              <span className="text-xs text-muted-foreground">
                /{groupCases.length}
              </span>
            </div>
          </div>
          {ep.summary && (
            <div className="text-xs text-muted-foreground truncate ml-[22px] mt-0.5">
              {ep.summary}
            </div>
          )}
        </div>
      </div>
      {/* 展开的用例列表 */}
      {!collapsed &&
        groupCases.map((tc) => (
          <CaseItem
            key={tc.id}
            testCase={tc}
            latestResult={getLatestResult(tc.id)}
            isSelected={selectedCaseId === tc.id}
            onSelect={onSelectCase}
            onDelete={onDeleteCase}
          />
        ))}
    </div>
  );
}
