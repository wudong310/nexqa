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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import type { ApiEndpoint, Endpoint } from "@nexqa/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Globe, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type MethodType = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface AddEndpointDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}

interface EndpointForm {
  method: MethodType;
  path: string;
  summary: string;
}

const INITIAL_FORM: EndpointForm = {
  method: "GET",
  path: "",
  summary: "",
};

export function AddEndpointDialog({
  open,
  onOpenChange,
  projectId,
}: AddEndpointDialogProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<EndpointForm>({ ...INITIAL_FORM });

  function resetForm() {
    setForm({ ...INITIAL_FORM });
  }

  const createEndpointMutation = useMutation({
    mutationFn: (data: { projectId: string; endpoints: Endpoint[] }) =>
      api.post<ApiEndpoint[]>("/api-endpoints/import", data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["api-endpoints", projectId],
      });
      onOpenChange(false);
      resetForm();
      toast.success("接口已创建");
    },
    onError: (err: Error) => {
      toast.error(`创建失败：${err.message}`);
    },
  });

  function handleSubmit() {
    if (!form.path.trim()) {
      toast.error("请填写接口路径");
      return;
    }

    const endpoint: Endpoint = {
      method: form.method,
      path: form.path.trim(),
      summary: form.summary.trim(),
      headers: [],
      queryParams: [],
      pathParams: [],
      responses: [],
      confidence: "high",
    };

    createEndpointMutation.mutate({
      projectId,
      endpoints: [endpoint],
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            添加 API
          </DialogTitle>
          <DialogDescription>手动添加一个 API 端点</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="ae-method">请求方法 *</Label>
            <Select
              value={form.method}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, method: v as MethodType }))
              }
            >
              <SelectTrigger id="ae-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(
                  ["GET", "POST", "PUT", "PATCH", "DELETE"] as MethodType[]
                ).map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ae-path">接口路径 *</Label>
            <Input
              id="ae-path"
              placeholder="/api/users"
              value={form.path}
              onChange={(e) =>
                setForm((f) => ({ ...f, path: e.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ae-summary">描述</Label>
            <Input
              id="ae-summary"
              placeholder="如：获取用户列表"
              value={form.summary}
              onChange={(e) =>
                setForm((f) => ({ ...f, summary: e.target.value }))
              }
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={createEndpointMutation.isPending}
          >
            {createEndpointMutation.isPending && (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            )}
            创建接口
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
