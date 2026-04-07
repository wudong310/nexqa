// ── API Diff + Regression Types ─────────────────────────

export interface ApiDocVersion {
  id: string;
  projectId: string;
  version: string;
  specContent: string;
  endpointCount: number;
  createdAt: string;
  source: "manual" | "webhook" | "git";
}

export interface EndpointChange {
  path: string;
  method: string;
  description?: string;
}

export interface OasDiffChange {
  id: string;
  level: number;
  text: string;
}

export interface EndpointModification {
  path: string;
  method: string;
  changes: OasDiffChange[];
  severity: "breaking" | "non-breaking" | "info";
}

export interface ApiDiff {
  id: string;
  projectId: string;
  oldVersionId: string;
  newVersionId: string;
  summary: {
    added: number;
    removed: number;
    modified: number;
    breaking: number;
  };
  added: EndpointChange[];
  removed: EndpointChange[];
  modified: EndpointModification[];
  createdAt: string;
}

export interface ImpactDirectCase {
  caseId: string;
  caseName: string;
  method: string;
  path: string;
  priority: string;
  phase: string;
  impact: string;
  aiSuggestion: string;
}

export interface ImpactIndirectChain {
  chainId: string;
  chainName: string;
  affectedStep: string;
  cascadeRisk: string;
}

export interface ImpactNewCase {
  path: string;
  method: string;
  description: string;
  estimatedCount: number;
}

export interface ImpactAnalysis {
  diffId: string;
  directCases: ImpactDirectCase[];
  indirectChains: ImpactIndirectChain[];
  newCasesNeeded: ImpactNewCase[];
}

export interface RegressionAdjustment {
  caseId: string;
  description: string;
  field: string;
  before: unknown;
  after: unknown;
}

export interface AutoRegressionResult {
  id: string;
  projectId: string;
  diffId: string;
  changeSummary: ApiDiff["summary"];
  confidence: number;
  directCases: string[];
  indirectChains: string[];
  smokeCases: string[];
  newCases: string[];
  adjustments: RegressionAdjustment[];
  execution: {
    environmentId?: string;
    concurrency: number;
    retryOnFail: number;
    timeoutMs: number;
    minPassRate: number;
  };
  reasoning: string;
  createdAt: string;
}
