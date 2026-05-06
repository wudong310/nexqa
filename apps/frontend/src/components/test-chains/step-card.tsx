import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApiChangeBadge } from "@/components/api-management/api-change-badge";
import { cn } from "@/lib/utils";
import type { Extractor, Injector, TestCase } from "@nexqa/shared";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  CheckCircle,
  ChevronDown,
  Clock,
  GripVertical,
  Loader2,
  Settings2,
  SkipForward,
  Trash2,
  XCircle,
} from "lucide-react";
import { VarTag } from "./var-tag";

// ── Execution status type ───────────────────────────

export type StepExecutionStatus =
  | "idle"
  | "waiting"
  | "running"
  | "passed"
  | "failed"
  | "skipped";

interface StepCardProps {
  stepId: string;
  index: number;
  label: string;
  testCase: TestCase | undefined;
  extractors: Extractor[];
  injectors: Injector[];
  isLast?: boolean;
  isSelected?: boolean;
  /** Execution state */
  executionStatus?: StepExecutionStatus;
  executionDuration?: number;
  executionStatusCode?: number;
  executionFailReason?: string;
  /** Variable color map */
  varColorMap?: Map<string, number>;
  highlightedVar?: string | null;
  onHoverVar?: (varName: string | null) => void;
  onEdit: () => void;
  onDelete: () => void;
}

// ── Method icons ────────────────────────────────────

const METHOD_ICONS: Record<string, string> = {
  POST: "📝",
  GET: "🔍",
  PUT: "✏️",
  DELETE: "🗑️",
  PATCH: "🔧",
};

const methodColors: Record<string, string> = {
  GET: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  POST: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  PUT: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  PATCH: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  DELETE: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

// ── Status visual config ────────────────────────────

const STATUS_CONFIG: Record<
  StepExecutionStatus,
  {
    borderClass: string;
    bgClass: string;
    icon: React.ReactNode;
    label: string;
  }
> = {
  idle: {
    borderClass: "",
    bgClass: "",
    icon: null,
    label: "",
  },
  waiting: {
    borderClass: "border-l-4 border-l-muted-foreground/30",
    bgClass: "",
    icon: <Clock className="h-4 w-4 text-muted-foreground" />,
    label: "等待中",
  },
  running: {
    borderClass: "border-l-4 border-l-blue-500",
    bgClass: "bg-blue-50/30 dark:bg-blue-950/20",
    icon: <Loader2 className="h-4 w-4 animate-spin text-blue-500" />,
    label: "执行中",
  },
  passed: {
    borderClass: "border-l-4 border-l-green-500",
    bgClass: "bg-green-50/30 dark:bg-green-950/20",
    icon: <CheckCircle className="h-4 w-4 text-green-500" />,
    label: "通过",
  },
  failed: {
    borderClass: "border-l-4 border-l-red-500",
    bgClass: "bg-red-50/30 dark:bg-red-950/20",
    icon: <XCircle className="h-4 w-4 text-red-500" />,
    label: "失败",
  },
  skipped: {
    borderClass: "border-l-4 border-l-amber-500",
    bgClass: "bg-amber-50/30 dark:bg-amber-950/20",
    icon: <SkipForward className="h-4 w-4 text-amber-500" />,
    label: "跳过",
  },
};

export function StepCard({
  stepId,
  index,
  label,
  testCase,
  extractors,
  injectors,
  isLast,
  isSelected,
  executionStatus = "idle",
  executionDuration,
  executionStatusCode,
  executionFailReason,
  varColorMap,
  highlightedVar,
  onHoverVar,
  onEdit,
  onDelete,
}: StepCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stepId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isExecuting = executionStatus !== "idle";
  const statusCfg = STATUS_CONFIG[executionStatus];
  const isDimmed =
    highlightedVar !== null &&
    !extractors.some((e) => e.varName === highlightedVar) &&
    !injectors.some((i) => i.varName === highlightedVar);

  const method = testCase?.request.method ?? "GET";

  return (
    <div ref={setNodeRef} style={style}>
      <div
        className={cn(
          "border rounded-lg bg-card transition-all max-w-[600px] mx-auto",
          isDragging && "shadow-lg ring-2 ring-primary/20 opacity-90",
          isSelected && "ring-2 ring-primary/40",
          statusCfg.borderClass,
          statusCfg.bgClass,
          highlightedVar && isDimmed && "opacity-60",
        )}
      >
        <div className="flex items-start gap-2 p-3">
          {/* Drag handle (hidden during execution) */}
          {!isExecuting ? (
            <button
              className="mt-1 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground shrink-0"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="h-4 w-4" />
            </button>
          ) : (
            <div className="mt-0.5 shrink-0">{statusCfg.icon}</div>
          )}

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="shrink-0">
                {METHOD_ICONS[method] ?? "📋"}
              </span>
              <span className="text-sm font-medium truncate">
                {label || testCase?.name || "未命名步骤"}
              </span>
              {testCase && (
                <span className="text-xs font-mono text-muted-foreground truncate hidden sm:inline">
                  {method} {testCase.request.path}
                </span>
              )}
              {testCase?.apiChangeFlag && (
                <ApiChangeBadge flag={testCase.apiChangeFlag} />
              )}
            </div>

            {/* Execution status line */}
            {isExecuting && (
              <div className="flex items-center gap-2 mt-1 text-xs">
                <span className="text-muted-foreground">
                  {statusCfg.label}
                </span>
                {executionDuration !== undefined && (
                  <span className="text-muted-foreground">
                    {executionDuration}ms
                  </span>
                )}
                {executionStatusCode !== undefined && (
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] h-4",
                      executionStatusCode < 400
                        ? "text-green-600"
                        : "text-red-600",
                    )}
                  >
                    {executionStatusCode}
                  </Badge>
                )}
              </div>
            )}

            {/* Extractors */}
            {extractors.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {extractors.map((ext) => (
                  <VarTag
                    key={ext.varName}
                    varName={ext.varName}
                    type="extract"
                    colorIndex={varColorMap?.get(ext.varName) ?? 0}
                    expression={ext.expression || ext.source}
                    isHighlighted={highlightedVar === ext.varName}
                    isDimmed={
                      highlightedVar !== null &&
                      highlightedVar !== ext.varName
                    }
                    onHoverStart={onHoverVar}
                    onHoverEnd={() => onHoverVar?.(null)}
                  />
                ))}
              </div>
            )}

            {/* Injectors */}
            {injectors.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {injectors.map((inj) => (
                  <VarTag
                    key={`${inj.varName}-${inj.target}`}
                    varName={inj.varName}
                    type="inject"
                    colorIndex={varColorMap?.get(inj.varName) ?? 0}
                    expression={`${inj.target} ${inj.expression}`}
                    isHighlighted={highlightedVar === inj.varName}
                    isDimmed={
                      highlightedVar !== null &&
                      highlightedVar !== inj.varName
                    }
                    onHoverStart={onHoverVar}
                    onHoverEnd={() => onHoverVar?.(null)}
                  />
                ))}
              </div>
            )}

            {/* Failure reason */}
            {executionFailReason && (
              <div className="mt-2 p-2 rounded bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
                {executionFailReason}
              </div>
            )}
          </div>

          {/* Actions */}
          {!isExecuting && (
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={onEdit}
              >
                <Settings2 className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={onDelete}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Connector arrow */}
      {!isLast && (
        <div className="flex justify-center py-1">
          <div className="w-px h-8 bg-border relative">
            <ChevronDown className="h-4 w-4 text-muted-foreground absolute -bottom-2 left-1/2 -translate-x-1/2" />
          </div>
        </div>
      )}
    </div>
  );
}
