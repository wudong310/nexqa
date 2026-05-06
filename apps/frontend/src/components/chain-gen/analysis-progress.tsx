import type { ChainGenStatusResponse } from "@/types/chain-gen";
import { CheckCircle2, Loader2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface AnalysisStep {
  id: string;
  label: string;
  detail?: string;
  status: "done" | "running" | "waiting";
}

function deriveSteps(data: ChainGenStatusResponse | undefined): AnalysisStep[] {
  const phase = data?.progress?.phase;
  const status = data?.status;

  if (status === "completed") {
    return [
      { id: "read", label: "读取 API 文档", status: "done", detail: `${data?.result?.stats.endpointsAnalyzed ?? "?"} 个接口` },
      { id: "params", label: "识别参数来源", status: "done" },
      { id: "deps", label: "推断数据依赖关系", status: "done" },
      { id: "chains", label: "编排测试链", status: "done", detail: `${data?.result?.stats.chainsGenerated ?? "?"} 条链` },
      { id: "config", label: "配置提取器/注入器", status: "done", detail: `${data?.result?.stats.totalSteps ?? "?"} 个步骤` },
    ];
  }

  const isAnalyzing = status === "analyzing";
  const isGenerating = status === "generating";

  return [
    {
      id: "read",
      label: "读取 API 文档",
      status: isAnalyzing && (phase === "analyze" && (data?.progress?.current ?? 0) <= 1) ? "running" : (isAnalyzing || isGenerating) ? "done" : "waiting",
      detail: data?.progress?.detail,
    },
    {
      id: "params",
      label: "识别参数来源",
      status: isAnalyzing && phase === "analyze" ? "running" : isGenerating ? "done" : "waiting",
    },
    {
      id: "deps",
      label: "推断数据依赖关系",
      status: isAnalyzing ? "running" : isGenerating ? "done" : "waiting",
    },
    {
      id: "chains",
      label: "编排测试链",
      status: isGenerating ? "running" : "waiting",
    },
    {
      id: "config",
      label: "配置提取器/注入器",
      status: isGenerating && (data?.progress?.current ?? 0) > (data?.progress?.total ?? 1) / 2 ? "running" : "waiting",
    },
  ];
}

const StepIcon = ({ status }: { status: "done" | "running" | "waiting" }) => {
  if (status === "done")
    return <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />;
  if (status === "running")
    return <Loader2 className="h-4 w-4 text-violet-500 animate-spin shrink-0" />;
  return <Clock className="h-4 w-4 text-muted-foreground/50 shrink-0" />;
};

interface ChainGenProgressProps {
  statusData: ChainGenStatusResponse | undefined;
}

export function ChainGenProgress({ statusData }: ChainGenProgressProps) {
  const steps = deriveSteps(statusData);

  return (
    <div className="space-y-4">
      <div className="space-y-2.5">
        {steps.map((step) => (
          <div
            key={step.id}
            className={cn(
              "flex items-center gap-3 text-sm",
              step.status === "waiting" && "opacity-50",
            )}
          >
            <StepIcon status={step.status} />
            <span
              className={cn(
                step.status === "running" && "font-medium text-foreground",
                step.status === "done" && "text-muted-foreground",
              )}
            >
              {step.label}
            </span>
            {step.detail && (
              <span className="text-xs text-muted-foreground ml-auto">
                {step.detail}
              </span>
            )}
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        💡 AI 正在分析接口间的参数传递关系，例如创建用户返回的 userId
        会被后续的获取/更新/删除接口使用。
      </p>
    </div>
  );
}
