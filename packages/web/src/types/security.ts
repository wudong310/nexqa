// ── Security Scan Types ─────────────────────────────────

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
  | "overflow";

export type SeverityLevel = "critical" | "high" | "medium" | "low" | "info";

export interface AttackVector {
  type: SecurityTestType;
  target: string;
  risk: "high" | "medium" | "low";
  reasoning: string;
  payloadCount: number;
}

export interface AttackSurface {
  endpointId: string;
  path: string;
  method: string;
  vectors: AttackVector[];
}

export interface SecurityFinding {
  id: string;
  type: SecurityTestType;
  severity: SeverityLevel;
  endpoint: string;
  parameter: string;
  description: string;
  evidence: {
    request: string;
    response: string;
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

export interface OwaspCoverage {
  category: string;
  tested: boolean;
  findingsCount: number;
}

export interface SecuritySummary {
  totalTests: number;
  passed: number;
  vulnerabilities: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

export interface SecurityReport {
  summary: SecuritySummary;
  findings: SecurityFinding[];
  owaspCoverage: OwaspCoverage[];
}

export interface SecurityScan {
  id: string;
  projectId: string;
  status: "analyzing" | "generating" | "executing" | "completed" | "failed";
  attackSurfaces?: AttackSurface[];
  generatedCaseIds?: string[];
  batchRunId?: string;
  report?: SecurityReport;
  error?: string;
  createdAt: string;
}

// ── API request/response types ──────────────────────────

export interface SecurityScanRequest {
  environmentId: string;
  scope?: "all" | "selected";
  endpointIds?: string[];
  testTypes?: SecurityTestType[];
}

export interface SecurityScanResponse {
  scanId: string;
  status: string;
  message: string;
}

export interface SecurityStatusResponse {
  id: string;
  status: "analyzing" | "generating" | "executing" | "completed" | "failed";
  progress?: {
    phase: "analyzing" | "generating" | "executing";
    current: number;
    total: number;
    detail?: string;
  };
  attackSurfaces?: AttackSurface[];
  error?: string;
}

export interface SecurityReportResponse extends SecurityReport {
  scanId: string;
  projectId: string;
  createdAt: string;
}

export interface AttackSurfaceResponse {
  endpoints: { path: string; method: string }[];
  attackTypes: { type: string; label: string }[];
  cells: Record<string, "vulnerable" | "safe" | "na">;
}
