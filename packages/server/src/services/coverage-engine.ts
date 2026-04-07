import type { ApiEndpoint, Purpose, TestCase, TestCaseTags } from "@nexqa/shared";

import { storage } from "./storage.js";

// ── Types ─────────────────────────────────────────────

export interface CoverageResult {
  /** 接口覆盖率 = 有 ≥1 个用例的接口数 / 总接口数 */
  endpointCoverage: number;
  /** HTTP 方法覆盖率 = 有 ≥1 个用例的 method 种类 / 总 method 种类 */
  methodCoverage: number;
  /** 状态码覆盖率 = 已覆盖的 (接口+状态码) 对 / 总 (接口+状态码) 对 */
  statusCodeCoverage: number;
  /** 详细统计 */
  details: {
    totalEndpoints: number;
    coveredEndpoints: number;
    totalMethods: number;
    coveredMethods: number;
    totalStatusCodes: number;
    coveredStatusCodes: number;
  };
  /** 每个接口的覆盖明细 */
  endpoints: EndpointCoverageDetail[];
}

export interface EndpointCoverageDetail {
  endpointId: string;
  method: string;
  path: string;
  caseCount: number;
  covered: boolean;
  /** 该接口文档中定义的状态码 */
  definedStatusCodes: number[];
  /** 测试用例覆盖到的状态码 */
  coveredStatusCodes: number[];
  /** 测试目的覆盖 */
  coveredPurposes: Purpose[];
}

// ── Helpers ───────────────────────────────────────────

function safeTags(tags: TestCaseTags | undefined | null): TestCaseTags {
  if (!tags) {
    return { purpose: ["functional"], strategy: ["positive"], phase: ["full"], priority: "P1" };
  }
  return tags;
}

// ── Coverage calculation ──────────────────────────────

export async function calculateCoverage(projectId: string): Promise<CoverageResult> {
  // 1. 获取项目的所有接口
  const allEndpoints = await storage.list<ApiEndpoint>("api-endpoints");
  const endpoints = allEndpoints.filter((ep) => ep.projectId === projectId);

  // 2. 获取项目的所有测试用例
  const allCases = await storage.list<TestCase>("test-cases");
  const endpointIds = new Set(endpoints.map((ep) => ep.id));
  const cases = allCases.filter((tc) => endpointIds.has(tc.endpointId));

  // 3. 按 endpointId 分组用例
  const casesByEndpoint = new Map<string, TestCase[]>();
  for (const tc of cases) {
    const arr = casesByEndpoint.get(tc.endpointId) || [];
    arr.push(tc);
    casesByEndpoint.set(tc.endpointId, arr);
  }

  // 4. 计算接口覆盖率
  let coveredEndpoints = 0;
  const endpointDetails: EndpointCoverageDetail[] = [];

  // 5. 计算方法覆盖率 — 统计所有不同的 HTTP 方法
  const allMethods = new Set<string>();
  const coveredMethodsSet = new Set<string>();

  // 6. 计算状态码覆盖率
  let totalStatusCodePairs = 0;
  let coveredStatusCodePairs = 0;

  for (const ep of endpoints) {
    allMethods.add(ep.method);
    const epCases = casesByEndpoint.get(ep.id) || [];
    const hasCases = epCases.length > 0;

    if (hasCases) {
      coveredEndpoints++;
      coveredMethodsSet.add(ep.method);
    }

    // 接口文档中定义的状态码
    const definedStatusCodes = ep.responses
      ? ep.responses.map((r) => r.status)
      : [];
    // 如果文档未定义状态码，至少假设有一个 200
    const effectiveDefinedCodes =
      definedStatusCodes.length > 0 ? definedStatusCodes : [200];

    // 用例中覆盖到的状态码
    const coveredCodes = new Set<number>();
    const coveredPurposes = new Set<Purpose>();
    for (const tc of epCases) {
      if (tc.expected?.status != null) {
        coveredCodes.add(tc.expected.status);
      }
      const tags = safeTags(tc.tags as TestCaseTags);
      for (const p of tags.purpose) {
        coveredPurposes.add(p);
      }
    }

    // 状态码覆盖对
    totalStatusCodePairs += effectiveDefinedCodes.length;
    for (const code of effectiveDefinedCodes) {
      if (coveredCodes.has(code)) {
        coveredStatusCodePairs++;
      }
    }

    endpointDetails.push({
      endpointId: ep.id,
      method: ep.method,
      path: ep.path,
      caseCount: epCases.length,
      covered: hasCases,
      definedStatusCodes: effectiveDefinedCodes,
      coveredStatusCodes: [...coveredCodes],
      coveredPurposes: [...coveredPurposes],
    });
  }

  const totalEndpoints = endpoints.length;
  const totalMethods = allMethods.size;
  const coveredMethods = coveredMethodsSet.size;

  return {
    endpointCoverage: totalEndpoints > 0 ? coveredEndpoints / totalEndpoints : 0,
    methodCoverage: totalMethods > 0 ? coveredMethods / totalMethods : 0,
    statusCodeCoverage: totalStatusCodePairs > 0 ? coveredStatusCodePairs / totalStatusCodePairs : 0,
    details: {
      totalEndpoints,
      coveredEndpoints,
      totalMethods,
      coveredMethods,
      totalStatusCodes: totalStatusCodePairs,
      coveredStatusCodes: coveredStatusCodePairs,
    },
    endpoints: endpointDetails,
  };
}
