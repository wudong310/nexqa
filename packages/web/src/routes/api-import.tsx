import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { createLogger, getTraceId } from "@/lib/logger";
import type { ApiEndpoint, Endpoint } from "@nexqa/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle,
  Loader2,
  RotateCcw,
  Upload,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type ParseState = "idle" | "parsing" | "done" | "error";

const FORMAT_LABELS: Record<string, string> = {
  openapi3: "OpenAPI 3.x",
  swagger2: "Swagger 2.0",
  "postman-v2": "Postman Collection",
  har: "HAR (HTTP Archive)",
  curl: "cURL",
};

const SUPPORTED_FORMATS_TEXT =
  "OpenAPI 3.x、Swagger 2.0、Postman Collection、HAR、cURL";

export function ApiImportPage() {
  const log = createLogger("import");
  const { projectId } = useParams({ from: "/p/$projectId/api/import" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");
  const [source, setSource] = useState<"paste" | "url" | "file">("paste");
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [parseState, setParseState] = useState<ParseState>("idle");
  const [parseError, setParseError] = useState("");
  const [detectedFormat, setDetectedFormat] = useState("");
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);

  const fetchUrlMutation = useMutation({
    mutationFn: (fetchUrl: string) =>
      api.post<{ content: string }>("/fetch-url", { url: fetchUrl }),
    onSuccess: (data) => {
      setContent(data.content);
      handleParse(data.content);
    },
    onError: (err) => {
      setParseError(err.message);
      setParseState("error");
      toast.error(`获取失败：${err.message}`);
    },
  });

  async function handleParse(text?: string) {
    const input = text || content;
    if (!input.trim()) return;

    log.info("开始解析文档", { contentLength: input.length, source });
    setParseState("parsing");
    setParseError("");
    setDetectedFormat("");
    setParseWarnings([]);

    try {
      const res = await fetch("/nexqa/api/api-endpoints/parse", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-trace-id": getTraceId(),
        },
        body: JSON.stringify({ content: input }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 400) {
          throw new Error(
            `不支持的格式。支持：${SUPPORTED_FORMATS_TEXT}`,
          );
        }
        throw new Error(data.error || "解析失败");
      }

      const { format, endpoints: parsedEndpoints, errors } = data as {
        format: string;
        endpoints: Endpoint[];
        errors: string[];
      };

      setDetectedFormat(format);
      if (errors && errors.length > 0) {
        setParseWarnings(errors);
      }

      const list: Endpoint[] = Array.isArray(parsedEndpoints)
        ? parsedEndpoints
        : [];
      log.info(`解析成功, 格式: ${format}, 提取到 ${list.length} 个接口`);
      setEndpoints(list);
      setSelectedKeys(
        new Set(list.map((ep: Endpoint) => `${ep.method} ${ep.path}`)),
      );
      setParseState("done");
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "解析失败");
      setParseState("error");
    }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSource("file");
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setContent(text);
    };
    reader.readAsText(file);
  }

  const importMutation = useMutation({
    mutationFn: () => {
      const selected = endpoints.filter((ep) =>
        selectedKeys.has(`${ep.method} ${ep.path}`),
      );
      return api.post<ApiEndpoint[]>("/api-endpoints/import", {
        projectId,
        endpoints: selected,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["api-endpoints", projectId],
      });
      queryClient.invalidateQueries({
        queryKey: ["test-cases", projectId],
      });
      toast.success("接口导入成功");
      navigate({ to: "/p/$projectId/api", params: { projectId } });
    },
    onError: (err: Error) => {
      toast.error(`导入失败：${err.message}`);
    },
  });

  function toggleKey(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-bold mb-6">导入 API</h1>

      <Tabs
        defaultValue="paste"
        onValueChange={(v) => setSource(v as "paste" | "url" | "file")}
      >
        <TabsList>
          <TabsTrigger value="paste">粘贴内容</TabsTrigger>
          <TabsTrigger value="url">URL</TabsTrigger>
          <TabsTrigger value="file">上传文件</TabsTrigger>
        </TabsList>

        <TabsContent value="paste" className="space-y-4">
          <Textarea
            placeholder="粘贴 OpenAPI/Swagger (JSON/YAML)、Postman Collection、HAR、或 cURL 命令..."
            className="min-h-[200px] font-mono text-sm"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <Button
            onClick={() => handleParse()}
            disabled={!content.trim() || parseState === "parsing"}
          >
            {parseState === "parsing" ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : null}
            解析
          </Button>
        </TabsContent>

        <TabsContent value="url" className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="https://api.example.com/openapi.json"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="flex-1"
            />
            <Button
              onClick={() => fetchUrlMutation.mutate(url)}
              disabled={!url.trim() || fetchUrlMutation.isPending}
            >
              {fetchUrlMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : null}
              获取并解析
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="file" className="space-y-4">
          <div className="border-2 border-dashed rounded-lg p-8 text-center">
            <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground mb-2">
              上传 .json、.yaml、.yml 或 .har 文件
            </p>
            <Input
              type="file"
              accept=".json,.yaml,.yml,.har"
              onChange={handleFileUpload}
              className="max-w-xs mx-auto"
            />
          </div>
          {content && source === "file" && (
            <Button
              onClick={() => handleParse()}
              disabled={parseState === "parsing"}
            >
              {parseState === "parsing" ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : null}
              解析
            </Button>
          )}
        </TabsContent>
      </Tabs>

      {parseState === "error" && (
        <Card className="mt-4 border-destructive">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              <span>{parseError}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {parseState === "done" && endpoints.length > 0 && (
        <div className="mt-6 space-y-4">
          {/* 格式检测结果 */}
          {detectedFormat && (
            <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg px-4 py-2">
              <CheckCircle className="h-4 w-4 shrink-0" />
              <span>
                检测到 {FORMAT_LABELS[detectedFormat] || detectedFormat}{" "}
                格式，共提取 {endpoints.length} 个接口
              </span>
            </div>
          )}

          {/* 解析警告 */}
          {parseWarnings.length > 0 && (
            <div className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <span className="font-medium">部分内容解析失败：</span>
                <ul className="mt-1 list-disc list-inside">
                  {parseWarnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              提取的接口 ({selectedKeys.size}/{endpoints.length})
            </h2>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setSelectedKeys(
                    new Set(endpoints.map((ep) => `${ep.method} ${ep.path}`)),
                  )
                }
              >
                全选
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedKeys(new Set())}
              >
                全不选
              </Button>
              <Button variant="outline" onClick={() => handleParse()}>
                <RotateCcw className="h-4 w-4 mr-1" /> 重新解析
              </Button>
              <Button
                onClick={() => importMutation.mutate()}
                disabled={importMutation.isPending || selectedKeys.size === 0}
              >
                <CheckCircle className="h-4 w-4 mr-1" /> 导入选中 (
                {selectedKeys.size})
              </Button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            已存在相同 path 的接口将自动合并更新
          </p>

          {endpoints.map((ep) => {
            const key = `${ep.method} ${ep.path}`;
            const checked = selectedKeys.has(key);
            return (
              <Card
                key={key}
                className={`transition-opacity ${!checked ? "opacity-50" : ""}`}
              >
                <CardHeader className="py-3">
                  <CardTitle className="flex items-center gap-2 text-sm font-mono">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleKey(key)}
                      className="shrink-0"
                    />
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-bold ${
                        ep.method === "GET"
                          ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                          : ep.method === "POST"
                            ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                            : ep.method === "PUT"
                              ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                              : ep.method === "DELETE"
                                ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                                : "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200"
                      }`}
                    >
                      {ep.method}
                    </span>
                    <span>{ep.path}</span>
                    {ep.confidence !== "high" && (
                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="py-2">
                  <p className="text-sm text-muted-foreground">{ep.summary}</p>
                  {ep.body && (
                    <div className="mt-2">
                      <span className="text-xs text-muted-foreground">
                        请求体:{" "}
                      </span>
                      <code className="text-xs bg-muted px-1 py-0.5 rounded">
                        {JSON.stringify(
                          ep.body.example || ep.body.schema,
                          null,
                          0,
                        )?.slice(0, 100)}
                      </code>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
