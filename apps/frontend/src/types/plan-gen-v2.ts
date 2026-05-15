// ── Plan Gen V2 Types ────────────────────────────────────────────────────────

/** 生成记录状态 */
export type PlanGenRecordStatus =
  | "generating"
  | "completed_pending"
  | "completed_adopted"
  | "failed";

/** 日志条目 */
export interface LogEntry {
  event: "delta" | "tool_use" | "tool_result" | "error" | "final";
  text: string;
  timestamp: string;
}

/** 生成记录（前端视图） */
export interface PlanGenRecord {
  id: string;
  projectId: string;
  intent: string;
  scope?: {
    changedOnly?: boolean;
    endpointIds?: string[];
    gitSourceIds?: string[];
  };
  status: PlanGenRecordStatus;
  result?: PlanGenV2Result;
  error?: string;
  adoptedPlanId?: string;
  startedAt: string;
  completedAt?: string;
  logs?: LogEntry[];
}

/** 生成记录列表响应 */
export interface PlanGenRecordsResponse {
  records: PlanGenRecord[];
}

/** 采纳请求 */
export interface AdoptPlanGenRequest {
  generationId: string;
  name?: string;
  description?: string;
}

/** 采纳响应 */
export interface AdoptPlanGenResponse {
  planId: string;
  plan: {
    id: string;
    projectId: string;
    name: string;
    description?: string;
    selection: Record<string, unknown>;
    execution: Record<string, unknown>;
    criteria: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
  };
}

/** OpenClaw 连接选项（从 Project.openclawConnections 读取） */
export interface OpenClawConnectionOption {
  id: string;
  name: string;
  gatewayUrl: string;
}

/** 范围选择模式 */
export type ScopeMode = "all" | "changed" | "specific";

/** POST /projects/:projectId/plan-gen-v2 请求体 */
export interface StartPlanGenV2Request {
  intent: string;
  scope?: {
    gitSourceIds?: string[];
    endpointIds?: string[];
    changedOnly?: boolean;
  };
  openclawConnectionId: string;
}

/** POST /projects/:projectId/plan-gen-v2 202 响应 */
export interface StartPlanGenV2Response {
  id: string;
  status: "pending" | "generating";
  message: string;
}

/** 生成中轮询响应 */
export interface PollGeneratingResponse {
  id: string;
  status: "pending" | "generating";
  progress: string;
}

/** Stage 内的 criteria */
export interface StageCriteria {
  minPassRate: number;
  maxP0Fails: number;
  maxP1Fails: number;
}

/** Stage */
export interface PlanGenV2Stage {
  name: string;
  order: number;
  selection: Record<string, unknown>;
  criteria: StageCriteria;
  gate: boolean;
}

/** Agent 返回的 plan */
export interface PlanGenV2Plan {
  name: string;
  description: string;
  stages: PlanGenV2Stage[];
  execution: {
    concurrency: number;
    retryOnFail: number;
    timeoutMs: number;
    stopOnGateFail: boolean;
  };
  criteria: {
    minPassRate: number;
    maxP0Fails: number;
    maxP1Fails: number;
  };
  reasoning: string;
}

/** Agent 返回的完整结果 */
export interface PlanGenV2Result {
  parsedIntent: {
    type: string;
    scope: string;
    urgency: "normal" | "quick";
  };
  plan: PlanGenV2Plan;
}

/** 完成轮询响应 */
export interface PollCompletedResponse {
  id: string;
  status: "completed";
  result: PlanGenV2Result;
}

/** 失败轮询响应 */
export interface PollFailedResponse {
  id: string;
  status: "failed";
  error: string;
}

/** GET /plan-generations-v2/:id 响应联合类型 */
export type PollPlanGenV2Response =
  | PollGeneratingResponse
  | PollCompletedResponse
  | PollFailedResponse;
