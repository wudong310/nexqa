import type { Environment, Project, TestCase, TestChain, TestChainStep } from "@nexqa/shared";
import { CreateTestChainSchema, UpdateTestChainSchema } from "@nexqa/shared";
import { Hono } from "hono";
import { v4 as uuid } from "uuid";
import { executeChain } from "../services/chain-engine.js";
import { createLogger } from "../services/logger.js";
import { storage } from "../services/storage.js";
import { executeTestCase, buildVariableContext } from "./test-exec.js";
import { flattenVariables } from "../services/variable-engine.js";

const COLLECTION = "test-chains";

export const testChainRoutes = new Hono()
  // GET / — 获取项目所有测试链
  .get("/", async (c) => {
    const projectId = c.req.query("projectId");
    if (!projectId) {
      return c.json({ error: "projectId query parameter is required" }, 400);
    }
    const all = await storage.list<TestChain>(COLLECTION);
    const filtered = all.filter((ch) => ch.projectId === projectId);
    filtered.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
    return c.json(filtered);
  })
  // POST / — 创建测试链
  .post("/", async (c) => {
    const body = await c.req.json();
    const projectId = body.projectId;
    if (!projectId) {
      return c.json({ error: "projectId is required" }, 400);
    }

    const input = CreateTestChainSchema.parse(body);
    const now = new Date().toISOString();

    // 为每个 step 生成 id
    const steps: TestChainStep[] = input.steps.map((step) => ({
      ...step,
      id: uuid(),
    }));

    const chain: TestChain = {
      id: uuid(),
      projectId,
      name: input.name,
      description: input.description,
      steps,
      config: {
        continueOnFail: input.config.continueOnFail ?? false,
        cleanupSteps: input.config.cleanupSteps ?? [],
      },
      createdAt: now,
      updatedAt: now,
    };

    await storage.write(COLLECTION, chain.id, chain);
    return c.json(chain, 201);
  })
  // GET /detail — 获取单个测试链
  .get("/detail", async (c) => {
    const id = c.req.query("id");
    if (!id) return c.json({ error: "id is required" }, 400);
    const chain = await storage.read<TestChain>(COLLECTION, id);
    if (!chain) return c.json({ error: "Test chain not found" }, 404);
    return c.json(chain);
  })
  // POST /update — 更新测试链
  .post("/update", async (c) => {
    const body = await c.req.json();
    const { id, ...rest } = body;
    if (!id) return c.json({ error: "id is required" }, 400);
    const existing = await storage.read<TestChain>(COLLECTION, id);
    if (!existing) return c.json({ error: "Test chain not found" }, 404);

    const input = UpdateTestChainSchema.parse(rest);
    const now = new Date().toISOString();

    // 如果更新了 steps，为新 step 生成 id
    let steps = existing.steps;
    if (input.steps !== undefined) {
      steps = input.steps.map((step) => ({
        ...step,
        id: uuid(),
      }));
    }

    const updated: TestChain = {
      ...existing,
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      steps,
      ...(input.config !== undefined && {
        config: { ...existing.config, ...input.config },
      }),
      updatedAt: now,
    };

    await storage.write(COLLECTION, id, updated);
    return c.json(updated);
  })
  // POST /delete — 删除测试链
  .post("/delete", async (c) => {
    const { id } = await c.req.json();
    if (!id) return c.json({ error: "id is required" }, 400);
    const existing = await storage.read<TestChain>(COLLECTION, id);
    if (!existing) return c.json({ error: "Test chain not found" }, 404);

    await storage.remove(COLLECTION, id);
    return c.json({ success: true });
  })
  // POST /run — 执行测试链
  .post("/run", async (c) => {
    const log = createLogger("test-chains", c.req.header("x-trace-id"));
    const body = await c.req.json<{ id?: string; environmentId?: string }>();
    const id = body.id;
    if (!id) return c.json({ error: "id is required" }, 400);
    const chain = await storage.read<TestChain>(COLLECTION, id);
    if (!chain) return c.json({ error: "Test chain not found" }, 404);

    const project = await storage.read<Project>("projects", chain.projectId);
    if (!project) return c.json({ error: "Project not found" }, 404);

    let env: Environment | null = null;
    if (body.environmentId) {
      env = await storage.read<Environment>("environments", body.environmentId);
    }

    const effectiveBaseURL = env?.baseURL || project.baseURL || "";
    const effectiveHeaders = { ...project.headers, ...(env?.headers || {}) };
    const variableCtx = buildVariableContext(env);

    const allCases = await storage.list<TestCase>("test-cases");
    const testCaseMap = new Map<string, TestCase>();
    for (const tc of allCases) {
      testCaseMap.set(tc.id, tc);
    }

    log.info(`执行测试链(run): ${chain.name} (chainId=${id})`);

    const result = await executeChain({
      chain,
      testCaseMap,
      projectId: chain.projectId,
      baseURL: effectiveBaseURL,
      sharedHeaders: effectiveHeaders,
      environment: env,
      executeFn: async (testCase: TestCase) => {
        return executeTestCase({
          testCase,
          projectId: chain.projectId,
          baseURL: effectiveBaseURL,
          sharedHeaders: effectiveHeaders,
          variableCtx,
        });
      },
      initialVariables: flattenVariables(project.variables || {}),
    });

    return c.json(result);
  });
