import type { Environment, Project } from "@nexqa/shared";
import { CreateProjectSchema, UpdateProjectSchema } from "@nexqa/shared";
import { Hono } from "hono";
import { v4 as uuid } from "uuid";
import { safeFetch } from "../services/safe-fetch.js";
import { storage } from "../services/storage.js";

const COLLECTION = "projects";

export const projectRoutes = new Hono()
  .get("/", async (c) => {
    const projects = await storage.list<Project>(COLLECTION);
    projects.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
    return c.json(projects);
  })
  .get("/detail", async (c) => {
    const id = c.req.query("id");
    if (!id) return c.json({ error: "id is required" }, 400);
    const project = await storage.read<Project>(COLLECTION, id);
    if (!project) return c.json({ error: "Project not found" }, 404);
    return c.json(project);
  })
  .get("/ping", async (c) => {
    const id = c.req.query("id");
    if (!id) return c.json({ error: "id is required" }, 400);
    const project = await storage.read<Project>(COLLECTION, id);
    if (!project) return c.json({ error: "Project not found" }, 404);
    try {
      const start = Date.now();
      const res = await safeFetch(project.baseURL, {
        method: "HEAD",
        headers: project.headers,
        timeout: 5000,
      });
      return c.json({
        online: res.ok || res.status < 500,
        status: res.status,
        latency: Date.now() - start,
      });
    } catch {
      return c.json({ online: false, status: 0, latency: 0 });
    }
  })
  .post("/", async (c) => {
    const body = await c.req.json();
    const input = CreateProjectSchema.parse(body);
    const now = new Date().toISOString();
    const project: Project = {
      id: uuid(),
      ...input,
      description: input.description ?? "",
      headers: input.headers ?? {},
      createdAt: now,
      updatedAt: now,
    };

    // O3: Auto-create default environment with project's baseURL/headers
    const defaultEnv: Environment = {
      id: uuid(),
      projectId: project.id,
      name: "默认环境",
      slug: "default",
      baseURL: project.baseURL,
      headers: project.headers ?? {},
      variables: {},
      isDefault: true,
      order: 0,
      createdAt: now,
      updatedAt: now,
    };

    // Write env first (orphan env is harmless; missing env is not)
    await storage.write("environments", defaultEnv.id, defaultEnv);

    // Set activeEnvironmentId on project
    const projectWithEnv = {
      ...project,
      activeEnvironmentId: defaultEnv.id,
    };
    await storage.write(COLLECTION, project.id, projectWithEnv);
    return c.json(projectWithEnv, 201);
  })
  .post("/update", async (c) => {
    const body = await c.req.json();
    const { id, ...updateBody } = body;
    if (!id) return c.json({ error: "id is required" }, 400);
    const existing = await storage.read<Project>(COLLECTION, id);
    if (!existing) return c.json({ error: "Project not found" }, 404);
    const input = UpdateProjectSchema.parse(updateBody);

    // O7: description max 500 validation (already in schema, but explicit check for clarity)
    if (input.description !== undefined && input.description.length > 500) {
      return c.json({ error: "Description exceeds 500 characters" }, 400);
    }

    // O7c: activeEnvironmentId 校验 — 确保环境存在且属于该项目
    if (input.activeEnvironmentId) {
      const env = await storage.read<Environment>(
        "environments",
        input.activeEnvironmentId,
      );
      if (!env || env.projectId !== id) {
        return c.json(
          { error: "activeEnvironmentId does not reference a valid environment in this project" },
          400,
        );
      }
    }

    const updated: Project = {
      ...existing,
      ...input,
      updatedAt: new Date().toISOString(),
    };
    await storage.write(COLLECTION, id, updated);
    return c.json(updated);
  })
  .post("/delete", async (c) => {
    const { id } = await c.req.json();
    if (!id) return c.json({ error: "id is required" }, 400);
    const project = await storage.read<Project>(COLLECTION, id);
    if (!project) return c.json({ error: "Project not found" }, 404);

    // Delete related endpoints and their test cases
    const endpoints = (
      await storage.list<{ id: string; projectId: string }>("api-endpoints")
    ).filter((ep) => ep.projectId === id);
    for (const ep of endpoints) {
      const cases = (
        await storage.list<{ id: string; endpointId: string }>("test-cases")
      ).filter((tc) => tc.endpointId === ep.id);
      for (const tc of cases) {
        await storage.remove("test-cases", tc.id);
      }
      await storage.remove("api-endpoints", ep.id);
    }

    // Delete test results
    const results = (
      await storage.list<{ id: string; projectId: string }>("test-results")
    ).filter((r) => r.projectId === id);
    for (const r of results) {
      await storage.remove("test-results", r.id);
    }

    // Delete batch runs and batch-run-results
    const batches = (
      await storage.list<{ id: string; projectId: string }>("batch-runs")
    ).filter((b) => b.projectId === id);
    for (const b of batches) {
      const batchResults = (
        await storage.list<{ id: string; batchRunId: string }>("batch-run-results")
      ).filter((br) => br.batchRunId === b.id);
      for (const br of batchResults) {
        await storage.remove("batch-run-results", br.id);
      }
      // Delete failure analyses
      const analyses = (
        await storage.list<{ id: string; batchRunId: string }>("failure-analyses")
      ).filter((a) => a.batchRunId === b.id);
      for (const a of analyses) {
        await storage.remove("failure-analyses", a.id);
      }
      await storage.remove("batch-runs", b.id);
    }

    // Delete environments
    const envs = (
      await storage.list<{ id: string; projectId: string }>("environments")
    ).filter((e) => e.projectId === id);
    for (const e of envs) {
      await storage.remove("environments", e.id);
    }

    await storage.remove(COLLECTION, id);
    return c.json({ success: true });
  })
  // O7b: POST /api/projects/delete-results — 清空测试结果
  .post("/delete-results", async (c) => {
    const { id } = await c.req.json();
    if (!id) return c.json({ error: "id is required" }, 400);
    const project = await storage.read<Project>(COLLECTION, id);
    if (!project) return c.json({ error: "Project not found" }, 404);

    // Delete all BatchRuns + their TestResults + BatchRunResults + FailureAnalyses
    const batches = (
      await storage.list<{ id: string; projectId: string }>("batch-runs")
    ).filter((b) => b.projectId === id);

    let resultCount = 0;
    for (const batch of batches) {
      // Delete batch-run-results (linking table)
      const batchResults = (
        await storage.list<{ id: string; batchRunId: string }>("batch-run-results")
      ).filter((br) => br.batchRunId === batch.id);
      for (const br of batchResults) {
        await storage.remove("batch-run-results", br.id);
      }

      // Delete failure analyses
      const analyses = (
        await storage.list<{ id: string; batchRunId: string }>("failure-analyses")
      ).filter((a) => a.batchRunId === batch.id);
      for (const a of analyses) {
        await storage.remove("failure-analyses", a.id);
      }

      await storage.remove("batch-runs", batch.id);
    }

    // Delete all test results for the project
    const results = (
      await storage.list<{ id: string; projectId: string }>("test-results")
    ).filter((r) => r.projectId === id);
    resultCount = results.length;
    for (const r of results) {
      await storage.remove("test-results", r.id);
    }

    // Delete case-analyses
    const caseAnalyses = (
      await storage.list<{ id: string; projectId: string }>("case-analyses")
    ).filter((a) => a.projectId === id);
    for (const a of caseAnalyses) {
      await storage.remove("case-analyses", a.id);
    }

    return c.json({
      deleted: {
        batchRuns: batches.length,
        testResults: resultCount,
      },
    });
  });
