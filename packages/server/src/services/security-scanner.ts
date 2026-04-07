/**
 * security-scanner.ts — 安全扫描服务（核心编排）
 *
 * 整体流程：
 * 1. 创建 SecurityScan (status: analyzing)
 * 2. 攻击面识别（LLM 或规则引擎降级）
 * 3. 根据攻击面 + 内置 payload 库生成安全测试用例
 * 4. 执行安全用例，收集结果
 * 5. 分析结果，生成安全报告
 * 6. 更新状态为 completed
 */

import type { ApiEndpoint, Settings, TestCase } from "@nexqa/shared";
import { generateText } from "ai";
import { v4 as uuid } from "uuid";

import { createLlmModel } from "./llm.js";
import { createLogger } from "./logger.js";
import {
  CWE_MAP,
  OWASP_TOP_10,
  REMEDIATION_TEMPLATES,
  SECURITY_PAYLOADS,
} from "./security-payloads.js";
import { safeFetch } from "./safe-fetch.js";
import type {
  AttackSurface,
  AttackVector,
  SecurityFinding,
  SecurityReport,
  SecurityScan,
  SecurityTestResult,
  SecurityTestType,
  SecurityPayload,
  OwaspCoverage,
  DetectRule,
} from "./security-types.js";
import { storage } from "./storage.js";
import {
  SECURITY_ANALYSIS_SYSTEM_PROMPT,
  buildAttackSurfacePrompt,
  buildSecurityReportPrompt,
} from "../prompts/security-prompts.js";

const COLLECTION = "security-scans";
const log = createLogger("security-scanner");

// ── JSON 安全处理 ─────────────────────────────────────

/**
 * 清理值中的控制字符（\x00-\x1f 除 \t \n \r 外全部移除，
 * \t \n \r 替换为可见转义序列），确保 JSON 序列化安全。
 */
function sanitizeControlChars(value: unknown): unknown {
  if (typeof value === "string") {
    // 将 \t \n \r 替换为可读转义表示，删除其余控制字符
    return value
      .replace(/\t/g, "\\t")
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r")
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeControlChars);
  }
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = sanitizeControlChars(v);
    }
    return result;
  }
  return value;
}

// ── 公共接口 ──────────────────────────────────────────

export interface StartScanOptions {
  projectId: string;
  environmentId: string;
  scope: "all" | "selected";
  endpointIds?: string[];
  testTypes?: SecurityTestType[];
}

/**
 * 启动安全扫描（异步执行）
 */
export async function startSecurityScan(
  options: StartScanOptions,
): Promise<SecurityScan> {
  const scanId = uuid();
  const scan: SecurityScan = {
    id: scanId,
    projectId: options.projectId,
    environmentId: options.environmentId,
    scope: options.scope,
    endpointIds: options.endpointIds,
    testTypes: options.testTypes,
    attackSurfaces: [],
    generatedCaseIds: [],
    status: "analyzing",
    progress: { phase: "初始化", current: 0, total: 0 },
    createdAt: new Date().toISOString(),
  };

  await storage.write(COLLECTION, scanId, scan);

  // 异步执行扫描流程
  runScanPipeline(scan).catch((err) => {
    log.error(`扫描 ${scanId} 失败`, err);
  });

  return scan;
}

/**
 * 获取扫描状态
 */
export async function getScanStatus(
  scanId: string,
): Promise<SecurityScan | null> {
  return storage.read<SecurityScan>(COLLECTION, scanId);
}

/**
 * 获取项目的所有安全扫描
 */
export async function listProjectScans(
  projectId: string,
): Promise<SecurityScan[]> {
  const all = await storage.list<SecurityScan>(COLLECTION);
  return all
    .filter((s) => s.projectId === projectId)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
}

/**
 * 获取攻击面分析（基于项目的 API 端点）
 */
export async function getAttackSurface(
  projectId: string,
): Promise<AttackSurface[]> {
  const endpoints = await loadProjectEndpoints(projectId);
  if (endpoints.length === 0) return [];
  return analyzeAttackSurfaces(endpoints, null);
}

// ── 扫描流水线 ────────────────────────────────────────

async function runScanPipeline(scan: SecurityScan): Promise<void> {
  try {
    // 1. 加载项目端点
    const allEndpoints = await loadProjectEndpoints(scan.projectId);
    const endpoints =
      scan.scope === "selected" && scan.endpointIds?.length
        ? allEndpoints.filter((ep) => scan.endpointIds!.includes(ep.id))
        : allEndpoints;

    if (endpoints.length === 0) {
      scan.status = "failed";
      scan.error = "项目没有 API 端点，无法进行安全扫描";
      await storage.write(COLLECTION, scan.id, scan);
      return;
    }

    // 2. 加载环境配置
    const environment = await storage.read<{
      id: string;
      baseURL: string;
      headers: Record<string, string>;
    }>("environments", scan.environmentId);
    if (!environment) {
      scan.status = "failed";
      scan.error = "环境不存在";
      await storage.write(COLLECTION, scan.id, scan);
      return;
    }

    // 3. 攻击面分析
    scan.status = "analyzing";
    scan.progress = {
      phase: "攻击面分析",
      current: 0,
      total: endpoints.length,
    };
    await storage.write(COLLECTION, scan.id, scan);

    const settings = await loadSettings();
    scan.attackSurfaces = await analyzeAttackSurfaces(
      endpoints,
      settings,
      scan.testTypes,
    );
    scan.progress = {
      phase: "攻击面分析完成",
      current: endpoints.length,
      total: endpoints.length,
    };
    await storage.write(COLLECTION, scan.id, scan);

    // 4. 生成安全测试用例
    scan.status = "generating";
    const totalVectors = scan.attackSurfaces.reduce(
      (sum, s) => sum + s.vectors.length,
      0,
    );
    scan.progress = {
      phase: "生成安全用例",
      current: 0,
      total: totalVectors,
    };
    await storage.write(COLLECTION, scan.id, scan);

    const generatedCases = generateSecurityCases(scan.attackSurfaces);
    scan.generatedCaseIds = generatedCases.map((c) => c.id);

    // 保存生成的用例
    for (const tc of generatedCases) {
      await storage.write("test-cases", tc.id, tc);
    }
    scan.progress = {
      phase: "用例生成完成",
      current: generatedCases.length,
      total: generatedCases.length,
    };
    await storage.write(COLLECTION, scan.id, scan);

    // 5. 执行安全用例
    scan.status = "executing";
    scan.progress = {
      phase: "执行安全测试",
      current: 0,
      total: generatedCases.length,
    };
    await storage.write(COLLECTION, scan.id, scan);

    const testResults = await executeSecurityTests(
      generatedCases,
      scan.attackSurfaces,
      environment,
      scan,
    );

    // 6. 生成安全报告
    scan.status = "reporting";
    scan.progress = { phase: "生成安全报告", current: 0, total: 1 };
    await storage.write(COLLECTION, scan.id, scan);

    const matchedResults = testResults.filter((r) => r.ruleMatched);
    scan.report = await generateSecurityReport(
      testResults,
      matchedResults,
      scan.attackSurfaces,
      settings,
    );

    // 7. 完成
    scan.status = "completed";
    scan.completedAt = new Date().toISOString();
    scan.progress = undefined;
    await storage.write(COLLECTION, scan.id, scan);

    log.info(
      `扫描 ${scan.id} 完成：${scan.report.summary.vulnerabilities} 个漏洞`,
    );
  } catch (err) {
    scan.status = "failed";
    scan.error = err instanceof Error ? err.message : String(err);
    scan.progress = undefined;
    await storage.write(COLLECTION, scan.id, scan);
    log.error(`扫描 ${scan.id} 执行失败`, err);
  }
}

// ── 攻击面分析 ────────────────────────────────────────

async function analyzeAttackSurfaces(
  endpoints: ApiEndpoint[],
  settings: Settings | null,
  filterTypes?: SecurityTestType[],
): Promise<AttackSurface[]> {
  const llmConfig = settings?.llm;

  // 优先尝试 LLM 分析
  if (llmConfig) {
    try {
      return await llmAnalyzeAttackSurfaces(endpoints, llmConfig, filterTypes);
    } catch (err) {
      log.warn("LLM 攻击面分析失败，降级为规则引擎", err);
    }
  }

  // 规则引擎降级
  return ruleBasedAttackSurfaces(endpoints, filterTypes);
}

async function llmAnalyzeAttackSurfaces(
  endpoints: ApiEndpoint[],
  llmConfig: { provider: string; apiKey: string; model: string; baseURL?: string },
  filterTypes?: SecurityTestType[],
): Promise<AttackSurface[]> {
  const apiDocSummary = endpoints
    .map((ep) => {
      const params = [
        ...ep.pathParams.map((p) => `path.${p.name}: ${p.type}`),
        ...ep.queryParams.map((p) => `query.${p.name}: ${p.type}`),
        ...ep.headers.map((p) => `header.${p.name}: ${p.type}`),
      ];
      const bodyStr = ep.body
        ? `body: ${JSON.stringify(ep.body.example || ep.body.schema || "unknown")}`
        : "";
      return `[${ep.id}] ${ep.method} ${ep.path} — ${ep.summary}\n  参数: ${params.join(", ") || "无"}\n  ${bodyStr}`;
    })
    .join("\n\n");

  const model = createLlmModel(llmConfig as Parameters<typeof createLlmModel>[0]);
  const { text } = await generateText({
    model,
    system: SECURITY_ANALYSIS_SYSTEM_PROMPT,
    prompt: buildAttackSurfacePrompt(apiDocSummary),
    maxTokens: 4096,
    temperature: 0.2,
  });

  const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  const parsed = JSON.parse(cleaned) as Array<{
    endpointId: string;
    path: string;
    method: string;
    vectors: Array<{
      type: SecurityTestType;
      target: string;
      risk: "high" | "medium" | "low";
      reasoning: string;
    }>;
  }>;

  // 添加 payloadCount 并过滤类型
  return parsed.map((surface) => ({
    ...surface,
    vectors: surface.vectors
      .filter((v) => !filterTypes?.length || filterTypes.includes(v.type))
      .map((v) => ({
        ...v,
        payloadCount: (SECURITY_PAYLOADS[v.type] || []).length,
      })),
  })).filter((s) => s.vectors.length > 0);
}

/**
 * 规则引擎降级 — 按参数类型/名称 pattern 匹配攻击面
 */
export function ruleBasedAttackSurfaces(
  endpoints: ApiEndpoint[],
  filterTypes?: SecurityTestType[],
): AttackSurface[] {
  const surfaces: AttackSurface[] = [];

  for (const ep of endpoints) {
    const vectors: AttackVector[] = [];

    // 分析路径参数
    for (const param of ep.pathParams) {
      if (param.name.match(/id$/i)) {
        vectors.push({
          type: "idor",
          target: `path.${param.name}`,
          risk: "high",
          reasoning: "路径 ID 参数，可能存在越权访问",
          payloadCount: SECURITY_PAYLOADS.idor.length,
        });
      }
      if (param.type === "string") {
        vectors.push({
          type: "path-traversal",
          target: `path.${param.name}`,
          risk: "medium",
          reasoning: "路径字符串参数，可能存在路径遍历",
          payloadCount: SECURITY_PAYLOADS["path-traversal"].length,
        });
      }
    }

    // 分析查询参数
    for (const param of ep.queryParams) {
      if (param.type === "string") {
        vectors.push({
          type: "sql-injection",
          target: `query.${param.name}`,
          risk: "high",
          reasoning: "字符串查询参数，可能用于数据库查询",
          payloadCount: SECURITY_PAYLOADS["sql-injection"].length,
        });
        vectors.push({
          type: "xss",
          target: `query.${param.name}`,
          risk: "medium",
          reasoning: "字符串参数可能被渲染到页面",
          payloadCount: SECURITY_PAYLOADS.xss.length,
        });
      }
      if (param.name.match(/url|link|href|callback|redirect/i)) {
        vectors.push({
          type: "ssrf",
          target: `query.${param.name}`,
          risk: "medium",
          reasoning: "URL 类型参数，可能存在 SSRF",
          payloadCount: SECURITY_PAYLOADS.ssrf.length,
        });
      }
    }

    // 分析 body 参数
    if (ep.body) {
      const bodyExample = ep.body.example;
      const bodySchema = ep.body.schema;
      const bodyFields = extractBodyFields(bodyExample, bodySchema);

      for (const field of bodyFields) {
        if (field.type === "string") {
          vectors.push({
            type: "sql-injection",
            target: `body.${field.name}`,
            risk: "high",
            reasoning: "字符串 body 参数，可能用于查询",
            payloadCount: SECURITY_PAYLOADS["sql-injection"].length,
          });
          vectors.push({
            type: "xss",
            target: `body.${field.name}`,
            risk: "medium",
            reasoning: "字符串参数可能被渲染",
            payloadCount: SECURITY_PAYLOADS.xss.length,
          });
          vectors.push({
            type: "overflow",
            target: `body.${field.name}`,
            risk: "low",
            reasoning: "字符串长度未约束",
            payloadCount: SECURITY_PAYLOADS.overflow.length,
          });
        }
        if (field.name.match(/url|link|href|callback/i)) {
          vectors.push({
            type: "ssrf",
            target: `body.${field.name}`,
            risk: "medium",
            reasoning: "URL 类型参数",
            payloadCount: SECURITY_PAYLOADS.ssrf.length,
          });
        }
        if (field.name.match(/file|path|filename|filepath/i)) {
          vectors.push({
            type: "path-traversal",
            target: `body.${field.name}`,
            risk: "high",
            reasoning: "文件路径参数",
            payloadCount: SECURITY_PAYLOADS["path-traversal"].length,
          });
        }
        if (field.name.match(/cmd|command|exec|shell/i)) {
          vectors.push({
            type: "command-injection",
            target: `body.${field.name}`,
            risk: "high",
            reasoning: "可能传入命令行的参数",
            payloadCount: SECURITY_PAYLOADS["command-injection"].length,
          });
        }
      }
    }

    // 认证相关
    const hasAuthHeader = ep.headers.some((h) =>
      h.name.match(/authorization|auth|token/i),
    );
    if (hasAuthHeader) {
      vectors.push({
        type: "auth-bypass",
        target: "Authorization",
        risk: "high",
        reasoning: "需要认证的接口",
        payloadCount: SECURITY_PAYLOADS["auth-bypass"].length,
      });
    }

    // 信息泄露 — 所有有 body 的接口
    if (["POST", "PUT", "PATCH"].includes(ep.method)) {
      vectors.push({
        type: "info-disclosure",
        target: "error-handling",
        risk: "medium",
        reasoning: "写操作错误处理可能泄露信息",
        payloadCount: SECURITY_PAYLOADS["info-disclosure"].length,
      });
      vectors.push({
        type: "rate-limit",
        target: "endpoint",
        risk: "medium",
        reasoning: "写操作需要速率限制",
        payloadCount: SECURITY_PAYLOADS["rate-limit"].length,
      });
    }

    // 过滤测试类型
    const filteredVectors = filterTypes?.length
      ? vectors.filter((v) => filterTypes.includes(v.type))
      : vectors;

    if (filteredVectors.length > 0) {
      surfaces.push({
        endpointId: ep.id,
        path: `${ep.method} ${ep.path}`,
        method: ep.method,
        vectors: filteredVectors,
      });
    }
  }

  return surfaces;
}

// ── 安全用例生成 ──────────────────────────────────────

interface SecurityCaseMetadata {
  securityTestType: SecurityTestType;
  parameter: string;
  payload: string | object | number;
  detectRule: DetectRule;
  endpointPath: string;
  endpointMethod: string;
}

function generateSecurityCases(
  surfaces: AttackSurface[],
): (TestCase & { _secMeta: SecurityCaseMetadata })[] {
  const cases: (TestCase & { _secMeta: SecurityCaseMetadata })[] = [];
  const now = new Date().toISOString();

  for (const surface of surfaces) {
    for (const vector of surface.vectors) {
      const payloads = SECURITY_PAYLOADS[vector.type] || [];
      for (const p of payloads) {
        const caseId = uuid();
        const request = buildTestRequest(surface, vector, p);
        const tc: TestCase & { _secMeta: SecurityCaseMetadata } = {
          id: caseId,
          endpointId: surface.endpointId,
          name: `[安全] ${vector.type} — ${vector.target} — ${String(p.payload).slice(0, 40)}`,
          request: {
            method: surface.method as TestCase["request"]["method"],
            path: surface.path.replace(/^\w+\s+/, ""), // 去掉 method 前缀
            headers: {},
            query: {},
            body: undefined,
            timeout: 30000,
          },
          expected: {
            status: null,
            bodyContains: null,
            bodySchema: null,
          },
          tags: {
            purpose: ["security"],
            strategy: ["negative"],
            phase: ["full"],
            priority: "P1",
          },
          createdAt: now,
          updatedAt: now,
          _secMeta: {
            securityTestType: vector.type,
            parameter: vector.target,
            payload: p.payload,
            detectRule: p.detectRule,
            endpointPath: surface.path.replace(/^\w+\s+/, ""),
            endpointMethod: surface.method,
          },
        };

        // 注入 payload 到请求
        Object.assign(tc.request, request);
        cases.push(tc);
      }
    }
  }

  return cases;
}

function buildTestRequest(
  surface: AttackSurface,
  vector: AttackVector,
  payload: SecurityPayload,
): Partial<TestCase["request"]> {
  const result: Partial<TestCase["request"]> = {};
  const target = vector.target;

  if (target.startsWith("body.")) {
    const fieldName = target.replace("body.", "");
    result.body = { [fieldName]: payload.payload };
  } else if (target.startsWith("query.")) {
    const fieldName = target.replace("query.", "");
    result.query = { [fieldName]: String(payload.payload) };
  } else if (target.startsWith("path.")) {
    // path 参数替换到 URL
    const fieldName = target.replace("path.", "");
    const path = surface.path.replace(/^\w+\s+/, "");
    result.path = path.replace(`:${fieldName}`, String(payload.payload));
  } else if (target === "Authorization") {
    // auth-bypass: 设置特殊的 auth header
    if (payload.payload === "") {
      result.headers = {}; // 移除 Authorization
    } else {
      result.headers = { Authorization: String(payload.payload) };
    }
  } else if (target === "error-handling") {
    // info-disclosure: 发送畸形 body
    if (typeof payload.payload === "string" && payload.payload.includes("{invalid")) {
      result.body = payload.payload; // 畸形 JSON 字符串
    } else {
      result.body = payload.payload;
    }
  }

  return result;
}

// ── 安全测试执行 ──────────────────────────────────────

async function executeSecurityTests(
  cases: (TestCase & { _secMeta: SecurityCaseMetadata })[],
  surfaces: AttackSurface[],
  environment: { baseURL: string; headers: Record<string, string> },
  scan: SecurityScan,
): Promise<SecurityTestResult[]> {
  const results: SecurityTestResult[] = [];
  let completed = 0;

  for (const tc of cases) {
    const meta = tc._secMeta;

    try {
      // 特殊处理 rate-limit 测试
      if (meta.securityTestType === "rate-limit" && String(meta.payload).startsWith("__repeat:")) {
        const repeatCount = parseInt(String(meta.payload).split(":")[1], 10) || 50;
        const rlResult = await executeRateLimitTest(
          tc,
          meta,
          environment,
          repeatCount,
        );
        results.push(rlResult);
      } else {
        const result = await executeSingleSecurityTest(tc, meta, environment);
        results.push(result);
      }
    } catch (err) {
      log.warn(`安全测试 ${tc.id} 执行失败: ${err}`);
      results.push({
        caseId: tc.id,
        testType: meta.securityTestType,
        endpoint: `${meta.endpointMethod} ${meta.endpointPath}`,
        parameter: meta.parameter,
        payload: meta.payload,
        detectRule: meta.detectRule,
        request: {
          method: meta.endpointMethod,
          url: `${environment.baseURL}${meta.endpointPath}`,
          headers: {},
        },
        response: {
          status: 0,
          headers: {},
          body: `执行失败: ${err}`,
          duration: 0,
        },
        ruleMatched: false,
      });
    }

    completed++;
    scan.progress = {
      phase: "执行安全测试",
      current: completed,
      total: cases.length,
      detail: `${meta.securityTestType} — ${meta.parameter}`,
    };
    // 每 5 个更新一次进度（减少 I/O）
    if (completed % 5 === 0 || completed === cases.length) {
      await storage.write(COLLECTION, scan.id, scan);
    }
  }

  return results;
}

async function executeSingleSecurityTest(
  tc: TestCase & { _secMeta: SecurityCaseMetadata },
  meta: SecurityCaseMetadata,
  environment: { baseURL: string; headers: Record<string, string> },
): Promise<SecurityTestResult> {
  const url = `${environment.baseURL}${tc.request.path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...environment.headers,
    ...tc.request.headers,
  };

  // auth-bypass 测试时，如果 payload 为空则移除 Authorization
  if (meta.securityTestType === "auth-bypass" && meta.payload === "") {
    delete headers.Authorization;
    delete headers.authorization;
  }

  const fetchOptions: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    timeout?: number;
  } = {
    method: tc.request.method,
    headers,
    timeout: 15000,
  };

  if (tc.request.body !== undefined && !["GET", "HEAD"].includes(tc.request.method)) {
    fetchOptions.body =
      typeof tc.request.body === "string"
        ? tc.request.body
        : JSON.stringify(tc.request.body);
  }

  // 构建带 query 的 URL
  let fullUrl = url;
  if (tc.request.query && Object.keys(tc.request.query).length > 0) {
    const params = new URLSearchParams(tc.request.query);
    fullUrl = `${url}?${params.toString()}`;
  }

  const startTime = Date.now();
  const response = await safeFetch(fullUrl, fetchOptions);
  const duration = Date.now() - startTime;

  let responseBody: unknown;
  try {
    const text = await response.text();
    try {
      responseBody = JSON.parse(text);
    } catch {
      responseBody = text;
    }
  } catch {
    responseBody = null;
  }

  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((v, k) => {
    responseHeaders[k] = v;
  });

  const ruleMatched = evaluateDetectRule(
    meta.detectRule,
    response.status,
    responseBody,
    duration,
    responseHeaders,
  );

  return {
    caseId: tc.id,
    testType: meta.securityTestType,
    endpoint: `${meta.endpointMethod} ${meta.endpointPath}`,
    parameter: meta.parameter,
    payload: sanitizeControlChars(meta.payload) as string | object | number,
    detectRule: meta.detectRule,
    request: {
      method: tc.request.method,
      url: fullUrl,
      headers,
      body: sanitizeControlChars(tc.request.body),
    },
    response: {
      status: response.status,
      headers: responseHeaders,
      body: sanitizeControlChars(responseBody),
      duration,
    },
    ruleMatched,
  };
}

async function executeRateLimitTest(
  tc: TestCase & { _secMeta: SecurityCaseMetadata },
  meta: SecurityCaseMetadata,
  environment: { baseURL: string; headers: Record<string, string> },
  repeatCount: number,
): Promise<SecurityTestResult> {
  const url = `${environment.baseURL}${tc.request.path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...environment.headers,
  };

  const statuses: number[] = [];
  for (let i = 0; i < repeatCount; i++) {
    try {
      const res = await safeFetch(url, {
        method: tc.request.method,
        headers,
        timeout: 5000,
      });
      statuses.push(res.status);
    } catch {
      statuses.push(0);
    }
  }

  const allSuccess = statuses.every((s) => s >= 200 && s < 300);
  const hasRateLimit = statuses.some((s) => s === 429);

  return {
    caseId: tc.id,
    testType: "rate-limit",
    endpoint: `${meta.endpointMethod} ${meta.endpointPath}`,
    parameter: meta.parameter,
    payload: meta.payload,
    detectRule: meta.detectRule,
    request: {
      method: tc.request.method,
      url,
      headers,
    },
    response: {
      status: statuses[statuses.length - 1],
      headers: {},
      body: {
        totalRequests: repeatCount,
        statuses: statuses.slice(0, 10), // 只保存前 10 个
        allSuccess,
        hasRateLimit,
      },
      duration: 0,
    },
    ruleMatched: allSuccess && !hasRateLimit,
  };
}

// ── 检测规则评估 ──────────────────────────────────────

function evaluateDetectRule(
  rule: DetectRule,
  status: number,
  body: unknown,
  duration: number,
  headers: Record<string, string>,
): boolean {
  try {
    switch (rule.type) {
      case "status":
        return evaluateStatusRule(rule.condition, status);
      case "body-contains":
        return evaluateBodyContainsRule(rule.condition, body);
      case "body-not-contains":
        return !evaluateBodyContainsRule(rule.condition, body);
      case "timing":
        return evaluateTimingRule(rule.condition, duration);
      case "header":
        return evaluateHeaderRule(rule.condition, headers);
      default:
        return false;
    }
  } catch {
    return false;
  }
}

function evaluateStatusRule(condition: string, status: number): boolean {
  // 简单条件评估
  const cond = condition.replace(/status/g, String(status));
  try {
    // 安全评估简单的状态码比较表达式
    // 支持: status === 200, status !== 400 && status !== 422, status < 500
    const sanitized = cond.replace(/[^0-9!=<>&|() ]/g, "");
    return new Function(`return ${sanitized}`)() as boolean;
  } catch {
    return false;
  }
}

function evaluateBodyContainsRule(condition: string, body: unknown): boolean {
  const bodyStr =
    typeof body === "string" ? body : JSON.stringify(body || "");
  // 支持 "|" 分隔的多个关键词
  const keywords = condition.split("|");
  return keywords.some((kw) => bodyStr.toLowerCase().includes(kw.trim().toLowerCase()));
}

function evaluateTimingRule(condition: string, duration: number): boolean {
  const match = condition.match(/duration\s*>\s*(\d+)/);
  if (match) return duration > parseInt(match[1], 10);
  return false;
}

function evaluateHeaderRule(
  condition: string,
  headers: Record<string, string>,
): boolean {
  // 简单的 header 存在/值检查
  const [key, value] = condition.split("=").map((s) => s.trim());
  if (value) {
    return headers[key.toLowerCase()] === value;
  }
  return key in headers;
}

// ── 安全报告生成 ──────────────────────────────────────

async function generateSecurityReport(
  allResults: SecurityTestResult[],
  matchedResults: SecurityTestResult[],
  surfaces: AttackSurface[],
  settings: Settings | null,
): Promise<SecurityReport> {
  let findings: SecurityFinding[] = [];

  // 优先尝试 LLM 分析
  if (settings?.llm && matchedResults.length > 0) {
    try {
      findings = await llmAnalyzeFindings(matchedResults, settings.llm);
    } catch (err) {
      log.warn("LLM 报告分析失败，降级为规则引擎", err);
      findings = ruleBasedFindings(matchedResults);
    }
  } else {
    findings = ruleBasedFindings(matchedResults);
  }

  // 统计
  const summary = {
    totalTests: allResults.length,
    passed: allResults.length - findings.length,
    vulnerabilities: findings.length,
    criticalRisk: findings.filter((f) => f.severity === "critical").length,
    highRisk: findings.filter((f) => f.severity === "high").length,
    mediumRisk: findings.filter((f) => f.severity === "medium").length,
    lowRisk: findings.filter((f) => f.severity === "low").length,
  };

  // OWASP 覆盖度
  const testedTypes = new Set(allResults.map((r) => r.testType));
  const owaspCoverage: OwaspCoverage[] = OWASP_TOP_10.map((item) => {
    const tested = item.testTypes.some((t) => testedTypes.has(t));
    const findingsCount = findings.filter(
      (f) => f.owaspTop10 === item.category,
    ).length;
    return { category: item.category, tested, findingsCount };
  });

  return { summary, findings, owaspCoverage };
}

async function llmAnalyzeFindings(
  matchedResults: SecurityTestResult[],
  llmConfig: { provider: string; apiKey: string; model: string; baseURL?: string },
): Promise<SecurityFinding[]> {
  const resultsJson = JSON.stringify(
    matchedResults.map((r) => ({
      testType: r.testType,
      endpoint: r.endpoint,
      parameter: r.parameter,
      payload: sanitizeControlChars(r.payload),
      request: {
        ...r.request,
        body: sanitizeControlChars(r.request.body),
      },
      response: {
        status: r.response.status,
        body: sanitizeControlChars(r.response.body),
      },
      detectRule: r.detectRule,
      ruleMatched: r.ruleMatched,
    })),
    null,
    2,
  );

  const model = createLlmModel(llmConfig as Parameters<typeof createLlmModel>[0]);
  const { text } = await generateText({
    model,
    system: SECURITY_ANALYSIS_SYSTEM_PROMPT,
    prompt: buildSecurityReportPrompt(resultsJson),
    maxTokens: 4096,
    temperature: 0.2,
  });

  const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  const parsed = JSON.parse(cleaned) as { findings: SecurityFinding[] };
  return parsed.findings || [];
}

/**
 * 规则引擎降级 — 直接使用 detectRule.vulnerable 生成报告
 */
function ruleBasedFindings(
  matchedResults: SecurityTestResult[],
): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  let counter = 1;

  // 按端点+参数+类型分组，避免同一问题重复报告
  const grouped = new Map<string, SecurityTestResult[]>();
  for (const r of matchedResults) {
    const key = `${r.endpoint}|${r.parameter}|${r.testType}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(r);
  }

  for (const [, results] of grouped) {
    const first = results[0];
    const severity = inferSeverity(first.testType, results);
    const template = REMEDIATION_TEMPLATES[first.testType];
    const cwe = CWE_MAP[first.testType];
    const owasp = OWASP_TOP_10.find((o) =>
      o.testTypes.includes(first.testType),
    );

    findings.push({
      id: `finding-${String(counter++).padStart(3, "0")}`,
      type: first.testType,
      severity,
      endpoint: first.endpoint,
      parameter: first.parameter,
      description: first.detectRule.vulnerable,
      evidence: {
        request: {
          method: first.request.method,
          url: first.request.url,
          headers: first.request.headers,
          body: sanitizeControlChars(first.request.body),
        },
        response: {
          status: first.response.status,
          body: sanitizeControlChars(first.response.body),
        },
        anomaly: first.detectRule.vulnerable,
      },
      remediation: template
        ? {
            summary: template.summary,
            details: template.details,
            codeExample: template.codeExample,
            reference: template.reference,
          }
        : {
            summary: "请参考 OWASP 相关文档进行修复",
            details: "",
          },
      cwe,
      owaspTop10: owasp?.category,
    });
  }

  return findings;
}

function inferSeverity(
  testType: SecurityTestType,
  results: SecurityTestResult[],
): "critical" | "high" | "medium" | "low" | "info" {
  // 高危类型
  if (
    ["sql-injection", "command-injection", "auth-bypass"].includes(testType)
  ) {
    // 多个 payload 都匹配 → critical
    if (results.length >= 3) return "critical";
    return "high";
  }
  if (["idor", "path-traversal", "ssrf"].includes(testType)) {
    return "high";
  }
  if (["xss", "info-disclosure", "rate-limit", "mass-assignment"].includes(testType)) {
    return "medium";
  }
  if (testType === "overflow") {
    return "low";
  }
  return "info";
}

// ── 辅助函数 ──────────────────────────────────────────

async function loadProjectEndpoints(
  projectId: string,
): Promise<ApiEndpoint[]> {
  const all = await storage.list<ApiEndpoint>("api-endpoints");
  return all.filter((ep) => ep.projectId === projectId);
}

async function loadSettings(): Promise<Settings | null> {
  return storage.read<Settings>("", "settings");
}

interface BodyField {
  name: string;
  type: "string" | "number" | "boolean" | "object" | "array" | "unknown";
}

function extractBodyFields(
  example: unknown,
  schema: unknown,
): BodyField[] {
  const fields: BodyField[] = [];

  // 从 example 推断
  if (example && typeof example === "object" && !Array.isArray(example)) {
    for (const [key, value] of Object.entries(example as Record<string, unknown>)) {
      fields.push({
        name: key,
        type: inferType(value),
      });
    }
    return fields;
  }

  // 从 schema 推断
  if (schema && typeof schema === "object") {
    const s = schema as Record<string, unknown>;
    const properties = (s.properties || s) as Record<string, unknown>;
    for (const [key, def] of Object.entries(properties)) {
      const d = def as Record<string, unknown>;
      fields.push({
        name: key,
        type: (d.type as BodyField["type"]) || "unknown",
      });
    }
    return fields;
  }

  return fields;
}

function inferType(value: unknown): BodyField["type"] {
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (Array.isArray(value)) return "array";
  if (value && typeof value === "object") return "object";
  return "unknown";
}
