/**
 * security-types.ts — 安全扫描相关类型定义
 *
 * 数据模型来自 NexQA v3 P1 需求文档 §3.3.2
 */

// ── 安全测试类型 ──────────────────────────────────────

export type SecurityTestType =
  | "sql-injection"
  | "xss"
  | "path-traversal"
  | "auth-bypass"
  | "idor"
  | "mass-assignment"
  | "rate-limit"
  | "info-disclosure"
  | "ssrf"
  | "command-injection"
  | "overflow";

export type SeverityLevel = "critical" | "high" | "medium" | "low" | "info";

// ── 攻击面分析 ────────────────────────────────────────

export interface AttackVector {
  type: SecurityTestType;
  target: string; // 具体的参数/字段名
  risk: "high" | "medium" | "low";
  reasoning: string; // AI 为什么认为这是攻击面
  payloadCount: number; // 将生成多少个 payload 测试
}

export interface AttackSurface {
  endpointId: string;
  path: string;
  method: string;
  vectors: AttackVector[];
}

// ── 检测规则 ──────────────────────────────────────────

export interface DetectRule {
  type: "status" | "body-contains" | "body-not-contains" | "timing" | "header";
  condition: string;
  vulnerable: string; // 满足条件时的漏洞描述
}

// ── 安全 Payload ──────────────────────────────────────

export interface SecurityPayload {
  payload: string | object | number;
  context: string; // 适用场景描述
  detectRule: DetectRule;
}

// ── 安全发现 ──────────────────────────────────────────

export interface SecurityFinding {
  id: string;
  type: SecurityTestType;
  severity: SeverityLevel;
  endpoint: string;
  parameter: string;
  description: string;
  evidence: {
    request: {
      method: string;
      url: string;
      headers: Record<string, string>;
      body?: unknown;
    };
    response: {
      status: number;
      body?: unknown;
    };
    anomaly: string;
  };
  remediation: {
    summary: string;
    details: string;
    codeExample?: string;
    reference?: string;
  };
  cwe?: string;
  owaspTop10?: string;
}

// ── OWASP 覆盖度 ─────────────────────────────────────

export interface OwaspCoverage {
  category: string;
  tested: boolean;
  findingsCount: number;
}

// ── 安全报告 ──────────────────────────────────────────

export interface SecurityReport {
  summary: {
    totalTests: number;
    passed: number;
    vulnerabilities: number;
    criticalRisk: number;
    highRisk: number;
    mediumRisk: number;
    lowRisk: number;
  };
  findings: SecurityFinding[];
  owaspCoverage: OwaspCoverage[];
}

// ── 安全扫描 ──────────────────────────────────────────

export type SecurityScanStatus =
  | "analyzing"
  | "generating"
  | "executing"
  | "reporting"
  | "completed"
  | "failed";

export interface SecurityScan {
  id: string;
  projectId: string;
  environmentId: string;
  scope: "all" | "selected";
  endpointIds?: string[];
  testTypes?: SecurityTestType[];

  attackSurfaces: AttackSurface[];
  generatedCaseIds: string[];
  batchRunId?: string;
  report?: SecurityReport;

  status: SecurityScanStatus;
  progress?: {
    phase: string;
    current: number;
    total: number;
    detail?: string;
  };
  error?: string;
  createdAt: string;
  completedAt?: string;
}

// ── 安全测试执行结果（内部） ──────────────────────────

export interface SecurityTestResult {
  caseId: string;
  testType: SecurityTestType;
  endpoint: string;
  parameter: string;
  payload: string | object | number;
  detectRule: DetectRule;
  request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: unknown;
  };
  response: {
    status: number;
    headers: Record<string, string>;
    body?: unknown;
    duration: number;
  };
  ruleMatched: boolean;
}
