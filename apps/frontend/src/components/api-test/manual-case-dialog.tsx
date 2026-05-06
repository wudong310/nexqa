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
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { methodColor } from "@/utils/api-test-helpers";
import type { ApiEndpoint } from "@nexqa/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FilePlus2, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type MethodType = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

interface ManualCaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  endpoints: ApiEndpoint[];
  projectId: string;
}

interface ManualForm {
  name: string;
  method: MethodType;
  path: string;
  headers: string;
  body: string;
  expectedStatus: string;
  endpointId: string;
}

const INITIAL_FORM: ManualForm = {
  name: "",
  method: "GET",
  path: "",
  headers: "{}",
  body: "",
  expectedStatus: "",
  endpointId: "",
};

export function ManualCaseDialog({
  open,
  onOpenChange,
  endpoints,
  projectId,
}: ManualCaseDialogProps) {
  const queryClient = useQueryClient();
  const [manualForm, setManualForm] = useState<ManualForm>({ ...INITIAL_FORM });

  function resetManualForm() {
    setManualForm({ ...INITIAL_FORM });
  }

  const createCaseMutation = useMutation({
    mutationFn: (data: {
      endpointId: string;
      name: string;
      request: { method: string; path: string; headers: Record<string, string>; body?: unknown };
      expected: { status: number | null; bodyContains: null; bodySchema: null };
    }) => api.post("/test-cases", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["test-cases", projectId] });
      onOpenChange(false);
      resetManualForm();
      toast.success("用例已创建");
    },
    onError: (err: Error) => {
      toast.error(`创建失败：${err.message}`);
    },
  });

  function handleManualCaseSubmit() {
    if (!manualForm.name.trim()) {
      toast.error("请填写用例名称");
      return;
    }
    if (!manualForm.endpointId) {
      toast.error("请选择关联接口");
      return;
    }

    let headers: Record<string, string> = {};
    try {
      headers = manualForm.headers.trim() ? JSON.parse(manualForm.headers) : {};
    } catch {
      toast.error("请求头 JSON 格式无效");
      return;
    }

    let body: unknown = undefined;
    if (manualForm.body.trim()) {
      try {
        body = JSON.parse(manualForm.body);
      } catch {
        toast.error("请求体 JSON 格式无效");
        return;
      }
    }

    const expectedStatus = manualForm.expectedStatus.trim()
      ? Number.parseInt(manualForm.expectedStatus, 10)
      : null;

    createCaseMutation.mutate({
      endpointId: manualForm.endpointId,
      name: manualForm.name.trim(),
      request: {
        method: manualForm.method,
        path: manualForm.path || endpoints.find((ep) => ep.id === manualForm.endpointId)?.path || "/",
        headers,
        body,
      },
      expected: {
        status: expectedStatus,
        bodyContains: null,
        bodySchema: null,
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FilePlus2 className="h-5 w-5" />
            添加测试用例
          </DialogTitle>
          <DialogDescription>
            为已有接口手动创建一条测试用例
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="mc-name">用例名称 *</Label>
            <Input
              id="mc-name"
              placeholder="如：正向 - 创建用户成功"
              value={manualForm.name}
              onChange={(e) => setManualForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mc-endpoint">关联接口 *</Label>
            <Select
              value={manualForm.endpointId}
              onValueChange={(v) => {
                const ep = endpoints.find((e) => e.id === v);
                setManualForm((f) => ({
                  ...f,
                  endpointId: v,
                  method: (ep?.method as MethodType) ?? f.method,
                  path: ep?.path ?? f.path,
                }));
              }}
            >
              <SelectTrigger id="mc-endpoint">
                <SelectValue placeholder="选择接口" />
              </SelectTrigger>
              <SelectContent>
                {endpoints.map((ep) => (
                  <SelectItem key={ep.id} value={ep.id}>
                    <span className={`text-xs font-bold mr-1.5 ${methodColor(ep.method)}`}>{ep.method}</span>
                    {ep.path}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="mc-method">请求方法</Label>
              <Select
                value={manualForm.method}
                onValueChange={(v) => setManualForm((f) => ({ ...f, method: v as MethodType }))}
              >
                <SelectTrigger id="mc-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="mc-status">期望状态码</Label>
              <Input
                id="mc-status"
                placeholder="如：200"
                value={manualForm.expectedStatus}
                onChange={(e) => setManualForm((f) => ({ ...f, expectedStatus: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="mc-path">请求路径</Label>
            <Input
              id="mc-path"
              placeholder="/api/users"
              value={manualForm.path}
              onChange={(e) => setManualForm((f) => ({ ...f, path: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mc-headers">请求头 (JSON)</Label>
            <Textarea
              id="mc-headers"
              placeholder='{"Authorization": "Bearer xxx"}'
              className="font-mono text-xs min-h-[60px]"
              value={manualForm.headers}
              onChange={(e) => setManualForm((f) => ({ ...f, headers: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mc-body">请求体 (JSON)</Label>
            <Textarea
              id="mc-body"
              placeholder='{"name": "test"}'
              className="font-mono text-xs min-h-[80px]"
              value={manualForm.body}
              onChange={(e) => setManualForm((f) => ({ ...f, body: e.target.value }))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            onClick={handleManualCaseSubmit}
            disabled={createCaseMutation.isPending}
          >
            {createCaseMutation.isPending && (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            )}
            创建用例
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
