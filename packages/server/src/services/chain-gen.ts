/**
 * AI 自动生成测试链服务
 *
 * 核心流程：
 * 1. analyze — 收集 API 文档 + 用例，分析数据依赖
 * 2. generate — 调用 LLM（或规则引擎降级）生成测试链
 * 3. adopt — 将 AI 生成的链保存为正式 TestChain
 *
 * 存储集合：chain-gen-tasks
 */

import type {
  ApiEndpoint,
  Settings,
  TestCase,
  TestCaseTags,
  TestChain,
  TestChainStep,
} from "@nexqa/shared";

import { generateText } from "ai";
import { v4 as uuid } from "uuid";
import { createLlmModel } from "./llm.js";
import { createLogger } from "./logger.js";
import { storage } from "./storage.js";
import {
  CHAIN_GEN_SYSTEM_PROMPT,
  buildChainGenAnalyzePrompt,
} from "../prompts/chain-gen.js";

// ── Types ─────────────────────────────────────────────

export interface DataOutput {
  variable: string;
  expression: string;
  type: string;
}

export interface DataInput {
  variable: string;
  target: "path" | "query" | "header" | "body";
  expression: string;
  required: boolean;
}

export interface DependencyNode {
  endpointId: string;
  path: string;
  method: string;
  produces: DataOutput[];
  requires: DataInput[];
}

export interface DependencyEdge {
  from: string;
  to: string;
  variable: string;
  fromExpression: string;
  toTarget: string;
  toExpression: string;
  confidence: number;
}

export interface DependencyGraph {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
}

export interface GeneratedStepExtractor {
  varName: string;
  source: "body" | "header" | "status";
  expression: string;
}

export interface GeneratedStepInjector {
  varName: string;
  target: "path" | "query" | "header" | "body";
  expression: string;
}

export interface GeneratedStep {
  caseId: string;
  caseName: string;
  label: string;
  extractors: GeneratedStepExtractor[];
  injectors: GeneratedStepInjector[];
  confidence: number;
  reasoning: string;
}

export interface GeneratedChain {
  name: string;
  description: string;
  type: "crud" | "auth" | "business" | "cleanup";
  steps: GeneratedStep[];
  overallConfidence: number;
}

export interface ChainGenStats {
  endpointsAnalyzed: number;
  chainsGenerated: number;
  totalSteps: number;
  avgConfidence: number;
}

export interface ChainGenTask {
  id: string;
  projectId: string;
  status: "analyzing" | "generating" | "completed" | "failed";
  dependencyGraph: DependencyGraph | null;
  generatedChains: GeneratedChain[];
  stats: ChainGenStats | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

// In-memory task store (tasks are transient, persisted to storage on completion)
const chainGenTasks = new Map<string, ChainGenTask>();

const COLLECTION = "chain-gen-tasks";

// ── Tag helpers ───────────────────────────────────────

function safeTags(tags: TestCaseTags | undefined | null): TestCaseTags {
  if (!tags) {
    return { purpose: ["functional"], strategy: ["positive"], phase: ["full"], priority: "P1" };
  }
  return tags;
}

// ── LLM helpers ───────────────────────────────────────

async function getLlmConfig(): Promise<Settings["llm"] | null> {
  const raw = await storage.readRaw("settings.json");
  if (!raw) return null;
  const settings = JSON.parse(raw) as Settings;
  return settings.llm || null;
}

function parseLlmJson(text: string): unknown {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }
  return JSON.parse(cleaned);
}

// ── Public API ────────────────────────────────────────

export function getChainGenTask(taskId: string): ChainGenTask | null {
  return chainGenTasks.get(taskId) || null;
}

/**
 * 分析 + 生成测试链（异步，返回 taskId 后台执行）
 */
export async function analyzeAndGenerate(
  projectId: string,
  scope: "all" | "selected" = "all",
  endpointIds?: string[],
): Promise<ChainGenTask> {
  const log = createLogger("chain-gen");
  const now = new Date().toISOString();

  const task: ChainGenTask = {
    id: uuid(),
    projectId,
    status: "analyzing",
    dependencyGraph: null,
    generatedChains: [],
    stats: null,
    error: null,
    createdAt: now,
    updatedAt: now,
  };

  chainGenTasks.set(task.id, task);

  // Fire-and-forget async work
  doAnalyzeAndGenerate(task, projectId, scope, endpointIds, log).catch(
    (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      log.error(`链生成任务失败: ${msg}`);
      task.status = "failed";
      task.error = msg;
      task.updatedAt = new Date().toISOString();
    },
  );

  return task;
}

async function doAnalyzeAndGenerate(
  task: ChainGenTask,
  projectId: string,
  scope: "all" | "selected",
  endpointIds: string[] | undefined,
  log: ReturnType<typeof createLogger>,
): Promise<void> {
  // 1. Load endpoints
  const allEndpoints = await storage.list<ApiEndpoint>("api-endpoints");
  let endpoints = allEndpoints.filter((ep) => ep.projectId === projectId);
  if (scope === "selected" && endpointIds?.length) {
    const idSet = new Set(endpointIds);
    endpoints = endpoints.filter((ep) => idSet.has(ep.id));
  }

  if (endpoints.length === 0) {
    task.status = "failed";
    task.error = "项目没有 API 接口文档，请先导入";
    task.updatedAt = new Date().toISOString();
    return;
  }

  // 2. Load test cases
  const allCases = await storage.list<TestCase>("test-cases");
  const projectCases = allCases.filter((tc) =>
    endpoints.some((ep) => ep.id === tc.endpointId),
  );

  if (projectCases.length === 0) {
    task.status = "failed";
    task.error = "项目没有测试用例，请先生成";
    task.updatedAt = new Date().toISOString();
    return;
  }

  log.info(`分析 ${endpoints.length} 个接口，${projectCases.length} 个用例`);
  task.status = "generating";
  task.updatedAt = new Date().toISOString();

  // 3. Build compact data for LLM / rule engine
  const compactEndpoints = endpoints.map((ep) => ({
    id: ep.id,
    method: ep.method,
    path: ep.path,
    summary: ep.summary || "",
    pathParams: ep.pathParams.map((p) => ({
      name: p.name,
      type: p.type,
      required: p.required,
    })),
    queryParams: ep.queryParams.map((p) => ({
      name: p.name,
      type: p.type,
      required: p.required,
    })),
    bodyExample: ep.body?.example ?? null,
    bodySchema: ep.body?.schema ?? null,
    responses: ep.responses.map((r) => ({
      status: r.status,
      example: r.example ?? null,
    })),
  }));

  const compactCases = projectCases.map((tc) => {
    const tags = safeTags(tc.tags);
    return {
      caseId: tc.id,
      endpointId: tc.endpointId,
      name: tc.name,
      method: tc.request.method,
      path: tc.request.path,
      tags: {
        purpose: tags.purpose,
        strategy: tags.strategy,
        priority: tags.priority,
      },
    };
  });

  // 4. Try LLM, fallback to rules
  const llmConfig = await getLlmConfig();

  let graph: DependencyGraph;
  let chains: GeneratedChain[];

  if (llmConfig) {
    try {
      const result = await llmGenerate(
        compactEndpoints,
        compactCases,
        projectCases,
        llmConfig,
        log,
      );
      graph = result.graph;
      chains = result.chains;
    } catch (err) {
      log.warn(
        `LLM 链生成失败，降级到规则引擎: ${err instanceof Error ? err.message : err}`,
      );
      const result = ruleBasedGenerate(endpoints, projectCases);
      graph = result.graph;
      chains = result.chains;
    }
  } else {
    log.info("未配置 LLM，使用规则引擎生成测试链");
    const result = ruleBasedGenerate(endpoints, projectCases);
    graph = result.graph;
    chains = result.chains;
  }

  // 5. Validate caseIds
  const caseIdSet = new Set(projectCases.map((tc) => tc.id));
  for (const chain of chains) {
    chain.steps = chain.steps.filter((step) => {
      if (!caseIdSet.has(step.caseId)) {
        log.warn(`过滤无效 caseId: ${step.caseId} (${step.caseName})`);
        return false;
      }
      return true;
    });
  }
  // Remove empty chains
  const validChains = chains.filter((ch) => ch.steps.length > 0);

  // 6. Compute stats
  const allSteps = validChains.flatMap((ch) => ch.steps);
  const avgConf =
    allSteps.length > 0
      ? allSteps.reduce((sum, s) => sum + s.confidence, 0) / allSteps.length
      : 0;

  // Compute overallConfidence per chain
  for (const chain of validChains) {
    if (chain.steps.length > 0) {
      chain.overallConfidence =
        chain.steps.reduce((sum, s) => sum + s.confidence, 0) /
        chain.steps.length;
    }
  }

  task.dependencyGraph = graph;
  task.generatedChains = validChains;
  task.stats = {
    endpointsAnalyzed: endpoints.length,
    chainsGenerated: validChains.length,
    totalSteps: allSteps.length,
    avgConfidence: Math.round(avgConf * 100) / 100,
  };
  task.status = "completed";
  task.updatedAt = new Date().toISOString();

  // Persist to storage
  await storage.write(COLLECTION, task.id, task);
  log.info(
    `链生成完成: ${validChains.length} 条链, ${allSteps.length} 步, 平均置信度 ${task.stats.avgConfidence}`,
  );
}

// ── LLM-based generation ──────────────────────────────

async function llmGenerate(
  compactEndpoints: unknown[],
  compactCases: unknown[],
  fullCases: TestCase[],
  llmConfig: NonNullable<Settings["llm"]>,
  log: ReturnType<typeof createLogger>,
): Promise<{ graph: DependencyGraph; chains: GeneratedChain[] }> {
  const model = createLlmModel(llmConfig);
  const prompt = buildChainGenAnalyzePrompt(compactEndpoints, compactCases);

  log.info(`调用 LLM 分析 ${compactEndpoints.length} 个接口的依赖关系`);
  const { text } = await generateText({
    model,
    system: CHAIN_GEN_SYSTEM_PROMPT,
    prompt,
    maxRetries: 2,
  });

  const parsed = parseLlmJson(text) as {
    dependencyGraph?: DependencyGraph;
    generatedChains?: GeneratedChain[];
  };

  const graph: DependencyGraph = parsed.dependencyGraph || {
    nodes: [],
    edges: [],
  };
  const chains: GeneratedChain[] = (parsed.generatedChains || []).map(
    (ch) => ({
      name: ch.name || "未命名链",
      description: ch.description || "",
      type: ch.type || "business",
      steps: (ch.steps || []).map((s) => ({
        caseId: s.caseId || "",
        caseName: s.caseName || "",
        label: s.label || "",
        extractors: (s.extractors || []).map((e) => ({
          varName: e.varName || "",
          source: e.source || "body",
          expression: e.expression || "",
        })),
        injectors: (s.injectors || []).map((inj) => ({
          varName: inj.varName || "",
          target: inj.target || "header",
          expression: inj.expression || "",
        })),
        confidence: typeof s.confidence === "number" ? s.confidence : 0.5,
        reasoning: s.reasoning || "",
      })),
      overallConfidence: 0, // computed later
    }),
  );

  return { graph, chains };
}

// ── Rule-based fallback ───────────────────────────────

/**
 * 规则引擎：按 API 路径和 HTTP 方法推断基本依赖。
 * 模式：POST→GET→PUT→DELETE (CRUD) + auth chains
 */
export function ruleBasedGenerate(
  endpoints: ApiEndpoint[],
  cases: TestCase[],
): { graph: DependencyGraph; chains: GeneratedChain[] } {
  const log = createLogger("chain-gen-rules");

  // Group endpoints by resource (extract base path)
  const resourceMap = new Map<
    string,
    { resource: string; endpoints: ApiEndpoint[] }
  >();

  for (const ep of endpoints) {
    const resource = extractResource(ep.path);
    if (!resource) continue;
    const entry = resourceMap.get(resource) || {
      resource,
      endpoints: [],
    };
    entry.endpoints.push(ep);
    resourceMap.set(resource, entry);
  }

  const nodes: DependencyNode[] = [];
  const edges: DependencyEdge[] = [];
  const chains: GeneratedChain[] = [];

  // Build nodes
  for (const ep of endpoints) {
    const node: DependencyNode = {
      endpointId: ep.id,
      path: `${ep.method} ${ep.path}`,
      method: ep.method,
      produces: [],
      requires: [],
    };

    // POST typically produces an ID
    if (ep.method === "POST") {
      node.produces.push({
        variable: `${extractResource(ep.path) || "item"}Id`,
        expression: "$.data.id",
        type: "string",
      });
    }

    // GET/PUT/DELETE with path params require input
    if (
      ["GET", "PUT", "PATCH", "DELETE"].includes(ep.method) &&
      ep.pathParams.length > 0
    ) {
      for (const p of ep.pathParams) {
        node.requires.push({
          variable: p.name,
          target: "path",
          expression: p.name,
          required: true,
        });
      }
    }

    nodes.push(node);
  }

  // Build CRUD chains
  for (const [resource, entry] of resourceMap) {
    const methods = new Set(entry.endpoints.map((ep) => ep.method));
    const hasCRUD =
      methods.has("POST") &&
      methods.has("GET") &&
      (methods.has("PUT") || methods.has("PATCH")) &&
      methods.has("DELETE");

    if (!hasCRUD) continue;

    const crudOrder: Array<"POST" | "GET" | "PUT" | "PATCH" | "DELETE"> = [
      "POST",
      "GET",
      "PUT",
      "PATCH",
      "DELETE",
    ];
    const steps: GeneratedStep[] = [];
    const resourceName = resource.replace(/^\//, "").replace(/\//g, "-");
    const varName = `${resourceName}Id`;

    for (const method of crudOrder) {
      const ep = entry.endpoints.find((e) => e.method === method);
      if (!ep) continue;

      // Find a suitable test case
      const matchedCase = findBestCase(cases, ep);
      if (!matchedCase) continue;

      const step: GeneratedStep = {
        caseId: matchedCase.id,
        caseName: matchedCase.name,
        label: `${methodLabel(method)} ${resourceName}`,
        extractors: [],
        injectors: [],
        confidence: 0.6,
        reasoning: `规则引擎: ${method} ${ep.path} 属于 CRUD 模式`,
      };

      // POST extracts ID
      if (method === "POST") {
        step.extractors.push({
          varName,
          source: "body",
          expression: "$.data.id",
        });
      }

      // GET/PUT/PATCH/DELETE injects ID
      if (["GET", "PUT", "PATCH", "DELETE"].includes(method)) {
        const pathParam = ep.pathParams[0];
        if (pathParam) {
          step.injectors.push({
            varName,
            target: "path",
            expression: pathParam.name,
          });
        }
      }

      steps.push(step);
    }

    if (steps.length >= 2) {
      // Build edges
      const postEp = entry.endpoints.find((e) => e.method === "POST");
      if (postEp) {
        for (const ep of entry.endpoints) {
          if (ep.method !== "POST" && ep.pathParams.length > 0) {
            edges.push({
              from: postEp.id,
              to: ep.id,
              variable: varName,
              fromExpression: "$.data.id",
              toTarget: "path",
              toExpression: ep.pathParams[0]?.name || "id",
              confidence: 0.6,
            });
          }
        }
      }

      chains.push({
        name: `${resourceName} CRUD 链路`,
        description: `${resourceName} 资源的完整生命周期：${steps.map((s) => s.label).join(" → ")}`,
        type: "crud",
        steps,
        overallConfidence: 0.6,
      });
    }
  }

  // Build auth chain
  const authEndpoints = endpoints.filter((ep) => isAuthEndpoint(ep));
  if (authEndpoints.length > 0) {
    const authSteps: GeneratedStep[] = [];
    for (const ep of authEndpoints) {
      const matchedCase = findBestCase(cases, ep);
      if (!matchedCase) continue;

      const step: GeneratedStep = {
        caseId: matchedCase.id,
        caseName: matchedCase.name,
        label: `认证: ${ep.method} ${ep.path}`,
        extractors: [],
        injectors: [],
        confidence: 0.6,
        reasoning: `规则引擎: 识别为认证接口`,
      };

      // Login/register typically produces token
      if (ep.method === "POST") {
        step.extractors.push({
          varName: "token",
          source: "body",
          expression: "$.data.token",
        });
      }

      authSteps.push(step);
    }

    if (authSteps.length > 0) {
      chains.push({
        name: "认证流程",
        description: "认证相关接口的测试链路",
        type: "auth",
        steps: authSteps,
        overallConfidence: 0.6,
      });
    }
  }

  log.info(
    `规则引擎生成 ${chains.length} 条链 (${resourceMap.size} 个资源)`,
  );

  return { graph: { nodes, edges }, chains };
}

// ── Adopt: convert generated chains → formal TestChains ─

export interface AdoptRequest {
  chainIndexes: number[];
  modifications?: Record<
    string,
    {
      steps?: Record<
        string,
        {
          extractors?: GeneratedStepExtractor[];
          injectors?: GeneratedStepInjector[];
        }
      >;
    }
  >;
}

export interface AdoptedChain {
  chainId: string;
  name: string;
  steps: number;
}

export async function adoptChains(
  taskId: string,
  projectId: string,
  request: AdoptRequest,
): Promise<AdoptedChain[]> {
  const log = createLogger("chain-gen");

  // Load task from memory or storage
  let task: ChainGenTask | undefined = chainGenTasks.get(taskId);
  if (!task) {
    const stored = await storage.read<ChainGenTask>(COLLECTION, taskId);
    if (stored) task = stored;
  }
  if (!task) throw new Error("生成任务不存在");
  if (task.status !== "completed") throw new Error("任务尚未完成");
  if (task.projectId !== projectId) throw new Error("项目 ID 不匹配");

  const adopted: AdoptedChain[] = [];
  const now = new Date().toISOString();

  for (const idx of request.chainIndexes) {
    const generated = task.generatedChains[idx];
    if (!generated) {
      log.warn(`链索引 ${idx} 超出范围，跳过`);
      continue;
    }

    // Apply modifications if any
    const mods = request.modifications?.[String(idx)];

    const steps: TestChainStep[] = generated.steps.map((gs, stepIdx) => {
      const stepMod = mods?.steps?.[String(stepIdx)];

      const extractors = (stepMod?.extractors || gs.extractors).map((e) => ({
        varName: e.varName,
        source: e.source as "body" | "header" | "status",
        expression: e.expression,
        required: true,
      }));

      const injectors = (stepMod?.injectors || gs.injectors).map((inj) => ({
        varName: inj.varName,
        target: inj.target as "path" | "query" | "header" | "body",
        expression: inj.expression,
      }));

      return {
        id: uuid(),
        caseId: gs.caseId,
        label: gs.label,
        extractors,
        injectors,
        delay: 0,
      };
    });

    const chain: TestChain = {
      id: uuid(),
      projectId,
      name: generated.name,
      description: generated.description,
      steps,
      config: {
        continueOnFail: false,
        cleanupSteps: [],
      },
      createdAt: now,
      updatedAt: now,
    };

    await storage.write("test-chains", chain.id, chain);
    adopted.push({
      chainId: chain.id,
      name: chain.name,
      steps: chain.steps.length,
    });

    log.info(`采纳链: ${chain.name} (${chain.steps.length} 步)`);
  }

  return adopted;
}

// ── Utility functions ─────────────────────────────────

function extractResource(path: string): string | null {
  // /api/users/:id → /api/users
  // /api/v1/orders/:orderId/items → /api/v1/orders
  const cleaned = path.replace(/\/:[^/]+/g, "").replace(/\/\{[^}]+\}/g, "");
  const parts = cleaned.split("/").filter(Boolean);
  if (parts.length === 0) return null;
  // Return last meaningful segment as resource key
  return "/" + parts.join("/");
}

function isAuthEndpoint(ep: ApiEndpoint): boolean {
  const lower = ep.path.toLowerCase();
  return (
    /\/(auth|login|register|signup|signin|token|oauth)/.test(lower) ||
    (ep.summary || "").toLowerCase().includes("认证") ||
    (ep.summary || "").toLowerCase().includes("登录")
  );
}

function findBestCase(cases: TestCase[], ep: ApiEndpoint): TestCase | null {
  // Prefer positive + P0
  const epCases = cases.filter((tc) => tc.endpointId === ep.id);
  if (epCases.length === 0) return null;

  // Sort: positive first, then by priority
  const priorityOrder: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

  return epCases.sort((a, b) => {
    const aTags = safeTags(a.tags);
    const bTags = safeTags(b.tags);
    const aPositive = aTags.strategy.includes("positive") ? 0 : 1;
    const bPositive = bTags.strategy.includes("positive") ? 0 : 1;
    if (aPositive !== bPositive) return aPositive - bPositive;
    return (priorityOrder[aTags.priority] || 2) - (priorityOrder[bTags.priority] || 2);
  })[0];
}

function methodLabel(method: string): string {
  switch (method) {
    case "POST":
      return "创建";
    case "GET":
      return "获取";
    case "PUT":
    case "PATCH":
      return "更新";
    case "DELETE":
      return "删除";
    default:
      return method;
  }
}
