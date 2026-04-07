// ── Case Generation Types ─────────────────────────────

import type { TestCaseTags } from "@nexqa/shared";

export type CaseGenStrategy = "positive" | "negative" | "boundary" | "destructive";

export type CaseGenPurpose = "functional" | "auth" | "data-integrity" | "security" | "idempotent" | "performance";

export interface CaseGenConfig {
  endpointId: string;
  strategies: CaseGenStrategy[];
  purposes: CaseGenPurpose[];
  isolationRule: boolean;
}

export interface GeneratedCase {
  /** Temporary client ID for selection tracking */
  _tempId: string;
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
  /** Which strategy this case covers */
  strategy: CaseGenStrategy;
}

export type CaseGenPhase =
  | "config"     // Phase 1: configure endpoint + strategies
  | "analyzing"  // Phase 2: AI analyzing API structure
  | "preview"    // Phase 3: preview generated cases
  | "confirm"    // Phase 4: confirm adoption
  | "done";      // Phase 5: written to system

export interface CaseGenAnalysisStep {
  id: string;
  label: string;
  status: "done" | "running" | "waiting";
  detail?: string;
}

export interface CaseGenResult {
  cases: GeneratedCase[];
  endpointSummary: string;
  analysisSteps: CaseGenAnalysisStep[];
}

export interface CaseGenAdoptResult {
  adopted: number;
  failed: number;
}

// ── Per-endpoint generation state (serial generation) ─

export interface EndpointGenState {
  endpointId: string;
  method: string;
  path: string;
  name?: string;
  status: "pending" | "generating" | "done" | "failed";
  cases: GeneratedCase[];
  error?: string;
}
