import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { StageNode, type StageNodeData } from "./stage-node";

interface StagePipelineProps {
  stages: StageNodeData[];
  activeStageIndex: number;
  onStageClick: (index: number) => void;
  className?: string;
}

export function StagePipeline({
  stages,
  activeStageIndex,
  onStageClick,
  className,
}: StagePipelineProps) {
  if (stages.length === 0) return null;

  return (
    <div className={cn("overflow-x-auto", className)}>
      {/* Horizontal pipeline — wraps on mobile */}
      <div className="flex items-center gap-0 min-w-max sm:min-w-0 sm:flex-wrap sm:gap-y-2">
        {stages.map((stage, i) => (
          <div key={stage.name} className="flex items-center">
            <StageNode
              stage={stage}
              isActive={activeStageIndex === i}
              onClick={() => onStageClick(i)}
            />
            {i < stages.length - 1 && (
              <PipelineArrow
                prevStatus={stage.status}
                prevGate={stage.gateResult}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function PipelineArrow({
  prevStatus,
  prevGate,
}: {
  prevStatus: StageNodeData["status"];
  prevGate?: "passed" | "failed" | null;
}) {
  let color = "text-muted-foreground";
  let lineColor = "bg-border";

  if (prevStatus === "passed" || prevGate === "passed") {
    color = "text-green-400";
    lineColor = "bg-green-400";
  } else if (prevStatus === "running") {
    color = "text-blue-400";
    lineColor = "bg-blue-400";
  } else if (prevStatus === "failed" || prevGate === "failed") {
    color = "text-red-300";
    lineColor = "bg-red-300";
  }

  return (
    <div className="flex items-center mx-0.5">
      <div className={cn("h-0.5 w-6", lineColor)} />
      <ChevronRight className={cn("h-4 w-4 -ml-1", color)} />
    </div>
  );
}
