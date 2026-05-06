/**
 * Source Scanner 服务
 *
 * 完整流程：Git 源码 clone → 文件提取 → OpenClaw AI 分析 → 结构化结果
 */

import { randomUUID } from "node:crypto";
import { readFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join, extname, relative } from "node:path";
import { simpleGit } from "simple-git";
import { glob } from "glob";
import type { GitSource } from "@nexqa/shared";
import type { ScanRecord, ScanResult } from "@nexqa/shared";
import { createOpenClawClient } from "./openclaw-client.js";
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

const SCAN_BASE_DIR = "/tmp/nexqa-scans";
const COLLECTION_SCAN_RECORDS = "scan-records";

// ─── 核心流程 ──────────────────────────────────────────────────────────────────

/**
 * 执行完整扫描流程
 *
 * 1. 创建 ScanRecord (status=pending)
 * 2. Clone/Pull 代码
 * 3. 文件提取
 * 4. 调用 OpenClaw 分析
 * 5. 返回结构化结果
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
    // 2. Clone/Pull
    scanRecord = { ...scanRecord, status: "cloning" };
    await saveScanRecord(scanRecord);

    const { cloneDir, commitHash } = await cloneOrPull(gitSource, branch);
    scanRecord = { ...scanRecord, commitHash };
    await saveScanRecord(scanRecord);
    log.info(`代码已获取: commit=${commitHash}`);

    // 3. 文件提取
    const { files, totalFound } = await extractFiles(
      cloneDir,
      gitSource.scanConfig,
    );
    scanRecord = {
      ...scanRecord,
      scannedFiles: files.map((f) => f.path),
      totalFilesFound: totalFound,
    };
    await saveScanRecord(scanRecord);
    log.info(`文件已提取: ${files.length}/${totalFound} 个文件`);

    if (files.length === 0) {
      scanRecord = {
        ...scanRecord,
        status: "completed",
        result: {
          endpointsFound: 0,
          endpointsNew: 0,
          endpointsUpdated: 0,
          endpointsRemoved: 0,
        },
        completedAt: new Date().toISOString(),
      };
      await saveScanRecord(scanRecord);
      log.info("没有匹配的文件，扫描完成");
      return { scanRecord, endpoints: [] };
    }

    // 4. 调用 OpenClaw 分析
    scanRecord = { ...scanRecord, status: "analyzing" };
    await saveScanRecord(scanRecord);

    const endpoints = await analyzeWithOpenClaw(
      files,
      gitSource.scanConfig.framework,
      openclawConfig,
    );
    log.info(`分析完成: 发现 ${endpoints.length} 个端点`);

    // 5. 返回结果
    const result: ScanResult = {
      endpointsFound: endpoints.length,
      endpointsNew: endpoints.length,
      endpointsUpdated: 0,
      endpointsRemoved: 0,
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

// ─── Clone/Pull ───────────────────────────────────────────────────────────────

async function cloneOrPull(
  gitSource: GitSource,
  branch: string,
): Promise<{ cloneDir: string; commitHash: string }> {
  const timestamp = Date.now();
  const cloneDir = join(SCAN_BASE_DIR, gitSource.id, String(timestamp));

  mkdirSync(cloneDir, { recursive: true });

  const git = simpleGit();

  // 构建 clone URL（带 token 认证）
  let repoUrl = gitSource.repoUrl;
  if (gitSource.auth.type === "token" && gitSource.auth.token) {
    // 将 token 插入 URL: https://token@host/repo.git
    const url = new URL(repoUrl);
    url.username = gitSource.auth.token;
    repoUrl = url.toString();
  }

  try {
    // Shallow clone
    await git.clone(repoUrl, cloneDir, [
      "--depth=1",
      "--branch",
      branch,
      "--single-branch",
    ]);

    // 获取 commit hash
    const localGit = simpleGit(cloneDir);
    const logResult = await localGit.log(["-1"]);
    const commitHash = logResult.latest?.hash ?? "unknown";

    return { cloneDir, commitHash };
  } catch (err) {
    // 清理失败的 clone 目录
    try {
      rmSync(cloneDir, { recursive: true, force: true });
    } catch {}
    throw new Error(
      `Git clone 失败: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// ─── 文件提取 ──────────────────────────────────────────────────────────────────

interface FileEntry {
  path: string;
  content: string;
  language: string;
}

async function extractFiles(
  cloneDir: string,
  scanConfig: GitSource["scanConfig"],
): Promise<{ files: FileEntry[]; totalFound: number }> {
  const { includePaths, excludePaths, maxFileSize, maxTotalFiles } = scanConfig;

  // 用 glob 匹配文件
  const matched = await glob(includePaths, {
    cwd: cloneDir,
    ignore: excludePaths,
    nodir: true,
    absolute: false,
  });

  const totalFound = matched.length;

  // 限制文件数量
  const limited = matched.slice(0, maxTotalFiles);

  // 读取文件内容
  const files: FileEntry[] = [];
  for (const relPath of limited) {
    const absPath = join(cloneDir, relPath);
    try {
      const stat = readFileSync(absPath);
      // 跳过超大文件
      if (stat.length > maxFileSize) continue;

      const content = stat.toString("utf-8");
      const language = detectLanguage(relPath);

      // 过滤路由文件（如果 framework 已知）
      if (
        scanConfig.framework !== "auto" &&
        !isRouteFile(relPath, content, scanConfig.framework)
      ) {
        continue;
      }

      files.push({ path: relPath, content, language });
    } catch {
      // 跳过无法读取的文件
      continue;
    }
  }

  return { files, totalFound };
}

// ─── OpenClaw 分析 ────────────────────────────────────────────────────────────

async function analyzeWithOpenClaw(
  files: FileEntry[],
  framework: string,
  openclawConfig: OpenClawConfig,
): Promise<Endpoint[]> {
  const client = createOpenClawClient({
    gatewayUrl: openclawConfig.gatewayUrl,
    token: openclawConfig.token,
  });

  try {
    await client.connect();

    // 组装 prompt
    const prompt = buildAnalysisPrompt(files, framework);

    // 发送并等待结果
    const reply = await client.sendAndWait(prompt, { timeout: 120000 });

    // 解析 JSON
    const parsed = extractJson(reply);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      log.warn("OpenClaw 返回无法解析为端点数组");
      return [];
    }

    // 验证并过滤有效端点
    return parsed.filter(isValidEndpoint) as Endpoint[];
  } finally {
    client.disconnect();
  }
}

function buildAnalysisPrompt(files: FileEntry[], framework: string): string {
  const filesSection = files
    .map(
      (f) => `### ${f.path}\n\`\`\`${f.language}\n${f.content}\n\`\`\``,
    )
    .join("\n\n");

  return `你是一个 API 源码分析专家。请分析以下源码文件，识别所有 HTTP API 端点。

## 框架提示
{framework: "${framework}"}

## 源码文件
${filesSection}

## 输出要求
返回纯 JSON 数组（不要 markdown 代码块），每个元素：
{
  "method": "GET|POST|PUT|PATCH|DELETE",
  "path": "/api/xxx",
  "summary": "接口描述",
  "queryParams": [{"name":"xx","type":"string","required":false,"description":""}],
  "pathParams": [...],
  "headers": [...],
  "body": {"contentType":"application/json","schema":{}},
  "responses": [{"status":200,"description":""}],
  "confidence": "high|medium|low"
}`;
}

// ─── 辅助函数 ──────────────────────────────────────────────────────────────────

/** 根据文件扩展名推断语言 */
export function detectLanguage(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    ".ts": "typescript",
    ".tsx": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
    ".py": "python",
    ".go": "go",
    ".java": "java",
    ".kt": "kotlin",
    ".rs": "rust",
    ".rb": "ruby",
    ".php": "php",
    ".cs": "csharp",
    ".swift": "swift",
  };
  return map[ext] ?? "text";
}

/** 根据框架和文件内容推断是否包含路由定义 */
export function isRouteFile(
  filePath: string,
  content: string,
  framework: string,
): boolean {
  const fileName = filePath.toLowerCase();

  // 通用路由文件名模式
  if (
    fileName.includes("route") ||
    fileName.includes("router") ||
    fileName.includes("controller") ||
    fileName.includes("handler") ||
    fileName.includes("endpoint") ||
    fileName.includes("api")
  ) {
    return true;
  }

  // 按框架检测内容特征
  switch (framework) {
    case "hono":
      return (
        content.includes(".get(") ||
        content.includes(".post(") ||
        content.includes(".put(") ||
        content.includes(".delete(") ||
        content.includes(".patch(") ||
        content.includes("new Hono") ||
        content.includes("app.route")
      );

    case "express":
      return (
        content.includes("router.get") ||
        content.includes("router.post") ||
        content.includes("router.put") ||
        content.includes("router.delete") ||
        content.includes("app.get(") ||
        content.includes("app.post(") ||
        content.includes("express.Router")
      );

    case "spring-boot":
      return (
        content.includes("@GetMapping") ||
        content.includes("@PostMapping") ||
        content.includes("@PutMapping") ||
        content.includes("@DeleteMapping") ||
        content.includes("@RequestMapping") ||
        content.includes("@RestController")
      );

    case "fastapi":
      return (
        content.includes("@app.get") ||
        content.includes("@app.post") ||
        content.includes("@app.put") ||
        content.includes("@app.delete") ||
        content.includes("@router.get") ||
        content.includes("@router.post") ||
        content.includes("APIRouter")
      );

    default:
      // auto 模式不过滤
      return true;
  }
}

/** 从 OpenClaw 返回文本中提取 JSON */
export function extractJson(text: string): unknown[] {
  // 尝试 1：直接解析为 JSON 数组
  try {
    const parsed = JSON.parse(text.trim());
    if (Array.isArray(parsed)) return parsed;
    return [parsed];
  } catch {
    // 继续尝试
  }

  // 尝试 2：提取 markdown 代码块中的 JSON
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

// ─── 验证函数 ──────────────────────────────────────────────────────────────────

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
