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
import { api } from "@/lib/api";
import type { Environment } from "@nexqa/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface CloneEnvDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: Environment | null;
  projectId: string;
}

export function CloneEnvDialog({
  open,
  onOpenChange,
  source,
  projectId,
}: CloneEnvDialogProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");

  useEffect(() => {
    if (source && open) {
      setName(`${source.name} (副本)`);
      setSlug(`${source.slug}-copy`);
    }
  }, [source, open]);

  const mutation = useMutation({
    mutationFn: (data: { name: string; slug: string }) =>
      api.post<Environment>('/environments/clone', { id: source!.id, ...data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["environments", projectId] });
      onOpenChange(false);
      toast.success("环境克隆成功，建议修改 baseURL 和敏感变量");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!source) return;
    mutation.mutate({ name, slug });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>克隆环境</DialogTitle>
          <DialogDescription>
            从「{source?.name}」创建副本，Base URL、Headers、Variables
            将完整复制。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="clone-name">名称</Label>
            <Input
              id="clone-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="clone-slug">Slug</Label>
            <Input
              id="clone-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              pattern="^[a-z0-9-]+$"
              title="只允许小写字母、数字和连字符"
              required
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              取消
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Copy className="h-4 w-4 mr-1" />
              )}
              创建副本
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
