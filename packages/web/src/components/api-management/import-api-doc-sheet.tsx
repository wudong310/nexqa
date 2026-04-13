import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { useImportApiDocument, useConfirmUpdate } from "@/hooks/use-api-documents";
import { createLogger, getTraceId } from "@/lib/logger";
import type { Endpoint } from "@nexqa/shared";
import type { ApiDiffResult, ImportResult } from "@/types/api-management";
import { useMutation } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle,
  Loader2,
  RotateCcw,
  Upload,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ChangeDiffSheet } from "./change-diff-sheet";

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

interface ImportApiDocSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  /** If provided, we are updating an existing document */
  updateDocumentId?: string;
  updateDocumentName?: string;
  onSuccess?: () => void;
}

export function ImportApiDocSheet({
  open,
  onOpenChange,
  projectId,
  updateDocumentId,
  updateDocumentName,
  onSuccess,
}: ImportApiDocSheetProps) {
  const log = createLogger("import-doc");

  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");
  const [source, setSource] = useState<"paste" | "url" | "file">("paste");
  const [documentName, setDocumentName] = useState(updateDocumentName ?? "");
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [parseState, setParseState] = useState<ParseState>("idle");
  const [parseError, setParseError] = useState("");
  const [detectedFormat, setDetectedFormat] = useState("");
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);

  // Import and diff state
  const importMutation = useImportApiDocument();
  const confirmMutation = useConfirmUpdate();
  const [diffResult, setDiffResult] = useState<ApiDiffResult | null>(null);
  const [diffOpen, setDiffOpen] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const fetchUrlMutation = useMutation({
    mutationFn: (fetchUrl: string) =>
      api.post<{ content: string }>("/fetch-url", { url: fetchUrl }),
    onSuccess: (data) => {
      setContent(data.content);
      handleParse(data.content);
    },
    onError: (err: Error) => {
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
          throw new Error(`不支持的格式。支持：${SUPPORTED_FORMATS_TEXT}`);
        }
        throw new Error(data.error || "解析失败");
      }

      const { format, endpoints: parsedEndpoints, errors } = data as {
        format: string;
        endpoints: Endpoint[];
        errors: string[];
      };

      setDetectedFormat(format);
      if (errors && errors.length > 0) setParseWarnings(errors);

      const list: Endpoint[] = Array.isArray(parsedEndpoints) ? parsedEndpoints : [];
      log.info(`解析成功, 格式: ${format}, 提取到 ${list.length} 个接口`);
      setEndpoints(list);
      setSelectedKeys(new Set(list.map((ep) => `${ep.method} ${ep.path}`)));
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
    // Auto-fill document name from file name
    if (!documentName) {
      setDocumentName(file.name);
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setContent(text);
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    try {
      const result = await importMutation.mutateAsync({
        projectId,
        name: documentName || undefined,
        content,
        source: source === "url" ? url : undefined,
        updateDocumentId,
      });

      setImportResult(result);

      if (result.isUpdate && result.diff) {
        // Show diff for confirmation
        setDiffResult(result.diff);
        setDiffOpen(true);
      } else {
        // Direct import success
        toast.success("API 导入成功");
        resetAndClose();
        onSuccess?.();
      }
    } catch (err) {
      toast.error(`导入失败：${err instanceof Error ? err.message : "未知错误"}`);
    }
  }

  async function handleConfirmUpdate() {
    if (!diffResult || !importResult) return;

    try {
      await confirmMutation.mutateAsync({
        id: diffResult.documentId,
        data: {
          contentHash: importResult.document.contentHash,
          acceptAdded: diffResult.added.map((a) => a.tempId),
          acceptModified: diffResult.modified.map((m) => m.endpointId),
          acceptRemoved: diffResult.removed.map((r) => r.tempId),
        },
      });

      toast.success("API 更新成功");
      setDiffOpen(false);
      resetAndClose();
      onSuccess?.();
    } catch (err) {
      toast.error(`更新失败：${err instanceof Error ? err.message : "未知错误"}`);
    }
  }

  function resetAndClose() {
    setContent("");
    setUrl("");
    setDocumentName("");
    setEndpoints([]);
    setSelectedKeys(new Set());
    setParseState("idle");
    setDiffResult(null);
    setImportResult(null);
    onOpenChange(false);
  }

  function toggleKey(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-[520px] sm:w-[600px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              {updateDocumentId ? "更新 API 文档" : "导入 API"}
            </SheetTitle>
            <SheetDescription>
              支持 {SUPPORTED_FORMATS_TEXT}
            </SheetDescription>
          </SheetHeader>

          <div className="py-4 space-y-4">
            {/* Document name */}
            <div className="space-y-2">
              <Label htmlFor="doc-name" className="text-xs">
                文档名称（可选）
              </Label>
              <Input
                id="doc-name"
                placeholder="petstore-api-v3"
                value={documentName}
                onChange={(e) => setDocumentName(e.target.value)}
              />
            </div>

            {/* Import method tabs */}
            <Tabs
              defaultValue="paste"
              onValueChange={(v) => setSource(v as "paste" | "url" | "file")}
            >
              <TabsList className="w-full">
                <TabsTrigger value="paste" className="flex-1">粘贴内容</TabsTrigger>
                <TabsTrigger value="url" className="flex-1">URL</TabsTrigger>
                <TabsTrigger value="file" className="flex-1">上传文件</TabsTrigger>
              </TabsList>

              <TabsContent value="paste" className="space-y-3 mt-3">
                <Textarea
                  placeholder="粘贴 OpenAPI/Swagger (JSON/YAML)、Postman Collection、HAR、或 cURL 命令..."
                  className="min-h-[160px] font-mono text-sm"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                />
                <Button
                  onClick={() => handleParse()}
                  disabled={!content.trim() || parseState === "parsing"}
                  size="sm"
                >
                  {parseState === "parsing" && (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  )}
                  解析
                </Button>
              </TabsContent>

              <TabsContent value="url" className="space-y-3 mt-3">
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
                    size="sm"
                  >
                    {fetchUrlMutation.isPending && (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    )}
                    获取
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="file" className="space-y-3 mt-3">
                <div className="border-2 border-dashed rounded-lg p-6 text-center">
                  <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground mb-2">
                    .json、.yaml、.yml 或 .har
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
                    size="sm"
                  >
                    {parseState === "parsing" && (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    )}
                    解析
                  </Button>
                )}
              </TabsContent>
            </Tabs>

            {/* Parse error */}
            {parseState === "error" && (
              <div className="flex items-center gap-2 text-destructive text-sm p-3 bg-destructive/10 rounded-lg">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{parseError}</span>
              </div>
            )}

            {/* Parse results */}
            {parseState === "done" && endpoints.length > 0 && (
              <div className="space-y-3">
                {detectedFormat && (
                  <div className="flex items-center gap-2 text-xs text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg px-3 py-2">
                    <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      {FORMAT_LABELS[detectedFormat] || detectedFormat}，共{" "}
                      {endpoints.length} 个接口
                    </span>
                  </div>
                )}

                {parseWarnings.length > 0 && (
                  <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-medium">部分解析失败：</span>
                      <ul className="mt-1 list-disc list-inside">
                        {parseWarnings.map((w) => (
                          <li key={w}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {selectedKeys.size}/{endpoints.length} 个接口
                  </span>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
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
                      className="h-7 text-xs"
                      onClick={() => setSelectedKeys(new Set())}
                    >
                      全不选
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => handleParse()}
                    >
                      <RotateCcw className="h-3 w-3 mr-1" /> 重解析
                    </Button>
                  </div>
                </div>

                <div className="space-y-2 max-h-[40vh] overflow-y-auto">
                  {endpoints.map((ep) => {
                    const key = `${ep.method} ${ep.path}`;
                    const checked = selectedKeys.has(key);
                    return (
                      <Card
                        key={key}
                        className={`transition-opacity ${!checked ? "opacity-50" : ""}`}
                      >
                        <CardHeader className="py-2 px-3">
                          <CardTitle className="flex items-center gap-2 text-xs font-mono">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleKey(key)}
                              className="shrink-0"
                            />
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
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
                            <span className="truncate">{ep.path}</span>
                          </CardTitle>
                        </CardHeader>
                        {ep.summary && (
                          <CardContent className="py-1 px-3">
                            <p className="text-xs text-muted-foreground truncate">
                              {ep.summary}
                            </p>
                          </CardContent>
                        )}
                      </Card>
                    );
                  })}
                </div>

                <Button
                  onClick={handleImport}
                  disabled={importMutation.isPending || selectedKeys.size === 0}
                  className="w-full"
                >
                  {importMutation.isPending && (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  )}
                  <CheckCircle className="h-4 w-4 mr-1" />
                  {updateDocumentId ? "更新文档" : "导入选中"} ({selectedKeys.size})
                </Button>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Change diff sheet */}
      <ChangeDiffSheet
        open={diffOpen}
        onOpenChange={setDiffOpen}
        diff={diffResult}
        isConfirming={confirmMutation.isPending}
        onConfirm={handleConfirmUpdate}
        onCancel={() => setDiffOpen(false)}
      />
    </>
  );
}
