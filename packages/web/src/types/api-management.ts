import type { ApiChangeFlag, ApiDocument, ApiEndpoint, ApiFormat, FieldChange, TestCase } from "@nexqa/shared";

// ── Re-export shared types for convenience ──────────

export type { ApiDocument, ApiFormat, ApiChangeFlag, FieldChange };

// ── Endpoint with test case count (list view) ───────

export interface ApiEndpointWithCaseCount extends ApiEndpoint {
  testCaseCount: number;
}

// ── Document with endpoints (detail view) ───────────

export interface ApiDocumentDetail {
  document: ApiDocument;
  endpoints: ApiEndpointWithCaseCount[];
}

// ── Endpoint detail (with linked test cases) ────────

export interface ApiEndpointDetail extends ApiEndpoint {
  testCases: TestCase[];
}

// ── Import result ───────────────────────────────────

export interface ImportResult {
  isUpdate: boolean;
  document: ApiDocument;
  endpoints?: ApiEndpoint[];
  diff?: ApiDiffResult;
  parseResult?: {
    format: ApiFormat;
    endpointCount: number;
  };
}

// ── Diff types ──────────────────────────────────────

export interface DiffSummary {
  added: number;
  removed: number;
  modified: number;
  breaking: number;
}

export interface EndpointChange {
  tempId: string;
  endpoint: {
    method: string;
    path: string;
    summary: string;
  };
  description?: string;
}

export interface EndpointModification {
  endpointId: string;
  endpoint: {
    method: string;
    path: string;
    summary: string;
  };
  changes: FieldChange[];
  severity: "breaking" | "non-breaking" | "info";
}

export interface AffectedCase {
  testCaseId: string;
  testCaseName: string;
  endpointKey: string;
  impactType: "modified" | "deleted";
}

export interface ApiDiffResult {
  documentId: string;
  documentName: string;
  summary: DiffSummary;
  added: EndpointChange[];
  removed: EndpointChange[];
  modified: EndpointModification[];
  affectedCases: AffectedCase[];
}

// ── Confirm update ──────────────────────────────────

export interface ConfirmUpdateRequest {
  contentHash: string;
  acceptAdded: string[];
  acceptModified: string[];
  acceptRemoved: string[];
}

export interface ConfirmUpdateResult {
  updated: ApiEndpoint[];
  deleted: string[];
  affectedCases: TestCase[];
}
