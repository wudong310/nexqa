import { describe, expect, it } from "vitest";
import type { TestReport } from "../services/report-generator.js";
import {
  exportMarkdown,
  exportHtml,
  exportJunitXml,
  exportJson,
  exportReport,
} from "../services/report-exporter.js";

const mockReport: TestReport = {
  id: "report-001",
  batchRunId: "batch-001",
  projectId: "proj-001",
  summary: {
    total: 10,
    passed: 8,
    failed: 2,
    skipped: 0,
    duration: 5000,
    passRate: 0.8,
    environment: "dev",
    triggeredBy: "CLI",
    timestamp: "2026-03-30T10:00:00.000Z",
  },
  failureAnalysis: {
    byType: { status_mismatch: 1, timeout: 1 },
    byEndpoint: { "GET /api/users": 1, "POST /api/orders": 1 },
    byPurpose: { functional: 2 },
    topFailures: [
      {
        caseId: "tc-1",
        caseName: "GET users 错误",
        endpoint: "GET /api/users",
        failType: "status_mismatch",
        failReason: "Expected 200, got 500",
      },
      {
        caseId: "tc-2",
        caseName: "POST orders 超时",
        endpoint: "POST /api/orders",
        failType: "timeout",
        failReason: "Request timed out after 30000ms",
      },
    ],
  },
  coverage: {
    endpoint: 0.85,
    method: 0.7,
    statusCode: 0.6,
  },
  comparison: {
    previousBatchId: "batch-000",
    passRateDelta: -0.05,
    newFailures: ["tc-1"],
    fixedFailures: ["tc-3"],
    newCases: 2,
  },
  stages: [
    {
      name: "冒烟测试",
      status: "passed",
      passRate: 1.0,
      total: 3,
      passed: 3,
      failed: 0,
      duration: 1000,
    },
  ],
  caseDetails: [
    { caseId: "tc-1", caseName: "GET users 错误", endpoint: "GET /api/users", passed: false, duration: 500, failType: "status_mismatch", failReason: "Expected 200, got 500" },
    { caseId: "tc-2", caseName: "POST orders 超时", endpoint: "POST /api/orders", passed: false, duration: 30000, failType: "timeout", failReason: "Request timed out after 30000ms" },
    { caseId: "tc-3", caseName: "GET users 列表", endpoint: "GET /api/users", passed: true, duration: 120 },
    { caseId: "tc-4", caseName: "POST orders 创建", endpoint: "POST /api/orders", passed: true, duration: 200 },
    { caseId: "tc-5", caseName: "GET orders 详情", endpoint: "GET /api/orders/:id", passed: true, duration: 150 },
    { caseId: "tc-6", caseName: "DELETE users 删除", endpoint: "DELETE /api/users/:id", passed: true, duration: 100 },
    { caseId: "tc-7", caseName: "PUT users 更新", endpoint: "PUT /api/users/:id", passed: true, duration: 180 },
    { caseId: "tc-8", caseName: "GET orders 列表", endpoint: "GET /api/orders", passed: true, duration: 130 },
    { caseId: "tc-9", caseName: "POST users 创建", endpoint: "POST /api/users", passed: true, duration: 220 },
    { caseId: "tc-10", caseName: "GET health 检查", endpoint: "GET /api/health", passed: true, duration: 80 },
  ],
  generatedAt: "2026-03-30T10:01:00.000Z",
};

describe("report-exporter", () => {
  describe("Markdown", () => {
    it("生成包含所有区块的 Markdown", () => {
      const md = exportMarkdown(mockReport);

      expect(md).toContain("# 测试报告");
      expect(md).toContain("80.0%"); // pass rate
      expect(md).toContain("85.0%"); // endpoint coverage
      expect(md).toContain("冒烟测试"); // stage
      expect(md).toContain("status_mismatch");
      expect(md).toContain("GET users 错误");
      expect(md).toContain("与上次对比");
      expect(md).toContain("-5.0%");
    });
  });

  describe("HTML", () => {
    it("生成有效 HTML 结构", () => {
      const html = exportHtml(mockReport);

      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("<html");
      expect(html).toContain("80.0%");
      expect(html).toContain("85.0%");
      expect(html).toContain("GET users 错误");
      expect(html).toContain("</html>");
    });

    it("转义 HTML 特殊字符", () => {
      const reportWithSpecial: TestReport = {
        ...mockReport,
        failureAnalysis: {
          ...mockReport.failureAnalysis,
          topFailures: [
            {
              caseId: "tc-1",
              caseName: "Test <script>alert(1)</script>",
              endpoint: "GET /api/test",
              failType: "status_mismatch",
              failReason: 'Body contains "malicious" & <tags>',
            },
          ],
        },
      };

      const html = exportHtml(reportWithSpecial);
      expect(html).not.toContain("<script>");
      expect(html).toContain("&lt;script&gt;");
    });
  });

  describe("JUnit XML", () => {
    it("生成有效的 JUnit XML", () => {
      const xml = exportJunitXml(mockReport);

      expect(xml).toContain('<?xml version="1.0"');
      expect(xml).toContain("<testsuites");
      expect(xml).toContain('tests="10"');
      expect(xml).toContain('failures="2"');
      expect(xml).toContain("<failure");
      expect(xml).toContain("</testsuites>");
    });
  });

  describe("JSON", () => {
    it("返回格式化的 JSON", () => {
      const json = exportJson(mockReport);
      const parsed = JSON.parse(json);

      expect(parsed.id).toBe("report-001");
      expect(parsed.summary.passRate).toBe(0.8);
    });
  });

  describe("exportReport dispatcher", () => {
    it("markdown 返回正确 contentType", () => {
      const result = exportReport(mockReport, "markdown");
      expect(result.contentType).toContain("text/markdown");
      expect(result.extension).toBe("md");
    });

    it("html 返回正确 contentType", () => {
      const result = exportReport(mockReport, "html");
      expect(result.contentType).toContain("text/html");
      expect(result.extension).toBe("html");
    });

    it("junit 返回正确 contentType", () => {
      const result = exportReport(mockReport, "junit");
      expect(result.contentType).toContain("application/xml");
      expect(result.extension).toBe("xml");
    });

    it("json 返回正确 contentType", () => {
      const result = exportReport(mockReport, "json");
      expect(result.contentType).toContain("application/json");
      expect(result.extension).toBe("json");
    });

    it("无效格式抛错", () => {
      expect(() => exportReport(mockReport, "pdf" as any)).toThrow(
        "Unsupported export format",
      );
    });
  });
});
