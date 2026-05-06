import type { Environment } from "@nexqa/shared";
import {
  CreateEnvironmentSchema,
  UpdateEnvironmentSchema,
  normalizeVariables,
  type VariableEntry,
  type VariableValue,
} from "@nexqa/shared";
import { Hono } from "hono";
import { v4 as uuid } from "uuid";
import { encrypt, decrypt, mask, isEncrypted } from "../services/secret-manager.js";
import { storage } from "../services/storage.js";

const COLLECTION = "environments";

// ── Health check helper ───────────────────────────────

const HEALTH_TIMEOUT_MS = 5000;

interface HealthResult {
  healthy: boolean;
  latencyMs: number | null;
  error?: string;
  checkedAt: string;
}

async function checkHealth(baseURL: string): Promise<HealthResult> {
  const startTime = Date.now();
  const checkedAt = new Date().toISOString();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

    try {
      await fetch(baseURL, { method: "HEAD", signal: controller.signal });
    } catch {
      // HEAD 不支持时 fallback 到 GET
      await fetch(baseURL, { method: "GET", signal: controller.signal });
    }
    clearTimeout(timeout);

    const latencyMs = Date.now() - startTime;
    return { healthy: true, latencyMs, checkedAt };
  } catch (err: any) {
    return {
      healthy: false,
      latencyMs: null,
      error: err.message || "Connection failed",
      checkedAt,
    };
  }
}

// ── Secret helpers ────────────────────────────────────

/** Encrypt secret variables before writing to storage */
function encryptVariables(
  vars: Record<string, VariableValue>,
): Record<string, VariableValue> {
  const result: Record<string, VariableValue> = {};
  for (const [k, v] of Object.entries(vars)) {
    if (typeof v === "string") {
      result[k] = v; // legacy string, no encryption
    } else if (v.secret && v.value && !isEncrypted(v.value)) {
      result[k] = { ...v, value: encrypt(v.value) };
    } else {
      result[k] = v;
    }
  }
  return result;
}

/** Mask secret variables for API response */
function maskVariables(
  vars: Record<string, VariableValue>,
): Record<string, VariableValue & { hasValue?: boolean }> {
  const result: Record<string, VariableValue & { hasValue?: boolean }> = {};
  for (const [k, v] of Object.entries(vars)) {
    if (typeof v === "string") {
      result[k] = v; // legacy
    } else if (v.secret) {
      const plainValue = isEncrypted(v.value) ? decrypt(v.value) : v.value;
      result[k] = {
        ...v,
        value: mask(plainValue),
        hasValue: Boolean(v.value),
      };
    } else {
      // Non-secret VariableEntry: if value happens to be encrypted (migrated from secret → non-secret), decrypt
      if (isEncrypted(v.value)) {
        result[k] = { ...v, value: decrypt(v.value) };
      } else {
        result[k] = v;
      }
    }
  }
  return result;
}

/** Merge updated variables with existing, preserving secret values when not modified */
function mergeSecretVariables(
  existing: Record<string, VariableValue>,
  updated: Record<string, VariableValue>,
): Record<string, VariableValue> {
  const result: Record<string, VariableValue> = {};
  for (const [k, v] of Object.entries(updated)) {
    if (typeof v !== "string" && v.secret) {
      const existingEntry =
        typeof existing[k] === "object" ? (existing[k] as VariableEntry) : null;
      // If the new value looks like a masked value (e.g. "abc***") or is empty,
      // and there's an existing encrypted value, keep the old one
      if (
        existingEntry &&
        existingEntry.secret &&
        (!v.value || v.value.endsWith("***"))
      ) {
        result[k] = { ...v, value: existingEntry.value };
        continue;
      }
    }
    result[k] = v;
  }
  return result;
}

/** Prepare environment for API response (mask secrets) */
function maskEnvResponse(env: Environment): Environment {
  return { ...env, variables: maskVariables(env.variables) } as Environment;
}

export const environmentRoutes = new Hono()
  // POST /api/environments/reorder — batch update environment order
  .post("/reorder", async (c) => {
    const body = await c.req.json();
    const orders: Array<{ id: string; order: number }> = body.orders;
    if (!Array.isArray(orders) || orders.length === 0) {
      return c.json({ error: "orders array is required" }, 400);
    }

    let updated = 0;
    for (const item of orders) {
      const env = await storage.read<Environment>(COLLECTION, item.id);
      if (!env) continue;
      (env as any).order = item.order;
      env.updatedAt = new Date().toISOString();
      await storage.write(COLLECTION, env.id, env);
      updated++;
    }
    return c.json({ updated });
  })
  // GET /api/environments?projectId= — list all environments for a project
  .get("/", async (c) => {
    const projectId = c.req.query("projectId");
    if (!projectId) {
      return c.json({ error: "projectId query parameter is required" }, 400);
    }
    const all = await storage.list<Environment>(COLLECTION);
    const filtered = all.filter((e) => e.projectId === projectId);
    // Sort by order (ascending), fallback to createdAt
    filtered.sort(
      (a, b) =>
        ((a as any).order ?? 0) - ((b as any).order ?? 0) ||
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    return c.json(filtered.map(maskEnvResponse));
  })
  // GET /api/environments/health — health check for a single environment
  .get("/health", async (c) => {
    const id = c.req.query("id");
    if (!id) return c.json({ error: "id is required" }, 400);
    const env = await storage.read<Environment>(COLLECTION, id);
    if (!env) return c.json({ error: "Environment not found" }, 404);
    const result = await checkHealth(env.baseURL);
    return c.json(result);
  })
  // GET /api/environments/detail — get single environment
  .get("/detail", async (c) => {
    const id = c.req.query("id");
    if (!id) return c.json({ error: "id is required" }, 400);
    const env = await storage.read<Environment>(COLLECTION, id);
    if (!env) return c.json({ error: "Environment not found" }, 404);
    return c.json(maskEnvResponse(env));
  })
  // POST /api/environments — create environment
  .post("/", async (c) => {
    const body = await c.req.json();
    const projectId = body.projectId;
    if (!projectId) {
      return c.json({ error: "projectId is required" }, 400);
    }

    const input = CreateEnvironmentSchema.parse(body);

    // Check slug uniqueness within the project
    const existing = await storage.list<Environment>(COLLECTION);
    const projectEnvs = existing.filter((e) => e.projectId === projectId);
    const duplicate = projectEnvs.find((e) => e.slug === input.slug);
    if (duplicate) {
      return c.json(
        { error: `Environment with slug "${input.slug}" already exists in this project` },
        409,
      );
    }

    const now = new Date().toISOString();
    // Assign order = max existing order + 1
    const maxOrder = projectEnvs.reduce((max, e) => Math.max(max, (e as any).order ?? 0), -1);
    const env: Environment = {
      id: uuid(),
      projectId,
      name: input.name,
      slug: input.slug,
      baseURL: input.baseURL,
      headers: input.headers ?? {},
      variables: encryptVariables(input.variables ?? {}),
      isDefault: input.isDefault ?? false,
      order: maxOrder + 1,
      createdAt: now,
      updatedAt: now,
    };

    // If this is the first environment or marked as default, ensure it's default
    if (projectEnvs.length === 0) {
      env.isDefault = true;
    }

    // If setting as default, unset other defaults
    if (env.isDefault) {
      for (const e of projectEnvs) {
        if (e.isDefault) {
          e.isDefault = false;
          e.updatedAt = now;
          await storage.write(COLLECTION, e.id, e);
        }
      }
    }

    await storage.write(COLLECTION, env.id, env);
    return c.json(maskEnvResponse(env), 201);
  })
  // POST /api/environments/clone — O4: clone environment
  .post("/clone", async (c) => {
    const body = await c.req.json();
    const { id } = body;
    if (!id) return c.json({ error: "id is required" }, 400);
    const source = await storage.read<Environment>(COLLECTION, id);
    if (!source) return c.json({ error: "Environment not found" }, 404);

    const name = body.name || `${source.name} (副本)`;
    const slug: string = body.slug || `${source.slug}-copy`;

    // slug uniqueness within the project
    const allEnvs = await storage.list<Environment>(COLLECTION);
    const projectEnvs = allEnvs.filter((e) => e.projectId === source.projectId);
    if (projectEnvs.some((e) => e.slug === slug)) {
      return c.json(
        { error: `Slug '${slug}' already exists in this project` },
        409,
      );
    }

    const now = new Date().toISOString();
    const maxOrder = projectEnvs.reduce((max, e) => Math.max(max, (e as any).order ?? 0), -1);
    const cloned: Environment = {
      id: uuid(),
      projectId: source.projectId,
      name,
      slug,
      baseURL: source.baseURL,
      headers: { ...source.headers },
      variables: JSON.parse(JSON.stringify(source.variables)), // deep copy
      isDefault: false,
      order: maxOrder + 1,
      createdAt: now,
      updatedAt: now,
    };

    await storage.write(COLLECTION, cloned.id, cloned);
    return c.json(maskEnvResponse(cloned), 201);
  })
  // POST /api/environments/update — update environment
  .post("/update", async (c) => {
    const body = await c.req.json();
    const { id, ...updateBody } = body;
    if (!id) return c.json({ error: "id is required" }, 400);
    const existing = await storage.read<Environment>(COLLECTION, id);
    if (!existing) return c.json({ error: "Environment not found" }, 404);

    const input = UpdateEnvironmentSchema.parse(updateBody);

    // Check slug uniqueness if slug is being changed
    if (input.slug && input.slug !== existing.slug) {
      const all = await storage.list<Environment>(COLLECTION);
      const duplicate = all.find(
        (e) =>
          e.projectId === existing.projectId &&
          e.slug === input.slug &&
          e.id !== id,
      );
      if (duplicate) {
        return c.json(
          { error: `Environment with slug "${input.slug}" already exists in this project` },
          409,
        );
      }
    }

    const now = new Date().toISOString();

    // If setting as default, unset other defaults
    if (input.isDefault === true && !existing.isDefault) {
      const all = await storage.list<Environment>(COLLECTION);
      const projectEnvs = all.filter(
        (e) => e.projectId === existing.projectId && e.id !== id,
      );
      for (const e of projectEnvs) {
        if (e.isDefault) {
          e.isDefault = false;
          e.updatedAt = now;
          await storage.write(COLLECTION, e.id, e);
        }
      }
    }

    // Merge secret variables: preserve existing encrypted values if not modified
    let finalVariables = existing.variables;
    if (input.variables) {
      const merged = mergeSecretVariables(existing.variables, input.variables);
      finalVariables = encryptVariables(merged);
    }

    const updated: Environment = {
      ...existing,
      ...input,
      variables: finalVariables,
      id,
      projectId: existing.projectId,
      updatedAt: now,
    };
    await storage.write(COLLECTION, id, updated);
    return c.json(maskEnvResponse(updated));
  })
  // POST /api/environments/delete — delete environment (cannot delete default)
  .post("/delete", async (c) => {
    const { id } = await c.req.json();
    if (!id) return c.json({ error: "id is required" }, 400);
    const env = await storage.read<Environment>(COLLECTION, id);
    if (!env) return c.json({ error: "Environment not found" }, 404);

    if (env.isDefault) {
      return c.json(
        { error: "Cannot delete the default environment. Set another environment as default first." },
        400,
      );
    }

    await storage.remove(COLLECTION, id);

    // O7c: If this env was activeEnvironmentId on the project, clear it
    const project = await storage.read<{ id: string; activeEnvironmentId?: string | null }>(
      "projects",
      env.projectId,
    );
    if (project && project.activeEnvironmentId === id) {
      await storage.write("projects", project.id, {
        ...project,
        activeEnvironmentId: null,
        updatedAt: new Date().toISOString(),
      });
    }

    return c.json({ success: true });
  });
