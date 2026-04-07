import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { WebhookConfig } from "@/types/cicd";
import { AlertTriangle, Bell, Clipboard, Copy, Eye, EyeOff, MoreVertical, RotateCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function WebhookEndpointCard({
  config,
  projectId,
  onRegenerateToken,
}: {
  config: WebhookConfig | undefined;
  projectId: string;
  onRegenerateToken: () => void;
}) {
  const [showToken, setShowToken] = useState(false);
  const webhookUrl = `${window.location.origin}/nexqa/api/webhooks/${projectId}/trigger`;
  const token = config?.incoming.token ?? "nexqa_wh_...";

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    toast.success("已复制到剪贴板");
  }

  const curlExample = `curl -X POST \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{"type":"smoke","env":"test"}' \\
  ${webhookUrl}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">接收端点 (Incoming Webhook)</CardTitle>
        <p className="text-xs text-muted-foreground">
          NexQA 监听以下 URL，外部 CI/CD 系统可调用此端点触发测试执行。
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* URL */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium">URL</p>
          <div className="flex items-center gap-2 bg-muted p-2 rounded-md">
            <code className="text-xs font-mono flex-1 truncate">{webhookUrl}</code>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={() => copyToClipboard(webhookUrl)}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Token */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium">认证 Token</p>
          <div className="flex items-center gap-2">
            <Input
              type={showToken ? "text" : "password"}
              value={token}
              readOnly
              className="font-mono text-xs h-8"
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => setShowToken(!showToken)}
            >
              {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 text-xs"
              onClick={onRegenerateToken}
            >
              <RotateCw className="h-3 w-3 mr-1" />
              重新生成
            </Button>
          </div>
          <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            Token 仅在生成时展示一次，请妥善保存
          </p>
        </div>

        {/* Example */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium">请求示例</p>
          <div className="relative">
            <pre className="bg-muted/50 rounded-lg p-4 text-xs font-mono overflow-x-auto">
              {curlExample}
            </pre>
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 h-6 w-6"
              onClick={() => copyToClipboard(curlExample)}
            >
              <Clipboard className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function OutgoingWebhookRow({
  webhook,
  onEdit,
  onTest,
  onToggle,
  onDelete,
}: {
  webhook: {
    id: string;
    name: string;
    url: string;
    events: string[];
    notifyOn: string;
    active: boolean;
  };
  onEdit: () => void;
  onTest: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-lg border p-3 flex items-start justify-between">
      <div className="space-y-1 min-w-0">
        <div className="flex items-center gap-2">
          <Bell className="h-3.5 w-3.5 text-blue-500 shrink-0" />
          <span className="text-sm font-medium truncate">{webhook.name}</span>
        </div>
        <p className="text-xs font-mono text-muted-foreground truncate">
          {webhook.url}
        </p>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
          <span>触发: {webhook.events.join(" · ")}</span>
          <span>·</span>
          <span>
            {webhook.notifyOn === "always" ? "始终通知" : "仅失败时通知"}
          </span>
          <span>·</span>
          <span className="flex items-center gap-1">
            状态:
            {webhook.active ? (
              <Badge
                variant="outline"
                className="text-[10px] border-green-300 text-green-600"
              >
                活跃
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="text-[10px] border-gray-300 text-gray-500"
              >
                已禁用
              </Badge>
            )}
          </span>
        </div>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
            <MoreVertical className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onEdit}>✏️ 编辑</DropdownMenuItem>
          <DropdownMenuItem onClick={onTest}>🔔 测试发送</DropdownMenuItem>
          <DropdownMenuItem onClick={onToggle}>
            {webhook.active ? "⏸ 禁用" : "▶ 启用"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={onDelete}
          >
            🗑️ 删除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
