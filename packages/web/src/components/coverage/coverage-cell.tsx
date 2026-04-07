import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface CoverageCellData {
  covered: boolean;
  caseCount: number;
  lastPassRate?: number;
  applicable: boolean;
  cases?: { id: string; name: string; passed: boolean }[];
}

interface CoverageCellProps {
  cell: CoverageCellData | null;
  endpointLabel: string;
  purposeLabel: string;
  onClick?: () => void;
}

export function CoverageCell({
  cell,
  endpointLabel,
  purposeLabel,
  onClick,
}: CoverageCellProps) {
  if (!cell || !cell.applicable) {
    return (
      <div className="w-16 h-10 rounded-md flex items-center justify-center text-xs text-muted-foreground bg-muted/30 mx-auto">
        ·
      </div>
    );
  }

  const isUncovered = cell.caseCount === 0;
  const isPartial = cell.caseCount === 1;
  const isFull = cell.caseCount >= 2;

  const cellStyle = cn(
    "w-16 h-10 rounded-md flex items-center justify-center text-xs font-medium mx-auto transition-colors",
    isFull && "bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 text-green-700 dark:text-green-300",
    isPartial && "bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-700 dark:text-amber-300",
    isUncovered && "bg-red-500/20 hover:bg-red-500/40 border border-red-500/30 border-dashed text-red-700 dark:text-red-300 cursor-pointer",
  );

  const display = isUncovered ? "—" : String(cell.caseCount);

  const tooltipContent = isUncovered
    ? `${endpointLabel} × ${purposeLabel}\n点击快速生成`
    : `${endpointLabel} × ${purposeLabel}\n${cell.caseCount} 个用例${cell.lastPassRate !== undefined ? `，通过率 ${Math.round(cell.lastPassRate * 100)}%` : ""}`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cellStyle}
          onClick={isUncovered ? onClick : undefined}
          role={isUncovered ? "button" : undefined}
          tabIndex={isUncovered ? 0 : undefined}
          aria-label={tooltipContent.replace("\n", "，")}
        >
          {display}
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="whitespace-pre-line text-xs max-w-[240px]">
        {tooltipContent}
      </TooltipContent>
    </Tooltip>
  );
}
