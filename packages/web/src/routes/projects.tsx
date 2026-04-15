import { ProjectStatusBadge } from "@/components/project-status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import type { Project } from "@nexqa/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Clock, Globe, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export function ProjectsPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);

  const [name, setName] = useState("");
  const [baseURL, setBaseURL] = useState("");
  const [headerKey, setHeaderKey] = useState("");
  const [headerValue, setHeaderValue] = useState("");
  const [headers, setHeaders] = useState<Record<string, string>>({});

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: () => api.get("/projects"),
  });

  const createMutation = useMutation({
    mutationFn: (data: {
      name: string;
      baseURL: string;
      headers: Record<string, string>;
    }) => api.post<Project>("/projects", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("项目创建成功");
      closeDialog();
    },
    onError: (err: Error) => {
      toast.error(`创建失败：${err.message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: string;
      name: string;
      baseURL: string;
      headers: Record<string, string>;
    }) => api.post<Project>('/projects/update', { id, ...data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("项目已更新");
      closeDialog();
    },
    onError: (err: Error) => {
      toast.error(`更新失败：${err.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.post('/projects/delete', { id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("项目已删除");
      setDeleteTarget(null);
    },
    onError: (err: Error) => {
      toast.error(`删除失败：${err.message}`);
    },
  });

  function openCreate() {
    setEditingProject(null);
    setName("");
    setBaseURL("");
    setHeaders({});
    setDialogOpen(true);
  }

  function openEdit(project: Project) {
    setEditingProject(project);
    setName(project.name);
    setBaseURL(project.baseURL);
    setHeaders(project.headers ?? {});
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingProject(null);
  }

  function handleSave() {
    if (editingProject) {
      updateMutation.mutate({ id: editingProject.id, name, baseURL, headers });
    } else {
      createMutation.mutate({ name, baseURL, headers });
    }
  }

  function addHeader() {
    if (headerKey.trim()) {
      setHeaders({ ...headers, [headerKey.trim()]: headerValue });
      setHeaderKey("");
      setHeaderValue("");
    }
  }

  function removeHeader(key: string) {
    const next = { ...headers };
    delete next[key];
    setHeaders(next);
  }

  return (
    <div className="p-8">
      <Link
        to="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="h-4 w-4" />
        返回首页
      </Link>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">项目</h1>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" /> 新建项目
        </Button>
      </div>

      {projects.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          暂无项目，创建你的第一个项目开始使用。
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <Card key={project.id} className="group relative">
              <Link to="/p/$projectId/api" params={{ projectId: project.id }}>
                <CardHeader className="cursor-pointer">
                  <CardTitle>{project.name}</CardTitle>
                  <CardDescription className="space-y-0.5">
                    <span className="flex items-center gap-1">
                      <Globe className="h-3 w-3" />
                      {project.baseURL}
                    </span>
                    <span className="text-[11px] text-muted-foreground/60 font-mono">
                      ID: {project.id.slice(0, 8)}
                    </span>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {new Date(project.updatedAt).toLocaleDateString()}
                    </div>
                    <ProjectStatusBadge projectId={project.id} />
                  </div>
                </CardContent>
              </Link>
              <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => openEdit(project)}
                >
                  <span className="text-xs">编辑</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setDeleteTarget(project)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingProject ? "编辑项目" : "新建项目"}
            </DialogTitle>
            <DialogDescription>
              {editingProject
                ? "更新你的项目设置。"
                : "创建一个新的测试项目。"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>名称</Label>
              <Input
                placeholder="我的后端 API"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>基础 URL</Label>
              <Input
                placeholder="https://api.example.com"
                value={baseURL}
                onChange={(e) => setBaseURL(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>共享请求头</Label>
              {Object.entries(headers).map(([k, v]) => (
                <div key={k} className="flex items-center gap-2 text-sm">
                  <code className="bg-muted px-2 py-1 rounded">{k}</code>
                  <span className="text-muted-foreground truncate">{v}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeHeader(k)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              <div className="flex gap-2">
                <Input
                  placeholder="键"
                  value={headerKey}
                  onChange={(e) => setHeaderKey(e.target.value)}
                  className="flex-1"
                />
                <Input
                  placeholder="值"
                  value={headerValue}
                  onChange={(e) => setHeaderValue(e.target.value)}
                  className="flex-1"
                />
                <Button variant="outline" size="sm" onClick={addHeader}>
                  添加
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              取消
            </Button>
            <Button onClick={handleSave} disabled={!name || !baseURL}>
              {editingProject ? "更新" : "创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除项目</DialogTitle>
            <DialogDescription>
              确定要删除 &quot;{deleteTarget?.name}&quot; 吗？
              这将同时删除所有关联的 API
              文档、测试用例和测试结果。此操作无法撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                deleteTarget && deleteMutation.mutate(deleteTarget.id)
              }
            >
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
