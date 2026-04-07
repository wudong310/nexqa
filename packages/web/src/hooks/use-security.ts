import { api } from "@/lib/api";
import type {
  AttackSurfaceResponse,
  SecurityReportResponse,
  SecurityScanRequest,
  SecurityScanResponse,
  SecurityStatusResponse,
} from "@/types/security";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

// ── Query Keys ──────────────────────────────────────

export const securityKeys = {
  status: (scanId: string) => ["security", "status", scanId] as const,
  report: (scanId: string) => ["security", "report", scanId] as const,
  surface: (scanId: string) => ["security", "surface", scanId] as const,
};

// ── Scan — POST /security-scan ──────────────────────

export function useSecurityScan(projectId: string) {
  return useMutation({
    mutationFn: (req: SecurityScanRequest) =>
      api.post<SecurityScanResponse>(
        '/projects/security-scan',
        { projectId, ...req },
      ),
    onError: (err: Error) =>
      toast.error(`安全扫描启动失败：${err.message}`),
  });
}

// ── Status — GET /security-scan/:scanId (auto-polling) ──

export function useSecurityStatus(scanId: string | undefined) {
  return useQuery<SecurityStatusResponse>({
    queryKey: securityKeys.status(scanId ?? ""),
    queryFn: () => api.get(`/security-scan?scanId=${scanId}`),
    enabled: !!scanId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "completed" || status === "failed") return false;
      return 2000;
    },
  });
}

// ── Report — GET /security-scan/:scanId/report ──────

export function useSecurityReport(scanId: string | undefined) {
  return useQuery<SecurityReportResponse>({
    queryKey: securityKeys.report(scanId ?? ""),
    queryFn: () => api.get(`/security-scan/report?scanId=${scanId}`),
    enabled: !!scanId,
  });
}

// ── Attack Surface — GET /security-scan/:scanId/surface ──

export function useAttackSurface(scanId: string | undefined) {
  return useQuery<AttackSurfaceResponse>({
    queryKey: securityKeys.surface(scanId ?? ""),
    queryFn: () => api.get(`/security-scan/surface?scanId=${scanId}`),
    enabled: !!scanId,
  });
}
