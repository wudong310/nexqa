import { api } from "@/lib/api";
import { getTraceId } from "@/lib/logger";
import type {
  CaseGenPurpose,
  CaseGenStrategy,
  EndpointGenState,
  GeneratedCase,
} from "@/types/case-gen";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

import type { TestCaseTags } from "@nexqa/shared";

const DEFAULT_TAGS: TestCaseTags = {
  purpose: ["functional"],
  strategy: ["positive"],
  phase: ["full"],
  priority: "P1",
};

function parseSSECases(fullText: string): GeneratedCase[] {
  // Handle Vercel AI SDK "0:" prefix format
  const lines = fullText.split("\n").filter((l) => l.startsWith("0:"));
  const parts = lines.map((l) => {
    try {
      return JSON.parse(l.slice(2));
    } catch {
      return "";
    }
  });

  const jsonStr = parts
    .join("")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  if (!jsonStr) return [];

  const parsed = JSON.parse(jsonStr) as Array<{
    name: string;
    request: unknown;
    expected: unknown;
    tags: unknown;
  }>;

  return parsed.map((item, idx) => ({
    _tempId: `gen-${Date.now()}-${idx}`,
    name: item.name,
    request: item.request as GeneratedCase["request"],
    expected: item.expected as GeneratedCase["expected"],
    tags: (item.tags && typeof item.tags === "object" && !Array.isArray(item.tags)
      ? item.tags
      : DEFAULT_TAGS) as TestCaseTags,
    strategy: inferStrategy(item.tags),
  }));
}

function inferStrategy(tags: unknown): CaseGenStrategy {
  if (tags && typeof tags === "object" && !Array.isArray(tags) && "strategy" in tags) {
    const stratArr = (tags as { strategy?: string[] }).strategy;
    if (Array.isArray(stratArr)) {
      if (stratArr.includes("destructive")) return "destructive";
      if (stratArr.includes("negative")) return "negative";
      if (stratArr.includes("boundary")) return "boundary";
      return "positive";
    }
  }
  return "positive";
}

/** Fetch one endpoint's cases via SSE stream */
async function fetchEndpointCases(
  endpoint: { id: string; method: string; path: string; [k: string]: unknown },
  tags: CaseGenStrategy[] | undefined,
  purposes: CaseGenPurpose[] | undefined,
  isolationRule: boolean,
  signal: AbortSignal,
): Promise<GeneratedCase[]> {
  const res = await fetch("/nexqa/api/test-cases/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-trace-id": getTraceId(),
    },
    body: JSON.stringify({
      endpoints: [endpoint],
      tags,
      purposes: purposes && purposes.length > 0 ? purposes : undefined,
      isolationRule,
    }),
    signal,
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: res.statusText }));
    const rawMsg = errBody.error || `生成失败 (${res.status})`;
    const msg = /LLM not configured/i.test(rawMsg)
      ? "尚未配置 AI 模型，请前往全局设置页面配置"
      : rawMsg;
    throw new Error(msg);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("无法读取流式响应");

  let fullText = "";
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      fullText += decoder.decode(value, { stream: true });
    }
  } catch (streamErr) {
    if (!fullText.trim()) {
      throw new Error(
        `流式读取中断: ${streamErr instanceof Error ? streamErr.message : String(streamErr)}`,
      );
    }
    console.warn("流式读取中断，尝试使用已接收内容", streamErr);
  }

  if (fullText.includes('"finishReason":"length"')) {
    throw new Error("LLM 输出被截断，生成内容不完整。");
  }

  return parseSSECases(fullText);
}

// ── Main hook ───────────────────────────────────────

export function useCaseGen(projectId: string) {
  const queryClient = useQueryClient();
  const abortRef = useRef<AbortController | null>(null);

  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedCases, setGeneratedCases] = useState<GeneratedCase[]>([]);
  const [genError, setGenError] = useState<Error | null>(null);
  const [endpointStates, setEndpointStates] = useState<EndpointGenState[]>([]);
  const [currentEndpointIndex, setCurrentEndpointIndex] = useState(-1);
  const [totalEndpoints, setTotalEndpoints] = useState(0);

  // Ref to keep track of latest config for retries
  const configRef = useRef<{
    tags?: CaseGenStrategy[];
    purposes?: CaseGenPurpose[];
    isolationRule: boolean;
  }>({ isolationRule: false });

  // ── Helper: update one endpoint state ─────────────

  const updateEpState = useCallback(
    (
      endpointId: string,
      updater: (prev: EndpointGenState) => Partial<EndpointGenState>,
    ) => {
      setEndpointStates((prev) =>
        prev.map((ep) =>
          ep.endpointId === endpointId ? { ...ep, ...updater(ep) } : ep,
        ),
      );
    },
    [],
  );

  // ── Generate: serial per-endpoint ─────────────────

  const generate = useCallback(
    async (
      endpoints: Array<{ id: string; method: string; path: string; name?: string; [k: string]: unknown }>,
      strategies: CaseGenStrategy[],
      purposes?: CaseGenPurpose[],
      isolationRule?: boolean,
    ) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const tags = strategies.length > 0 ? strategies : undefined;
      const isoRule = isolationRule ?? false;
      configRef.current = { tags, purposes, isolationRule: isoRule };

      // Initialize endpoint states
      const initial: EndpointGenState[] = endpoints.map((ep) => ({
        endpointId: ep.id,
        method: ep.method,
        path: ep.path,
        name: ep.name,
        status: "pending" as const,
        cases: [],
      }));

      setIsGenerating(true);
      setGenError(null);
      setGeneratedCases([]);
      setEndpointStates(initial);
      setTotalEndpoints(endpoints.length);
      setCurrentEndpointIndex(0);

      const allCases: GeneratedCase[] = [];

      // Serial loop
      for (let i = 0; i < endpoints.length; i++) {
        if (controller.signal.aborted) break;

        const ep = endpoints[i];
        setCurrentEndpointIndex(i);

        // Mark generating
        setEndpointStates((prev) =>
          prev.map((s, idx) =>
            idx === i ? { ...s, status: "generating" as const } : s,
          ),
        );

        try {
          const cases = await fetchEndpointCases(
            ep,
            tags,
            purposes,
            isoRule,
            controller.signal,
          );

          // Mark done
          setEndpointStates((prev) =>
            prev.map((s, idx) =>
              idx === i ? { ...s, status: "done" as const, cases } : s,
            ),
          );

          allCases.push(...cases);
          // Update aggregate immediately
          setGeneratedCases([...allCases]);
        } catch (err) {
          if ((err as Error).name === "AbortError") break;
          const error = err instanceof Error ? err : new Error(String(err));

          // Mark failed, continue to next
          setEndpointStates((prev) =>
            prev.map((s, idx) =>
              idx === i
                ? { ...s, status: "failed" as const, error: error.message }
                : s,
            ),
          );
        }
      }

      // Done: update final index
      setCurrentEndpointIndex(endpoints.length);
      setIsGenerating(false);
      return allCases;
    },
    [],
  );

  // ── Retry single endpoint ─────────────────────────

  const retryEndpoint = useCallback(
    async (endpointId: string) => {
      const epState = endpointStates.find((e) => e.endpointId === endpointId);
      if (!epState) return;

      const controller = new AbortController();
      // Store to allow abort
      abortRef.current = controller;

      // Mark generating
      updateEpState(endpointId, () => ({
        status: "generating" as const,
        error: undefined,
        cases: [],
      }));

      const { tags, purposes, isolationRule } = configRef.current;

      try {
        const cases = await fetchEndpointCases(
          { id: epState.endpointId, method: epState.method, path: epState.path },
          tags,
          purposes,
          isolationRule,
          controller.signal,
        );

        updateEpState(endpointId, () => ({
          status: "done" as const,
          cases,
        }));

        // Update aggregate: remove old cases for this endpoint, add new
        setGeneratedCases((prev) => {
          const oldIds = new Set(epState.cases.map((c) => c._tempId));
          return [...prev.filter((c) => !oldIds.has(c._tempId)), ...cases];
        });
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        const error = err instanceof Error ? err : new Error(String(err));
        updateEpState(endpointId, () => ({
          status: "failed" as const,
          error: error.message,
        }));
      }
    },
    [endpointStates, updateEpState],
  );

  // ── Retry all failed ──────────────────────────────

  const retryFailed = useCallback(async () => {
    const failedEps = endpointStates.filter((e) => e.status === "failed");
    for (const ep of failedEps) {
      await retryEndpoint(ep.endpointId);
    }
  }, [endpointStates, retryEndpoint]);

  // ── Abort ───────────────────────────────────────

  const abort = useCallback(() => {
    abortRef.current?.abort();
    setIsGenerating(false);
  }, []);

  // ── Adopt: write selected cases to backend ──────

  const adoptMutation = useMutation({
    mutationFn: async (cases: GeneratedCase[]) => {
      let adopted = 0;
      let failed = 0;
      for (const tc of cases) {
        try {
          await api.post("/test-cases", {
            endpointId: tc.request.path ? undefined : undefined,
            name: tc.name,
            request: tc.request,
            expected: tc.expected,
            tags: tc.tags,
          });
          adopted++;
        } catch {
          failed++;
        }
      }
      return { adopted, failed };
    },
    onSuccess: ({ adopted, failed }) => {
      queryClient.invalidateQueries({ queryKey: ["test-cases", projectId] });
      if (failed > 0) {
        toast.warning(`已采纳 ${adopted} 条用例，${failed} 条失败`);
      } else {
        toast.success(`✅ 已采纳 ${adopted} 条用例`);
      }
    },
    onError: (err: Error) => {
      toast.error(`采纳失败：${err.message}`);
    },
  });

  // ── Adopt with endpointId ───────────────────────

  const adoptCases = useCallback(
    async (cases: GeneratedCase[], endpointId: string) => {
      const withEpId = cases.map((tc) => ({
        ...tc,
      }));
      let adopted = 0;
      let failed = 0;
      for (const tc of withEpId) {
        try {
          await api.post("/test-cases", {
            endpointId,
            name: tc.name,
            request: tc.request,
            expected: tc.expected,
            tags: tc.tags,
          });
          adopted++;
        } catch {
          failed++;
        }
      }
      queryClient.invalidateQueries({ queryKey: ["test-cases", projectId] });
      if (failed > 0) {
        toast.warning(`已采纳 ${adopted} 条用例，${failed} 条失败`);
      } else {
        toast.success(`✅ 已采纳 ${adopted} 条用例`);
      }
      return { adopted, failed };
    },
    [projectId, queryClient],
  );

  // ── Adopt with per-endpoint mapping ─────────────

  const adoptCasesByEndpoint = useCallback(
    async (cases: GeneratedCase[]) => {
      // Map each case to its endpoint via endpointStates
      const caseToEndpoint = new Map<string, string>();
      for (const epState of endpointStates) {
        for (const c of epState.cases) {
          caseToEndpoint.set(c._tempId, epState.endpointId);
        }
      }

      let adopted = 0;
      let failed = 0;
      for (const tc of cases) {
        try {
          const epId = caseToEndpoint.get(tc._tempId) ?? "";
          await api.post("/test-cases", {
            endpointId: epId,
            name: tc.name,
            request: tc.request,
            expected: tc.expected,
            tags: tc.tags,
          });
          adopted++;
        } catch {
          failed++;
        }
      }
      queryClient.invalidateQueries({ queryKey: ["test-cases", projectId] });
      if (failed > 0) {
        toast.warning(`已采纳 ${adopted} 条用例，${failed} 条失败`);
      } else {
        toast.success(`✅ 已采纳 ${adopted} 条用例`);
      }
      return { adopted, failed };
    },
    [endpointStates, projectId, queryClient],
  );

  // ── Reset ───────────────────────────────────────

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setIsGenerating(false);
    setGeneratedCases([]);
    setGenError(null);
    setEndpointStates([]);
    setCurrentEndpointIndex(-1);
    setTotalEndpoints(0);
  }, []);

  return {
    // State
    isGenerating,
    generatedCases,
    genError,
    endpointStates,
    currentEndpointIndex,
    totalEndpoints,
    isAdopting: adoptMutation.isPending,

    // Actions
    generate,
    abort,
    adoptCases,
    adoptCasesByEndpoint,
    retryEndpoint,
    retryFailed,
    reset,
  };
}
