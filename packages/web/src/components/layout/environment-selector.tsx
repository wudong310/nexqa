import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/lib/api";
import { useEnvironmentStore } from "@/stores/environment-store";
import type { Environment, Project } from "@nexqa/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Globe, Star } from "lucide-react";
import { useEffect, useState } from "react";

interface EnvironmentSelectorProps {
  projectId: string;
}

export function EnvironmentSelector({ projectId }: EnvironmentSelectorProps) {
  const queryClient = useQueryClient();
  const { selectedEnvIds, setSelectedEnv } = useEnvironmentStore();
  const selectedEnvId = selectedEnvIds[projectId] ?? "";
  const [syncFailed, setSyncFailed] = useState(false);

  const { data: project } = useQuery<Project>({
    queryKey: ["project", projectId],
    queryFn: () => api.get(`/projects/detail?id=${projectId}`),
    enabled: !!projectId,
  });

  const { data: environments = [] } = useQuery<Environment[]>({
    queryKey: ["environments", projectId],
    queryFn: () => api.get(`/environments?projectId=${projectId}`),
    enabled: !!projectId,
  });

  // Persist activeEnvironmentId to server (silent, non-blocking)
  const persistMutation = useMutation({
    mutationFn: (envId: string) =>
      api.post<Project>('/projects/update', {
        id: projectId,
        activeEnvironmentId: envId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      setSyncFailed(false);
    },
    onError: () => {
      setSyncFailed(true);
      console.warn("Failed to persist activeEnvironmentId");
    },
  });

  // Initialize from server-side activeEnvironmentId > local store > default
  useEffect(() => {
    if (environments.length === 0) return;

    const serverEnvId = (project as Record<string, unknown>)
      ?.activeEnvironmentId as string | undefined;

    if (!selectedEnvId) {
      if (serverEnvId && environments.some((e) => e.id === serverEnvId)) {
        setSelectedEnv(projectId, serverEnvId);
      } else {
        const defaultEnv = environments.find((e) => e.isDefault);
        setSelectedEnv(projectId, defaultEnv?.id ?? environments[0].id);
      }
    }
  }, [environments, selectedEnvId, projectId, setSelectedEnv, project]);

  function handleSelect(envId: string) {
    // 1. Immediately update local store (optimistic)
    setSelectedEnv(projectId, envId);
    setSyncFailed(false);
    // 2. Async persist to server
    persistMutation.mutate(envId);
  }

  const selectedEnv = environments.find((e) => e.id === selectedEnvId);

  if (environments.length === 0) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground gap-1"
            disabled
          >
            <Globe className="h-3 w-3" />
            无环境
          </Button>
        </TooltipTrigger>
        <TooltipContent>前往环境管理页创建环境</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <Select value={selectedEnvId} onValueChange={handleSelect}>
        <SelectTrigger className="h-7 w-auto min-w-[120px] max-w-[200px] text-xs border-dashed">
          <SelectValue placeholder="选择环境" />
        </SelectTrigger>
        <SelectContent>
          {environments.map((env) => (
            <SelectItem key={env.id} value={env.id}>
              <div className="flex items-center gap-1.5">
                {env.isDefault && (
                  <Star className="h-3 w-3 text-yellow-500 shrink-0" />
                )}
                <span>{env.name}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {syncFailed && (
        <Tooltip>
          <TooltipTrigger>
            <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">环境选择同步失败，仅本地生效</p>
          </TooltipContent>
        </Tooltip>
      )}
      {selectedEnv && (
        <span className="text-[10px] text-muted-foreground truncate max-w-[160px] hidden sm:inline">
          {selectedEnv.baseURL}
        </span>
      )}
    </div>
  );
}
