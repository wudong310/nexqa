import { Button } from "@/components/ui/button";
import { InlineEdit } from "@/components/ui/inline-edit";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type {
  CreateTestChain,
  Extractor,
  Injector,
  TestCase,
  TestChain,
  TestChainStep,
} from "@nexqa/shared";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { ArrowLeft, Link2, Loader2, Play, Plus, Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StepCard } from "./step-card";
import { StepConfigPanel, type StepFormData } from "./step-config-panel";
import { VarPool } from "./var-pool";
import { buildVarColorMap } from "./var-tag";
import { EmptyState } from "@/components/ui/empty-state";

// ── Types ───────────────────────────────────────────

interface LocalStep {
  id: string;
  caseId: string;
  label: string;
  extractors: Extractor[];
  injectors: Injector[];
  delay: number;
}

interface ChainEditorProps {
  chain?: TestChain | null;
  testCases: TestCase[];
  onSave: (data: CreateTestChain) => void;
  onExecute?: () => void;
  onBack: () => void;
  isSaving?: boolean;
  isExecuting?: boolean;
}

// ── Helpers ─────────────────────────────────────────

function genId(): string {
  return crypto.randomUUID();
}

function toLocalSteps(steps: TestChainStep[]): LocalStep[] {
  return steps.map((s) => ({
    id: s.id,
    caseId: s.caseId,
    label: s.label,
    extractors: [...s.extractors],
    injectors: [...s.injectors],
    delay: s.delay ?? 0,
  }));
}

type RightPanel = "varpool" | { type: "config"; stepIndex: number };

// ── Component ───────────────────────────────────────

export function ChainEditor({
  chain,
  testCases,
  onSave,
  onExecute,
  onBack,
  isSaving,
  isExecuting,
}: ChainEditorProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [continueOnFail, setContinueOnFail] = useState(false);
  const [steps, setSteps] = useState<LocalStep[]>([]);
  const [rightPanel, setRightPanel] = useState<RightPanel>("varpool");
  const [highlightedVar, setHighlightedVar] = useState<string | null>(null);

  // Initialize from chain prop
  useEffect(() => {
    if (chain) {
      setName(chain.name);
      setDescription(chain.description);
      setContinueOnFail(chain.config.continueOnFail);
      setSteps(toLocalSteps(chain.steps));
    } else {
      setName("");
      setDescription("");
      setContinueOnFail(false);
      setSteps([]);
    }
    setRightPanel("varpool");
  }, [chain]);

  // Case map for quick lookup
  const caseMap = useMemo(() => {
    const m = new Map<string, TestCase>();
    for (const tc of testCases) m.set(tc.id, tc);
    return m;
  }, [testCases]);

  // Build var color map
  const allVarNames = useMemo(() => {
    const names: string[] = [];
    for (const step of steps) {
      for (const ext of step.extractors) {
        if (ext.varName && !names.includes(ext.varName)) {
          names.push(ext.varName);
        }
      }
    }
    return names;
  }, [steps]);

  const varColorMap = useMemo(() => buildVarColorMap(allVarNames), [allVarNames]);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setSteps((prev) => {
      const oldIndex = prev.findIndex((s) => s.id === active.id);
      const newIndex = prev.findIndex((s) => s.id === over.id);
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  function addStep(tc: TestCase) {
    const newStep: LocalStep = {
      id: genId(),
      caseId: tc.id,
      label: tc.name,
      extractors: [],
      injectors: [],
      delay: 0,
    };
    setSteps((prev) => [...prev, newStep]);
    // Open config for the new step
    setRightPanel({ type: "config", stepIndex: steps.length });
  }

  function openStepConfig(index: number) {
    setRightPanel({ type: "config", stepIndex: index });
  }

  function handleStepApply(data: StepFormData) {
    const idx =
      typeof rightPanel === "object" && rightPanel.type === "config"
        ? rightPanel.stepIndex
        : -1;
    if (idx < 0 || idx >= steps.length) return;

    setSteps((prev) =>
      prev.map((s, i) =>
        i === idx
          ? {
              ...s,
              caseId: data.caseId,
              label: data.label,
              extractors: data.extractors,
              injectors: data.injectors,
              delay: data.delay,
            }
          : s,
      ),
    );
    setRightPanel("varpool");
  }

  function removeStep(index: number) {
    setSteps((prev) => prev.filter((_, i) => i !== index));
    if (
      typeof rightPanel === "object" &&
      rightPanel.type === "config" &&
      rightPanel.stepIndex === index
    ) {
      setRightPanel("varpool");
    }
  }

  function handleSave() {
    onSave({
      name: name.trim() || "未命名测试链",
      description,
      steps: steps.map((s) => ({
        caseId: s.caseId,
        label: s.label,
        extractors: s.extractors,
        injectors: s.injectors,
        delay: s.delay,
      })),
      config: { continueOnFail, cleanupSteps: [] },
    });
  }

  const handleHoverVar = useCallback((varName: string | null) => {
    setHighlightedVar(varName);
  }, []);

  // Available vars for step config
  const getAvailableVarsForStep = useCallback(
    (stepIndex: number) => {
      const vars: { name: string; source: string }[] = [];
      for (let i = 0; i < stepIndex; i++) {
        for (const ext of steps[i].extractors) {
          if (ext.varName && !vars.some((v) => v.name === ext.varName)) {
            vars.push({
              name: ext.varName,
              source: `Step ${i + 1}`,
            });
          }
        }
      }
      return vars;
    },
    [steps],
  );

  const isDirty = true; // simplified — could track actual changes
  const selectedStepIndex =
    typeof rightPanel === "object" && rightPanel.type === "config"
      ? rightPanel.stepIndex
      : -1;

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Top bar */}
      <div className="h-14 border-b flex items-center px-4 gap-3 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onBack}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm text-muted-foreground">测试链</span>
        <span className="text-muted-foreground">/</span>
        <InlineEdit
          value={name || "新测试链"}
          onSave={setName}
          className="text-sm font-semibold"
        />

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSave}
            disabled={isSaving || !name.trim()}
          >
            {isSaving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
            ) : (
              <Save className="h-3.5 w-3.5 mr-1" />
            )}
            保存
          </Button>
          {onExecute && (
            <Button
              size="sm"
              onClick={onExecute}
              disabled={isExecuting || steps.length === 0}
            >
              {isExecuting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              ) : (
                <Play className="h-3.5 w-3.5 mr-1" />
              )}
              执行链
            </Button>
          )}
        </div>
      </div>

      {/* Main body: steps + right panel */}
      <div className="flex flex-1 min-h-0">
        {/* Left: Steps flow */}
        <div className="flex-1 overflow-y-auto p-6">
          {steps.length === 0 ? (
            <EmptyState
              icon={<Link2 className="h-12 w-12" />}
              title="从项目用例中添加步骤"
              description="构建多接口串联测试流程"
              action={
                <AddStepButton testCases={testCases} onAdd={addStep} />
              }
            />
          ) : (
            <div className="space-y-0">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={steps.map((s) => s.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {steps.map((step, i) => (
                    <StepCard
                      key={step.id}
                      stepId={step.id}
                      index={i}
                      label={step.label}
                      testCase={caseMap.get(step.caseId)}
                      extractors={step.extractors}
                      injectors={step.injectors}
                      isLast={i === steps.length - 1}
                      isSelected={selectedStepIndex === i}
                      varColorMap={varColorMap}
                      highlightedVar={highlightedVar}
                      onHoverVar={handleHoverVar}
                      onEdit={() => openStepConfig(i)}
                      onDelete={() => removeStep(i)}
                    />
                  ))}
                </SortableContext>
              </DndContext>

              {/* Add step button */}
              <div className="max-w-[600px] mx-auto mt-2">
                <AddStepButton testCases={testCases} onAdd={addStep} />
              </div>
            </div>
          )}

          {/* Chain config (below steps) */}
          {steps.length > 0 && (
            <div className="max-w-[600px] mx-auto mt-6 border rounded-lg p-4 space-y-3">
              <h4 className="text-sm font-medium">链配置</h4>
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm">步骤失败继续执行</Label>
                  <p className="text-xs text-muted-foreground">
                    开启后，某个步骤失败不会中止整条链
                  </p>
                </div>
                <Switch
                  checked={continueOnFail}
                  onCheckedChange={setContinueOnFail}
                />
              </div>
            </div>
          )}
        </div>

        {/* Right panel */}
        <div className="w-[340px] lg:w-[360px] border-l shrink-0 hidden md:flex flex-col">
          {rightPanel === "varpool" ? (
            <div className="p-4 overflow-y-auto flex-1">
              <VarPool
                steps={steps}
                varColorMap={varColorMap}
                highlightedVar={highlightedVar}
                onHoverVar={handleHoverVar}
              />
            </div>
          ) : (
            <StepConfigPanel
              stepIndex={rightPanel.stepIndex}
              initialData={{
                caseId: steps[rightPanel.stepIndex]?.caseId ?? "",
                label: steps[rightPanel.stepIndex]?.label ?? "",
                extractors: steps[rightPanel.stepIndex]?.extractors ?? [],
                injectors: steps[rightPanel.stepIndex]?.injectors ?? [],
                delay: steps[rightPanel.stepIndex]?.delay ?? 0,
              }}
              testCases={testCases}
              availableVars={getAvailableVarsForStep(rightPanel.stepIndex)}
              onApply={handleStepApply}
              onCancel={() => setRightPanel("varpool")}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Add Step Button (inline search) ─────────────────

function AddStepButton({
  testCases,
  onAdd,
}: {
  testCases: TestCase[];
  onAdd: (tc: TestCase) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return testCases.slice(0, 20);
    const q = search.toLowerCase();
    return testCases.filter(
      (tc) =>
        tc.name.toLowerCase().includes(q) ||
        tc.request.path.toLowerCase().includes(q) ||
        tc.request.method.toLowerCase().includes(q),
    );
  }, [testCases, search]);

  // Group by module (first path segment)
  const grouped = useMemo(() => {
    const map = new Map<string, TestCase[]>();
    for (const tc of filtered) {
      const parts = tc.request.path.split("/").filter(Boolean);
      const module = parts[1] ?? parts[0] ?? "其他";
      if (!map.has(module)) map.set(module, []);
      map.get(module)!.push(tc);
    }
    return map;
  }, [filtered]);

  if (!open) {
    return (
      <Button
        variant="outline"
        className="w-full border-dashed"
        onClick={() => setOpen(true)}
      >
        <Plus className="h-4 w-4 mr-2" />
        添加步骤
      </Button>
    );
  }

  const methodColors: Record<string, string> = {
    GET: "text-blue-600",
    POST: "text-green-600",
    PUT: "text-amber-600",
    PATCH: "text-orange-600",
    DELETE: "text-red-600",
  };

  return (
    <div className="border rounded-lg overflow-hidden bg-card">
      <div className="p-2 border-b">
        <Input
          placeholder="🔍 搜索用例名称、路径、方法..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 text-sm"
          autoFocus
        />
      </div>
      <div className="max-h-[300px] overflow-y-auto divide-y">
        {[...grouped.entries()].map(([module, cases]) => (
          <div key={module}>
            <div className="px-3 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider bg-muted/50">
              {module} ({cases.length})
            </div>
            {cases.map((tc) => (
              <button
                key={tc.id}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-accent/50 text-left"
                onClick={() => {
                  onAdd(tc);
                  setOpen(false);
                  setSearch("");
                }}
              >
                <span
                  className={`font-mono font-medium w-12 shrink-0 ${methodColors[tc.request.method] ?? ""}`}
                >
                  {tc.request.method}
                </span>
                <span className="text-muted-foreground truncate flex-1 font-mono">
                  {tc.request.path}
                </span>
                <span className="truncate max-w-[160px]">{tc.name}</span>
              </button>
            ))}
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">
            没有匹配的用例
          </p>
        )}
      </div>
      <div className="p-2 border-t flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setOpen(false);
            setSearch("");
          }}
        >
          关闭
        </Button>
      </div>
    </div>
  );
}
