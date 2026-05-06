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

import { calculateCoverage } from "../services/coverage-engine.js";

describe("coverage-engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("空项目返回 0 覆盖率", async () => {
    mockStorage.list.mockResolvedValue([]);

    const result = await calculateCoverage("proj-001");

    expect(result.endpointCoverage).toBe(0);
    expect(result.methodCoverage).toBe(0);
    expect(result.statusCodeCoverage).toBe(0);
    expect(result.details.totalEndpoints).toBe(0);
    expect(result.endpoints).toHaveLength(0);
  });

  it("全覆盖返回 100%", async () => {
    const endpoints = [
      {
        id: "ep-1",
        projectId: "proj-001",
        method: "GET",
        path: "/api/users",
        responses: [{ status: 200 }, { status: 404 }],
      },
      {
        id: "ep-2",
        projectId: "proj-001",
        method: "POST",
        path: "/api/users",
        responses: [{ status: 201 }, { status: 400 }],
      },
    ];

    const testCases = [
      {
        id: "tc-1",
        endpointId: "ep-1",
        name: "GET users 200",
        expected: { status: 200 },
        tags: { purpose: ["functional"], strategy: ["positive"], phase: ["full"], priority: "P1" },
      },
      {
        id: "tc-2",
        endpointId: "ep-1",
        name: "GET users 404",
        expected: { status: 404 },
        tags: { purpose: ["functional"], strategy: ["negative"], phase: ["full"], priority: "P1" },
      },
      {
        id: "tc-3",
        endpointId: "ep-2",
        name: "POST users 201",
        expected: { status: 201 },
        tags: { purpose: ["functional"], strategy: ["positive"], phase: ["full"], priority: "P1" },
      },
      {
        id: "tc-4",
        endpointId: "ep-2",
        name: "POST users 400",
        expected: { status: 400 },
        tags: { purpose: ["auth"], strategy: ["negative"], phase: ["full"], priority: "P1" },
      },
    ];

    mockStorage.list
      .mockResolvedValueOnce(endpoints) // api-endpoints
      .mockResolvedValueOnce(testCases); // test-cases

    const result = await calculateCoverage("proj-001");

    expect(result.endpointCoverage).toBe(1);
    expect(result.methodCoverage).toBe(1);
    expect(result.statusCodeCoverage).toBe(1);
    expect(result.details.totalEndpoints).toBe(2);
    expect(result.details.coveredEndpoints).toBe(2);
  });

  it("部分覆盖正确计算", async () => {
    const endpoints = [
      {
        id: "ep-1",
        projectId: "proj-001",
        method: "GET",
        path: "/api/users",
        responses: [{ status: 200 }],
      },
      {
        id: "ep-2",
        projectId: "proj-001",
        method: "POST",
        path: "/api/users",
        responses: [{ status: 201 }],
      },
      {
        id: "ep-3",
        projectId: "proj-001",
        method: "DELETE",
        path: "/api/users/:id",
        responses: [{ status: 204 }],
      },
    ];

    const testCases = [
      {
        id: "tc-1",
        endpointId: "ep-1",
        name: "GET users",
        expected: { status: 200 },
        tags: { purpose: ["functional"], strategy: ["positive"], phase: ["full"], priority: "P1" },
      },
    ];

    mockStorage.list
      .mockResolvedValueOnce(endpoints)
      .mockResolvedValueOnce(testCases);

    const result = await calculateCoverage("proj-001");

    // 1/3 接口有用例
    expect(result.endpointCoverage).toBeCloseTo(1 / 3, 5);
    // GET 被覆盖，POST 和 DELETE 未覆盖 → 1/3
    expect(result.methodCoverage).toBeCloseTo(1 / 3, 5);
    // 1/3 状态码对被覆盖
    expect(result.statusCodeCoverage).toBeCloseTo(1 / 3, 5);
  });

  it("处理 structured tags", async () => {
    const endpoints = [
      {
        id: "ep-1",
        projectId: "proj-001",
        method: "GET",
        path: "/api/items",
        responses: [{ status: 200 }],
      },
    ];

    const testCases = [
      {
        id: "tc-1",
        endpointId: "ep-1",
        name: "GET items",
        expected: { status: 200 },
        tags: { purpose: ["functional"], strategy: ["positive"], phase: ["smoke"], priority: "P0" },
      },
    ];

    mockStorage.list
      .mockResolvedValueOnce(endpoints)
      .mockResolvedValueOnce(testCases);

    const result = await calculateCoverage("proj-001");

    expect(result.endpointCoverage).toBe(1);
    expect(result.endpoints[0].coveredPurposes).toContain("functional");
  });

  it("过滤其他项目的数据", async () => {
    const endpoints = [
      { id: "ep-1", projectId: "proj-001", method: "GET", path: "/a", responses: [] },
      { id: "ep-2", projectId: "proj-002", method: "POST", path: "/b", responses: [] },
    ];

    const testCases = [
      {
        id: "tc-1",
        endpointId: "ep-2", // belongs to proj-002 endpoint
        name: "POST b",
        expected: { status: 200 },
        tags: { purpose: ["functional"], strategy: ["positive"], phase: ["full"], priority: "P1" },
      },
    ];

    mockStorage.list
      .mockResolvedValueOnce(endpoints)
      .mockResolvedValueOnce(testCases);

    const result = await calculateCoverage("proj-001");

    expect(result.details.totalEndpoints).toBe(1);
    expect(result.details.coveredEndpoints).toBe(0);
    expect(result.endpointCoverage).toBe(0);
  });
});
