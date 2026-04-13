import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  apiDocumentsApi,
  apiEndpointsApi,
  testCaseLinkApi,
} from "@/lib/api-documents";
import type { ConfirmUpdateRequest } from "@/types/api-management";

// ── Query keys ──────────────────────────────────────

export const apiDocumentKeys = {
  all: ["api-documents"] as const,
  list: (projectId: string) => ["api-documents", projectId] as const,
  detail: (id: string) => ["api-document", id] as const,
};

export const apiEndpointKeys = {
  all: ["api-endpoints"] as const,
  list: (projectId: string, documentId?: string) =>
    ["api-endpoints", projectId, documentId] as const,
  detail: (id: string) => ["api-endpoint", id] as const,
};

// ── Document queries ────────────────────────────────

export function useApiDocuments(projectId: string) {
  return useQuery({
    queryKey: apiDocumentKeys.list(projectId),
    queryFn: () => apiDocumentsApi.list(projectId),
    enabled: !!projectId,
  });
}

export function useApiDocument(id: string) {
  return useQuery({
    queryKey: apiDocumentKeys.detail(id),
    queryFn: () => apiDocumentsApi.get(id),
    enabled: !!id,
  });
}

// ── Endpoint queries ────────────────────────────────

export function useApiEndpoints(projectId: string, documentId?: string) {
  return useQuery({
    queryKey: apiEndpointKeys.list(projectId, documentId),
    queryFn: () => apiEndpointsApi.list(projectId, documentId),
    enabled: !!projectId,
  });
}

export function useApiEndpoint(id: string) {
  return useQuery({
    queryKey: apiEndpointKeys.detail(id),
    queryFn: () => apiEndpointsApi.get(id),
    enabled: !!id,
  });
}

// ── Mutations ───────────────────────────────────────

export function useImportApiDocument() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: apiDocumentsApi.import,
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: apiDocumentKeys.list(variables.projectId) });
      qc.invalidateQueries({ queryKey: apiEndpointKeys.all });
    },
  });
}

export function useConfirmUpdate() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: ConfirmUpdateRequest;
    }) => apiDocumentsApi.confirmUpdate(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: apiDocumentKeys.all });
      qc.invalidateQueries({ queryKey: apiEndpointKeys.all });
      qc.invalidateQueries({ queryKey: ["test-cases"] });
    },
  });
}

export function useDeleteApiDocument() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: apiDocumentsApi.delete,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: apiDocumentKeys.all });
      qc.invalidateQueries({ queryKey: apiEndpointKeys.all });
    },
  });
}

export function useDeleteApiEndpoint() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: apiEndpointsApi.delete,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: apiEndpointKeys.all });
      qc.invalidateQueries({ queryKey: ["test-cases"] });
    },
  });
}

export function useLinkEndpoint() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({
      testCaseId,
      endpointId,
    }: {
      testCaseId: string;
      endpointId: string | null;
    }) => testCaseLinkApi.linkEndpoint(testCaseId, endpointId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["test-cases"] });
      qc.invalidateQueries({ queryKey: apiEndpointKeys.all });
    },
  });
}
