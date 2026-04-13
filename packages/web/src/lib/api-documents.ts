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
    api.post<{ success: boolean }>(`/api-documents/${id}/delete`, {}),
};

// ── API Endpoint endpoints ──────────────────────────

export const apiEndpointsApi = {
  /** List endpoints, optionally filtered by documentId */
  list: (projectId: string, documentId?: string) => {
    const params = new URLSearchParams({ projectId });
    if (documentId) params.append("documentId", documentId);
    return api.get<ApiEndpoint[]>(`/api-endpoints?${params}`);
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
      `/api-endpoints/${id}/delete`,
      {},
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
