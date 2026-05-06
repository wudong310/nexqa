/**
 * Impact Analyzer — 从 API diff 映射到已有 TestCase 的影响范围
 * 支持 LLM 深度分析（可选）和规则引擎降级
 */

import type { TestCase, Settings } from "@nexqa/shared";
import { generateText } from "ai";
import { createLlmModel } from "./llm.js";
import { storage } from "./storage.js";
import type {
  ApiDiffResult,
  EndpointChange,
  EndpointModification,
} from "./api-diff-service.js";

// ── Types ─────────────────────────────────────────────

export interface ImpactedCase {
  caseId: string;
  caseName: string;
  method: string;
  path: string;
  priority: string;
  impact: string;
  aiSuggestion: string;
  autoFixable: boolean;
}

export interface ImpactedChain {
  chainId: string;
  chainName: string;
  affectedStep: string;
  cascadeRisk: string;
}

export interface NewCaseNeeded {
  path: string;
  method: string;
  description: string;
  estimatedCount: number;
}

export interface ImpactAnalysisResult {
  directCases: ImpactedCase[];
  indirectChains: ImpactedChain[];
  newCasesNeeded: NewCaseNeeded[];
}

// ── Rule-based impact matching ────────────────────────

/**
 * Match test cases by method + path pattern.
 * Converts parameterized paths (e.g., /users/{id}, /users/:id) to a regex for flexible matching.
 * Test case paths may contain actual values (e.g., /users/123) or template variables (e.g., /users/{{userId}}).
 */
function pathMatches(casePath: string, specPath: string): boolean {
  // Normalize: strip leading/trailing slashes, lowercase
  const normCase = casePath.replace(/\{\{[^}]+\}\}/g, "___VAR___").toLowerCase().replace(/\/+$/, "");
  const normSpec = specPath
    .replace(/\{[^}]+\}/g, "___VAR___")
    .replace(/:([a-zA-Z_]+)/g, "___VAR___")
    .toLowerCase()
    .replace(/\/+$/, "");

  // Direct exact match
  if (normCase === normSpec) return true;
  // Case path might have base URL prefix
  if (normCase.endsWith(normSpec)) return true;

  // Build regex from spec path: replace ___var___ with [^/]+ for flexible matching
  // Note: ___VAR___ became ___var___ after toLowerCase()
  const regexStr = normSpec
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")  // escape regex special chars first
    .replace(/___var___/g, "[^/]+");           // then replace placeholders (lowercased)
  try {
    const regex = new RegExp(`${regexStr}$`);
    return regex.test(normCase);
  } catch {
    return false;
  }
}

function ruleBasedImpact(
  diff: ApiDiffResult,
  testCases: TestCase[],
  testChains: any[],
): ImpactAnalysisResult {
  const directCases: ImpactedCase[] = [];
  const seenCaseIds = new Set<string>();

  // For modified endpoints
  for (const mod of diff.modified) {
    const matchedCases = testCases.filter(
      (tc) =>
        tc.request.method === mod.method &&
        pathMatches(tc.request.path, mod.path),
    );

    for (const tc of matchedCases) {
      if (seenCaseIds.has(tc.id)) continue;
      seenCaseIds.add(tc.id);

      const breakingChanges = mod.changes.filter((c) => c.breaking);
      const impact = breakingChanges.length > 0
        ? breakingChanges.map((c) => c.detail).join("; ")
        : mod.changes.map((c) => c.detail).join("; ");

      const autoFixable = mod.changes.some(
        (c) => c.type === "added" && c.field.startsWith("requestBody."),
      );

      const suggestion = autoFixable
        ? `自动添加新字段到请求体`
        : `需要手动检查和更新用例`;

      const tags = tc.tags as any;
      directCases.push({
        caseId: tc.id,
        caseName: tc.name,
        method: tc.request.method,
        path: tc.request.path,
        priority: tags?.priority || "P1",
        impact,
        aiSuggestion: suggestion,
        autoFixable,
      });
    }
  }

  // For removed endpoints — all matching cases are directly impacted
  for (const rem of diff.removed) {
    const matchedCases = testCases.filter(
      (tc) =>
        tc.request.method === rem.method &&
        pathMatches(tc.request.path, rem.path),
    );

    for (const tc of matchedCases) {
      if (seenCaseIds.has(tc.id)) continue;
      seenCaseIds.add(tc.id);

      const tags = tc.tags as any;
      directCases.push({
        caseId: tc.id,
        caseName: tc.name,
        method: tc.request.method,
        path: tc.request.path,
        priority: tags?.priority || "P1",
        impact: `接口 ${rem.method} ${rem.path} 已被删除，该用例将失败`,
        aiSuggestion: "考虑标记用例为废弃或删除",
        autoFixable: false,
      });
    }
  }

  // Indirect chain impact
  const indirectChains: ImpactedChain[] = [];
  const affectedPaths = new Set<string>();
  for (const mod of diff.modified) affectedPaths.add(`${mod.method} ${mod.path}`);
  for (const rem of diff.removed) affectedPaths.add(`${rem.method} ${rem.path}`);

  for (const chain of testChains) {
    const steps = chain.steps || [];
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (!step.caseId) continue;
      const tc = testCases.find((c) => c.id === step.caseId);
      if (!tc) continue;

      const key = `${tc.request.method} ${tc.request.path}`;
      // Check if any affected path matches
      for (const ap of affectedPaths) {
        const [method, ...pathParts] = ap.split(" ");
        const path = pathParts.join(" ");
        if (tc.request.method === method && pathMatches(tc.request.path, path)) {
          indirectChains.push({
            chainId: chain.id,
            chainName: chain.name,
            affectedStep: `步骤 ${i + 1} '${tc.name}'`,
            cascadeRisk: i < steps.length - 1
              ? `后续 ${steps.length - i - 1} 个步骤可能连锁失败`
              : "最后一步受影响，无连锁风险",
          });
          break;
        }
      }
    }
  }

  // New cases needed
  const newCasesNeeded: NewCaseNeeded[] = diff.added.map((ep) => ({
    path: ep.path,
    method: ep.method,
    description: ep.description || `新增接口 ${ep.method} ${ep.path}`,
    estimatedCount: 5,
  }));

  return { directCases, indirectChains, newCasesNeeded };
}

// ── LLM-enhanced impact analysis ──────────────────────

async function llmImpact(
  diff: ApiDiffResult,
  testCases: TestCase[],
  testChains: any[],
  ruleResult: ImpactAnalysisResult,
): Promise<ImpactAnalysisResult> {
  const settings = await storage.read<Settings>("", "settings");
  if (!settings?.llm) return ruleResult; // No LLM configured, return rule-based

  try {
    const model = createLlmModel(settings.llm);

    // Only send relevant cases (matching the affected methods/paths)
    const relevantCases = ruleResult.directCases.slice(0, 20);

    const prompt = `你是 NexQA 的 AI 回归分析引擎。分析 API 变更对现有测试用例的影响。

## API 变更
新增接口: ${diff.added.map((a) => `${a.method} ${a.path}`).join(", ") || "无"}
删除接口: ${diff.removed.map((r) => `${r.method} ${r.path}`).join(", ") || "无"}
修改接口: ${diff.modified.map((m) => `${m.method} ${m.path} (${m.changes.map((c) => c.detail).join("; ")})`).join("\n") || "无"}

## 已识别受影响用例 (${relevantCases.length} 个)
${relevantCases.map((c) => `- ${c.caseName}: ${c.impact}`).join("\n")}

## 请为每个受影响用例给出更精确的修复建议。

输出 JSON:
{
  "suggestions": [
    { "caseId": "...", "suggestion": "具体修复建议", "autoFixable": true/false }
  ],
  "additionalNewCases": [
    { "path": "...", "method": "...", "description": "...", "estimatedCount": 5 }
  ]
}`;

    const result = await generateText({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    });

    // Parse and merge LLM suggestions
    const text = result.text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.suggestions) {
        for (const sug of parsed.suggestions) {
          const idx = ruleResult.directCases.findIndex((c) => c.caseId === sug.caseId);
          if (idx >= 0) {
            ruleResult.directCases[idx].aiSuggestion = sug.suggestion;
            ruleResult.directCases[idx].autoFixable = sug.autoFixable ?? ruleResult.directCases[idx].autoFixable;
          }
        }
      }
      if (parsed.additionalNewCases) {
        ruleResult.newCasesNeeded.push(...parsed.additionalNewCases);
      }
    }
  } catch (err) {
    console.error("[impact-analyzer] LLM 分析失败，使用规则引擎结果:", (err as Error).message);
  }

  return ruleResult;
}

// ── Public API ────────────────────────────────────────

export async function analyzeImpact(
  projectId: string,
  diff: ApiDiffResult,
  useLlm: boolean = true,
): Promise<ImpactAnalysisResult> {
  // Load project test cases
  const allCases = await storage.list<TestCase>("test-cases");
  // We need to find cases that belong to endpoints in this project
  const allEndpoints = await storage.list<{ id: string; projectId: string }>("api-endpoints");
  const projectEndpointIds = new Set(
    allEndpoints.filter((e) => e.projectId === projectId).map((e) => e.id),
  );
  const projectCases = allCases.filter((tc) => tc.endpointId != null && projectEndpointIds.has(tc.endpointId));

  // Load test chains
  const allChains = await storage.list<any>("test-chains");
  const projectChains = allChains.filter((ch) => ch.projectId === projectId);

  // Rule-based analysis first
  const ruleResult = ruleBasedImpact(diff, projectCases, projectChains);

  // Enhance with LLM if available
  if (useLlm) {
    return llmImpact(diff, projectCases, projectChains, ruleResult);
  }

  return ruleResult;
}
