import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TestCaseTags } from "@nexqa/shared";
import { Filter, X } from "lucide-react";
import { useState } from "react";

// ── Tag dimension definitions ───────────────────────

const PURPOSE_OPTIONS = [
  { value: "functional", label: "功能" },
  { value: "auth", label: "鉴权" },
  { value: "data-integrity", label: "数据完整性" },
  { value: "security", label: "安全" },
  { value: "idempotent", label: "幂等" },
  { value: "performance", label: "性能" },
] as const;

const STRATEGY_OPTIONS = [
  { value: "positive", label: "正向", tooltip: "验证正常输入下的预期行为" },
  { value: "negative", label: "反向", tooltip: "验证异常/非法输入的错误处理" },
  { value: "boundary", label: "边界值", tooltip: "验证边界条件（空值、极值、临界值）" },
  { value: "destructive", label: "破坏性", tooltip: "模拟恶意操作（注入、越权、并发冲突）" },
] as const;

const PHASE_OPTIONS = [
  { value: "smoke", label: "冒烟" },
  { value: "regression", label: "回归" },
  { value: "full", label: "完整" },
  { value: "targeted", label: "定向" },
] as const;

const PRIORITY_OPTIONS = [
  { value: "P0", label: "P0" },
  { value: "P1", label: "P1" },
  { value: "P2", label: "P2" },
  { value: "P3", label: "P3" },
] as const;

export { PURPOSE_OPTIONS, STRATEGY_OPTIONS, PHASE_OPTIONS, PRIORITY_OPTIONS };

// ── Types ───────────────────────────────────────────

export interface TagFilter {
  purpose: string[];
  strategy: string[];
  phase: string[];
  priority: string | null;
}

export const EMPTY_TAG_FILTER: TagFilter = {
  purpose: [],
  strategy: [],
  phase: [],
  priority: null,
};

export function isFilterActive(filter: TagFilter): boolean {
  return (
    filter.purpose.length > 0 ||
    filter.strategy.length > 0 ||
    filter.phase.length > 0 ||
    filter.priority !== null
  );
}

export function matchesTagFilter(tags: TestCaseTags | null | undefined, filter: TagFilter): boolean {
  if (!tags || typeof tags !== "object" || Array.isArray(tags)) return false;
  const purpose = Array.isArray(tags.purpose) ? tags.purpose : [];
  const strategy = Array.isArray(tags.strategy) ? tags.strategy : [];
  const phase = Array.isArray(tags.phase) ? tags.phase : [];
  if (filter.purpose.length > 0) {
    if (!filter.purpose.some((p) => purpose.includes(p as never))) return false;
  }
  if (filter.strategy.length > 0) {
    if (!filter.strategy.some((s) => strategy.includes(s as never))) return false;
  }
  if (filter.phase.length > 0) {
    if (!filter.phase.some((p) => phase.includes(p as never))) return false;
  }
  if (filter.priority) {
    if ((tags as Record<string, unknown>).priority !== filter.priority) return false;
  }
  return true;
}

// ── Priority color helper ───────────────────────────

export function priorityColor(priority: string): string {
  switch (priority) {
    case "P0":
      return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 border-red-200 dark:border-red-800";
    case "P1":
      return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 border-orange-200 dark:border-orange-800";
    case "P2":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 border-blue-200 dark:border-blue-800";
    case "P3":
      return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 border-gray-200 dark:border-gray-800";
    default:
      return "";
  }
}

// ── Multi-select toggle helper ──────────────────────

function toggleInArray(arr: string[], value: string): string[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

// ── Filter Bar Component ────────────────────────────

interface TagFilterBarProps {
  filter: TagFilter;
  onChange: (filter: TagFilter) => void;
}

export function TagFilterBar({ filter, onChange }: TagFilterBarProps) {
  const [expanded, setExpanded] = useState(false);
  const active = isFilterActive(filter);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button
          variant={active ? "secondary" : "ghost"}
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={() => setExpanded(!expanded)}
        >
          <Filter className="h-3 w-3" />
          多维筛选
          {active && (
            <Badge variant="default" className="h-4 text-[10px] px-1 ml-1">
              {filter.purpose.length + filter.strategy.length + filter.phase.length + (filter.priority ? 1 : 0)}
            </Badge>
          )}
        </Button>
        {active && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => onChange(EMPTY_TAG_FILTER)}
          >
            <X className="h-3 w-3 mr-1" /> 清除
          </Button>
        )}
      </div>

      {expanded && (
        <div className="flex flex-wrap gap-x-4 gap-y-2 p-2 rounded-md border bg-muted/30 text-xs">
          {/* Purpose */}
          <div className="space-y-1">
            <span className="text-muted-foreground font-medium">用途</span>
            <div className="flex flex-wrap gap-1">
              {PURPOSE_OPTIONS.map((opt) => (
                <Badge
                  key={opt.value}
                  variant={filter.purpose.includes(opt.value) ? "default" : "outline"}
                  className="cursor-pointer text-[11px] h-5"
                  onClick={() =>
                    onChange({ ...filter, purpose: toggleInArray(filter.purpose, opt.value) })
                  }
                >
                  {opt.label}
                </Badge>
              ))}
            </div>
          </div>
          {/* Strategy */}
          <div className="space-y-1">
            <span className="text-muted-foreground font-medium">策略</span>
            <div className="flex flex-wrap gap-1">
              {STRATEGY_OPTIONS.map((opt) => (
                <Badge
                  key={opt.value}
                  variant={filter.strategy.includes(opt.value) ? "default" : "outline"}
                  className="cursor-pointer text-[11px] h-5"
                  title={opt.tooltip}
                  onClick={() =>
                    onChange({ ...filter, strategy: toggleInArray(filter.strategy, opt.value) })
                  }
                >
                  {opt.label}
                </Badge>
              ))}
            </div>
          </div>
          {/* Phase */}
          <div className="space-y-1">
            <span className="text-muted-foreground font-medium">阶段</span>
            <div className="flex flex-wrap gap-1">
              {PHASE_OPTIONS.map((opt) => (
                <Badge
                  key={opt.value}
                  variant={filter.phase.includes(opt.value) ? "default" : "outline"}
                  className="cursor-pointer text-[11px] h-5"
                  onClick={() =>
                    onChange({ ...filter, phase: toggleInArray(filter.phase, opt.value) })
                  }
                >
                  {opt.label}
                </Badge>
              ))}
            </div>
          </div>
          {/* Priority */}
          <div className="space-y-1">
            <span className="text-muted-foreground font-medium">优先级</span>
            <div className="flex flex-wrap gap-1">
              {PRIORITY_OPTIONS.map((opt) => (
                <Badge
                  key={opt.value}
                  variant={filter.priority === opt.value ? "default" : "outline"}
                  className={`cursor-pointer text-[11px] h-5 ${filter.priority === opt.value ? "" : priorityColor(opt.value)}`}
                  onClick={() =>
                    onChange({
                      ...filter,
                      priority: filter.priority === opt.value ? null : opt.value,
                    })
                  }
                >
                  {opt.label}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
