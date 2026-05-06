import { Hono } from "hono";
import type { ExportFormat } from "../services/report-exporter.js";
import { exportReport } from "../services/report-exporter.js";
import {
  getReport,
  listReports,
} from "../services/report-generator.js";

export const reportRoutes = new Hono()
  // GET /reports?projectId=xxx — 获取项目的所有报告
  .get("/", async (c) => {
    const projectId = c.req.query("projectId");
    if (!projectId) {
      return c.json({ error: "projectId query parameter is required" }, 400);
    }
    const reports = await listReports(projectId);
    return c.json(reports);
  })

  // GET /reports/detail — 获取报告详情
  .get("/detail", async (c) => {
    const id = c.req.query("id");
    if (!id) return c.json({ error: "id is required" }, 400);
    const report = await getReport(id);
    if (!report) {
      return c.json({ error: "Report not found" }, 404);
    }
    return c.json(report);
  })

  // GET /reports/export?id=xxx&format=markdown|html|junit|json
  .get("/export", async (c) => {
    const id = c.req.query("id");
    if (!id) return c.json({ error: "id is required" }, 400);
    const format = (c.req.query("format") || "json") as ExportFormat;

    if (!["markdown", "html", "junit", "json"].includes(format)) {
      return c.json(
        { error: "Invalid format. Use: markdown, html, junit, json" },
        400,
      );
    }

    const report = await getReport(id);
    if (!report) {
      return c.json({ error: "Report not found" }, 404);
    }

    const { content, contentType, extension } = exportReport(report, format);

    c.header("Content-Type", contentType);
    c.header(
      "Content-Disposition",
      `attachment; filename="report-${id}.${extension}"`,
    );
    return c.body(content);
  });
