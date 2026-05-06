#!/usr/bin/env node

/**
 * NexQA CLI — 在 CI/CD 中运行 API 测试
 *
 * 用法:
 *   npx nexqa run --project <id> [--plan <id>] [--env <id>] [--format json|markdown|junit] [--output <file>]
 *
 * 退出码:
 *   0 = 全部通过
 *   1 = 有失败
 *   2 = 执行错误
 */

import { parseArgs } from "node:util";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

// ── Arg parsing ───────────────────────────────────────

const HELP = `
NexQA CLI — AI 驱动的 API 质量验证

用法:
  nexqa run [options]         执行测试
  nexqa report [options]      生成/导出报告
  nexqa --help                显示帮助

run 选项:
  --project <id>              项目 ID（必填）
  --plan <id>                 测试方案 ID（可选，不指定则跑全部）
  --env <id>                  环境 ID（可选）
  --format <fmt>              输出格式: json, markdown, junit（默认 json）
  --output <file>             输出文件路径（默认输出到 stdout）
  --server <url>              NexQA 服务地址（默认 http://localhost:3456）

report 选项:
  --batch <id>                批次 ID（必填）
  --format <fmt>              导出格式: json, markdown, html, junit
  --output <file>             输出文件路径

退出码:
  0  全部通过
  1  有失败
  2  执行错误
`.trim();

interface CliOptions {
  command: string;
  project?: string;
  plan?: string;
  env?: string;
  batch?: string;
  format: string;
  output?: string;
  server: string;
  help: boolean;
}

function parseCliArgs(): CliOptions {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      project: { type: "string" },
      plan: { type: "string" },
      env: { type: "string" },
      batch: { type: "string" },
      format: { type: "string", default: "json" },
      output: { type: "string" },
      server: { type: "string", default: "http://localhost:3456" },
      help: { type: "boolean", default: false },
    },
  });

  return {
    command: positionals[0] || "",
    project: values.project,
    plan: values.plan,
    env: values.env,
    batch: values.batch,
    format: values.format || "json",
    output: values.output,
    server: values.server || "http://localhost:3456",
    help: values.help || false,
  };
}

// ── API client ────────────────────────────────────────

/**
 * 规范化 server URL + path 拼接。
 * 如果 server 已包含 /nexqa（如 http://localhost/nexqa），
 * 则去掉 path 中的 /nexqa 前缀，避免路径重复。
 */
function resolveUrl(server: string, path: string): string {
  const base = server.replace(/\/+$/, "");
  if (base.endsWith("/nexqa") && path.startsWith("/nexqa/")) {
    return `${base}${path.slice("/nexqa".length)}`;
  }
  return `${base}${path}`;
}

async function apiFetch<T>(
  server: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const url = resolveUrl(server, path);
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
}

// ── Run command ───────────────────────────────────────

async function runCommand(opts: CliOptions): Promise<number> {
  if (!opts.project) {
    console.error("❌ --project 参数必填");
    return 2;
  }

  const server = opts.server;
  const projectId = opts.project;
  console.log(`🚀 NexQA CLI — 开始执行测试`);
  console.log(`   项目: ${projectId}`);
  console.log(`   服务: ${server}`);
  if (opts.env) console.log(`   环境: ${opts.env}`);
  if (opts.plan) console.log(`   方案: ${opts.plan}`);
  console.log("");

  try {
    // 执行批量测试
    const batchPayload: Record<string, unknown> = {
      projectId,
      name: `CLI-${new Date().toISOString().slice(0, 19)}`,
      environmentId: opts.env || null,
    };

    // 如果指定了 plan，加载方案的筛选条件
    if (opts.plan) {
      const plan = await apiFetch<{ selection?: Record<string, unknown> }>(
        server,
        `/nexqa/api/test-plans/${opts.plan}`,
      );
      if (plan.selection) {
        // 从 plan 的 selection 提取过滤条件
        const sel = plan.selection as Record<string, unknown>;
        if (sel.caseIds) batchPayload.caseIds = sel.caseIds;
        if (sel.endpointIds) batchPayload.endpointIds = sel.endpointIds;
        if (sel.tags) batchPayload.tagFilter = sel.tags;
      }
    }

    console.log("⏳ 执行中...");
    const batchRun = await apiFetch<{
      id: string;
      status: string;
      totalCases: number;
      passedCases: number;
      failedCases: number;
      skippedCases: number;
      failureBreakdown: Record<string, number>;
    }>(server, `/nexqa/api/test/exec/batch`, {
      method: "POST",
      body: JSON.stringify(batchPayload),
    });

    console.log("");
    console.log(`📊 结果:`);
    console.log(`   状态: ${batchRun.status}`);
    console.log(`   总计: ${batchRun.totalCases}`);
    console.log(`   通过: ${batchRun.passedCases}`);
    console.log(`   失败: ${batchRun.failedCases}`);
    console.log(`   跳过: ${batchRun.skippedCases}`);
    const passRate =
      batchRun.totalCases > 0
        ? ((batchRun.passedCases / batchRun.totalCases) * 100).toFixed(1)
        : "0.0";
    console.log(`   通过率: ${passRate}%`);

    if (Object.keys(batchRun.failureBreakdown).length > 0) {
      console.log("");
      console.log("   失败分类:");
      for (const [type, count] of Object.entries(batchRun.failureBreakdown)) {
        console.log(`     ${type}: ${count}`);
      }
    }

    // 生成报告
    console.log("");
    console.log("📝 生成报告...");
    const report = await apiFetch<{
      id: string;
      summary: Record<string, unknown>;
    }>(server, `/nexqa/api/reports/generate`, {
      method: "POST",
      body: JSON.stringify({ batchRunId: batchRun.id }),
    });

    // 导出
    if (opts.output || opts.format !== "json") {
      const format = opts.format || "json";
      const exported = await apiFetch<string>(
        server,
        `/nexqa/api/reports/${report.id}/export?format=${format}`,
      );

      if (opts.output) {
        const outPath = resolve(opts.output);
        writeFileSync(outPath, typeof exported === "string" ? exported : JSON.stringify(exported, null, 2));
        console.log(`📁 报告已保存: ${outPath}`);
      } else {
        console.log("");
        console.log(typeof exported === "string" ? exported : JSON.stringify(exported, null, 2));
      }
    } else {
      console.log(`   报告ID: ${report.id}`);
    }

    // 退出码
    if (batchRun.failedCases > 0) {
      console.log("");
      console.log("❌ 测试有失败");
      return 1;
    }

    console.log("");
    console.log("✅ 全部通过");
    return 0;
  } catch (err) {
    console.error("");
    console.error(
      `❌ 执行错误: ${err instanceof Error ? err.message : String(err)}`,
    );
    return 2;
  }
}

// ── Report command ────────────────────────────────────

async function reportCommand(opts: CliOptions): Promise<number> {
  if (!opts.batch) {
    console.error("❌ --batch 参数必填");
    return 2;
  }

  const server = opts.server;
  const format = opts.format || "json";

  try {
    // 先生成报告
    console.log("📝 生成报告...");
    const report = await apiFetch<{ id: string }>(
      server,
      `/nexqa/api/reports/generate`,
      {
        method: "POST",
        body: JSON.stringify({ batchRunId: opts.batch }),
      },
    );

    // 导出
    const res = await fetch(
      resolveUrl(server, `/nexqa/api/reports/${report.id}/export?format=${format}`),
    );
    if (!res.ok) {
      throw new Error(`Export failed: ${res.status}`);
    }

    const content = await res.text();

    if (opts.output) {
      const outPath = resolve(opts.output);
      writeFileSync(outPath, content);
      console.log(`📁 报告已保存: ${outPath}`);
    } else {
      console.log(content);
    }

    return 0;
  } catch (err) {
    console.error(
      `❌ 报告错误: ${err instanceof Error ? err.message : String(err)}`,
    );
    return 2;
  }
}

// ── Main ──────────────────────────────────────────────

async function main(): Promise<void> {
  const opts = parseCliArgs();

  if (opts.help || !opts.command) {
    console.log(HELP);
    process.exit(0);
  }

  let exitCode: number;
  switch (opts.command) {
    case "run":
      exitCode = await runCommand(opts);
      break;
    case "report":
      exitCode = await reportCommand(opts);
      break;
    default:
      console.error(`未知命令: ${opts.command}`);
      console.log(HELP);
      exitCode = 2;
  }

  process.exit(exitCode);
}

main();
