import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import type { ExportFormat } from "@/types/coverage";
import { toast } from "sonner";

const PREVIEW_SNIPPETS: Record<ExportFormat, string> = {
  markdown: `# 测试报告: v2.1 回归 #12

> 环境: test | 触发: 手动 | 时间: 2026-03-30 14:23

## 概要

| 指标 | 值 |
|------|-----|
| 通过率 | 85% (42/50) |
| 失败数 | 5 |
| 跳过数 | 3 |
| 耗时 | 2m 34s |
| 判定 | ❌ 未达标 |

## 失败用例

| # | 用例 | 接口 | 类型 | 原因 |
|---|------|------|------|------|
| 1 | 缺少email字段 | POST /api/users | status_mismatch | 期望400,实际500 |
...`,
  html: `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <title>测试报告: v2.1 回归 #12</title>
  <style>
    body { font-family: system-ui; max-width: 800px; margin: 0 auto; padding: 2rem; }
    .pass { color: #16a34a; }
    .fail { color: #dc2626; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #e5e7eb; padding: 8px; text-align: left; }
  </style>
</head>
<body>
  <h1>测试报告: v2.1 回归 #12</h1>
  <p>环境: test | 触发: 手动 | 2026-03-30 14:23</p>
  ...
</body>
</html>`,
  "junit": `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="v2.1 回归 #12" tests="50" failures="5" skipped="3" time="154">
  <testsuite name="Stage 1: 冒烟测试" tests="10" failures="0" time="45">
    <testcase name="GET /api/users - 获取用户列表" classname="users" time="0.120">
    </testcase>
  </testsuite>
  <testsuite name="Stage 2: 功能测试" tests="35" failures="3" time="80">
    <testcase name="POST /api/users - 缺少email" classname="users" time="0.089">
      <failure type="status_mismatch" message="Expected 400, got 500">
        Request: POST http://test.api.com/api/users
      </failure>
    </testcase>
  </testsuite>
</testsuites>`,
  json: `{
  "id": "rpt-xxx",
  "batchRunId": "batch-xxx",
  "summary": {
    "passRate": 0.85,
    "totalCases": 50,
    "passed": 42,
    "failed": 5,
    "skipped": 3,
    "duration": 154000,
    "environment": "test",
    "triggeredBy": "manual",
    "timestamp": "2026-03-30T14:23:05.000Z"
  },
  "failureAnalysis": {
    "byType": {
      "status_mismatch": 3,
      "schema_violation": 1,
      "timeout": 1
    }
  }
}`,
};

interface PreviewPanelProps {
  format: ExportFormat;
}

export function PreviewPanel({ format }: PreviewPanelProps) {
  const content = PREVIEW_SNIPPETS[format];

  function handleCopy() {
    navigator.clipboard.writeText(content).then(() => {
      toast.success("已复制到剪贴板");
    });
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b">
        <span className="text-xs font-medium text-muted-foreground">预览</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs"
          onClick={handleCopy}
        >
          <Copy className="h-3 w-3 mr-1" />
          复制
        </Button>
      </div>
      <pre className="p-4 text-xs font-mono overflow-x-auto max-h-[240px] overflow-y-auto bg-zinc-950 text-zinc-100">
        <code>{content}</code>
      </pre>
    </div>
  );
}
