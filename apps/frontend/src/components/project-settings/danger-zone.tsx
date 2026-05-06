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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { api } from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

// ── DangerAction ────────────────────────────────────────

function DangerAction({
  title,
  description,
  buttonLabel,
  onClick,
}: {
  title: string;
  description: string;
  buttonLabel: string;
  onClick: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-3 min-w-0">
        <Trash2 className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {description}
          </p>
        </div>
      </div>
      <Button
        variant="destructive"
        size="sm"
        className="shrink-0"
        onClick={onClick}
      >
        {buttonLabel}
      </Button>
    </div>
  );
}

// ── ClearResultsDialog ──────────────────────────────────

function ClearResultsDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
}) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () =>
      api.post('/projects/delete-results', { id: projectId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["batchRuns", projectId] });
      queryClient.invalidateQueries({ queryKey: ["testResults", projectId] });
      onOpenChange(false);
      toast.success("测试结果已清空");
    },
    onError: (err: Error) => {
      toast.error(`操作失败: ${err.message}`);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            确认清空测试结果
          </DialogTitle>
          <DialogDescription>
            此操作将删除项目「{projectName}」的所有执行历史和测试结果。用例和配置不受影响。此操作无法恢复。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            variant="destructive"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending && (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            )}
            清空
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── DeleteProjectDialog ─────────────────────────────────

function DeleteProjectDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmInput, setConfirmInput] = useState("");

  const mutation = useMutation({
    mutationFn: () => api.post('/projects/delete', { id: projectId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      onOpenChange(false);
      toast.success("项目已删除");
      navigate({ to: "/" });
    },
    onError: (err: Error) => {
      toast.error(`删除失败: ${err.message}`);
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setConfirmInput("");
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            确认删除项目
          </DialogTitle>
          <DialogDescription>
            此操作将永久删除项目「{projectName}
            」及所有关联数据（用例、环境、执行历史、报告）。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label className="text-sm">请输入项目名称来确认:</Label>
          <Input
            value={confirmInput}
            onChange={(e) => setConfirmInput(e.target.value)}
            placeholder={projectName}
            className="text-sm"
          />
          <p className="text-xs text-muted-foreground">
            需输入 &ldquo;<strong>{projectName}</strong>&rdquo; 来确认删除
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            variant="destructive"
            disabled={
              confirmInput.trim() !== projectName || mutation.isPending
            }
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending && (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            )}
            永久删除
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── DangerZone ──────────────────────────────────────────

export function DangerZone({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const [clearOpen, setClearOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" />
            危险操作
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            以下操作不可恢复，请谨慎操作
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <DangerAction
            title="清空测试结果"
            description="删除该项目所有执行历史和测试结果，用例和配置不受影响。"
            buttonLabel="清空测试结果"
            onClick={() => setClearOpen(true)}
          />
          <Separator />
          <DangerAction
            title="删除项目"
            description="永久删除项目及所有关联数据（用例、环境、执行历史、报告）。此操作无法恢复。"
            buttonLabel="删除项目"
            onClick={() => setDeleteOpen(true)}
          />
        </CardContent>
      </Card>

      <ClearResultsDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        projectId={projectId}
        projectName={projectName}
      />
      <DeleteProjectDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        projectId={projectId}
        projectName={projectName}
      />
    </>
  );
}
