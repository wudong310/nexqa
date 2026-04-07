/**
 * AI 自动生成测试方案 — 核心服务
 *
 * 流程：
 * 1. 意图预分类（关键词匹配 → IntentType）
 * 2. 组装上下文（项目信息 + 用例统计 + 环境列表）
 * 3. LLM 可用 → 调用 LLM 深度理解意图 + 生成方案
 * 4. LLM 不可用 → 使用预置模板 + 关键词匹配
 * 5. 计算匹配统计（方案会匹配多少用例/链）
 * 6. 返回 PlanGenerationResult
 */

import type {
  BatchRun,
  Environment,
  Project,
  Settings,
  TestCase,
  TestCaseTags,
  TestChain,
  TestPlan,
  TestPlanCriteria,
  TestPlanExecution,
  TestPlanSelection,
} from "@nexqa/shared";

import { generateText } from "ai";
import { v4 as uuid } from "uuid";
import {
  PLAN_GEN_SYSTEM_PROMPT,
  buildPlanGenPrompt,
  type PlanGenContext,
} from "../prompts/plan-gen.js";
import { createLlmModel } from "./llm.js";
import { createLogger } from "./logger.js";
import { filterCasesBySelection } from "./plan-engine.js";
import { storage } from "./storage.js";

// ── Types ─────────────────────────────────────────────

export type IntentType =
  | "release"
  | "smoke"
  | "security"
  | "regression"
  | "full"
  | "module"
  | "quick"
  | "custom";

export interface IntentTemplate {
  matchPatterns: string[];
  defaultStages: PlanStage[];
  defaultSelection: TestPlanSelection;
  defaultExecution: Partial<TestPlanExecution>;
  defaultCriteria: Partial<TestPlanCriteria>;
  name: (date: string) => string;
  description: string;
}

export interface PlanStage {
  name: string;
  order: number;
  selection: TestPlanSelection;
  criteria: TestPlanCriteria;
  gate: boolean;
}

export interface GeneratedPlan {
  name: string;
  description: string;
  stages: PlanStage[];
  selection: TestPlanSelection;
  execution: TestPlanExecution;
  criteria: TestPlanCriteria;
  reasoning: string;
}

export interface ParsedIntent {
  type: IntentType;
  scope: string;
  urgency: "normal" | "quick";
}

export interface MatchStats {
  totalCases: number;
  matchedCases: number;
  matchedChains: number;
}

export interface PlanGenerationResult {
  id: string;
  projectId: string;
  userIntent: string;
  parsedIntent: ParsedIntent;
  generatedPlan: GeneratedPlan;
  matchStats: MatchStats;
  createdAt: string;
}

// ── Intent Templates ──────────────────────────────────

const INTENT_TEMPLATES: Record<IntentType, IntentTemplate> = {
  release: {
    matchPatterns: ["发版", "release", "上线", "部署", "deploy", "发布"],
    defaultStages: [
      {
        name: "冒烟测试",
        order: 1,
        selection: {
          tags: { priority: ["P0"], strategy: ["positive"], phase: ["smoke"] },
        },
        criteria: { minPassRate: 1.0, maxP0Fails: 0, maxP1Fails: 0 },
        gate: true,
      },
      {
        name: "功能回归",
        order: 2,
        selection: {
          tags: { priority: ["P0", "P1", "P2"], purpose: ["functional", "auth"] },
        },
        criteria: { minPassRate: 0.95, maxP0Fails: 0, maxP1Fails: 3 },
        gate: true,
      },
      {
        name: "安全检查",
        order: 3,
        selection: {
          tags: { purpose: ["security"] },
        },
        criteria: { minPassRate: 0.9, maxP0Fails: 0, maxP1Fails: 5 },
        gate: false,
      },
    ],
    defaultSelection: { tags: { priority: ["P0", "P1", "P2"] } },
    defaultExecution: {
      stages: true,
      concurrency: 3,
      retryOnFail: 1,
      timeoutMs: 30000,
      stopOnGateFail: true,
    },
    defaultCriteria: { minPassRate: 0.95, maxP0Fails: 0, maxP1Fails: 0 },
    name: (d) => `发版检查 - ${d}`,
    description: "发版前完整质量验证：冒烟→功能回归→安全检查",
  },
  smoke: {
    matchPatterns: ["冒烟", "smoke", "快速验证核心", "基本功能"],
    defaultStages: [],
    defaultSelection: {
      tags: { priority: ["P0"], strategy: ["positive"], phase: ["smoke"] },
    },
    defaultExecution: {
      stages: false,
      concurrency: 1,
      retryOnFail: 0,
      timeoutMs: 30000,
      stopOnGateFail: true,
    },
    defaultCriteria: { minPassRate: 1.0, maxP0Fails: 0, maxP1Fails: 0 },
    name: (d) => `冒烟测试 - ${d}`,
    description: "快速核心功能验证，P0 正向用例",
  },
  security: {
    matchPatterns: ["安全", "security", "漏洞", "扫描", "渗透"],
    defaultStages: [],
    defaultSelection: {
      tags: { purpose: ["security"] },
    },
    defaultExecution: {
      stages: false,
      concurrency: 1,
      retryOnFail: 0,
      timeoutMs: 30000,
      stopOnGateFail: false,
    },
    defaultCriteria: { minPassRate: 0.9, maxP0Fails: 0, maxP1Fails: 5 },
    name: (d) => `安全测试 - ${d}`,
    description: "安全专项测试，覆盖安全类用例",
  },
  regression: {
    matchPatterns: ["回归", "regression", "变更影响", "改了测一下"],
    defaultStages: [
      {
        name: "冒烟验证",
        order: 1,
        selection: {
          tags: { priority: ["P0"], strategy: ["positive"], phase: ["smoke"] },
        },
        criteria: { minPassRate: 1.0, maxP0Fails: 0, maxP1Fails: 0 },
        gate: true,
      },
      {
        name: "回归测试",
        order: 2,
        selection: {
          tags: { priority: ["P0", "P1", "P2"], phase: ["regression", "full"] },
        },
        criteria: { minPassRate: 0.95, maxP0Fails: 0, maxP1Fails: 3 },
        gate: true,
      },
    ],
    defaultSelection: {
      tags: { priority: ["P0", "P1", "P2"], phase: ["regression", "full"] },
    },
    defaultExecution: {
      stages: true,
      concurrency: 3,
      retryOnFail: 1,
      timeoutMs: 30000,
      stopOnGateFail: true,
    },
    defaultCriteria: { minPassRate: 0.95, maxP0Fails: 0, maxP1Fails: 3 },
    name: (d) => `回归测试 - ${d}`,
    description: "冒烟验证 + 回归测试，确保变更未引入新问题",
  },
  full: {
    matchPatterns: ["全量", "full", "完整", "所有"],
    defaultStages: [
      {
        name: "冒烟测试",
        order: 1,
        selection: {
          tags: { priority: ["P0"], strategy: ["positive"], phase: ["smoke"] },
        },
        criteria: { minPassRate: 1.0, maxP0Fails: 0, maxP1Fails: 0 },
        gate: true,
      },
      {
        name: "全量功能",
        order: 2,
        selection: {
          tags: { priority: ["P0", "P1", "P2", "P3"] },
        },
        criteria: { minPassRate: 0.9, maxP0Fails: 0, maxP1Fails: 5 },
        gate: false,
      },
    ],
    defaultSelection: { tags: { priority: ["P0", "P1", "P2", "P3"] } },
    defaultExecution: {
      stages: true,
      concurrency: 5,
      retryOnFail: 1,
      timeoutMs: 30000,
      stopOnGateFail: true,
    },
    defaultCriteria: { minPassRate: 0.9, maxP0Fails: 0, maxP1Fails: 5 },
    name: (d) => `全量测试 - ${d}`,
    description: "全量测试覆盖所有优先级用例",
  },
  module: {
    matchPatterns: ["只测", "模块", "module"],
    defaultStages: [],
    defaultSelection: { tags: { priority: ["P0", "P1", "P2"] } },
    defaultExecution: {
      stages: false,
      concurrency: 3,
      retryOnFail: 1,
      timeoutMs: 30000,
      stopOnGateFail: false,
    },
    defaultCriteria: { minPassRate: 0.95, maxP0Fails: 0, maxP1Fails: 3 },
    name: (d) => `模块测试 - ${d}`,
    description: "模块级测试，按指定范围筛选",
  },
  quick: {
    matchPatterns: ["快速", "quick", "简单跑一下"],
    defaultStages: [],
    defaultSelection: {
      tags: { priority: ["P0", "P1"], strategy: ["positive"] },
    },
    defaultExecution: {
      stages: false,
      concurrency: 3,
      retryOnFail: 0,
      timeoutMs: 30000,
      stopOnGateFail: false,
    },
    defaultCriteria: { minPassRate: 0.9, maxP0Fails: 0, maxP1Fails: 5 },
    name: (d) => `快速验证 - ${d}`,
    description: "快速验证 P0+P1 正向用例",
  },
  custom: {
    matchPatterns: [],
    defaultStages: [],
    defaultSelection: { tags: { priority: ["P0", "P1", "P2"] } },
    defaultExecution: {
      stages: false,
      concurrency: 3,
      retryOnFail: 0,
      timeoutMs: 30000,
      stopOnGateFail: false,
    },
    defaultCriteria: { minPassRate: 0.9, maxP0Fails: 0, maxP1Fails: 5 },
    name: (d) => `自定义测试 - ${d}`,
    description: "自定义测试方案",
  },
};

// ── Intent Classification ─────────────────────────────

export function classifyIntent(input: string): IntentType {
  const lower = input.toLowerCase();
  for (const [type, template] of Object.entries(INTENT_TEMPLATES)) {
    for (const pattern of template.matchPatterns) {
      if (lower.includes(pattern.toLowerCase())) {
        return type as IntentType;
      }
    }
  }
  return "custom";
}

// ── Get all templates (for GET /templates) ────────────

export interface TemplateInfo {
  type: IntentType;
  name: string;
  description: string;
  matchPatterns: string[];
  hasStages: boolean;
  stageNames: string[];
}

export function getTemplateList(): TemplateInfo[] {
  return Object.entries(INTENT_TEMPLATES).map(([type, t]) => ({
    type: type as IntentType,
    name: t.name(today()),
    description: t.description,
    matchPatterns: t.matchPatterns,
    hasStages: t.defaultStages.length > 0,
    stageNames: t.defaultStages.map((s) => s.name),
  }));
}

// ── Context Building ──────────────────────────────────

function safeTags(
  tags: TestCaseTags | undefined | null,
): TestCaseTags {
  if (!tags) {
    return {
      purpose: ["functional"],
      strategy: ["positive"],
      phase: ["full"],
      priority: "P1",
    };
  }
  return tags;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

interface ProjectContext {
  project: Project;
  projectCases: TestCase[];
  chains: TestChain[];
  environments: Environment[];
  lastBatch: BatchRun | null;
}

async function loadProjectContext(projectId: string): Promise<ProjectContext> {
  const project = await storage.read<Project>("projects", projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  const allCases = await storage.list<TestCase>("test-cases");
  // 加载所有 endpoints 来获得 projectId 对应的 endpointIds
  const allEndpoints = await storage.list<{ id: string; projectId: string }>(
    "api-endpoints",
  );
  const projectEndpointIds = new Set(
    allEndpoints
      .filter((ep) => ep.projectId === projectId)
      .map((ep) => ep.id),
  );
  const projectCases = allCases.filter((tc) =>
    projectEndpointIds.has(tc.endpointId),
  );

  const allChains = await storage.list<TestChain>("test-chains");
  const chains = allChains.filter((ch) => ch.projectId === projectId);

  const allEnvs = await storage.list<Environment>("environments");
  const environments = allEnvs.filter((e) => e.projectId === projectId);

  const allBatches = await storage.list<BatchRun>("batch-runs");
  const projectBatches = allBatches
    .filter((b) => b.projectId === projectId)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  const lastBatch = projectBatches[0] || null;

  return { project, projectCases, chains, environments, lastBatch };
}

function buildTagDistribution(cases: TestCase[]): string {
  const purposeCount: Record<string, number> = {};
  const strategyCount: Record<string, number> = {};
  const priorityCount: Record<string, number> = {};
  const phaseCount: Record<string, number> = {};

  for (const tc of cases) {
    const tags = safeTags(tc.tags as TestCaseTags);
    for (const p of tags.purpose) {
      purposeCount[p] = (purposeCount[p] || 0) + 1;
    }
    for (const s of tags.strategy) {
      strategyCount[s] = (strategyCount[s] || 0) + 1;
    }
    for (const p of tags.phase) {
      phaseCount[p] = (phaseCount[p] || 0) + 1;
    }
    priorityCount[tags.priority] = (priorityCount[tags.priority] || 0) + 1;
  }

  const fmt = (m: Record<string, number>) =>
    Object.entries(m)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");

  return [
    `purpose: ${fmt(purposeCount)}`,
    `strategy: ${fmt(strategyCount)}`,
    `phase: ${fmt(phaseCount)}`,
    `priority: ${fmt(priorityCount)}`,
  ].join("\n  ");
}

function buildPlanGenContext(ctx: ProjectContext): PlanGenContext {
  return {
    projectName: ctx.project.name,
    totalCases: ctx.projectCases.length,
    tagDistribution: buildTagDistribution(ctx.projectCases),
    chainList:
      ctx.chains.length > 0
        ? ctx.chains
            .map((ch) => `${ch.name} (${ch.steps.length} 步)`)
            .join(", ")
        : "无",
    environmentList:
      ctx.environments.length > 0
        ? ctx.environments.map((e) => `${e.name} (${e.slug})`).join(", ")
        : "无",
    lastBatchSummary: ctx.lastBatch
      ? `${ctx.lastBatch.name}: 通过 ${ctx.lastBatch.passedCases}/${ctx.lastBatch.totalCases}`
      : "无历史数据",
    activeEnvironmentId:
      (ctx.project as Record<string, unknown>).activeEnvironmentId as
        | string
        | null ?? null,
  };
}

// ── Template-based plan generation (rule engine) ──────

function generatePlanFromTemplate(
  intentType: IntentType,
  ctx: ProjectContext,
  environmentId: string | null,
): GeneratedPlan {
  const template = INTENT_TEMPLATES[intentType];
  const date = today();
  const effectiveEnvId =
    environmentId ||
    ((ctx.project as Record<string, unknown>).activeEnvironmentId as
      | string
      | null) ||
    (ctx.environments[0]?.id ?? null);

  // 给 stages 中注入已有的 chainIds
  const stages = template.defaultStages.map((s) => {
    // 功能回归阶段注入测试链
    if (
      s.name.includes("功能") ||
      s.name.includes("回归") ||
      s.name.includes("全量")
    ) {
      return {
        ...s,
        selection: {
          ...s.selection,
          chainIds: ctx.chains.map((ch) => ch.id),
        },
      };
    }
    return s;
  });

  return {
    name: template.name(date),
    description: template.description,
    stages,
    selection: template.defaultSelection,
    execution: {
      environmentId: effectiveEnvId,
      stages: template.defaultExecution.stages ?? stages.length > 0,
      concurrency: template.defaultExecution.concurrency ?? 3,
      retryOnFail: template.defaultExecution.retryOnFail ?? 0,
      timeoutMs: template.defaultExecution.timeoutMs ?? 30000,
      stopOnGateFail: template.defaultExecution.stopOnGateFail ?? true,
    },
    criteria: {
      minPassRate: template.defaultCriteria.minPassRate ?? 0.9,
      maxP0Fails: template.defaultCriteria.maxP0Fails ?? 0,
      maxP1Fails: template.defaultCriteria.maxP1Fails ?? 5,
    },
    reasoning: `${intentType} 场景使用预置模板生成：${template.description}`,
  };
}

// ── LLM-based plan generation ─────────────────────────

function parseLlmJson(text: string): unknown {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned
      .replace(/^```(?:json)?\s*\n?/, "")
      .replace(/\n?```\s*$/, "");
  }
  return JSON.parse(cleaned);
}

async function getLlmConfig(): Promise<Settings["llm"] | null> {
  const raw = await storage.readRaw("settings.json");
  if (!raw) return null;
  const settings = JSON.parse(raw) as Settings;
  return settings.llm || null;
}

async function llmGeneratePlan(
  userIntent: string,
  ctx: ProjectContext,
  environmentId: string | null,
  log: ReturnType<typeof createLogger>,
): Promise<{ parsedIntent: ParsedIntent; plan: GeneratedPlan }> {
  const llmConfig = await getLlmConfig();
  if (!llmConfig) throw new Error("LLM not configured");

  const planCtx = buildPlanGenContext(ctx);
  const prompt = buildPlanGenPrompt(userIntent, planCtx);

  log.info(`调用 LLM 生成测试方案，意图: "${userIntent}"`);
  const model = createLlmModel(llmConfig);
  const { text } = await generateText({
    model,
    system: PLAN_GEN_SYSTEM_PROMPT,
    prompt,
    maxRetries: 2,
  });

  const parsed = parseLlmJson(text) as {
    parsedIntent: ParsedIntent;
    plan: {
      name: string;
      description: string;
      stages?: PlanStage[];
      execution: Record<string, unknown>;
      criteria: Record<string, unknown>;
      reasoning: string;
    };
  };

  const effectiveEnvId =
    environmentId ||
    (parsed.plan.execution?.environmentId as string | null) ||
    ((ctx.project as Record<string, unknown>).activeEnvironmentId as
      | string
      | null) ||
    (ctx.environments[0]?.id ?? null);

  // Normalize stages
  const stages: PlanStage[] = (parsed.plan.stages || []).map((s, i) => ({
    name: s.name,
    order: s.order ?? i + 1,
    selection: s.selection || {},
    criteria: {
      minPassRate: s.criteria?.minPassRate ?? 0.9,
      maxP0Fails: s.criteria?.maxP0Fails ?? 0,
      maxP1Fails: s.criteria?.maxP1Fails ?? 5,
    },
    gate: s.gate ?? false,
  }));

  // Build selection from stages or use default
  const selection: TestPlanSelection = stages.length > 0
    ? mergeStageSelections(stages)
    : (parsed.plan as unknown as { selection?: TestPlanSelection }).selection || { tags: { priority: ["P0", "P1", "P2"] } };

  return {
    parsedIntent: {
      type: parsed.parsedIntent?.type || "custom",
      scope: parsed.parsedIntent?.scope || "all",
      urgency: parsed.parsedIntent?.urgency || "normal",
    },
    plan: {
      name: parsed.plan.name || `测试方案 - ${today()}`,
      description: parsed.plan.description || "",
      stages,
      selection,
      execution: {
        environmentId: effectiveEnvId,
        stages:
          (parsed.plan.execution?.stages as boolean) ?? stages.length > 0,
        concurrency: (parsed.plan.execution?.concurrency as number) ?? 3,
        retryOnFail: (parsed.plan.execution?.retryOnFail as number) ?? 0,
        timeoutMs: (parsed.plan.execution?.timeoutMs as number) ?? 30000,
        stopOnGateFail:
          (parsed.plan.execution?.stopOnGateFail as boolean) ?? true,
      },
      criteria: {
        minPassRate: (parsed.plan.criteria?.minPassRate as number) ?? 0.95,
        maxP0Fails: (parsed.plan.criteria?.maxP0Fails as number) ?? 0,
        maxP1Fails: (parsed.plan.criteria?.maxP1Fails as number) ?? 3,
      },
      reasoning: parsed.plan.reasoning || "",
    },
  };
}

/** 合并多阶段的 selection 为一个整体 selection */
function mergeStageSelections(stages: PlanStage[]): TestPlanSelection {
  const priorities = new Set<string>();
  const purposes = new Set<string>();
  const strategies = new Set<string>();
  const phases = new Set<string>();
  const chainIds = new Set<string>();

  for (const stage of stages) {
    const tags = stage.selection.tags;
    if (tags?.priority) for (const p of tags.priority) priorities.add(p);
    if (tags?.purpose) for (const p of tags.purpose) purposes.add(p);
    if (tags?.strategy) for (const s of tags.strategy) strategies.add(s);
    if (tags?.phase) for (const p of tags.phase) phases.add(p);
    if (stage.selection.chainIds) {
      for (const id of stage.selection.chainIds) chainIds.add(id);
    }
  }

  return {
    tags: {
      ...(priorities.size > 0 && { priority: [...priorities] as TestPlanSelection["tags"] extends { priority?: infer P } ? P : never }),
      ...(purposes.size > 0 && { purpose: [...purposes] as unknown as TestPlanSelection["tags"] extends { purpose?: infer P } ? P : never }),
      ...(strategies.size > 0 && { strategy: [...strategies] as unknown as TestPlanSelection["tags"] extends { strategy?: infer P } ? P : never }),
      ...(phases.size > 0 && { phase: [...phases] as unknown as TestPlanSelection["tags"] extends { phase?: infer P } ? P : never }),
    },
    ...(chainIds.size > 0 && { chainIds: [...chainIds] }),
  } as TestPlanSelection;
}

// ── Match Statistics ──────────────────────────────────

function computeMatchStats(
  plan: GeneratedPlan,
  projectCases: TestCase[],
  chains: TestChain[],
): MatchStats {
  // 用整体 selection 计算匹配用例数
  const matchedCases = filterCasesBySelection(projectCases, plan.selection);

  // 如果有 stages，把每个 stage 的用例也加进来
  const matchedIds = new Set(matchedCases.map((c) => c.id));
  for (const stage of plan.stages) {
    const stageCases = filterCasesBySelection(projectCases, stage.selection);
    for (const sc of stageCases) matchedIds.add(sc.id);
  }

  // 链匹配
  const planChainIds = new Set<string>();
  if (plan.selection.chainIds) {
    for (const id of plan.selection.chainIds) planChainIds.add(id);
  }
  for (const stage of plan.stages) {
    if (stage.selection.chainIds) {
      for (const id of stage.selection.chainIds) planChainIds.add(id);
    }
  }
  const matchedChains = chains.filter((ch) => planChainIds.has(ch.id)).length;

  return {
    totalCases: projectCases.length,
    matchedCases: matchedIds.size,
    matchedChains,
  };
}

// ── Public API ────────────────────────────────────────

const COLLECTION = "plan-generations";

/**
 * 根据自然语言意图生成测试方案
 */
export async function generatePlanFromIntent(
  projectId: string,
  userIntent: string,
  environmentId?: string | null,
): Promise<PlanGenerationResult> {
  const log = createLogger("plan-generator");
  log.info(`生成测试方案: projectId=${projectId}, intent="${userIntent}"`);

  // 1. 加载项目上下文
  const ctx = await loadProjectContext(projectId);

  // 2. 意图预分类
  const ruleIntentType = classifyIntent(userIntent);
  log.info(`规则引擎意图分类: ${ruleIntentType}`);

  // 3. 尝试 LLM 生成，失败降级到规则引擎
  let parsedIntent: ParsedIntent;
  let generatedPlan: GeneratedPlan;

  const llmConfig = await getLlmConfig();
  if (llmConfig) {
    try {
      const llmResult = await llmGeneratePlan(
        userIntent,
        ctx,
        environmentId ?? null,
        log,
      );
      parsedIntent = llmResult.parsedIntent;
      generatedPlan = llmResult.plan;
      log.info(`LLM 生成成功: type=${parsedIntent.type}`);
    } catch (err) {
      log.warn(
        `LLM 生成失败，降级到规则引擎: ${err instanceof Error ? err.message : err}`,
      );
      parsedIntent = { type: ruleIntentType, scope: "all", urgency: "normal" };
      generatedPlan = generatePlanFromTemplate(
        ruleIntentType,
        ctx,
        environmentId ?? null,
      );
    }
  } else {
    log.info("未配置 LLM，使用规则引擎生成");
    parsedIntent = { type: ruleIntentType, scope: "all", urgency: "normal" };
    generatedPlan = generatePlanFromTemplate(
      ruleIntentType,
      ctx,
      environmentId ?? null,
    );
  }

  // 4. 计算匹配统计
  const matchStats = computeMatchStats(
    generatedPlan,
    ctx.projectCases,
    ctx.chains,
  );
  log.info(
    `匹配统计: ${matchStats.matchedCases}/${matchStats.totalCases} 用例, ${matchStats.matchedChains} 链`,
  );

  // 5. 存储结果
  const result: PlanGenerationResult = {
    id: uuid(),
    projectId,
    userIntent,
    parsedIntent,
    generatedPlan,
    matchStats,
    createdAt: new Date().toISOString(),
  };

  await storage.write(COLLECTION, result.id, result);
  log.info(`方案生成完成: ${result.id}`);
  return result;
}

/**
 * 采纳 AI 生成的方案，创建正式 TestPlan
 */
export async function adoptPlan(
  generationId: string,
  modifications?: Partial<{
    name: string;
    description: string;
    execution: Partial<TestPlanExecution>;
    criteria: Partial<TestPlanCriteria>;
  }>,
): Promise<TestPlan> {
  const log = createLogger("plan-generator");
  const gen = await storage.read<PlanGenerationResult>(
    COLLECTION,
    generationId,
  );
  if (!gen) throw new Error(`Plan generation ${generationId} not found`);

  const plan = gen.generatedPlan;
  const now = new Date().toISOString();

  const testPlan: TestPlan = {
    id: uuid(),
    projectId: gen.projectId,
    name: modifications?.name || plan.name,
    description: modifications?.description || plan.description,
    selection: plan.selection,
    execution: {
      ...plan.execution,
      ...(modifications?.execution || {}),
    },
    criteria: {
      ...plan.criteria,
      ...(modifications?.criteria || {}),
    },
    createdAt: now,
    updatedAt: now,
  };

  await storage.write("test-plans", testPlan.id, testPlan);
  log.info(`方案已采纳: ${testPlan.id} (${testPlan.name})`);
  return testPlan;
}

export { INTENT_TEMPLATES };
