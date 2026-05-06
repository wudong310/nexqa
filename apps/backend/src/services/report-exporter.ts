import type { TestReport } from "./report-generator.js";

// ── Markdown ──────────────────────────────────────────

export function exportMarkdown(report: TestReport): string {
  const { summary, failureAnalysis, coverage, comparison, stages } = report;
  const lines: string[] = [];

  lines.push(`# 测试报告`);
  lines.push("");
  lines.push(`- **批次ID**: ${report.batchRunId}`);
  lines.push(`- **项目ID**: ${report.projectId}`);
  lines.push(`- **时间**: ${summary.timestamp}`);
  lines.push(`- **环境**: ${summary.environment || "默认"}`);
  lines.push(`- **触发方式**: ${summary.triggeredBy}`);
  lines.push("");

  // 概览
  lines.push("## 概览");
  lines.push("");
  lines.push(`| 指标 | 值 |`);
  lines.push(`|------|-----|`);
  lines.push(`| 总用例 | ${summary.total} |`);
  lines.push(`| 通过 | ${summary.passed} |`);
  lines.push(`| 失败 | ${summary.failed} |`);
  lines.push(`| 跳过 | ${summary.skipped} |`);
  lines.push(`| 通过率 | ${(summary.passRate * 100).toFixed(1)}% |`);
  lines.push(`| 总耗时 | ${(summary.duration / 1000).toFixed(1)}s |`);
  lines.push("");

  // 覆盖率
  lines.push("## 覆盖率");
  lines.push("");
  lines.push(`| 维度 | 覆盖率 |`);
  lines.push(`|------|--------|`);
  lines.push(`| 接口覆盖率 | ${(coverage.endpoint * 100).toFixed(1)}% |`);
  lines.push(`| 方法覆盖率 | ${(coverage.method * 100).toFixed(1)}% |`);
  lines.push(`| 状态码覆盖率 | ${(coverage.statusCode * 100).toFixed(1)}% |`);
  lines.push("");

  // 阶段结果
  if (stages.length > 0) {
    lines.push("## 阶段结果");
    lines.push("");
    lines.push(`| 阶段 | 状态 | 通过率 | 通过/总计 | 耗时 |`);
    lines.push(`|------|------|--------|----------|------|`);
    for (const stage of stages) {
      lines.push(
        `| ${stage.name} | ${stage.status} | ${(stage.passRate * 100).toFixed(1)}% | ${stage.passed}/${stage.total} | ${(stage.duration / 1000).toFixed(1)}s |`,
      );
    }
    lines.push("");
  }

  // 失败详情
  if (failureAnalysis.topFailures.length > 0) {
    lines.push("## 失败详情");
    lines.push("");

    // 按类型
    lines.push("### 按失败类型");
    lines.push("");
    for (const [type, count] of Object.entries(failureAnalysis.byType)) {
      lines.push(`- **${type}**: ${count} 个`);
    }
    lines.push("");

    // 按接口
    if (Object.keys(failureAnalysis.byEndpoint).length > 0) {
      lines.push("### 按接口");
      lines.push("");
      for (const [ep, count] of Object.entries(failureAnalysis.byEndpoint)) {
        lines.push(`- **${ep}**: ${count} 个`);
      }
      lines.push("");
    }

    // Top 失败
    lines.push("### Top 失败用例");
    lines.push("");
    for (let i = 0; i < failureAnalysis.topFailures.length; i++) {
      const f = failureAnalysis.topFailures[i];
      lines.push(`${i + 1}. **${f.caseName}** (${f.failType})`);
      lines.push(`   > ${f.failReason}`);
    }
    lines.push("");
  }

  // 与上次对比
  if (comparison) {
    lines.push("## 与上次对比");
    lines.push("");
    const delta = comparison.passRateDelta >= 0
      ? `+${(comparison.passRateDelta * 100).toFixed(1)}%`
      : `${(comparison.passRateDelta * 100).toFixed(1)}%`;
    lines.push(`- **通过率变化**: ${delta}`);
    lines.push(`- **新增失败**: ${comparison.newFailures.length} 个`);
    lines.push(`- **已修复**: ${comparison.fixedFailures.length} 个`);
    lines.push(`- **新增用例**: ${comparison.newCases} 个`);
    lines.push("");
  }

  lines.push(`---`);
  lines.push(`> 报告生成时间: ${report.generatedAt}`);

  return lines.join("\n");
}

// ── HTML ──────────────────────────────────────────────

export function exportHtml(report: TestReport): string {
  const md = exportMarkdown(report);
  // 简单 HTML 包装，将 Markdown 内容作为 pre 格式化文本 + 基础 HTML 结构
  const { summary } = report;
  const passRateColor =
    summary.passRate >= 0.95 ? "#22c55e" : summary.passRate >= 0.8 ? "#eab308" : "#ef4444";

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>测试报告 - ${report.batchRunId}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 900px; margin: 0 auto; padding: 24px; color: #333; }
    h1 { border-bottom: 2px solid #eee; padding-bottom: 8px; }
    h2 { color: #1a1a2e; margin-top: 32px; }
    h3 { color: #555; }
    table { border-collapse: collapse; width: 100%; margin: 12px 0; }
    th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
    th { background: #f5f5f5; font-weight: 600; }
    .summary-cards { display: flex; gap: 16px; flex-wrap: wrap; margin: 16px 0; }
    .card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px 24px; min-width: 120px; }
    .card-value { font-size: 28px; font-weight: 700; }
    .card-label { font-size: 13px; color: #666; margin-top: 4px; }
    .pass-rate { color: ${passRateColor}; }
    blockquote { border-left: 3px solid #ddd; margin: 8px 0; padding: 4px 12px; color: #666; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #eee; color: #999; font-size: 12px; }
  </style>
</head>
<body>
  <h1>测试报告</h1>
  <p>批次: ${report.batchRunId} | 环境: ${summary.environment || "默认"} | ${summary.timestamp}</p>
  
  <div class="summary-cards">
    <div class="card">
      <div class="card-value pass-rate">${(summary.passRate * 100).toFixed(1)}%</div>
      <div class="card-label">通过率</div>
    </div>
    <div class="card">
      <div class="card-value">${summary.total}</div>
      <div class="card-label">总用例</div>
    </div>
    <div class="card">
      <div class="card-value" style="color:#22c55e">${summary.passed}</div>
      <div class="card-label">通过</div>
    </div>
    <div class="card">
      <div class="card-value" style="color:#ef4444">${summary.failed}</div>
      <div class="card-label">失败</div>
    </div>
    <div class="card">
      <div class="card-value">${(summary.duration / 1000).toFixed(1)}s</div>
      <div class="card-label">耗时</div>
    </div>
  </div>

  <h2>覆盖率</h2>
  <table>
    <tr><th>维度</th><th>覆盖率</th></tr>
    <tr><td>接口覆盖率</td><td>${(report.coverage.endpoint * 100).toFixed(1)}%</td></tr>
    <tr><td>方法覆盖率</td><td>${(report.coverage.method * 100).toFixed(1)}%</td></tr>
    <tr><td>状态码覆盖率</td><td>${(report.coverage.statusCode * 100).toFixed(1)}%</td></tr>
  </table>

  ${
    report.failureAnalysis.topFailures.length > 0
      ? `<h2>失败详情</h2>
  <table>
    <tr><th>#</th><th>用例</th><th>失败类型</th><th>原因</th></tr>
    ${report.failureAnalysis.topFailures
      .map(
        (f, i) =>
          `<tr><td>${i + 1}</td><td>${escapeHtml(f.caseName)}</td><td>${f.failType}</td><td>${escapeHtml(f.failReason)}</td></tr>`,
      )
      .join("\n    ")}
  </table>`
      : ""
  }

  ${
    report.comparison
      ? `<h2>与上次对比</h2>
  <table>
    <tr><th>指标</th><th>值</th></tr>
    <tr><td>通过率变化</td><td>${report.comparison.passRateDelta >= 0 ? "+" : ""}${(report.comparison.passRateDelta * 100).toFixed(1)}%</td></tr>
    <tr><td>新增失败</td><td>${report.comparison.newFailures.length} 个</td></tr>
    <tr><td>已修复</td><td>${report.comparison.fixedFailures.length} 个</td></tr>
    <tr><td>新增用例</td><td>${report.comparison.newCases} 个</td></tr>
  </table>`
      : ""
  }

  <div class="footer">报告生成时间: ${report.generatedAt}</div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── JUnit XML ─────────────────────────────────────────

export function exportJunitXml(report: TestReport): string {
  const { summary } = report;
  const cases = report.caseDetails ?? [];
  const lines: string[] = [];

  lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  lines.push(
    `<testsuites name="NexQA" tests="${summary.total}" failures="${summary.failed}" skipped="${summary.skipped}" time="${(summary.duration / 1000).toFixed(3)}">`,
  );
  lines.push(
    `  <testsuite name="${escapeXml(report.projectId)}" tests="${summary.total}" failures="${summary.failed}" skipped="${summary.skipped}" time="${(summary.duration / 1000).toFixed(3)}" timestamp="${summary.timestamp}">`,
  );

  if (cases.length > 0) {
    // 有完整用例详情 — 导出全部用例
    for (const c of cases) {
      const classname = c.endpoint || "unknown";
      const time = (c.duration / 1000).toFixed(3);
      if (c.passed) {
        lines.push(
          `    <testcase name="${escapeXml(c.caseName)}" classname="${escapeXml(classname)}" time="${time}" />`,
        );
      } else {
        lines.push(
          `    <testcase name="${escapeXml(c.caseName)}" classname="${escapeXml(classname)}" time="${time}">`,
        );
        lines.push(
          `      <failure type="${escapeXml(c.failType || "unknown")}" message="${escapeXml(c.failReason || "")}" />`,
        );
        lines.push(`    </testcase>`);
      }
    }
  } else {
    // 兼容旧报告（无 caseDetails）— 回退到 topFailures
    for (const f of report.failureAnalysis.topFailures) {
      const classname = ("endpoint" in f && f.endpoint) ? f.endpoint as string : f.failType;
      lines.push(
        `    <testcase name="${escapeXml(f.caseName)}" classname="${escapeXml(classname)}">`,
      );
      lines.push(
        `      <failure type="${escapeXml(f.failType)}" message="${escapeXml(f.failReason)}" />`,
      );
      lines.push(`    </testcase>`);
    }
    // 通过的用例（简化）
    for (let i = 0; i < summary.passed; i++) {
      lines.push(`    <testcase name="passed-${i + 1}" classname="passed" />`);
    }
  }

  lines.push(`  </testsuite>`);
  lines.push(`</testsuites>`);

  return lines.join("\n");
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ── JSON ──────────────────────────────────────────────

export function exportJson(report: TestReport): string {
  return JSON.stringify(report, null, 2);
}

// ── Dispatcher ────────────────────────────────────────

export type ExportFormat = "markdown" | "html" | "junit" | "json";

export function exportReport(report: TestReport, format: ExportFormat): { content: string; contentType: string; extension: string } {
  switch (format) {
    case "markdown":
      return { content: exportMarkdown(report), contentType: "text/markdown; charset=utf-8", extension: "md" };
    case "html":
      return { content: exportHtml(report), contentType: "text/html; charset=utf-8", extension: "html" };
    case "junit":
      return { content: exportJunitXml(report), contentType: "application/xml; charset=utf-8", extension: "xml" };
    case "json":
      return { content: exportJson(report), contentType: "application/json; charset=utf-8", extension: "json" };
    default:
      throw new Error(`Unsupported export format: ${format}`);
  }
}
