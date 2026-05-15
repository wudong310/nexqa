/**
 * CaseGenAdoptDialog — 预览+采纳 Dialog
 *
 * 包含：
 * - 按端点分组展示生成的用例
 * - 每个用例 Checkbox + 名称 + tags badge
 * - 全选/取消全选
 * - 底部：「采纳选中(N)」「全部采纳」「取消」
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { GeneratedCaseV2 } from "@/types/case-gen-v2";
import { CheckCircle2, Sparkles } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

// ── Strategy Badge styles ───────────────────────────

const STRATEGY_STYLES: Record<string, { label: string; cls: string }> = {
  positive: {
    label: "正向",
    cls: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  },
  negative: {
    label: "负向",
    cls: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  },
  boundary: {
    label: "边界",
    cls: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  },
  destructive: {
    label: "破坏性",
    cls: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
  },
};

// ── Group by Endpoint ───────────────────────────────

interface EndpointGroup {
  endpointId: string;
  method: string;
  path: string;
  cases: GeneratedCaseV2[];
}

function groupByEndpoint(
  cases: GeneratedCaseV2[],
  endpointMap: Map<string, { method: string; path: string }>
): EndpointGroup[] {
  const groups = new Map<string, EndpointGroup>();

  for (const c of cases) {
    const ep = endpointMap.get(c.endpointId) || { method: "GET", path: "/" };
    if (!groups.has(c.endpointId)) {
      groups.set(c.endpointId, {
        endpointId: c.endpointId,
        method: ep.method,
        path: ep.path,
        cases: [],
      });
    }
    groups.get(c.endpointId)!.cases.push(c);
  }

  return [...groups.values()];
}

// ── Props ───────────────────────────────────────────

interface CaseGenAdoptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cases: GeneratedCaseV2[];
  endpointMap: Map<string, { method: string; path: string }>;
  onAdopt: (caseIds: string[]) => void;
  isAdopting?: boolean;
}

// ── Component ───────────────────────────────────────

export function CaseGenAdoptDialog({
  open,
  onOpenChange,
  cases,
  endpointMap,
  onAdopt,
  isAdopting = false,
}: CaseGenAdoptDialogProps) {
  const [selIds, setSelIds] = useState<Set<string>>(new Set(cases.map((c) => c.id)));

  const groups = useMemo(() => groupByEndpoint(cases, endpointMap), [cases, endpointMap]);

  const handleToggleAll = useCallback(() => {
    setSelIds(selIds.size === cases.length ? new Set() : new Set(cases.map((c) => c.id)));
  }, [selIds.size, cases]);

  const handleToggle = useCallback((id: string) => {
    setSelIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const handleAdopt = useCallback(() => {
    onAdopt([...selIds]);
  }, [onAdopt, selIds]);

  const handleAdoptAll = useCallback(() => {
    onAdopt(cases.map((c) => c.id));
  }, [onAdopt, cases]);

  // Reset selection when dialog opens
  useMemo(() => {
    if (open) {
      setSelIds(new Set(cases.map((c) => c.id)));
    }
  }, [open, cases]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-500" />
            预览生成结果
          </DialogTitle>
          <DialogDescription>
            已生成 {cases.length} 条用例，选择要采纳的用例
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 overflow-y-auto max-h-[50vh]">
          {/* Select all */}
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer pb-1 border-b">
            <Checkbox
              checked={selIds.size === cases.length}
              onCheckedChange={handleToggleAll}
            />
            全选（{selIds.size}/{cases.length}）
          </label>

          {/* Grouped cases */}
          <div className="space-y-3">
            {groups.map((group) => (
              <div key={group.endpointId} className="space-y-1.5">
                {/* Group header */}
                <div className="flex items-center gap-2 py-1">
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 py-0 font-mono"
                  >
                    {group.method.toUpperCase()}
                  </Badge>
                  <span className="text-xs font-mono text-muted-foreground truncate flex-1">
                    {group.path}
                  </span>
                  <span className="text-xs text-green-600">{group.cases.length} 条</span>
                </div>

                {/* Cases */}
                {group.cases.map((tc) => (
                  <label
                    key={tc.id}
                    className="flex items-start gap-3 rounded-md border bg-card p-2.5 cursor-pointer hover:bg-accent/50 transition-colors ml-4"
                  >
                    <Checkbox
                      checked={selIds.has(tc.id)}
                      onCheckedChange={() => handleToggle(tc.id)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium truncate">{tc.name}</span>
                        {tc.tags.strategy && tc.tags.strategy[0] && (
                          <Badge
                            variant="secondary"
                            className={`text-[10px] px-1.5 py-0 shrink-0 ${
                              STRATEGY_STYLES[tc.tags.strategy[0]]?.cls ?? ""
                            }`}
                          >
                            {STRATEGY_STYLES[tc.tags.strategy[0]]?.label ?? tc.tags.strategy[0]}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            variant="outline"
            onClick={handleAdoptAll}
            disabled={isAdopting || cases.length === 0}
          >
            全部采纳
          </Button>
          <Button
            onClick={handleAdopt}
            disabled={isAdopting || selIds.size === 0}
            className="bg-violet-600 hover:bg-violet-700 text-white gap-1.5"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            采纳{selIds.size > 0 ? ` (${selIds.size})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}