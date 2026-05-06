import type { Environment, Project, TestCase, TestPlan, TestResult } from "@nexqa/shared";
import { CreateTestPlanSchema, UpdateTestPlanSchema } from "@nexqa/shared";
import { Hono } from "hono";
import { v4 as uuid } from "uuid";
import { createLogger } from "../services/logger.js";
import { executePlan } from "../services/plan-engine.js";
import { safeFetch } from "../services/safe-fetch.js";
import { storage } from "../services/storage.js";
import {
  resolveRequest,
  type VariableContext,
} from "../services/variable-engine.js";
import { executeTestCase, buildVariableContext } from "./test-exec.js";

const COLLECTION = "test-plans";

export const testPlanRoutes = new Hono()
  // GET /projects/:projectId/plans — 获取项目所有测试方案
  .get("/", async (c) => {
    const all = await storage.list<TestPlan>(COLLECTION);
    // projectId 从路由上下文获取 — 由父路由传入 query
    const projectId = c.req.query("projectId");
    if (!projectId) {
      return c.json({ error: "projectId query parameter is required" }, 400);
    }
    const filtered = all.filter((p) => p.projectId === projectId);
    filtered.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
    return c.json(filtered);
  })
  // POST / — 创建测试方案
  .post("/", async (c) => {
    const body = await c.req.json();
    const projectId = body.projectId;
    if (!projectId) {
      return c.json({ error: "projectId is required" }, 400);
    }

    const input = CreateTestPlanSchema.parse(body);
    const now = new Date().toISOString();

    const plan: TestPlan = {
      id: uuid(),
      projectId,
      name: input.name,
      description: input.description,
      selection: input.selection,
      execution: input.execution,
      criteria: input.criteria,
      createdAt: now,
      updatedAt: now,
    };

    await storage.write(COLLECTION, plan.id, plan);
    return c.json(plan, 201);
  })
  // GET /detail — 获取单个测试方案
  .get("/detail", async (c) => {
    const id = c.req.query("id");
    if (!id) return c.json({ error: "id is required" }, 400);
    const plan = await storage.read<TestPlan>(COLLECTION, id);
    if (!plan) return c.json({ error: "Test plan not found" }, 404);
    return c.json(plan);
  })
  // POST /update — 更新测试方案
  .post("/update", async (c) => {
    const body = await c.req.json();
    const { id, ...rest } = body;
    if (!id) return c.json({ error: "id is required" }, 400);
    const existing = await storage.read<TestPlan>(COLLECTION, id);
    if (!existing) return c.json({ error: "Test plan not found" }, 404);

    const input = UpdateTestPlanSchema.parse(rest);
    const now = new Date().toISOString();

    const updated: TestPlan = {
      ...existing,
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.selection !== undefined && { selection: input.selection }),
      ...(input.execution !== undefined && {
        execution: { ...existing.execution, ...input.execution },
      }),
      ...(input.criteria !== undefined && {
        criteria: { ...existing.criteria, ...input.criteria },
      }),
      updatedAt: now,
    };

    await storage.write(COLLECTION, id, updated);
    return c.json(updated);
  })
  // POST /delete — 删除测试方案
  .post("/delete", async (c) => {
    const { id } = await c.req.json();
    if (!id) return c.json({ error: "id is required" }, 400);
    const existing = await storage.read<TestPlan>(COLLECTION, id);
    if (!existing) return c.json({ error: "Test plan not found" }, 404);

    await storage.remove(COLLECTION, id);
    return c.json({ success: true });
  })
  // POST /run — 执行测试方案
  .post("/run", async (c) => {
    const log = createLogger("test-plans", c.req.header("x-trace-id"));
    const body = await c.req.json<{ id?: string }>();
    const id = body.id;
    if (!id) return c.json({ error: "id is required" }, 400);
    const plan = await storage.read<TestPlan>(COLLECTION, id);
    if (!plan) return c.json({ error: "Test plan not found" }, 404);

    // 加载项目和环境
    const project = await storage.read<Project>("projects", plan.projectId);
    if (!project) return c.json({ error: "Project not found" }, 404);

    let env: Environment | null = null;
    if (plan.execution.environmentId) {
      env = await storage.read<Environment>("environments", plan.execution.environmentId);
    }

    const effectiveBaseURL = env?.baseURL || project.baseURL || "";
    const effectiveHeaders = { ...project.headers, ...(env?.headers || {}) };
    const variableCtx = buildVariableContext(env);

    log.info(`执行测试方案: ${plan.name} (planId=${id})`);

    // 执行方案
    const result = await executePlan({
      plan,
      projectId: plan.projectId,
      executeFn: async (testCase: TestCase) => {
        return executeTestCase({
          testCase,
          projectId: plan.projectId,
          baseURL: effectiveBaseURL,
          sharedHeaders: effectiveHeaders,
          variableCtx,
        });
      },
      onProgress: (stage, completed, total) => {
        log.info(`[${stage}] 进度: ${completed}/${total}`);
      },
    });

    return c.json(result, result.status === "completed" ? 200 : 200);
  });
