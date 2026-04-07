import { CloneEnvDialog } from "@/components/environments/clone-env-dialog";
import { EnvCompareDialog } from "@/components/environments/env-compare-dialog";
import { HealthIndicator } from "@/components/environments/health-indicator";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import {
  EnhancedKeyValueEditor,
  type EnhancedKVPair,
} from "@/components/ui/enhanced-kv-editor";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { VarGuideTip } from "@/components/ui/var-guide-tip";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useEnvironmentStore } from "@/stores/environment-store";
import { useEnvironmentHealth } from "@/hooks/use-environments";
import type { HealthStatus } from "@/types/cicd";
import type { Environment } from "@nexqa/shared";
import {
  DndContext,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
  Columns3,
  Copy,
  Globe,
  GripVertical,
  HeartPulse,
  Loader2,
  Lock,
  MoreVertical,
  Pencil,
  Plus,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

// ── Key-Value Editor (legacy headers) ───────────────────

interface KeyValuePair {
  key: string;
  value: string;
}

function KeyValueEditor({
  label,
  pairs,
  onChange,
}: {
  label: string;
  pairs: KeyValuePair[];
  onChange: (pairs: KeyValuePair[]) => void;
}) {
  function update(index: number, field: "key" | "value", val: string) {
    const next = [...pairs];
    next[index] = { ...next[index], [field]: val };
    onChange(next);
  }
  function remove(index: number) {
    onChange(pairs.filter((_, i) => i !== index));
  }
  function add() {
    onChange([...pairs, { key: "", value: "" }]);
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm">{label}</Label>
        <Button type="button" variant="ghost" size="sm" className="h-6 text-xs" onClick={add}>
          <Plus className="h-3 w-3 mr-1" /> 添加
        </Button>
      </div>
      {pairs.length === 0 && <p className="text-xs text-muted-foreground">暂无，点击添加</p>}
      {pairs.map((pair, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input placeholder="Key" value={pair.key} onChange={(e) => update(i, "key", e.target.value)} className="h-8 text-xs flex-1" />
          <Input placeholder="Value" value={pair.value} onChange={(e) => update(i, "value", e.target.value)} className="h-8 text-xs flex-1" />
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => remove(i)}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      ))}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────

function recordToPairs(record: Record<string, string>): KeyValuePair[] {
  return Object.entries(record).map(([key, value]) => ({ key, value }));
}
function pairsToRecord(pairs: KeyValuePair[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const { key, value } of pairs) { if (key.trim()) result[key.trim()] = value; }
  return result;
}

type VariableEntry = { value: string; secret?: boolean; description?: string };
type VariableRecord = Record<string, string | VariableEntry>;

function variablesToEnhancedPairs(record: VariableRecord): EnhancedKVPair[] {
  return Object.entries(record).map(([key, val]) => {
    if (typeof val === "string") return { key, value: val, description: "", secret: false };
    return { key, value: val.value, description: val.description ?? "", secret: val.secret ?? false };
  });
}

function enhancedPairsToVariables(pairs: EnhancedKVPair[]): VariableRecord {
  const result: VariableRecord = {};
  for (const { key, value, description, secret } of pairs) {
    if (!key.trim()) continue;
    const k = key.trim();
    if (secret || (description && description.trim())) {
      result[k] = { value, secret: secret ?? false, description: description ?? "" };
    } else {
      result[k] = value;
    }
  }
  return result;
}

function generateSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

// ── Skeleton ────────────────────────────────────────────

function EnvironmentsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {[1, 2].map((i) => (
        <Card key={i}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-5 w-24" />
              </div>
              <Skeleton className="h-7 w-7 rounded" />
            </div>
            <Skeleton className="h-3 w-48 mt-1" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-3 w-20" />
            <div className="flex gap-2"><Skeleton className="h-5 w-20 rounded-full" /><Skeleton className="h-5 w-16 rounded-full" /></div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Environment Form Dialog (with dirty state) ──────────

interface EnvFormData {
  name: string;
  slug: string;
  baseURL: string;
  headers: KeyValuePair[];
  variables: EnhancedKVPair[];
  isDefault: boolean;
}

const EMPTY_FORM: EnvFormData = { name: "", slug: "", baseURL: "", headers: [], variables: [], isDefault: false };

function EnvironmentFormDialog({
  open,
  onOpenChange,
  editing,
  projectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: Environment | null;
  projectId: string;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<EnvFormData>(EMPTY_FORM);
  const [autoSlug, setAutoSlug] = useState(true);
  const [isDirty, setIsDirty] = useState(false);
  const [showUnsavedAlert, setShowUnsavedAlert] = useState(false);

  useEffect(() => {
    if (editing) {
      setForm({
        name: editing.name,
        slug: editing.slug,
        baseURL: editing.baseURL,
        headers: recordToPairs(editing.headers),
        variables: variablesToEnhancedPairs(editing.variables as VariableRecord),
        isDefault: editing.isDefault,
      });
      setAutoSlug(false);
    } else {
      setForm(EMPTY_FORM);
      setAutoSlug(true);
    }
    setIsDirty(false);
  }, [editing, open]);

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post<Environment>("/environments", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["environments", projectId] });
      onOpenChange(false);
      toast.success(editing ? "环境已更新" : "环境已创建");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      api.post<Environment>('/environments/update', { id, ...data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["environments", projectId] });
      onOpenChange(false);
      toast.success("环境已更新");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      name: form.name,
      slug: form.slug,
      baseURL: form.baseURL,
      headers: pairsToRecord(form.headers),
      variables: enhancedPairsToVariables(form.variables),
      isDefault: form.isDefault,
      projectId,
    };
    if (editing) updateMutation.mutate({ id: editing.id, data: payload });
    else createMutation.mutate(payload);
  }

  function handleOpenChange(newOpen: boolean) {
    if (!newOpen && isDirty) {
      setShowUnsavedAlert(true);
      return;
    }
    onOpenChange(newOpen);
  }

  function updateForm(updater: (f: EnvFormData) => EnvFormData) {
    setForm((f) => { const next = updater(f); setIsDirty(true); return next; });
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "编辑环境" : "创建环境"}</DialogTitle>
            <DialogDescription>
              {editing ? "修改环境配置" : "为项目添加一个新的运行环境"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="env-name">名称</Label>
              <Input id="env-name" placeholder="Production" value={form.name}
                onChange={(e) => { const name = e.target.value; updateForm((f) => ({ ...f, name, slug: autoSlug ? generateSlug(name) : f.slug })); }}
                required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="env-slug">Slug</Label>
              <Input id="env-slug" placeholder="production" value={form.slug}
                onChange={(e) => { setAutoSlug(false); updateForm((f) => ({ ...f, slug: e.target.value })); }}
                pattern="^[a-z0-9-]+$" title="只允许小写字母、数字和连字符" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="env-url">Base URL</Label>
              <Input id="env-url" placeholder="https://api.example.com" value={form.baseURL}
                onChange={(e) => updateForm((f) => ({ ...f, baseURL: e.target.value }))} type="url" required />
            </div>
            <KeyValueEditor label="Headers" pairs={form.headers} onChange={(headers) => updateForm((f) => ({ ...f, headers }))} />
            <EnhancedKeyValueEditor label="环境变量" pairs={form.variables}
              onChange={(variables) => updateForm((f) => ({ ...f, variables }))}
              showDescription showSecretToggle valuePlaceholder="变量值"
              guideTip={<VarGuideTip text="在请求中使用 {{变量名}} 引用环境变量。" storageKey="envVarTipDismissed" />} />
            <div className="flex items-center gap-2">
              <input id="env-default" type="checkbox" checked={form.isDefault}
                onChange={(e) => updateForm((f) => ({ ...f, isDefault: e.target.checked }))} className="h-4 w-4 rounded border-gray-300" />
              <Label htmlFor="env-default" className="text-sm">设为默认环境</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>取消</Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                {editing ? "保存" : "创建"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showUnsavedAlert} onOpenChange={setShowUnsavedAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>未保存的修改</AlertDialogTitle>
            <AlertDialogDescription>你修改了环境配置但还未保存，确定要放弃修改吗？</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowUnsavedAlert(false)}>继续编辑</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setShowUnsavedAlert(false); setIsDirty(false); onOpenChange(false); }}>
              放弃修改
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Delete Confirmation Dialog ──────────────────────────

function DeleteConfirmDialog({
  open,
  onOpenChange,
  environment,
  projectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  environment: Environment | null;
  projectId: string;
}) {
  const queryClient = useQueryClient();
  const { clearSelectedEnv, getSelectedEnv } = useEnvironmentStore();
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.post('/environments/delete', { id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["environments", projectId] });
      if (environment && getSelectedEnv(projectId) === environment.id) clearSelectedEnv(projectId);
      onOpenChange(false);
      toast.success("环境已删除");
    },
    onError: (err: Error) => toast.error(err.message),
  });
  if (!environment) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>确认删除</DialogTitle>
          <DialogDescription>确定要删除环境 <strong>{environment.name}</strong> 吗？此操作不可恢复。</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button variant="destructive" onClick={() => deleteMutation.mutate(environment.id)} disabled={deleteMutation.isPending}>
            {deleteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            删除
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Draggable Environment Card ──────────────────────────

function DraggableEnvCard({
  env,
  healthStatus,
  onCheckHealth,
  onEdit,
  onClone,
  onSetDefault,
  onDelete,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: {
  env: Environment;
  healthStatus: HealthStatus;
  onCheckHealth: () => void;
  onEdit: () => void;
  onClone: () => void;
  onSetDefault: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: env.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const headerKeys = Object.keys(env.headers ?? {});
  const varKeys = Object.keys(env.variables ?? {});
  const isMobile = typeof window !== "undefined" && window.innerWidth < 640;

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(
        "group hover:border-primary/40 transition-colors",
        isDragging && "opacity-50 shadow-lg ring-2 ring-primary/30",
        env.isDefault && "border-primary/50 bg-primary/5",
      )}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {/* Drag handle — desktop only */}
              {!isMobile && (
                <button
                  {...attributes}
                  {...listeners}
                  className="cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity touch-none"
                  aria-label="拖拽排序"
                >
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                </button>
              )}
              <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
              <CardTitle className="text-base">{env.name}</CardTitle>
              {env.isDefault && (
                <Badge variant="secondary" className="text-xs gap-1">
                  <Star className="h-3 w-3 text-yellow-500" /> 默认
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-xs font-mono text-muted-foreground truncate">
                {env.slug} · {env.baseURL}
              </p>
              <HealthIndicator status={healthStatus} onCheck={onCheckHealth} />
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}><Pencil className="h-3.5 w-3.5 mr-2" />编辑</DropdownMenuItem>
              <DropdownMenuItem onClick={onClone}><Copy className="h-3.5 w-3.5 mr-2" />克隆</DropdownMenuItem>
              {!env.isDefault && <DropdownMenuItem onClick={onSetDefault}><Star className="h-3.5 w-3.5 mr-2" />设为默认</DropdownMenuItem>}
              {/* Mobile: move up/down */}
              {isMobile && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onMoveUp} disabled={isFirst}><ArrowUp className="h-3.5 w-3.5 mr-2" />上移</DropdownMenuItem>
                  <DropdownMenuItem onClick={onMoveDown} disabled={isLast}><ArrowDown className="h-3.5 w-3.5 mr-2" />下移</DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" disabled={env.isDefault} onClick={onDelete}>
                <Trash2 className="h-3.5 w-3.5 mr-2" />删除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">请求头 ({headerKeys.length})</p>
          {headerKeys.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {headerKeys.slice(0, 5).map((k) => (<Badge key={k} variant="outline" className="text-[10px]">{k}</Badge>))}
              {headerKeys.length > 5 && <span className="text-[10px] text-muted-foreground">+{headerKeys.length - 5}</span>}
            </div>
          )}
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">变量 ({varKeys.length})</p>
          {varKeys.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {varKeys.slice(0, 5).map((k) => {
                const val = (env.variables as VariableRecord)?.[k];
                const isSecret = typeof val === "object" && val?.secret;
                return (
                  <Badge key={k} variant="outline" className="text-[10px] font-mono">
                    {k}{isSecret && <Lock className="h-2.5 w-2.5 ml-0.5 text-muted-foreground" />}
                  </Badge>
                );
              })}
              {varKeys.length > 5 && <Badge variant="outline" className="text-[10px]">+{varKeys.length - 5}</Badge>}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">(暂无变量)</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Page ───────────────────────────────────────────

export function EnvironmentsPage() {
  const { projectId } = useParams({ from: "/p/$projectId/environments" });
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editingEnv, setEditingEnv] = useState<Environment | null>(null);
  const [deletingEnv, setDeletingEnv] = useState<Environment | null>(null);
  const [cloningEnv, setCloningEnv] = useState<Environment | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);

  const { data: environments = [], isLoading } = useQuery<Environment[]>({
    queryKey: ["environments", projectId],
    queryFn: () => api.get(`/environments?projectId=${projectId}`),
  });

  // Sort by order then createdAt
  const sorted = useMemo(
    () =>
      [...environments].sort(
        (a, b) =>
          (a.order ?? 0) - (b.order ?? 0) ||
          (a.createdAt ?? "").localeCompare(b.createdAt ?? ""),
      ),
    [environments],
  );

  // Health checks
  const { healthMap, checkSingle, checkAll } = useEnvironmentHealth();

  // Auto-check on mount
  useEffect(() => {
    if (sorted.length > 0) checkAll(sorted);
  }, [sorted.length]); // eslint-disable-line -- react-hooks/exhaustive-deps intentionally omitted

  const [checkingAll, setCheckingAll] = useState(false);
  const handleCheckAll = useCallback(async () => {
    setCheckingAll(true);
    await checkAll(sorted);
    setCheckingAll(false);
    const unhealthy = sorted.filter((e) => healthMap[e.id]?.state === "unhealthy");
    if (unhealthy.length === 0) toast.success("全部环境可达");
    else toast.warning(`${unhealthy.length} 个环境不可达: ${unhealthy.map((e) => e.name).join(", ")}`);
  }, [sorted, checkAll, healthMap]);

  // Reorder mutation
  const reorderMutation = useMutation({
    mutationFn: (orders: { id: string; order: number }[]) =>
      api.post('/projects/environments/reorder', { projectId, orders }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["environments", projectId] }),
    onError: (error: Error) => toast.error(`环境排序失败: ${error.message}`),
  });

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = sorted.findIndex((e) => e.id === active.id);
      const newIndex = sorted.findIndex((e) => e.id === over.id);
      const reordered = arrayMove(sorted, oldIndex, newIndex);
      reorderMutation.mutate(reordered.map((env, i) => ({ id: env.id, order: i })));
    },
    [sorted, reorderMutation],
  );

  const handleMoveUp = useCallback(
    (envId: string) => {
      const idx = sorted.findIndex((e) => e.id === envId);
      if (idx <= 0) return;
      const reordered = arrayMove(sorted, idx, idx - 1);
      reorderMutation.mutate(reordered.map((env, i) => ({ id: env.id, order: i })));
    },
    [sorted, reorderMutation],
  );

  const handleMoveDown = useCallback(
    (envId: string) => {
      const idx = sorted.findIndex((e) => e.id === envId);
      if (idx < 0 || idx >= sorted.length - 1) return;
      const reordered = arrayMove(sorted, idx, idx + 1);
      reorderMutation.mutate(reordered.map((env, i) => ({ id: env.id, order: i })));
    },
    [sorted, reorderMutation],
  );

  const setDefaultMutation = useMutation({
    mutationFn: ({ id }: { id: string }) => api.post<Environment>('/environments/update', { id, isDefault: true }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["environments", projectId] }); toast.success("默认环境已更新"); },
    onError: (err: Error) => toast.error(err.message),
  });

  function openCreate() { setEditingEnv(null); setFormOpen(true); }
  function openEdit(env: Environment) { setEditingEnv(env); setFormOpen(true); }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">环境管理</h1>
          <p className="text-sm text-muted-foreground mt-1">管理项目的运行环境 — Base URL、请求头和变量统一在此配置</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleCheckAll} disabled={checkingAll || sorted.length === 0}>
            {checkingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <HeartPulse className="h-3.5 w-3.5 mr-1" />}
            全部检测
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCompareOpen(true)}
            disabled={environments.length < 2}
            title={environments.length < 2 ? "需要至少 2 个环境才能对比" : undefined}
          >
            <Columns3 className="h-3.5 w-3.5 mr-1" />
            变量对比
          </Button>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" /> 新建环境
          </Button>
        </div>
      </div>

      {isLoading ? (
        <EnvironmentsSkeleton />
      ) : sorted.length === 0 ? (
        <EmptyState
          icon={<Globe className="h-12 w-12" />}
          title="还没有环境"
          description="创建环境来配置不同的 API 目标服务器（开发/测试/生产）"
          action={<Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" /> 创建第一个环境</Button>}
        />
      ) : (
        <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={sorted.map((e) => e.id)} strategy={rectSortingStrategy}>
            <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2">
              {sorted.map((env, idx) => (
                <DraggableEnvCard
                  key={env.id}
                  env={env}
                  healthStatus={healthMap[env.id] ?? { state: "idle" }}
                  onCheckHealth={() => checkSingle(env.id)}
                  onEdit={() => openEdit(env)}
                  onClone={() => setCloningEnv(env)}
                  onSetDefault={() => setDefaultMutation.mutate({ id: env.id })}
                  onDelete={() => setDeletingEnv(env)}
                  onMoveUp={() => handleMoveUp(env.id)}
                  onMoveDown={() => handleMoveDown(env.id)}
                  isFirst={idx === 0}
                  isLast={idx === sorted.length - 1}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <EnvironmentFormDialog open={formOpen} onOpenChange={setFormOpen} editing={editingEnv} projectId={projectId} />
      <DeleteConfirmDialog open={!!deletingEnv} onOpenChange={(open) => !open && setDeletingEnv(null)} environment={deletingEnv} projectId={projectId} />
      <CloneEnvDialog open={!!cloningEnv} onOpenChange={(open) => !open && setCloningEnv(null)} source={cloningEnv} projectId={projectId} />
      <EnvCompareDialog open={compareOpen} onOpenChange={setCompareOpen} environments={sorted} />
    </div>
  );
}
