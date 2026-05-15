/**
 * Case Gen V2 Types — API 端点用例生成
 *
 * 对标 plan-gen-v2 类型定义
 */

import type { TestCaseTags } from "@nexqa/shared";

// ── Status ──────────────────────────────────────────

export type CaseGenV2Status = "pending" | "generating" | "completed" | "failed";

// ── Log Entry ───────────────────────────────────────

export interface LogEntry {
  event: "delta" | "tool_use" | "tool_result" | "error" | "final";
  text: string;
  timestamp: string;
}

// ── Generated Case (before adoption) ───────────────

export interface GeneratedCaseV2 {
  id: string;
  endpointId: string;
  name: string;
  request: {
    method: string;
    path: string;
    headers: Record<string, string>;
    query: Record<string, string>;
    body?: unknown;
    timeout: number;
  };
  expected: {
    status: number | null;
    bodyContains: string | null;
    bodySchema: unknown | null;
  };
  tags: TestCaseTags;
}

// ── Result Stats ────────────────────────────────────

export interface CaseGenResultStats {
  total: number;
  byEndpoint: Record<string, number>;
}

// ── Result ──────────────────────────────────────────

export interface CaseGenResult {
  cases: GeneratedCaseV2[];
  stats: CaseGenResultStats;
}

// ── Task ────────────────────────────────────────────

export interface CaseGenTask {
  id: string;
  projectId: string;
  status: CaseGenV2Status;
  endpointIds: string[];
  tags?: {
    purpose?: string[];
    strategy?: string[];
    phase?: string[];
    priority?: string;
  };
  maxCasesPerEndpoint: number;
  openclawConnectionId: string;
  result: CaseGenResult | null;
  error: string | null;
  logs: LogEntry[];
  startedAt: string;
  completedAt: string | null;
}

// ── Request/Response ────────────────────────────────

export interface StartCaseGenRequest {
  endpointIds: string[];
  tags?: {
    purpose?: string[];
    strategy?: string[];
    phase?: string[];
    priority?: string;
  };
  maxCasesPerEndpoint?: number;
  openclawConnectionId?: string;
}

export interface StartCaseGenResponse {
  id: string;
  status: "pending";
  message: string;
}

export interface AdoptCaseGenRequest {
  caseIds: string[];
}

export interface AdoptCaseGenResponse {
  ok: boolean;
  adoptedCount: number;
  adoptedCaseIds: string[];
}
