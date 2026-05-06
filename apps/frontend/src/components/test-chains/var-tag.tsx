import { cn } from "@/lib/utils";
import { ArrowRight } from "lucide-react";

// ── 8-color cycle for variable visualization ────────

export const VAR_COLORS = [
  {
    key: "blue",
    dot: "bg-blue-500",
    light: "bg-blue-50 text-blue-700 border-blue-200",
    dark: "dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
    ring: "ring-blue-400",
  },
  {
    key: "purple",
    dot: "bg-purple-500",
    light: "bg-purple-50 text-purple-700 border-purple-200",
    dark: "dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800",
    ring: "ring-purple-400",
  },
  {
    key: "amber",
    dot: "bg-amber-500",
    light: "bg-amber-50 text-amber-700 border-amber-200",
    dark: "dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
    ring: "ring-amber-400",
  },
  {
    key: "emerald",
    dot: "bg-emerald-500",
    light: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dark: "dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
    ring: "ring-emerald-400",
  },
  {
    key: "rose",
    dot: "bg-rose-500",
    light: "bg-rose-50 text-rose-700 border-rose-200",
    dark: "dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800",
    ring: "ring-rose-400",
  },
  {
    key: "cyan",
    dot: "bg-cyan-500",
    light: "bg-cyan-50 text-cyan-700 border-cyan-200",
    dark: "dark:bg-cyan-950 dark:text-cyan-300 dark:border-cyan-800",
    ring: "ring-cyan-400",
  },
  {
    key: "pink",
    dot: "bg-pink-500",
    light: "bg-pink-50 text-pink-700 border-pink-200",
    dark: "dark:bg-pink-950 dark:text-pink-300 dark:border-pink-800",
    ring: "ring-pink-400",
  },
  {
    key: "yellow",
    dot: "bg-yellow-500",
    light: "bg-yellow-50 text-yellow-700 border-yellow-200",
    dark: "dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800",
    ring: "ring-yellow-400",
  },
] as const;

export function getVarColor(index: number) {
  return VAR_COLORS[index % VAR_COLORS.length];
}

/** Build a map: varName → colorIndex, assigned in order of first appearance */
export function buildVarColorMap(varNames: string[]): Map<string, number> {
  const map = new Map<string, number>();
  let idx = 0;
  for (const name of varNames) {
    if (!map.has(name)) {
      map.set(name, idx++);
    }
  }
  return map;
}

// ── VarTag Component ────────────────────────────────

interface VarTagProps {
  varName: string;
  type: "extract" | "inject";
  colorIndex: number;
  expression?: string;
  isHighlighted?: boolean;
  isDimmed?: boolean;
  onHoverStart?: (varName: string) => void;
  onHoverEnd?: () => void;
}

export function VarTag({
  varName,
  type,
  colorIndex,
  expression,
  isHighlighted,
  isDimmed,
  onHoverStart,
  onHoverEnd,
}: VarTagProps) {
  const color = getVarColor(colorIndex);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono border",
        "transition-all duration-150 cursor-default",
        color.light,
        color.dark,
        isHighlighted && `ring-2 ring-offset-1 scale-105 ${color.ring}`,
        isDimmed && "opacity-40",
      )}
      onMouseEnter={() => onHoverStart?.(varName)}
      onMouseLeave={() => onHoverEnd?.()}
    >
      {type === "extract" ? (
        <>
          <span className="font-medium">{varName}</span>
          {expression && (
            <span className="text-[10px] opacity-70">← {expression}</span>
          )}
          <ArrowRight className="h-3 w-3" />
        </>
      ) : (
        <>
          <ArrowRight className="h-3 w-3 rotate-180" />
          <span className="font-medium">{varName}</span>
          {expression && (
            <span className="text-[10px] opacity-70">→ {expression}</span>
          )}
        </>
      )}
    </span>
  );
}
