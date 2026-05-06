import { describe, it, expect } from "vitest";
import {
  ruleBasedGenerate,
  type ChainGenTask,
} from "../services/chain-gen.js";
import type { ApiEndpoint, TestCase } from "@nexqa/shared";

// ── Helper factories ──────────────────────────────────

function makeEndpoint(
  overrides: Partial<ApiEndpoint> & { method: string; path: string },
): ApiEndpoint {
  const id = overrides.id || crypto.randomUUID();
  return {
    id,
    projectId: "proj-1",
    documentId: null,
    method: overrides.method as ApiEndpoint["method"],
    path: overrides.path,
    summary: overrides.summary || "",
    headers: overrides.headers || [],
    queryParams: overrides.queryParams || [],
    pathParams: overrides.pathParams || [],
    body: overrides.body,
    responses: overrides.responses || [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function makeCase(
  overrides: Partial<TestCase> & { endpointId: string; method: string; path: string },
): TestCase {
  const id = overrides.id || crypto.randomUUID();
  return {
    id,
    endpointId: overrides.endpointId,
    name: overrides.name || `Test ${overrides.method} ${overrides.path}`,
    request: {
      method: overrides.method as TestCase["request"]["method"],
      path: overrides.path,
      headers: {},
      query: {},
      timeout: 30000,
    },
    expected: { status: 200, bodyContains: null, bodySchema: null },
    tags: overrides.tags || {
      purpose: ["functional"],
      strategy: ["positive"],
      phase: ["full"],
      priority: "P0",
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// ── Tests ─────────────────────────────────────────────

describe("chain-gen: ruleBasedGenerate", () => {
  it("should generate CRUD chain when POST+GET+PUT+DELETE exist for a resource", () => {
    const postEp = makeEndpoint({
      id: "ep-post",
      method: "POST",
      path: "/api/users",
    });
    const getEp = makeEndpoint({
      id: "ep-get",
      method: "GET",
      path: "/api/users/:id",
      pathParams: [{ name: "id", type: "string", required: true, description: "" }],
    });
    const putEp = makeEndpoint({
      id: "ep-put",
      method: "PUT",
      path: "/api/users/:id",
      pathParams: [{ name: "id", type: "string", required: true, description: "" }],
    });
    const deleteEp = makeEndpoint({
      id: "ep-del",
      method: "DELETE",
      path: "/api/users/:id",
      pathParams: [{ name: "id", type: "string", required: true, description: "" }],
    });

    const endpoints = [postEp, getEp, putEp, deleteEp];
    const cases = [
      makeCase({ endpointId: postEp.id, method: "POST", path: "/api/users" }),
      makeCase({ endpointId: getEp.id, method: "GET", path: "/api/users/:id" }),
      makeCase({ endpointId: putEp.id, method: "PUT", path: "/api/users/:id" }),
      makeCase({ endpointId: deleteEp.id, method: "DELETE", path: "/api/users/:id" }),
    ];

    const result = ruleBasedGenerate(endpoints, cases);

    // Should find 1 CRUD chain
    expect(result.chains.length).toBeGreaterThanOrEqual(1);
    const crudChain = result.chains.find((c) => c.type === "crud");
    expect(crudChain).toBeDefined();
    expect(crudChain!.steps.length).toBe(4);
    expect(crudChain!.steps[0].label).toContain("创建");
    expect(crudChain!.steps[crudChain!.steps.length - 1].label).toContain("删除");

    // POST step should have extractor
    expect(crudChain!.steps[0].extractors.length).toBe(1);
    expect(crudChain!.steps[0].extractors[0].varName).toContain("Id");

    // GET step should have injector
    const getStep = crudChain!.steps.find((s) => s.label.includes("获取"));
    expect(getStep).toBeDefined();
    expect(getStep!.injectors.length).toBe(1);
    expect(getStep!.injectors[0].target).toBe("path");
  });

  it("should generate auth chain when auth endpoints exist", () => {
    const loginEp = makeEndpoint({
      id: "ep-login",
      method: "POST",
      path: "/api/auth/login",
    });

    const endpoints = [loginEp];
    const cases = [
      makeCase({ endpointId: loginEp.id, method: "POST", path: "/api/auth/login" }),
    ];

    const result = ruleBasedGenerate(endpoints, cases);

    const authChain = result.chains.find((c) => c.type === "auth");
    expect(authChain).toBeDefined();
    expect(authChain!.steps.length).toBe(1);
    expect(authChain!.steps[0].extractors.length).toBe(1);
    expect(authChain!.steps[0].extractors[0].varName).toBe("token");
  });

  it("should return empty chains when no CRUD pattern or auth detected", () => {
    const ep = makeEndpoint({
      id: "ep-health",
      method: "GET",
      path: "/api/health",
    });

    const cases = [
      makeCase({ endpointId: ep.id, method: "GET", path: "/api/health" }),
    ];

    const result = ruleBasedGenerate([ep], cases);
    // Only a health GET, no CRUD, no auth
    expect(result.chains.length).toBe(0);
  });

  it("should build dependency graph nodes", () => {
    const postEp = makeEndpoint({
      id: "ep-post",
      method: "POST",
      path: "/api/orders",
    });
    const getEp = makeEndpoint({
      id: "ep-get",
      method: "GET",
      path: "/api/orders/:orderId",
      pathParams: [{ name: "orderId", type: "string", required: true, description: "" }],
    });

    const result = ruleBasedGenerate([postEp, getEp], []);

    expect(result.graph.nodes.length).toBe(2);
    const postNode = result.graph.nodes.find((n) => n.method === "POST");
    expect(postNode).toBeDefined();
    expect(postNode!.produces.length).toBe(1);

    const getNode = result.graph.nodes.find((n) => n.method === "GET");
    expect(getNode).toBeDefined();
    expect(getNode!.requires.length).toBe(1);
    expect(getNode!.requires[0].variable).toBe("orderId");
  });

  it("should build dependency edges between POST and GET/PUT/DELETE", () => {
    const postEp = makeEndpoint({
      id: "ep-post",
      method: "POST",
      path: "/api/items",
    });
    const getEp = makeEndpoint({
      id: "ep-get",
      method: "GET",
      path: "/api/items/:id",
      pathParams: [{ name: "id", type: "string", required: true, description: "" }],
    });
    const putEp = makeEndpoint({
      id: "ep-put",
      method: "PUT",
      path: "/api/items/:id",
      pathParams: [{ name: "id", type: "string", required: true, description: "" }],
    });
    const delEp = makeEndpoint({
      id: "ep-del",
      method: "DELETE",
      path: "/api/items/:id",
      pathParams: [{ name: "id", type: "string", required: true, description: "" }],
    });

    const endpoints = [postEp, getEp, putEp, delEp];
    const cases = endpoints.map((ep) =>
      makeCase({ endpointId: ep.id, method: ep.method, path: ep.path }),
    );

    const result = ruleBasedGenerate(endpoints, cases);

    // Should have edges from POST to GET, PUT, DELETE
    expect(result.graph.edges.length).toBe(3);
    for (const edge of result.graph.edges) {
      expect(edge.from).toBe("ep-post");
      expect(["ep-get", "ep-put", "ep-del"]).toContain(edge.to);
      expect(edge.confidence).toBe(0.6);
    }
  });

  it("should prefer positive + P0 cases when multiple exist", () => {
    const ep = makeEndpoint({
      id: "ep-post",
      method: "POST",
      path: "/api/users",
    });
    const getEp = makeEndpoint({
      id: "ep-get",
      method: "GET",
      path: "/api/users/:id",
      pathParams: [{ name: "id", type: "string", required: true, description: "" }],
    });
    const putEp = makeEndpoint({
      id: "ep-put",
      method: "PUT",
      path: "/api/users/:id",
      pathParams: [{ name: "id", type: "string", required: true, description: "" }],
    });
    const delEp = makeEndpoint({
      id: "ep-del",
      method: "DELETE",
      path: "/api/users/:id",
      pathParams: [{ name: "id", type: "string", required: true, description: "" }],
    });

    const p0Case = makeCase({
      id: "case-p0",
      endpointId: ep.id,
      method: "POST",
      path: "/api/users",
      name: "正向创建用户",
      tags: {
        purpose: ["functional"],
        strategy: ["positive"],
        phase: ["full"],
        priority: "P0",
      },
    });
    const p2Case = makeCase({
      id: "case-p2",
      endpointId: ep.id,
      method: "POST",
      path: "/api/users",
      name: "边界测试创建",
      tags: {
        purpose: ["functional"],
        strategy: ["boundary"],
        phase: ["full"],
        priority: "P2",
      },
    });
    const getCaseP0 = makeCase({
      endpointId: getEp.id,
      method: "GET",
      path: "/api/users/:id",
    });
    const putCaseP0 = makeCase({
      endpointId: putEp.id,
      method: "PUT",
      path: "/api/users/:id",
    });
    const delCaseP0 = makeCase({
      endpointId: delEp.id,
      method: "DELETE",
      path: "/api/users/:id",
    });

    const endpoints = [ep, getEp, putEp, delEp];
    const cases = [p0Case, p2Case, getCaseP0, putCaseP0, delCaseP0];

    const result = ruleBasedGenerate(endpoints, cases);

    const crudChain = result.chains.find((c) => c.type === "crud");
    expect(crudChain).toBeDefined();
    // Should pick the P0 positive case, not the P2 boundary case
    expect(crudChain!.steps[0].caseId).toBe("case-p0");
  });

  it("should set overallConfidence to 0.6 for rule-based chains", () => {
    const postEp = makeEndpoint({
      id: "ep-post",
      method: "POST",
      path: "/api/products",
    });
    const getEp = makeEndpoint({
      id: "ep-get",
      method: "GET",
      path: "/api/products/:id",
      pathParams: [{ name: "id", type: "string", required: true, description: "" }],
    });
    const putEp = makeEndpoint({
      id: "ep-put",
      method: "PUT",
      path: "/api/products/:id",
      pathParams: [{ name: "id", type: "string", required: true, description: "" }],
    });
    const delEp = makeEndpoint({
      id: "ep-del",
      method: "DELETE",
      path: "/api/products/:id",
      pathParams: [{ name: "id", type: "string", required: true, description: "" }],
    });

    const endpoints = [postEp, getEp, putEp, delEp];
    const cases = endpoints.map((ep) =>
      makeCase({ endpointId: ep.id, method: ep.method, path: ep.path }),
    );

    const result = ruleBasedGenerate(endpoints, cases);

    for (const chain of result.chains) {
      expect(chain.overallConfidence).toBe(0.6);
      for (const step of chain.steps) {
        expect(step.confidence).toBe(0.6);
      }
    }
  });

  it("should skip endpoints without matching test cases", () => {
    const postEp = makeEndpoint({
      id: "ep-post",
      method: "POST",
      path: "/api/comments",
    });
    const getEp = makeEndpoint({
      id: "ep-get",
      method: "GET",
      path: "/api/comments/:id",
      pathParams: [{ name: "id", type: "string", required: true, description: "" }],
    });
    const putEp = makeEndpoint({
      id: "ep-put",
      method: "PUT",
      path: "/api/comments/:id",
      pathParams: [{ name: "id", type: "string", required: true, description: "" }],
    });
    const delEp = makeEndpoint({
      id: "ep-del",
      method: "DELETE",
      path: "/api/comments/:id",
      pathParams: [{ name: "id", type: "string", required: true, description: "" }],
    });

    // Only provide case for POST, not for others
    const cases = [
      makeCase({ endpointId: postEp.id, method: "POST", path: "/api/comments" }),
    ];

    const result = ruleBasedGenerate([postEp, getEp, putEp, delEp], cases);

    // Chain should exist but only have 1 step (POST only)
    // Actually with only 1 step the chain won't be created (need >= 2)
    const crudChain = result.chains.find((c) => c.type === "crud");
    expect(crudChain).toBeUndefined();
  });

  it("should handle multiple resources independently", () => {
    // Users CRUD
    const userPost = makeEndpoint({ id: "u-post", method: "POST", path: "/api/users" });
    const userGet = makeEndpoint({
      id: "u-get",
      method: "GET",
      path: "/api/users/:id",
      pathParams: [{ name: "id", type: "string", required: true, description: "" }],
    });
    const userPut = makeEndpoint({
      id: "u-put",
      method: "PUT",
      path: "/api/users/:id",
      pathParams: [{ name: "id", type: "string", required: true, description: "" }],
    });
    const userDel = makeEndpoint({
      id: "u-del",
      method: "DELETE",
      path: "/api/users/:id",
      pathParams: [{ name: "id", type: "string", required: true, description: "" }],
    });

    // Orders CRUD
    const orderPost = makeEndpoint({ id: "o-post", method: "POST", path: "/api/orders" });
    const orderGet = makeEndpoint({
      id: "o-get",
      method: "GET",
      path: "/api/orders/:orderId",
      pathParams: [{ name: "orderId", type: "string", required: true, description: "" }],
    });
    const orderPut = makeEndpoint({
      id: "o-put",
      method: "PUT",
      path: "/api/orders/:orderId",
      pathParams: [{ name: "orderId", type: "string", required: true, description: "" }],
    });
    const orderDel = makeEndpoint({
      id: "o-del",
      method: "DELETE",
      path: "/api/orders/:orderId",
      pathParams: [{ name: "orderId", type: "string", required: true, description: "" }],
    });

    const endpoints = [userPost, userGet, userPut, userDel, orderPost, orderGet, orderPut, orderDel];
    const cases = endpoints.map((ep) =>
      makeCase({ endpointId: ep.id, method: ep.method, path: ep.path }),
    );

    const result = ruleBasedGenerate(endpoints, cases);

    const crudChains = result.chains.filter((c) => c.type === "crud");
    expect(crudChains.length).toBe(2);

    const names = crudChains.map((c) => c.name).sort();
    expect(names.some((n) => n.includes("users"))).toBe(true);
    expect(names.some((n) => n.includes("orders"))).toBe(true);
  });
});
