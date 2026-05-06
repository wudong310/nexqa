import { useProjectStatus } from "@/hooks/use-project-status";
import { Loader2, RefreshCw } from "lucide-react";

export function ProjectStatusBadge({ projectId }: { projectId: string }) {
  const { status, latency, check } = useProjectStatus(projectId);

  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`h-2 w-2 rounded-full shrink-0 ${
          status === "online"
            ? "bg-green-500"
            : status === "offline"
              ? "bg-red-500"
              : status === "checking"
                ? "bg-yellow-500 animate-pulse"
                : "bg-gray-400"
        }`}
      />
      <span className="text-xs text-muted-foreground">
        {status === "online"
          ? `在线 ${latency}ms`
          : status === "offline"
            ? "离线"
            : status === "checking"
              ? "检测中"
              : "未知"}
      </span>
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground transition-colors"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          check();
        }}
        title="手动检测"
      >
        {status === "checking" ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <RefreshCw className="h-3 w-3" />
        )}
      </button>
    </div>
  );
}
