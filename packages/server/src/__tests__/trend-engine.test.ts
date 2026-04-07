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

import { aggregateTrends } from "../services/trend-engine.js";

describe("trend-engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("空数据返回空趋势", async () => {
    mockStorage.list
      .mockResolvedValueOnce([]) // batch-runs
      .mockResolvedValueOnce([]); // batch-run-results

    const result = await aggregateTrends("proj-001", "day", 30);

    expect(result.projectId).toBe("proj-001");
    expect(result.period).toBe("day");
    expect(result.range).toBe(30);
    expect(result.data).toHaveLength(0);
  });

  it("按天聚合多个批次", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const batches = [
      {
        id: "b1",
        projectId: "proj-001",
        status: "completed",
        totalCases: 10,
        passedCases: 9,
        failedCases: 1,
        completedAt: `${today}T10:00:00.000Z`,
        failureBreakdown: { status_mismatch: 1 },
      },
      {
        id: "b2",
        projectId: "proj-001",
        status: "failed",
        totalCases: 5,
        passedCases: 3,
        failedCases: 2,
        completedAt: `${today}T14:00:00.000Z`,
        failureBreakdown: { timeout: 1, status_mismatch: 1 },
      },
    ];

    mockStorage.list
      .mockResolvedValueOnce(batches)
      .mockResolvedValueOnce([]);

    const result = await aggregateTrends("proj-001", "day", 7);

    expect(result.data).toHaveLength(1);
    expect(result.data[0].period).toBe(today);
    expect(result.data[0].batchCount).toBe(2);
    expect(result.data[0].totalCases).toBe(15);
    expect(result.data[0].totalPassed).toBe(12);
    expect(result.data[0].totalFailed).toBe(3);
    expect(result.data[0].avgPassRate).toBeCloseTo(12 / 15, 3);
    expect(result.data[0].failureTypes.status_mismatch).toBe(2);
    expect(result.data[0].failureTypes.timeout).toBe(1);
  });

  it("过滤其他项目的批次", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const batches = [
      {
        id: "b1",
        projectId: "proj-001",
        status: "completed",
        totalCases: 10,
        passedCases: 10,
        failedCases: 0,
        completedAt: `${today}T10:00:00.000Z`,
        failureBreakdown: {},
      },
      {
        id: "b2",
        projectId: "proj-002", // different project
        status: "completed",
        totalCases: 5,
        passedCases: 0,
        failedCases: 5,
        completedAt: `${today}T14:00:00.000Z`,
        failureBreakdown: {},
      },
    ];

    mockStorage.list
      .mockResolvedValueOnce(batches)
      .mockResolvedValueOnce([]);

    const result = await aggregateTrends("proj-001", "day", 7);

    expect(result.data).toHaveLength(1);
    expect(result.data[0].totalCases).toBe(10);
    expect(result.data[0].totalPassed).toBe(10);
  });

  it("过滤超出范围的旧数据", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 60);
    const oldDateStr = oldDate.toISOString().slice(0, 10);

    const batches = [
      {
        id: "b1",
        projectId: "proj-001",
        status: "completed",
        totalCases: 10,
        passedCases: 10,
        failedCases: 0,
        completedAt: `${today}T10:00:00.000Z`,
        failureBreakdown: {},
      },
      {
        id: "b2",
        projectId: "proj-001",
        status: "completed",
        totalCases: 5,
        passedCases: 5,
        failedCases: 0,
        completedAt: `${oldDateStr}T10:00:00.000Z`,
        failureBreakdown: {},
      },
    ];

    mockStorage.list
      .mockResolvedValueOnce(batches)
      .mockResolvedValueOnce([]);

    const result = await aggregateTrends("proj-001", "day", 30);

    // Only today's batch should be included
    expect(result.data).toHaveLength(1);
    expect(result.data[0].period).toBe(today);
  });
});
