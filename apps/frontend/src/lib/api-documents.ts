import { api } from "./api";
import type {
  ApiDocumentDetail,
  ApiEndpointDetail,
  ConfirmUpdateRequest,
  ConfirmUpdateResult,
  ImportResult,
} from "@/types/api-management";
import type { ApiDocument, ApiEndpoint, TestCase } from "@nexqa/shared";

// ── API Document endpoints ──────────────────────────

export const apiDocumentsApi = {
  /** List all documents for a project */
  list: (projectId: string) =>
    api.get<ApiDocument[]>(`/api-documents?projectId=${projectId}`),

  /** Get single document with its endpoints */
  get: (id: string) =>
    api.get<ApiDocumentDetail>(`/api-documents/${id}`),

  /** Import or update a document */
  import: (data: {
    projectId: string;
    name?: string;
    content: string;
    source?: string;
    updateDocumentId?: string;
  }) => api.post<ImportResult>("/api-documents/import", data),

  /** Confirm a change-detection update */
  confirmUpdate: (id: string, data: ConfirmUpdateRequest) =>
    api.post<ConfirmUpdateResult>(`/api-documents/${id}/confirm-update`, data),

  /** Delete a document and all its endpoints */
  delete: (id: string) =>
    api.delete<{ success: boolean }>(`/api-documents/${id}`),
};

// ── API Endpoint endpoints ──────────────────────────

export interface ModuleInfo {
  module: string;
  count: number;
}

export const apiEndpointsApi = {
  /** List endpoints, optionally filtered by documentId, gitSourceId, module */
  list: (
    projectId: string,
    opts?: { documentId?: string; gitSourceId?: string; module?: string },
  ) => {
    const params = new URLSearchParams({ projectId });
    if (opts?.documentId) params.append("documentId", opts.documentId);
    if (opts?.gitSourceId) params.append("gitSourceId", opts.gitSourceId);
    if (opts?.module) params.append("module", opts.module);
    return api.get<ApiEndpoint[]>(`/api-endpoints?${params}`);
  },

  /** Fetch module list for a project (optionally filtered by gitSourceId) */
  modules: (projectId: string, gitSourceId?: string) => {
    const params = new URLSearchParams({ projectId });
    if (gitSourceId) params.append("gitSourceId", gitSourceId);
    return api.get<ModuleInfo[]>(`/api-endpoints/modules?${params}`);
  },

  /** Get endpoint detail with linked test cases */
  get: (id: string) =>
    api.get<ApiEndpointDetail>(`/api-endpoints/${id}`),

  /** Update an endpoint */
  update: (id: string, data: Partial<ApiEndpoint>) =>
    api.post<ApiEndpoint>(`/api-endpoints/${id}/update`, data),

  /** Delete an endpoint */
  delete: (id: string) =>
    api.post<{ success: boolean; affectedCases: string[] }>(
      `/api-endpoints/delete`,
      { id },
    ),
};

// ── Test Case link endpoint ─────────────────────────

export const testCaseLinkApi = {
  /** Link or unlink a test case to an endpoint */
  linkEndpoint: (testCaseId: string, endpointId: string | null) =>
    api.post<TestCase>(`/test-cases/${testCaseId}/link-endpoint`, {
      endpointId,
    }),
};
