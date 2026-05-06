// ── AI Chain Generation Types ────────────────────────────

export interface DependencyNode {
  endpointId: string;
  path: string;
  method: string;
  produces: DataOutput[];
  requires: DataInput[];
}

export interface DataOutput {
  variable: string;
  expression: string;
  type: string;
}

export interface DataInput {
  variable: string;
  target: "path" | "query" | "header" | "body";
  expression: string;
  required: boolean;
}

export interface DependencyEdge {
  from: string;
  to: string;
  variable: string;
  fromExpression: string;
  toTarget: string;
  toExpression: string;
  confidence: number;
}

export interface DependencyGraph {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
}

export interface GeneratedExtractor {
  variable: string;
  source: "body" | "header" | "status";
  expression: string;
}

export interface GeneratedInjector {
  variable: string;
  target: "path" | "query" | "header" | "body";
  expression: string;
}

export interface GeneratedStep {
  caseId: string;
  caseName: string;
  label: string;
  method: string;
  path: string;
  extractors: GeneratedExtractor[];
  injectors: GeneratedInjector[];
  confidence: number;
  reasoning: string;
}

export interface GeneratedChain {
  name: string;
  description: string;
  type: "crud" | "auth" | "business" | "cleanup";
  steps: GeneratedStep[];
  overallConfidence: number;
}

export interface ChainGenStats {
  endpointsAnalyzed: number;
  chainsGenerated: number;
  totalSteps: number;
  avgConfidence: number;
}

export interface ChainGenerationResult {
  id: string;
  projectId: string;
  dependencyGraph: DependencyGraph;
  generatedChains: GeneratedChain[];
  stats: ChainGenStats;
  createdAt: string;
}

// ── API request/response types ──────────────────────────

export interface ChainGenAnalyzeRequest {
  scope?: "all" | "selected";
  endpointIds?: string[];
  force?: boolean;
}

export interface ChainGenAnalyzeResponse {
  taskId: string;
  status: "analyzing" | "generating" | "completed" | "failed";
  message: string;
}

export interface ChainGenStatusResponse {
  taskId: string;
  status: "analyzing" | "generating" | "completed" | "failed";
  progress?: {
    phase: "analyze" | "generate";
    current: number;
    total: number;
    detail?: string;
  };
  result?: ChainGenerationResult;
  error?: string;
}

export interface ChainGenAdoptRequest {
  generationId: string;
  chainIndexes: number[];
}

export interface ChainGenAdoptResponse {
  adopted: {
    chainId: string;
    name: string;
    steps: number;
  }[];
}
