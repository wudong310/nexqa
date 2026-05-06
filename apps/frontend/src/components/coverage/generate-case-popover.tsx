import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Bot, Loader2 } from "lucide-react";
import { useState } from "react";

interface GenerateCasePopoverProps {
  endpointPath: string;
  endpointMethod: string;
  purpose: string;
  purposeLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

type Phase = "idle" | "generating" | "preview";

interface GeneratedCase {
  id: string;
  name: string;
  selected: boolean;
}

export function GenerateCasePopover({
  endpointPath,
  endpointMethod,
  purposeLabel,
  open,
  onOpenChange,
  children,
}: GenerateCasePopoverProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [count, setCount] = useState("3");
  const [generatedCases, setGeneratedCases] = useState<GeneratedCase[]>([]);

  function handleGenerate() {
    setPhase("generating");
    // Simulate generation — in real app this calls the API
    setTimeout(() => {
      const mockCases: GeneratedCase[] = Array.from({ length: Number(count) }, (_, i) => ({
        id: `gen-${i}`,
        name: `${purposeLabel}测试 ${i + 1} - ${endpointMethod} ${endpointPath}`,
        selected: true,
      }));
      setGeneratedCases(mockCases);
      setPhase("preview");
    }, 1500);
  }

  function handleAdd() {
    // In real app: call API to add cases
    onOpenChange(false);
    setPhase("idle");
    setGeneratedCases([]);
  }

  function handleCancel() {
    onOpenChange(false);
    setPhase("idle");
    setGeneratedCases([]);
  }

  function toggleCase(id: string) {
    setGeneratedCases((prev) =>
      prev.map((c) => (c.id === id ? { ...c, selected: !c.selected } : c)),
    );
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-3">
          <h4 className="text-sm font-medium">快速生成测试用例</h4>

          <div className="text-xs text-muted-foreground space-y-1">
            <p>
              接口: {endpointMethod} {endpointPath}
            </p>
            <p>类型: {purposeLabel}</p>
          </div>

          {phase === "idle" && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-xs">生成数量:</span>
                <Select value={count} onValueChange={setCount}>
                  <SelectTrigger className="w-[80px] h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["1", "2", "3", "4", "5"].map((n) => (
                      <SelectItem key={n} value={n}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" className="text-xs" onClick={handleCancel}>
                  取消
                </Button>
                <Button size="sm" className="text-xs" onClick={handleGenerate}>
                  <Bot className="h-3 w-3 mr-1" />
                  生成
                </Button>
              </div>
            </>
          )}

          {phase === "generating" && (
            <div className="flex items-center gap-2 py-3">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-xs text-muted-foreground">AI 生成中...</span>
            </div>
          )}

          {phase === "preview" && (
            <>
              <p className="text-xs text-green-600">
                ✅ 已生成 {generatedCases.length} 个用例:
              </p>
              <div className="space-y-1.5 max-h-[160px] overflow-y-auto">
                {generatedCases.map((c) => (
                  <label
                    key={c.id}
                    className="flex items-center gap-2 text-xs cursor-pointer"
                  >
                    <Checkbox
                      checked={c.selected}
                      onCheckedChange={() => toggleCase(c.id)}
                    />
                    <span className="truncate">{c.name}</span>
                  </label>
                ))}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" className="text-xs" onClick={handleCancel}>
                  取消
                </Button>
                <Button
                  size="sm"
                  className="text-xs"
                  onClick={handleAdd}
                  disabled={generatedCases.filter((c) => c.selected).length === 0}
                >
                  ✓ 添加到项目
                </Button>
              </div>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
