import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockStorage } = vi.hoisted(() => {
  const mockStorage = {
    list: vi.fn(),
    read: vi.fn(),
    write: vi.fn(),
    remove: vi.fn(),
  };
  return { mockStorage };
});

vi.mock("../services/storage.js", () => ({
  storage: mockStorage,
}));

// Mock coverage engine
vi.mock("../services/coverage-engine.js", () => ({
  calculateCoverage: vi.fn().mockResolvedValue({
    endpointCoverage: 0.8,
    methodCoverage: 0.5,
    statusCodeCoverage: 0.6,
  }),
}));

import { generateReport, listReports } from "../services/report-generator.js";

describe("report-generator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("从 BatchRun 生成报告", async () => {
    const batchRun = {
      id: "batch-001",
      projectId: "proj-001",
      name: "测试批次",
      environmentId: "env-001",
      status: "completed",
      totalCases: 3,
      passedCases: 2,
      failedCases: 1,
      skippedCases: 0,
      failureBreakdown: { status_mismatch: 1 },
      startedAt: "2026-03-30T10:00:00.000Z",
      completedAt: "2026-03-30T10:01:00.000Z",
      createdAt: "2026-03-30T10:00:00.000Z",
    };

    const brResults = [
      { id: "brr-1", batchRunId: "batch-001", resultId: "res-1", caseId: "tc-1", passed: true, failType: null },
      { id: "brr-2", batchRunId: "batch-001", resultId: "res-2", caseId: "tc-2", passed: true, failType: null },
      { id: "brr-3", batchRunId: "batch-001", resultId: "res-3", caseId: "tc-3", passed: false, failType: "status_mismatch" },
    ];

    const testResults = [
      { id: "res-1", caseId: "tc-1", passed: true, failType: null, failReason: null, response: { duration: 100 } },
      { id: "res-2", caseId: "tc-2", passed: true, failType: null, failReason: null, response: { duration: 200 } },
      { id: "res-3", caseId: "tc-3", passed: false, failType: "status_mismatch", failReason: "Expected 200, got 500", response: { duration: 50 } },
    ];

    const testCases = [
      { id: "tc-1", endpointId: "ep-1", name: "GET users", tags: { purpose: ["functional"], strategy: ["positive"], phase: ["full"], priority: "P1" } },
      { id: "tc-2", endpointId: "ep-1", name: "POST users", tags: { purpose: ["functional"], strategy: ["positive"], phase: ["full"], priority: "P1" } },
      { id: "tc-3", endpointId: "ep-2", name: "DELETE users", tags: { purpose: ["auth"], strategy: ["negative"], phase: ["full"], priority: "P1" } },
    ];

    const apiEndpoints = [
      { id: "ep-1", projectId: "proj-001", method: "GET", path: "/api/users" },
      { id: "ep-2", projectId: "proj-001", method: "DELETE", path: "/api/users/:id" },
    ];

    mockStorage.read.mockImplementation(async (collection: string, id: string) => {
      if (collection === "batch-runs" && id === "batch-001") return batchRun;
      const tr = testResults.find((r) => r.id === id);
      if (tr) return tr;
      return null;
    });

    mockStorage.list.mockImplementation(async (collection: string) => {
      switch (collection) {
        case "batch-run-results": return brResults;
        case "test-cases": return testCases;
        case "api-endpoints": return apiEndpoints;
        case "batch-runs": return [batchRun]; // for comparison — only self, no previous
        case "test-reports": return [];
        default: return [];
      }
    });

    mockStorage.write.mockResolvedValue(undefined);

    const report = await generateReport("batch-001");

    expect(report.projectId).toBe("proj-001");
    expect(report.batchRunId).toBe("batch-001");
    expect(report.summary.total).toBe(3);
    expect(report.summary.passed).toBe(2);
    expect(report.summary.failed).toBe(1);
    expect(report.summary.passRate).toBeCloseTo(2 / 3, 5);
    expect(report.failureAnalysis.byType.status_mismatch).toBe(1);
    expect(report.failureAnalysis.topFailures).toHaveLength(1);
    expect(report.coverage.endpoint).toBe(0.8);
    // No comparison since there's only one batch
    expect(report.comparison).toBeUndefined();
  });

  it("BatchRun 不存在时抛错", async () => {
    mockStorage.read.mockResolvedValue(null);

    await expect(generateReport("nonexistent")).rejects.toThrow(
      "BatchRun not found",
    );
  });

  it("listReports 按时间排序", async () => {
    const reports = [
      { id: "r1", projectId: "proj-001", generatedAt: "2026-03-29T10:00:00.000Z" },
      { id: "r2", projectId: "proj-001", generatedAt: "2026-03-30T10:00:00.000Z" },
      { id: "r3", projectId: "proj-002", generatedAt: "2026-03-30T12:00:00.000Z" },
    ];

    mockStorage.list.mockResolvedValue(reports);

    const result = await listReports("proj-001");
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("r2"); // 最新的在前
    expect(result[1].id).toBe("r1");
  });
});
