import type { FailType, Purpose } from "@nexqa/shared";

// ── Coverage Types ──────────────────────────────────

export interface CoverageData {
  endpoint: number;
  scenario: number;
  statusCode: number;
  endpointCovered: number;
  endpointTotal: number;
  scenarioCovered: number;
  scenarioTotal: number;
  statusCodeCovered: number;
  statusCodeTotal: number;
  matrix: CoverageCell[];
  endpoints: CoverageEndpoint[];
  suggestions: CoverageSuggestion[];
}

export interface CoverageCell {
  endpointId: string;
  endpointPath: string;
  endpointMethod: string;
  purpose: Purpose;
  covered: boolean;
  caseCount: number;
  lastPassRate?: number;
  applicable: boolean;
  cases?: { id: string; name: string; passed: boolean }[];
}

export interface CoverageEndpoint {
  id: string;
  method: string;
  path: string;
  module: string;
}

export interface CoverageSuggestion {
  endpointPath: string;
  endpointMethod: string;
  endpointId: string;
  purpose: Purpose;
  message: string;
}

// ── Trend Types ─────────────────────────────────────

export type Granularity = "day" | "week" | "month";
export type TimeRange = "7d" | "14d" | "30d" | "90d" | "custom";

export interface TrendPassRatePoint {
  date: string;
  passRate: number;
  batchId: string;
  trigger: string;
  total: number;
  passed: number;
}

export interface TrendCaseCountPoint {
  date: string;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
}

export interface TrendFailTypePoint {
  date: string;
  status_mismatch: number;
  schema_violation: number;
  body_mismatch: number;
  timeout: number;
  network_error: number;
  auth_failure: number;
  variable_error: number;
  chain_dependency: number;
}

export interface TrendData {
  passRate: TrendPassRatePoint[];
  caseCount: TrendCaseCountPoint[];
  failType: TrendFailTypePoint[];
}

// ── Report Types ────────────────────────────────────

export interface TestReport {
  id: string;
  batchRunId: string;
  projectId: string;
  planName?: string;
  batchNumber: number;
  summary: ReportSummary;
  stages: ReportStage[];
  failureAnalysis: FailureAnalysis;
  comparison?: ReportComparison;
  generatedAt: string;
}

export interface ReportSummary {
  passRate: number;
  totalCases: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  environment: string;
  triggeredBy: string;
  timestamp: string;
}

export interface ReportStage {
  name: string;
  status: "passed" | "failed" | "skipped";
  passRate: number;
  passed: number;
  total: number;
  gateResult?: "passed" | "failed" | "skipped";
  duration: number;
  results: ReportCaseResult[];
}

export interface ReportCaseResult {
  caseId: string;
  caseName: string;
  endpointPath: string;
  endpointMethod: string;
  passed: boolean;
  skipped: boolean;
  failType?: FailType;
  failReason?: string;
  duration: number;
  isSecurity?: boolean;
}

export interface FailureAnalysis {
  byType: Record<string, number>;
  byEndpoint: Record<string, number>;
  topFailures: {
    caseId: string;
    caseName: string;
    endpointPath: string;
    failType: FailType;
    failReason: string;
    isSecurity?: boolean;
  }[];
}

export interface ReportComparison {
  previousBatchId: string;
  passRateDelta: number;
  newFailures: ComparisonItem[];
  fixedFailures: ComparisonItem[];
  ongoingFailures: ComparisonItem[];
  newCases: number;
}

export interface ComparisonItem {
  caseId: string;
  caseName: string;
  endpointPath: string;
  endpointMethod: string;
  failType?: FailType;
  previousStatus: "passed" | "failed" | "new";
  currentStatus: "passed" | "failed";
  isSecurity?: boolean;
  consecutiveFails?: number;
}

// ── Export Types ─────────────────────────────────────

export type ExportFormat = "markdown" | "html" | "junit" | "json";

export interface ExportConfig {
  format: ExportFormat;
  scope: "single" | "range";
  reportId?: string;
  reportIds?: string[];
  dateFrom?: string;
  dateTo?: string;
}
