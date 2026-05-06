import { DangerZone } from "@/components/project-settings/danger-zone";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  EnhancedKeyValueEditor,
  type EnhancedKVPair,
} from "@/components/ui/enhanced-kv-editor";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SaveButton } from "@/components/ui/save-button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { VarGuideTip } from "@/components/ui/var-guide-tip";
import { useUnsavedChanges } from "@/hooks/use-dirty-state";
import { api } from "@/lib/api";
import { useEnvironmentStore } from "@/stores/environment-store";
import type { Environment, Project, UpdateProject } from "@nexqa/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { AlertCircle, Globe, Package, Star, Unplug } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

// ── Helpers ─────────────────────────────────────────────

type VariableEntry = { value: string; secret?: boolean; description?: string };
type VariableRecord = Record<string, string | VariableEntry>;

function variablesToEnhancedPairs(record: VariableRecord): EnhancedKVPair[] {
  return Object.entries(record).map(([key, val]) => {
    if (typeof val === "string") {
      return { key, value: val, description: "", secret: false };
    }
    return {
      key,
      value: val.value,
      description: val.description ?? "",
      secret: val.secret ?? false,
    };
  });
}

function enhancedPairsToVariables(
  pairs: EnhancedKVPair[],
): VariableRecord {
  const result: VariableRecord = {};
  for (const { key, value, description, secret } of pairs) {
    if (!key.trim()) continue;
    const k = key.trim();
    if (secret || (description && description.trim())) {
      result[k] = {
        value,
        secret: secret ?? false,
        description: description ?? "",
      };
    } else {
      result[k] = value;
    }
  }
  return result;
}

// ── ActiveEnvironmentCard ───────────────────────────────

function ActiveEnvironmentCard({
  projectId,
  environments,
  project,
}: {
  projectId: string;
  environments: Environment[];
  project: Project | undefined;
}) {
  const queryClient = useQueryClient();
  const { setSelectedEnv } = useEnvironmentStore();
  const [syncFailed, setSyncFailed] = useState(false);

  const activeEnvId =
    (project as Record<string, unknown>)?.activeEnvironmentId as
      | string
      | undefined;

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.post<Project>('/projects/update', { id: projectId, ...data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      setSyncFailed(false);
    },
    onError: () => {
      setSyncFailed(true);
    },
  });

  function handleSelect(envId: string) {
    // Optimistic: update local store immediately
    setSelectedEnv(projectId, envId);
    setSyncFailed(false);
    // Persist to server
    updateMutation.mutate({ activeEnvironmentId: envId });
  }

  if (environments.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Globe className="h-4 w-4 text-muted-foreground" />
          默认环境
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          未指定环境时自动使用此环境
        </p>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3">
          <Select
            value={activeEnvId ?? ""}
            onValueChange={handleSelect}
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="选择默认环境" />
            </SelectTrigger>
            <SelectContent>
              {environments.map((env) => (
                <SelectItem key={env.id} value={env.id}>
                  <div className="flex items-center gap-1.5">
                    {env.isDefault && (
                      <Star className="h-3 w-3 text-yellow-500 shrink-0" />
                    )}
                    <span>{env.name}</span>
                    <span className="text-muted-foreground text-xs">
                      ({env.slug})
                    </span>
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
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          ℹ️ 切换默认环境后，未指定环境的测试执行将使用此环境。
        </p>
      </CardContent>
    </Card>
  );
}

// ── Dirty-state helpers ─────────────────────────────────

/** Snapshot of form fields for dirty comparison */
interface FormSnapshot {
  name: string;
  description: string;
  variables: EnhancedKVPair[];
}

function isKVEqual(a: EnhancedKVPair[], b: EnhancedKVPair[]): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (p, i) =>
      p.key === b[i].key &&
      p.value === b[i].value &&
      (p.description ?? "") === (b[i].description ?? "") &&
      (p.secret ?? false) === (b[i].secret ?? false),
  );
}

function isFormDirty(current: FormSnapshot, saved: FormSnapshot): boolean {
  if (current.name !== saved.name) return true;
  if (current.description !== saved.description) return true;
  return !isKVEqual(current.variables, saved.variables);
}

// ── Page ────────────────────────────────────────────────

export function ProjectSettingsPage() {
  const { projectId } = useParams({ from: "/p/$projectId/settings" });
  const queryClient = useQueryClient();

  const { data: project } = useQuery<Project>({
    queryKey: ["project", projectId],
    queryFn: () => api.get(`/projects/detail?id=${projectId}`),
  });

  const { data: environments = [] } = useQuery<Environment[]>({
    queryKey: ["environments", projectId],
    queryFn: () => api.get(`/environments?projectId=${projectId}`),
  });

  const defaultEnv = environments.find((e) => e.isDefault) ?? environments[0] ?? null;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [projectVariables, setProjectVariables] = useState<EnhancedKVPair[]>(
    [],
  );

  // Keep a snapshot of the last-saved / server-loaded values
  const savedSnapshot = useRef<FormSnapshot>({
    name: "",
    description: "",
    variables: [],
  });

  useEffect(() => {
    if (project) {
      const projectName = project.name;
      const projectDesc =
        ((project as Record<string, unknown>).description as string) ?? "";
      const projectVars = variablesToEnhancedPairs(
        (project.variables ?? {}) as VariableRecord,
      );
      setName(projectName);
      setDescription(projectDesc);
      setProjectVariables(projectVars);
      savedSnapshot.current = {
        name: projectName,
        description: projectDesc,
        variables: projectVars,
      };
    }
  }, [project]);

  // Compute dirty state
  const isDirty = useMemo(
    () =>
      isFormDirty(
        { name, description, variables: projectVariables },
        savedSnapshot.current,
      ),
    [name, description, projectVariables],
  );

  // Browser beforeunload + in-app navigation blocker (combined)
  const { proceed, reset: resetBlocker, status } = useUnsavedChanges(isDirty);

  const mutation = useMutation({
    mutationFn: (data: UpdateProject) =>
      api.post<Project>('/projects/update', { id: projectId, ...data }),
    onSuccess: () => {
      // Update snapshot to current values so isDirty becomes false
      savedSnapshot.current = {
        name,
        description,
        variables: projectVariables,
      };
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("项目设置已保存");
    },
    onError: (err: Error) => {
      toast.error(`保存失败：${err.message}`);
    },
  });

  const handleSave = useCallback(() => {
    mutation.mutate({
      name,
      description,
      variables: enhancedPairsToVariables(projectVariables),
    } as UpdateProject);
  }, [name, description, projectVariables, mutation]);

  const openclawCount = project?.openclawConnections?.length ?? 0;

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">项目设置</h1>
        <p className="text-sm text-muted-foreground mt-1">
          配置项目信息、全局变量和连接
        </p>
      </div>

      <div className="space-y-6">
        {/* Basic info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">基本信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="projectName">项目名称</Label>
              <Input
                id="projectName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="我的 API 项目"
              />
              <p className="text-xs text-muted-foreground">
                用于在项目列表中识别此项目
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">项目描述</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="记录项目用途、相关 API 文档链接等信息..."
                className="min-h-[80px] text-sm resize-y"
                maxLength={500}
              />
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  记录项目用途、相关文档链接等信息
                </p>
                <span className="text-xs text-muted-foreground">
                  {description.length}/500
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Project-level variables */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">项目级变量</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  在所有环境中生效的全局变量，优先级低于环境变量
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {projectVariables.length === 0 ? (
              <div className="text-center py-6">
                <Package className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  还没有项目级变量
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  添加所有环境共享的变量（如 orgId、apiVersion）
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() =>
                    setProjectVariables([
                      { key: "", value: "", description: "" },
                    ])
                  }
                >
                  + 添加第一个变量
                </Button>
              </div>
            ) : (
              <EnhancedKeyValueEditor
                label=""
                pairs={projectVariables}
                onChange={setProjectVariables}
                showDescription
                showSecretToggle
                valuePlaceholder="变量值"
                guideTip={
                  <VarGuideTip
                    text="在请求中使用 {{变量名}} 引用。同名时环境变量优先级更高。适合放组织 ID、API 版本号等所有环境共用的值。"
                    storageKey="projectVarTipDismissed"
                  />
                }
              />
            )}
            <div className="mt-4 pt-3 border-t">
              <p className="text-xs text-muted-foreground">
                变量优先级: 用例变量 {">"} 环境变量 {">"}{" "}
                <strong>项目变量</strong> {">"} 内置变量 ($timestamp 等)
              </p>
            </div>
          </CardContent>
        </Card>

        {/* OpenClaw connections */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">OpenClaw 连接</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Unplug className="h-4 w-4" />
                <span>已配置 {openclawCount} 个连接</span>
              </div>
              <Link to="/p/$projectId/openclaw" params={{ projectId }}>
                <Button variant="outline" size="sm">
                  管理连接
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Default Environment (activeEnvironmentId) */}
        <ActiveEnvironmentCard
          projectId={projectId}
          environments={environments}
          project={project}
        />

        {/* Save button with amber-500 pulse dirty indicator */}
        <SaveButton
          isDirty={isDirty}
          isSaving={mutation.isPending}
          onSave={handleSave}
        />

        {/* Danger zone */}
        <DangerZone
          projectId={projectId}
          projectName={project?.name ?? ""}
        />
      </div>

      {/* Unsaved changes alert for in-app navigation */}
      <AlertDialog open={status === "blocked"} onOpenChange={() => resetBlocker?.()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>未保存的修改</AlertDialogTitle>
            <AlertDialogDescription>
              你修改了项目设置但还未保存，确定要离开此页面吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => resetBlocker?.()}>
              继续编辑
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => proceed?.()}>
              放弃修改
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
