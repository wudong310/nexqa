import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
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
import { cn } from "@/lib/utils";
import type { Extractor, Injector, TestCase } from "@nexqa/shared";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

// ── Types ───────────────────────────────────────────

export interface StepFormData {
  caseId: string;
  label: string;
  extractors: Extractor[];
  injectors: Injector[];
  delay: number;
}

interface StepEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  testCases: TestCase[];
  initialData?: StepFormData | null;
  /** Variables available from prior steps */
  availableVars: string[];
  onSubmit: (data: StepFormData) => void;
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

export function StepEditorDialog({
  open,
  onOpenChange,
  testCases,
  initialData,
  availableVars,
  onSubmit,
}: StepEditorDialogProps) {
  const [caseId, setCaseId] = useState("");
  const [label, setLabel] = useState("");
  const [delay, setDelay] = useState(0);
  const [extractors, setExtractors] = useState<Extractor[]>([]);
  const [injectors, setInjectors] = useState<Injector[]>([]);

  useEffect(() => {
    if (open) {
      if (initialData) {
        setCaseId(initialData.caseId);
        setLabel(initialData.label);
        setDelay(initialData.delay);
        setExtractors(
          initialData.extractors.length > 0 ? [...initialData.extractors] : [],
        );
        setInjectors(
          initialData.injectors.length > 0 ? [...initialData.injectors] : [],
        );
      } else {
        setCaseId("");
        setLabel("");
        setDelay(0);
        setExtractors([]);
        setInjectors([]);
      }
    }
  }, [open, initialData]);

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

  function handleSubmit() {
    if (!caseId) return;
    onSubmit({
      caseId,
      label,
      extractors: extractors.filter((e) => e.varName.trim()),
      injectors: injectors.filter((i) => i.varName.trim()),
      delay,
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {initialData ? "编辑步骤" : "添加步骤"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Label */}
          <div className="space-y-1.5">
            <Label>步骤标签</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="例如：创建用户"
            />
          </div>

          {/* Test Case selector */}
          <div className="space-y-1.5">
            <Label>测试用例</Label>
            <Select value={caseId} onValueChange={setCaseId}>
              <SelectTrigger>
                <SelectValue placeholder="选择一个测试用例…" />
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
                      <span className="text-sm truncate">{tc.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedCase && (
              <p className="text-xs text-muted-foreground">
                {selectedCase.request.method} {selectedCase.request.path}
              </p>
            )}
          </div>

          {/* Delay */}
          <div className="space-y-1.5">
            <Label>执行前延迟 (ms)</Label>
            <Input
              type="number"
              min={0}
              max={10000}
              value={delay}
              onChange={(e) => setDelay(Number(e.target.value) || 0)}
            />
          </div>

          {/* Extractors */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-emerald-700 dark:text-emerald-400">
                提取器（从响应中提取变量）
              </Label>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={addExtractor}
              >
                <Plus className="h-3 w-3 mr-1" />
                添加
              </Button>
            </div>
            {extractors.length === 0 && (
              <p className="text-xs text-muted-foreground">
                暂无提取器，点击"添加"从响应中提取变量
              </p>
            )}
            {extractors.map((ext, i) => (
              <div
                key={i}
                className="grid grid-cols-[1fr_auto_1fr_auto_auto] gap-2 items-center"
              >
                <Input
                  placeholder="变量名"
                  value={ext.varName}
                  onChange={(e) => updateExtractor(i, { varName: e.target.value })}
                  className="h-8 text-sm"
                />
                <Select
                  value={ext.source}
                  onValueChange={(v) =>
                    updateExtractor(i, {
                      source: v as Extractor["source"],
                    })
                  }
                >
                  <SelectTrigger className="h-8 w-[90px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="body">body</SelectItem>
                    <SelectItem value="header">header</SelectItem>
                    <SelectItem value="status">status</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  placeholder={ext.source === "body" ? "$.data.id" : "Header-Name"}
                  value={ext.expression}
                  onChange={(e) =>
                    updateExtractor(i, { expression: e.target.value })
                  }
                  className="h-8 text-sm font-mono"
                  disabled={ext.source === "status"}
                />
                <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
                  <Checkbox
                    checked={ext.required}
                    onCheckedChange={(checked) =>
                      updateExtractor(i, { required: !!checked })
                    }
                    className="h-3.5 w-3.5"
                  />
                  必须
                </label>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive"
                  onClick={() => removeExtractor(i)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>

          {/* Injectors */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-violet-700 dark:text-violet-400">
                注入器（向请求中注入变量）
              </Label>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={addInjector}
              >
                <Plus className="h-3 w-3 mr-1" />
                添加
              </Button>
            </div>
            {injectors.length === 0 && availableVars.length === 0 && (
              <p className="text-xs text-muted-foreground">
                暂无可注入的变量（前序步骤未提取变量）
              </p>
            )}
            {injectors.length === 0 && availableVars.length > 0 && (
              <p className="text-xs text-muted-foreground">
                可用变量：{availableVars.join(", ")}
              </p>
            )}
            {injectors.map((inj, i) => (
              <div
                key={i}
                className="grid grid-cols-[1fr_auto_1fr_auto] gap-2 items-center"
              >
                <Select
                  value={inj.varName || "__placeholder"}
                  onValueChange={(v) =>
                    updateInjector(i, { varName: v === "__placeholder" ? "" : v })
                  }
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="选择变量" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableVars.map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                    {availableVars.length === 0 && (
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
                  <SelectTrigger className="h-8 w-[90px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="path">path</SelectItem>
                    <SelectItem value="query">query</SelectItem>
                    <SelectItem value="header">header</SelectItem>
                    <SelectItem value="body">body</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  placeholder={inj.target === "path" ? ":id" : "字段名"}
                  value={inj.expression}
                  onChange={(e) =>
                    updateInjector(i, { expression: e.target.value })
                  }
                  className="h-8 text-sm font-mono"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive"
                  onClick={() => removeInjector(i)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={!caseId}>
            确定
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
