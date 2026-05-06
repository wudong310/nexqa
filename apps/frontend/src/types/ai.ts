// ── AI Analysis Types ────────────────────────────────────

export type RootCauseCategory =
  | "api-bug"
  | "api-change"
  | "env-issue"
  | "auth-expired"
  | "test-case-error"
  | "test-data-issue"
  | "flaky"
  | "dependency-fail"
  | "timeout"
  | "unknown";

export interface AutoFixPatch {
  description: string;
  caseId: string;
  field: string;
  before: unknown;
  after: unknown;
}

export interface FailureItem {
  resultId: string;
  caseId: string;
  caseName: string;
  endpoint: string;
  rootCause: RootCauseCategory;
  confidence: number;
  analysis: string;
  suggestion: {
    target: "api" | "test-case" | "environment" | "test-chain";
    summary: string;
    details: string;
    autoFix?: AutoFixPatch;
  };
}

export interface FailureGroup {
  category: RootCauseCategory;
  count: number;
  items: FailureItem[];
  groupSuggestion: string;
}

export interface ActionItem {
  priority: "P0" | "P1" | "P2";
  action: string;
  target: "开发" | "测试" | "运维";
  relatedResultIds: string[];
}

export interface BatchAnalysis {
  id: string;
  batchRunId: string;
  projectId: string;
  overallAssessment: {
    status: "healthy" | "has-issues" | "critical";
    summary: string;
  };
  groups: FailureGroup[];
  actionItems: ActionItem[];
  createdAt: string;
}

// ── Smoke Test Types ────────────────────────────────────

export interface CorePath {
  name: string;
  type: "auth" | "crud" | "business" | "health";
  endpoints: string[];
  reason: string;
}

export interface ExcludedEndpoint {
  endpoint: string;
  reason: string;
}

export interface SmokeReasoning {
  corePaths: CorePath[];
  selectionCriteria: string;
  excluded: ExcludedEndpoint[];
}

export interface SmokeTaskStatus {
  taskId: string;
  batchRunId?: string;
  status: "analyzing" | "running" | "completed" | "failed";
  progress?: {
    current: number;
    total: number;
    currentCase?: string;
  };
  reasoning?: SmokeReasoning;
  error?: string;
}

// ── Analysis Step (for progress display) ────────────────

export interface AnalysisStep {
  id: string;
  label: string;
  status: "done" | "running" | "waiting";
  detail?: string;
}
