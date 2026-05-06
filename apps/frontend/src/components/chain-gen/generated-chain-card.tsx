import { ConfidenceBadge } from "@/components/ai/confidence-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { GeneratedChain } from "@/types/chain-gen";
import { Link2, Pencil } from "lucide-react";
import { GeneratedStepRow } from "./generated-step-row";

interface GeneratedChainCardProps {
  chain: GeneratedChain;
  index: number;
  onEdit: () => void;
}

const typeLabels: Record<string, string> = {
  crud: "CRUD",
  auth: "认证",
  business: "业务",
  cleanup: "清理",
};

export function GeneratedChainCard({
  chain,
  index,
  onEdit,
}: GeneratedChainCardProps) {
  const hasWarning = chain.steps.some((s) => s.confidence < 0.8);

  return (
    <Card
      className={cn(
        "transition-colors",
        hasWarning
          ? "border-amber-200 dark:border-amber-800"
          : "border-violet-200/50 dark:border-violet-800/50",
      )}
    >
      {/* Chain header */}
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Link2 className="h-4 w-4 text-violet-500 shrink-0" />
            <span className="text-sm font-semibold truncate">
              链 {index + 1}: {chain.name}
            </span>
            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
              {typeLabels[chain.type] ?? chain.type}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-muted-foreground">总体置信度</span>
            <ConfidenceBadge value={chain.overallConfidence} />
          </div>
        </div>
        {chain.description && (
          <p className="text-xs text-muted-foreground mt-1">
            {chain.description}
          </p>
        )}
      </CardHeader>

      {/* Steps */}
      <CardContent className="px-4 pb-3 space-y-2">
        {chain.steps.map((step, i) => (
          <GeneratedStepRow key={`step-${i}`} step={step} index={i + 1} />
        ))}

        {/* Edit button */}
        <Button
          variant="ghost"
          size="sm"
          className="text-xs gap-1 mt-2"
          onClick={onEdit}
        >
          <Pencil className="h-3 w-3" />
          编辑此链
        </Button>
      </CardContent>
    </Card>
  );
}
