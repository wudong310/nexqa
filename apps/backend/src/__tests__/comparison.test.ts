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

vi.mock("../services/coverage-engine.js", () => ({
  calculateCoverage: vi.fn().mockResolvedValue({
    endpointCoverage: 0.5,
    methodCoverage: 0.5,
    statusCodeCoverage: 0.5,
  }),
}));

import { generateReport } from "../services/report-generator.js";

describe("comparison logic (§3.6)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("正确计算 newFailures 和 fixedFailures", async () => {
    // 上次批次：tc-1 通过, tc-2 失败, tc-3 通过
    const prevBatch = {
      id: "batch-prev",
      projectId: "proj-001",
      environmentId: "env-001",
      status: "completed",
      totalCases: 3,
      passedCases: 2,
      failedCases: 1,
      completedAt: "2026-03-29T10:00:00.000Z",
      createdAt: "2026-03-29T10:00:00.000Z",
    };

    // 当前批次：tc-1 失败(新增), tc-2 通过(修复), tc-3 通过, tc-4 失败(新用例)
    const currBatch = {
      id: "batch-curr",
      projectId: "proj-001",
      name: "当前",
      environmentId: "env-001",
      status: "completed",
      totalCases: 4,
      passedCases: 2,
      failedCases: 2,
      startedAt: "2026-03-30T10:00:00.000Z",
      completedAt: "2026-03-30T10:01:00.000Z",
      createdAt: "2026-03-30T10:00:00.000Z",
      failureBreakdown: { status_mismatch: 2 },
      skippedCases: 0,
    };

    const prevBrResults = [
      { id: "p1", batchRunId: "batch-prev", resultId: "pr1", caseId: "tc-1", passed: true, failType: null },
      { id: "p2", batchRunId: "batch-prev", resultId: "pr2", caseId: "tc-2", passed: false, failType: "status_mismatch" },
      { id: "p3", batchRunId: "batch-prev", resultId: "pr3", caseId: "tc-3", passed: true, failType: null },
    ];

    const currBrResults = [
      { id: "c1", batchRunId: "batch-curr", resultId: "cr1", caseId: "tc-1", passed: false, failType: "status_mismatch" },
      { id: "c2", batchRunId: "batch-curr", resultId: "cr2", caseId: "tc-2", passed: true, failType: null },
      { id: "c3", batchRunId: "batch-curr", resultId: "cr3", caseId: "tc-3", passed: true, failType: null },
      { id: "c4", batchRunId: "batch-curr", resultId: "cr4", caseId: "tc-4", passed: false, failType: "status_mismatch" },
    ];

    const testResults = [
      { id: "cr1", caseId: "tc-1", passed: false, failType: "status_mismatch", failReason: "Expected 200, got 500", response: { duration: 100 } },
      { id: "cr2", caseId: "tc-2", passed: true, failType: null, failReason: null, response: { duration: 200 } },
      { id: "cr3", caseId: "tc-3", passed: true, failType: null, failReason: null, response: { duration: 150 } },
      { id: "cr4", caseId: "tc-4", passed: false, failType: "status_mismatch", failReason: "Expected 201, got 400", response: { duration: 80 } },
    ];

    const testCases = [
      { id: "tc-1", endpointId: "ep-1", name: "Case 1", tags: { purpose: ["functional"], strategy: ["positive"], phase: ["full"], priority: "P1" } },
      { id: "tc-2", endpointId: "ep-1", name: "Case 2", tags: { purpose: ["functional"], strategy: ["negative"], phase: ["full"], priority: "P1" } },
      { id: "tc-3", endpointId: "ep-1", name: "Case 3", tags: { purpose: ["functional"], strategy: ["positive"], phase: ["full"], priority: "P1" } },
      { id: "tc-4", endpointId: "ep-2", name: "Case 4", tags: { purpose: ["auth"], strategy: ["positive"], phase: ["full"], priority: "P1" } },
    ];

    mockStorage.read.mockImplementation(async (collection: string, id: string) => {
      if (collection === "batch-runs" && id === "batch-curr") return currBatch;
      const tr = testResults.find((r) => r.id === id);
      if (tr) return tr;
      return null;
    });

    mockStorage.list.mockImplementation(async (collection: string) => {
      switch (collection) {
        case "batch-run-results":
          return [...prevBrResults, ...currBrResults];
        case "batch-runs":
          return [currBatch, prevBatch];
        case "test-cases":
          return testCases;
        case "api-endpoints":
          return [
            { id: "ep-1", projectId: "proj-001", method: "GET", path: "/a" },
            { id: "ep-2", projectId: "proj-001", method: "POST", path: "/b" },
          ];
        default:
          return [];
      }
    });

    mockStorage.write.mockResolvedValue(undefined);

    const report = await generateReport("batch-curr");

    expect(report.comparison).toBeDefined();
    expect(report.comparison!.previousBatchId).toBe("batch-prev");
    
    // tc-1: 上次通过 → 本次失败 → newFailure
    // tc-4: 上次不存在 → 本次失败 → newFailure
    expect(report.comparison!.newFailures).toContain("tc-1");
    expect(report.comparison!.newFailures).toContain("tc-4");
    expect(report.comparison!.newFailures).toHaveLength(2);

    // tc-2: 上次失败 → 本次通过 → fixedFailure
    expect(report.comparison!.fixedFailures).toContain("tc-2");
    expect(report.comparison!.fixedFailures).toHaveLength(1);

    // tc-4 是新用例
    expect(report.comparison!.newCases).toBe(1);
  });
});
