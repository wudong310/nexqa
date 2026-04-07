import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Extractor, Injector, TestCase } from "@nexqa/shared";
import { HelpCircle, Plus, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";

// ── Types ───────────────────────────────────────────

export interface StepFormData {
  caseId: string;
  label: string;
  extractors: Extractor[];
  injectors: Injector[];
  delay: number;
}

interface StepConfigPanelProps {
  stepIndex: number;
  initialData: StepFormData;
  testCases: TestCase[];
  /** Variables available from prior steps, grouped */
  availableVars: { name: string; source: string }[];
  onApply: (data: StepFormData) => void;
  onCancel: () => void;
}

// ── Helpers ─────────────────────────────────────────

const methodColors: Record<string, string> = {
  GET: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  POST: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  PUT: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  PATCH: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  DELETE: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

const EMPTY_EXTRACTOR: Extractor = {
  varName: "",
  source: "body",
  expression: "",
  required: true,
};

const EMPTY_INJECTOR: Injector = {
  varName: "",
  target: "path",
  expression: "",
};

// ── Component ───────────────────────────────────────

export function StepConfigPanel({
  stepIndex,
  initialData,
  testCases,
  availableVars,
  onApply,
  onCancel,
}: StepConfigPanelProps) {
  const [caseId, setCaseId] = useState(initialData.caseId);
  const [label, setLabel] = useState(initialData.label);
  const [delay, setDelay] = useState(initialData.delay);
  const [extractors, setExtractors] = useState<Extractor[]>([
    ...initialData.extractors,
  ]);
  const [injectors, setInjectors] = useState<Injector[]>([
    ...initialData.injectors,
  ]);

  useEffect(() => {
    setCaseId(initialData.caseId);
    setLabel(initialData.label);
    setDelay(initialData.delay);
    setExtractors([...initialData.extractors]);
    setInjectors([...initialData.injectors]);
  }, [initialData]);

  const selectedCase = testCases.find((tc) => tc.id === caseId);

  function addExtractor() {
    setExtractors((prev) => [...prev, { ...EMPTY_EXTRACTOR }]);
  }
  function removeExtractor(i: number) {
    setExtractors((prev) => prev.filter((_, idx) => idx !== i));
  }
  function updateExtractor(i: number, patch: Partial<Extractor>) {
    setExtractors((prev) =>
      prev.map((ext, idx) => (idx === i ? { ...ext, ...patch } : ext)),
    );
  }
  function addInjector() {
    setInjectors((prev) => [...prev, { ...EMPTY_INJECTOR }]);
  }
  function removeInjector(i: number) {
    setInjectors((prev) => prev.filter((_, idx) => idx !== i));
  }
  function updateInjector(i: number, patch: Partial<Injector>) {
    setInjectors((prev) =>
      prev.map((inj, idx) => (idx === i ? { ...inj, ...patch } : inj)),
    );
  }

  function handleApply() {
    onApply({
      caseId,
      label,
      extractors: extractors.filter((e) => e.varName.trim()),
      injectors: injectors.filter((i) => i.varName.trim()),
      delay,
    });
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
        <h3 className="text-sm font-medium truncate">
          步骤 {stepIndex + 1} 配置
        </h3>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onCancel}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Body — scrollable */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {/* Basic info */}
        <div className="space-y-3">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            基本信息
          </span>

          <div className="space-y-1.5">
            <Label className="text-xs">标签</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="例如：创建用户"
              className="h-8 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">用例</Label>
            <Select value={caseId} onValueChange={setCaseId}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="选择用例…" />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {testCases.map((tc) => (
                  <SelectItem key={tc.id} value={tc.id}>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="secondary"
                        className={cn(
                          "text-[10px] h-4 font-mono",
                          methodColors[tc.request.method] ?? "",
                        )}
                      >
                        {tc.request.method}
                      </Badge>
                      <span className="text-xs truncate">{tc.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedCase && (
              <p className="text-[10px] text-muted-foreground font-mono">
                {selectedCase.request.method} {selectedCase.request.path}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">延迟 (ms)</Label>
            <Input
              type="number"
              min={0}
              max={10000}
              value={delay}
              onChange={(e) => setDelay(Number(e.target.value) || 0)}
              className="h-8 text-sm w-24"
            />
          </div>
        </div>

        {/* Extractors */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              提取器
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px] px-2"
              onClick={addExtractor}
            >
              <Plus className="h-3 w-3 mr-0.5" />
              添加
            </Button>
          </div>

          {extractors.length === 0 && (
            <p className="text-[10px] text-muted-foreground">
              从响应中提取变量供后续步骤使用
            </p>
          )}

          {extractors.map((ext, i) => (
            <div key={i} className="space-y-1.5 p-2 border rounded-md bg-muted/30">
              <div className="flex items-center gap-1.5">
                <Input
                  placeholder="变量名"
                  value={ext.varName}
                  onChange={(e) =>
                    updateExtractor(i, { varName: e.target.value })
                  }
                  className="h-7 text-xs font-mono flex-1"
                />
                <Select
                  value={ext.source}
                  onValueChange={(v) =>
                    updateExtractor(i, { source: v as Extractor["source"] })
                  }
                >
                  <SelectTrigger className="h-7 w-[72px] text-[10px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="body">body</SelectItem>
                    <SelectItem value="header">header</SelectItem>
                    <SelectItem value="status">status</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-destructive shrink-0"
                  onClick={() => removeExtractor(i)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
              <div className="flex items-center gap-1.5">
                <Input
                  placeholder={
                    ext.source === "body" ? "$.data.id" : "Header-Name"
                  }
                  value={ext.expression}
                  onChange={(e) =>
                    updateExtractor(i, { expression: e.target.value })
                  }
                  className="h-7 text-xs font-mono flex-1"
                  disabled={ext.source === "status"}
                />
                <TooltipProvider delayDuration={0}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="left" className="max-w-[200px] text-xs">
                      <p>JSONPath: $.field, $.a.b, $.arr[0]</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <label className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer shrink-0">
                  <Checkbox
                    checked={ext.required}
                    onCheckedChange={(checked) =>
                      updateExtractor(i, { required: !!checked })
                    }
                    className="h-3 w-3"
                  />
                  必须
                </label>
              </div>
            </div>
          ))}
        </div>

        {/* Injectors */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              注入器
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px] px-2"
              onClick={addInjector}
            >
              <Plus className="h-3 w-3 mr-0.5" />
              添加
            </Button>
          </div>

          {injectors.length === 0 && (
            <p className="text-[10px] text-muted-foreground">
              {availableVars.length > 0
                ? "从上游变量注入到请求中"
                : "前序步骤无可用变量"}
            </p>
          )}

          {injectors.map((inj, i) => (
            <div key={i} className="space-y-1.5 p-2 border rounded-md bg-muted/30">
              <div className="flex items-center gap-1.5">
                {/* Variable select with grouped options */}
                <Select
                  value={inj.varName || "__placeholder"}
                  onValueChange={(v) =>
                    updateInjector(i, {
                      varName: v === "__placeholder" ? "" : v,
                    })
                  }
                >
                  <SelectTrigger className="h-7 text-xs flex-1">
                    <SelectValue placeholder="选择变量" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableVars.length > 0 ? (
                      <>
                        <div className="px-2 py-1 text-[10px] text-muted-foreground font-medium">
                          链变量
                        </div>
                        {availableVars.map((v) => (
                          <SelectItem key={v.name} value={v.name}>
                            <span className="font-mono text-xs">
                              {v.name}
                            </span>
                            <span className="text-[10px] text-muted-foreground ml-1">
                              ({v.source})
                            </span>
                          </SelectItem>
                        ))}
                      </>
                    ) : (
                      <SelectItem value="__placeholder" disabled>
                        无可用变量
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
                <Select
                  value={inj.target}
                  onValueChange={(v) =>
                    updateInjector(i, { target: v as Injector["target"] })
                  }
                >
                  <SelectTrigger className="h-7 w-[72px] text-[10px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="path">path</SelectItem>
                    <SelectItem value="query">query</SelectItem>
                    <SelectItem value="header">header</SelectItem>
                    <SelectItem value="body">body</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-destructive shrink-0"
                  onClick={() => removeInjector(i)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
              <Input
                placeholder={inj.target === "path" ? ":id" : "字段名"}
                value={inj.expression}
                onChange={(e) =>
                  updateInjector(i, { expression: e.target.value })
                }
                className="h-7 text-xs font-mono"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 px-4 py-3 border-t shrink-0">
        <Button variant="outline" size="sm" onClick={onCancel}>
          取消
        </Button>
        <Button size="sm" onClick={handleApply} disabled={!caseId}>
          ✓ 应用
        </Button>
      </div>
    </div>
  );
}
