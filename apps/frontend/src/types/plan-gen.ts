// ── AI Plan Generation Types ────────────────────────────

export type IntentType =
  | "release"
  | "smoke"
  | "security"
  | "regression"
  | "full"
  | "module"
  | "quick"
  | "custom";

export interface PlanStage {
  name: string;
  order: number;
  type: "smoke" | "regression" | "security" | "performance" | "functional";
  selection: {
    tags?: {
      purpose?: string[];
      strategy?: string[];
      priority?: string[];
      phase?: string[];
    };
    caseIds?: string[];
    chainIds?: string[];
  };
  criteria: {
    minPassRate: number;
    maxP0Fails?: number;
    maxP1Fails?: number;
  };
  gate: boolean;
  caseCount?: number;
  chainCount?: number;
  description?: string;
}

export interface GeneratedPlan {
  name: string;
  description: string;
  stages?: PlanStage[];
  execution: {
    environmentId: string | null;
    stages: boolean;
    concurrency: number;
    retryOnFail: number;
    timeoutMs: number;
    stopOnGateFail: boolean;
  };
  criteria: {
    minPassRate: number;
    maxP0Fails?: number;
    maxP1Fails?: number;
  };
  reasoning: string;
}

export interface PlanGenerationResult {
  id: string;
  projectId: string;
  userIntent: string;
  parsedIntent: {
    type: IntentType;
    scope: string;
    urgency: "normal" | "quick";
  };
  generatedPlan: GeneratedPlan;
  matchStats: {
    totalCases: number;
    matchedCases: number;
    matchedChains: number;
  };
  createdAt: string;
}

// ── API request/response types ──────────────────────────

export interface PlanGenGenerateRequest {
  intent: string;
  environmentId?: string;
}

export interface PlanGenGenerateResponse {
  id: string;
  status: "generating" | "completed" | "failed";
  result?: PlanGenerationResult;
  error?: string;
}

export interface PlanGenAdoptRequest {
  generationId: string;
  modifications?: Record<string, unknown>;
}

export interface PlanGenAdoptResponse {
  planId: string;
  name: string;
}

export interface PlanGenTemplatesResponse {
  templates: {
    type: IntentType;
    label: string;
    description: string;
  }[];
}
