import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SHORTCUTS,
  formatShortcutDisplay,
} from "@/hooks/use-keyboard-shortcuts";
import { api } from "@/lib/api";
import type { LlmProvider, Settings } from "@nexqa/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle, Eye, EyeOff, Keyboard, Loader2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface StorageDefaults {
  dataDir: string;
  logDir: string;
  currentDataDir: string;
  currentLogDir: string;
}

export function SettingsPage() {
  const queryClient = useQueryClient();
  const { theme, setTheme } = useTheme();

  const { data: settings } = useQuery<Settings>({
    queryKey: ["settings"],
    queryFn: () => api.get("/settings"),
  });

  const { data: defaults } = useQuery<StorageDefaults>({
    queryKey: ["settings-defaults"],
    queryFn: () => api.get("/settings/defaults"),
  });

  const [provider, setProvider] = useState<LlmProvider>("openai-compatible");
  const [baseURL, setBaseURL] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [dataDir, setDataDir] = useState("");
  const [logDir, setLogDir] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);

  useEffect(() => {
    if (settings?.llm) {
      setProvider(settings.llm.provider);
      setBaseURL(settings.llm.baseURL || "");
      setApiKey(settings.llm.apiKey);
      setModel(settings.llm.model);
    }
    if (settings?.storage) {
      setDataDir(settings.storage.dataDir || "");
      setLogDir(settings.storage.logDir || "");
    }
  }, [settings]);

  const mutation = useMutation({
    mutationFn: (data: Settings) => api.post<Settings>("/settings/update", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast.success("LLM 配置已保存");
    },
    onError: (err: Error) => {
      toast.error(`保存失败：${err.message}`);
    },
  });

  const handleSave = () => {
    mutation.mutate({
      llm: {
        provider,
        baseURL: baseURL || undefined,
        apiKey,
        model,
      },
      theme,
      language: settings?.language || "zh-CN",
      storage: settings?.storage,
    });
  };

  const storageMutation = useMutation({
    mutationFn: (data: Settings) => api.post<Settings>("/settings/update", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      queryClient.invalidateQueries({ queryKey: ["settings-defaults"] });
      toast.success("存储路径已更新，立即生效");
    },
    onError: (err: Error) => {
      toast.error(`保存失败：${err.message}`);
    },
  });

  const handleStorageSave = () => {
    storageMutation.mutate({
      llm: settings?.llm,
      theme: settings?.theme || theme,
      language: settings?.language || "zh-CN",
      storage: {
        dataDir: dataDir || undefined,
        logDir: logDir || undefined,
      },
    });
  };

  const dataDirChanged = (dataDir || "") !== (settings?.storage?.dataDir || "");
  const logDirChanged = (logDir || "") !== (settings?.storage?.logDir || "");
  const storageChanged = dataDirChanged || logDirChanged;

  const testMutation = useMutation({
    mutationFn: () =>
      api.post<{
        ok: boolean;
        duration: number;
        model: string;
        response: string;
      }>("/llm/test-connection", {
        provider,
        baseURL: baseURL || undefined,
        apiKey,
        model,
      }),
    onSuccess: (data) => {
      toast.success(`连接成功 — 模型: ${data.model}，延迟 ${data.duration}ms`);
    },
    onError: (err: Error) => {
      toast.error(`连接失败：${err.message}`);
    },
  });

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">全局设置</h1>
        <p className="text-sm text-muted-foreground mt-1">
          配置 LLM 服务商、存储路径和应用外观
        </p>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>LLM 服务商</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>服务商</Label>
              <Select
                value={provider}
                onValueChange={(v) => setProvider(v as LlmProvider)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai-compatible">OpenAI 兼容</SelectItem>
                  <SelectItem value="anthropic">Anthropic</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {provider === "openai-compatible" && (
              <div className="space-y-2">
                <Label>基础 URL</Label>
                <Input
                  placeholder="https://api.openai.com/v1"
                  value={baseURL}
                  onChange={(e) => setBaseURL(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  OpenAI 兼容服务的 API 地址，通常以 /v1 结尾
                </p>
              </div>
            )}

            {provider === "anthropic" && (
              <div className="space-y-2">
                <Label>基础 URL</Label>
                <Input
                  placeholder="https://api.anthropic.com"
                  value={baseURL}
                  onChange={(e) => setBaseURL(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Anthropic API 地址
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label>API 密钥</Label>
              <div className="relative">
                <Input
                  type={showApiKey ? "text" : "password"}
                  placeholder="sk-..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full w-10 hover:bg-transparent"
                  onClick={() => setShowApiKey((prev) => !prev)}
                  tabIndex={-1}
                >
                  {showApiKey ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                密钥加密存储在本地，不会上传
              </p>
            </div>

            <div className="space-y-2">
              <Label>模型</Label>
              <Input
                placeholder="gpt-4o / claude-sonnet-4-20250514 / deepseek-chat"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                用于自动生成测试用例的模型
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                onClick={handleSave}
                disabled={mutation.isPending}
                className="min-w-[80px]"
              >
                {mutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    保存中...
                  </>
                ) : (
                  "保存"
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => testMutation.mutate()}
                disabled={testMutation.isPending || !apiKey || !model}
                className="min-w-[100px]"
              >
                {testMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    测试中...
                  </>
                ) : (
                  "测试连接"
                )}
              </Button>
            </div>
            {testMutation.isSuccess && (
              <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950 rounded-md">
                <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                <span className="text-sm text-green-600">
                  连接正常 · {testMutation.data.duration}ms · 模型: {testMutation.data.model}
                </span>
              </div>
            )}
            {testMutation.isError && (
              <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950 rounded-md">
                <XCircle className="h-4 w-4 text-red-600 shrink-0" />
                <span className="text-sm text-red-600">
                  连接失败 — {testMutation.error.message}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>存储</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>数据目录</Label>
              <Input
                placeholder={defaults?.dataDir || ""}
                value={dataDir}
                onChange={(e) => setDataDir(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                项目数据、用例、执行结果的存储位置。当前: {defaults?.currentDataDir}
              </p>
            </div>
            <div className="space-y-2">
              <Label>日志目录</Label>
              <Input
                placeholder={defaults?.logDir || ""}
                value={logDir}
                onChange={(e) => setLogDir(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                服务运行日志存储位置。当前: {defaults?.currentLogDir}
              </p>
            </div>

            {storageChanged && (
              <div className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-md">
                <AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0 mt-0.5" />
                <div className="text-sm text-yellow-800 dark:text-yellow-200">
                  <p className="font-medium">变更目录前请先手动迁移数据</p>
                  <p className="text-xs mt-1">
                    请将旧目录中的文件复制到新目录后再保存，否则已有数据将无法读取。路径变更保存后立即生效。
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Button
                onClick={handleStorageSave}
                disabled={storageMutation.isPending || !storageChanged}
                className="min-w-[100px]"
              >
                {storageMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    保存中...
                  </>
                ) : (
                  "保存路径"
                )}
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              留空使用默认路径。日志按天自动分割。
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>外观</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label>主题</Label>
              <Select
                value={theme}
                onValueChange={(v) =>
                  setTheme(v as "light" | "dark" | "system")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">浅色</SelectItem>
                  <SelectItem value="dark">深色</SelectItem>
                  <SelectItem value="system">跟随系统</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                也可通过侧边栏底部的主题按钮快速切换
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Keyboard className="h-5 w-5" />
              键盘快捷键
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {SHORTCUTS.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between py-2 border-b last:border-0"
                >
                  <div className="space-y-0.5">
                    <div className="text-sm font-medium">{s.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {s.description}
                    </div>
                  </div>
                  <kbd className="inline-flex items-center gap-1 rounded border bg-muted px-2 py-1 text-xs font-mono font-medium text-muted-foreground">
                    {formatShortcutDisplay(s.display)}
                  </kbd>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
