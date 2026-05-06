import { Button } from "@/components/ui/button";
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
import { useProjectStatus } from "@/hooks/use-project-status";
import { api } from "@/lib/api";
import type { Project } from "@nexqa/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  Check,
  ChevronsUpDown,
  FolderOpen,
  Loader2,
  Plus,
  RefreshCw,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export function ProjectSwitcher({
  currentProjectId,
}: { currentProjectId?: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [baseURL, setBaseURL] = useState("");

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: () => api.get("/projects"),
  });

  const currentProject = projects.find((p) => p.id === currentProjectId);
  const { status, latency, check } = useProjectStatus(currentProjectId);

  const createMutation = useMutation({
    mutationFn: (data: { name: string; baseURL: string }) =>
      api.post<Project>("/projects", data),
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      localStorage.setItem("lastProjectId", project.id);
      setCreateOpen(false);
      setName("");
      setBaseURL("");
      navigate({ to: "/p/$projectId/api", params: { projectId: project.id } });
    },
    onError: (error) => {
      toast.error(`创建项目失败: ${error instanceof Error ? error.message : '未知错误'}`);
    },
  });

  function selectProject(id: string) {
    localStorage.setItem("lastProjectId", id);
    setOpen(false);
    navigate({ to: "/p/$projectId/api", params: { projectId: id } });
  }

  return (
    <>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm hover:bg-accent transition-colors text-left"
        >
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
            title={
              status === "online"
                ? `在线 (${latency}ms)`
                : status === "offline"
                  ? "离线"
                  : status === "checking"
                    ? "检测中..."
                    : "未知"
            }
          />
          <span className="flex-1 truncate font-medium">
            {currentProject?.name || "选择项目"}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>

        {open && (
          <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-popover border rounded-md shadow-lg overflow-hidden">
            <div className="max-h-64 overflow-auto p-1">
              {projects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm rounded hover:bg-accent transition-colors text-left"
                  onClick={() => selectProject(p.id)}
                >
                  {p.id === currentProjectId ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <span className="w-3.5" />
                  )}
                  <span className="truncate">{p.name}</span>
                </button>
              ))}
            </div>
            {currentProjectId && (
              <div className="border-t px-3 py-2 flex items-center gap-2 text-xs text-muted-foreground">
                <span
                  className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                    status === "online"
                      ? "bg-green-500"
                      : status === "offline"
                        ? "bg-red-500"
                        : "bg-gray-400"
                  }`}
                />
                <span className="flex-1">
                  {status === "online"
                    ? `在线 ${latency}ms`
                    : status === "offline"
                      ? "离线"
                      : status === "checking"
                        ? "检测中..."
                        : "未检测"}
                </span>
                <button
                  type="button"
                  className="hover:text-foreground transition-colors"
                  onClick={(e) => {
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
            )}
            <div className="border-t p-1">
              <button
                type="button"
                className="flex items-center gap-2 w-full px-3 py-2 text-sm rounded hover:bg-accent transition-colors"
                onClick={() => {
                  setOpen(false);
                  setCreateOpen(true);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                新建项目
              </button>
              <button
                type="button"
                className="flex items-center gap-2 w-full px-3 py-2 text-sm rounded hover:bg-accent transition-colors"
                onClick={() => {
                  setOpen(false);
                  navigate({ to: "/projects" });
                }}
              >
                <FolderOpen className="h-3.5 w-3.5" />
                管理项目
              </button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建项目</DialogTitle>
            <DialogDescription>创建一个新的测试项目。</DialogDescription>
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button
              onClick={() => createMutation.mutate({ name, baseURL })}
              disabled={!name || !baseURL}
            >
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
