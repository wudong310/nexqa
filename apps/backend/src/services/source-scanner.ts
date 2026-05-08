/**
 * Source Scanner 服务（重构版）
 *
 * 编排流程：创建 ScanRecord → 发消息给 OpenClaw Agent → 等待分析结果 → 导入
 * Agent 负责：clone 代码 → 读取文件 → 识别 API endpoint → 返回 JSON
 */

import { randomUUID } from "node:crypto";
import type { GitSource } from "@nexqa/shared";
import type { ScanRecord, ScanResult } from "@nexqa/shared";
import { createOpenClawClient } from "./openclaw-client.js";
import { importEndpoints } from "./api-importer.js";
import { storage } from "./storage.js";
import { createLogger } from "./logger.js";

const log = createLogger("source-scanner");

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Endpoint {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  summary: string;
  queryParams: Array<{
    name: string;
    type: string;
    required: boolean;
    description: string;
  }>;
  pathParams: Array<{
    name: string;
    type: string;
    required: boolean;
    description: string;
  }>;
  headers: Array<{
    name: string;
    type: string;
    required: boolean;
    description: string;
  }>;
  body: {
    contentType: string;
    schema: Record<string, unknown>;
  } | null;
  responses: Array<{
    status: number;
    description: string;
  }>;
  confidence: "high" | "medium" | "low";
}

export interface ScanOutput {
  scanRecord: ScanRecord;
  endpoints: Endpoint[];
}

interface OpenClawConfig {
  gatewayUrl: string;
  token: string;
}

interface ScanOptions {
  branch?: string;
}

// ─── 常量 ──────────────────────────────────────────────────────────────────────

const COLLECTION_SCAN_RECORDS = "scan-records";
const AGENT_TIMEOUT_MS = 300_000; // 5 min — agent 需要 clone + 读文件 + 分析 + 生成 JSON

// ─── 核心流程 ──────────────────────────────────────────────────────────────────

/**
 * 执行扫描流程（重构版）
 *
 * 1. 创建 ScanRecord (status=pending)
 * 2. 发消息给 OpenClaw Agent（含 git URL + auth）
 * 3. 等待 Agent 返回结构化 JSON
 * 4. 解析验证 → 导入 → 返回结果
 */
export async function runScan(
  gitSource: GitSource,
  openclawConfig: OpenClawConfig,
  options?: ScanOptions,
): Promise<ScanOutput> {
  const branch = options?.branch ?? gitSource.branch;
  const scanId = randomUUID();
  const now = new Date().toISOString();

  // 1. 创建 ScanRecord
  let scanRecord: ScanRecord = {
    id: scanId,
    gitSourceId: gitSource.id,
    projectId: gitSource.projectId,
    status: "pending",
    branch,
    commitHash: null,
    scannedFiles: [],
    totalFilesFound: 0,
    result: null,
    error: null,
    openclawRunId: null,
    startedAt: now,
    completedAt: null,
  };

  await saveScanRecord(scanRecord);
  log.info(`扫描任务已创建: ${scanId}`);

  try {
    // 2. 调用 OpenClaw Agent 分析
    scanRecord = { ...scanRecord, status: "analyzing" };
    await saveScanRecord(scanRecord);

    const endpoints = await analyzeWithAgent(gitSource, branch, openclawConfig);
    log.info(`分析完成: 发现 ${endpoints.length} 个端点`);

    // 如果没有端点，直接完成
    if (endpoints.length === 0) {
      scanRecord = {
        ...scanRecord,
        status: "completed",
        result: {
          endpointsFound: 0,
          endpointsNew: 0,
          endpointsUpdated: 0,
          endpointsRemoved: 0,
          changes: [],
        },
        completedAt: new Date().toISOString(),
      };
      await saveScanRecord(scanRecord);
      return { scanRecord, endpoints: [] };
    }

    // 3. 导入到 API 管理
    scanRecord = { ...scanRecord, status: "importing" };
    await saveScanRecord(scanRecord);

    const sharedEndpoints = endpoints.map((ep) => ({
      ...ep,
      body: ep.body ?? undefined,
    }));

    const importResult = await importEndpoints(sharedEndpoints, {
      projectId: gitSource.projectId,
      gitSourceId: gitSource.id,
      scanId,
    });
    log.info(
      `导入完成: 新增=${importResult.added.length} 更新=${importResult.updated.length} 删除=${importResult.removed.length} 未变=${importResult.unchanged}`,
    );

    // 4. 返回结果
    const result: ScanResult = {
      endpointsFound: endpoints.length,
      endpointsNew: importResult.added.length,
      endpointsUpdated: importResult.updated.length,
      endpointsRemoved: importResult.removed.length,
      changes: importResult.changes,
    };

    scanRecord = {
      ...scanRecord,
      status: "completed",
      result,
      completedAt: new Date().toISOString(),
    };
    await saveScanRecord(scanRecord);
    log.info(`扫描完成: ${scanId}`);

    return { scanRecord, endpoints };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    log.error(`扫描失败: ${errorMsg}`);

    scanRecord = {
      ...scanRecord,
      status: "failed",
      error: errorMsg,
      completedAt: new Date().toISOString(),
    };
    await saveScanRecord(scanRecord);

    return { scanRecord, endpoints: [] };
  }
}

// ─── Agent 调用 ───────────────────────────────────────────────────────────────

/**
 * 调用 OpenClaw Agent 分析 Git 仓库
 *
 * Agent 自行 clone 代码、读取文件、识别 API 端点
 */
async function analyzeWithAgent(
  gitSource: GitSource,
  branch: string,
  openclawConfig: OpenClawConfig,
): Promise<Endpoint[]> {
  const client = createOpenClawClient({
    gatewayUrl: openclawConfig.gatewayUrl,
    token: openclawConfig.token,
  });

  try {
    await client.connect();

    const message = buildAgentMessage(gitSource, branch);

    const reply = await client.sendAndWait(message, {
      timeout: AGENT_TIMEOUT_MS,
      sessionKey: `agent:nexqa:scan-${gitSource.id}`,
    });

    // 检查是否是 Agent 错误
    const agentError = detectAgentError(reply);
    if (agentError) {
      throw new Error(`Agent 分析失败: ${agentError}`);
    }

    // 解析 JSON
    const parsed = extractJson(reply);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      log.warn("Agent 返回无法解析为端点数组");
      return [];
    }

    return parsed.filter(isValidEndpoint) as Endpoint[];
  } finally {
    client.disconnect();
  }
}

/**
 * 构建发给 Agent 的消息
 *
 * 只包含：git URL、认证信息、框架提示、输出格式要求
 * 不包含任何文件内容
 */
function buildAgentMessage(gitSource: GitSource, branch: string): string {
  const authInfo =
    gitSource.auth.type === "token" && gitSource.auth.token
      ? `\nGit 认证 token: ${gitSource.auth.token}`
      : "";

  const frameworkHint =
    gitSource.scanConfig.framework !== "auto"
      ? `\n框架提示: ${gitSource.scanConfig.framework}`
      : "";

  return `请分析以下 Git 仓库的 API 端点。

Git 仓库: ${gitSource.repoUrl}
分支: ${branch}${authInfo}${frameworkHint}

## 任务
1. Clone 该仓库的指定分支
2. 识别所有 HTTP API 端点（路由定义）
3. 返回结构化 JSON

## 输出格式要求
返回纯 JSON 数组，不要 markdown 代码块，不要任何额外文字。

每个元素格式：
[
  {
    "method": "GET|POST|PUT|PATCH|DELETE",
    "path": "/api/xxx",
    "summary": "接口功能描述",
    "queryParams": [{"name": "xx", "type": "string", "required": false, "description": "说明"}],
    "pathParams": [{"name": "id", "type": "string", "required": true, "description": "说明"}],
    "headers": [{"name": "Authorization", "type": "string", "required": true, "description": "Bearer token"}],
    "body": {"contentType": "application/json", "schema": {"field": "type"}} | null,
    "responses": [{"status": 200, "description": "成功"}],
    "confidence": "high|medium|low"
  }
]

## 规则
- 只返回纯 JSON，不要包裹在 markdown 代码块中
- method 必须大写
- path 必须以 / 开头
- 如果没有 body 则设为 null
- confidence: high=明确路由定义, medium=推断, low=不确定
- 忽略中间件、工具函数等非路由代码`;
}

/**
 * 检测 Agent 返回是否是错误信息
 */
function detectAgentError(reply: string): string | null {
  const errorPatterns = [
    /clone.*failed/i,
    /authentication.*failed/i,
    /repository.*not found/i,
    /permission.*denied/i,
    /fatal:\s+/i,
  ];
  for (const pattern of errorPatterns) {
    if (pattern.test(reply) && !reply.includes("[")) {
      return reply.slice(0, 200);
    }
  }
  return null;
}

// ─── JSON 解析 ────────────────────────────────────────────────────────────────

/** 从 Agent 返回文本中提取 JSON */
export function extractJson(text: string): unknown[] {
  // 尝试 1：直接解析为 JSON 数组
  try {
    const parsed = JSON.parse(text.trim());
    if (Array.isArray(parsed)) return parsed;
    return [parsed];
  } catch {
    // 继续尝试
  }

  // 尝试 2：提取 markdown 代码块中的 JSON（兜底）
  const codeBlockMatch = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1].trim());
      if (Array.isArray(parsed)) return parsed;
      return [parsed];
    } catch {
      // 继续尝试
    }
  }

  // 尝试 3：找到第一个 [ 和最后一个 ] 之间的内容
  const firstBracket = text.indexOf("[");
  const lastBracket = text.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    try {
      const jsonStr = text.slice(firstBracket, lastBracket + 1);
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // 解析失败
    }
  }

  // 尝试 4：找到第一个 { 和最后一个 } 之间的内容（单对象）
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      const jsonStr = text.slice(firstBrace, lastBrace + 1);
      const parsed = JSON.parse(jsonStr);
      return [parsed];
    } catch {
      // 解析失败
    }
  }

  return [];
}

// ─── 验证 ─────────────────────────────────────────────────────────────────────

function isValidEndpoint(item: unknown): boolean {
  if (!item || typeof item !== "object") return false;
  const obj = item as Record<string, unknown>;

  const validMethods = ["GET", "POST", "PUT", "PATCH", "DELETE"];
  if (!validMethods.includes(obj.method as string)) return false;
  if (typeof obj.path !== "string" || !obj.path.startsWith("/")) return false;

  return true;
}

// ─── 存储 ──────────────────────────────────────────────────────────────────────

async function saveScanRecord(record: ScanRecord): Promise<void> {
  await storage.write(COLLECTION_SCAN_RECORDS, record.id, record);
}
