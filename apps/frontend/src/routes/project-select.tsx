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
import { useNavigate } from "@tanstack/react-router";
import { FolderOpen, Globe, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const LAST_PROJECT_KEY = "lastProjectId";

export function ProjectSelectPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [baseURL, setBaseURL] = useState("");
  const [redirectChecked, setRedirectChecked] = useState(false);

  const { data: projects = [], isSuccess } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: () => api.get("/projects"),
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; baseURL: string }) =>
      api.post<Project>("/projects", data),
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      localStorage.setItem(LAST_PROJECT_KEY, project.id);
      toast.success("项目创建成功");
      setDialogOpen(false);
      navigate({ to: "/p/$projectId/api", params: { projectId: project.id } });
    },
    onError: (err: Error) => {
      toast.error(`创建失败：${err.message}`);
    },
  });

  useEffect(() => {
    if (!isSuccess || redirectChecked) return;
    setRedirectChecked(true);

    const lastProjectId = localStorage.getItem(LAST_PROJECT_KEY);
    if (lastProjectId && projects.some((p) => p.id === lastProjectId)) {
      navigate({
        to: "/p/$projectId/api",
        params: { projectId: lastProjectId },
      });
    }
  }, [isSuccess, projects, navigate, redirectChecked]);

  function handleSelectProject(project: Project) {
    localStorage.setItem(LAST_PROJECT_KEY, project.id);
    navigate({ to: "/p/$projectId/api", params: { projectId: project.id } });
  }

  function handleCreate() {
    createMutation.mutate({ name, baseURL });
  }

  function openCreate() {
    setName("");
    setBaseURL("");
    setDialogOpen(true);
  }

  if (!isSuccess) {
    return null;
  }

  if (projects.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-6">
          <FolderOpen className="h-16 w-16 mx-auto text-muted-foreground" />
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">创建你的第一个项目</h1>
            <p className="text-muted-foreground">
              开始使用前，请先创建一个项目。
            </p>
          </div>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" /> 创建项目
          </Button>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>新建项目</DialogTitle>
                <DialogDescription>
                  创建一个新的测试项目。
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
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  取消
                </Button>
                <Button onClick={handleCreate} disabled={!name || !baseURL}>
                  创建
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-full max-w-3xl px-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">选择项目</h1>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" /> 新建项目
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {projects.map((project) => (
            <Card
              key={project.id}
              className="cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => handleSelectProject(project)}
            >
              <CardHeader>
                <CardTitle>{project.name}</CardTitle>
                <CardDescription className="flex items-center gap-1">
                  <Globe className="h-3 w-3" />
                  {project.baseURL}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="text-xs text-muted-foreground">
                    {new Date(project.updatedAt).toLocaleDateString()}
                  </div>
                  <ProjectStatusBadge projectId={project.id} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
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
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                取消
              </Button>
              <Button onClick={handleCreate} disabled={!name || !baseURL}>
                创建
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
