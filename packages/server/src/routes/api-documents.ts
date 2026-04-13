/**
 * API 文档管理路由
 */

import { Hono } from "hono";
import { createLogger } from "../services/logger.js";
import {
  listDocuments,
  getDocument,
  deleteDocument,
  importDocument,
  confirmUpdate,
  getEndpointsByDocumentId,
  getEndpointDetail,
  computeContentHash,
} from "../services/api-document-service.js";

export const apiDocumentRoutes = new Hono()
  // GET /api-documents?projectId={id} — 文档列表
  .get("/", async (c) => {
    const projectId = c.req.query("projectId");
    if (!projectId) return c.json({ error: "projectId 参数必填" }, 400);

    const docs = await listDocuments(projectId);
    return c.json({ data: docs });
  })

  // GET /api-documents/:id — 文档详情（含端点列表）
  .get("/:id", async (c) => {
    const id = c.req.param("id");
    const doc = await getDocument(id);
    if (!doc) return c.json({ error: "文档不存在" }, 404);

    const endpoints = await getEndpointsByDocumentId(id);

    // 计算每个端点的关联用例数（通过 getEndpointDetail）
    const endpointsWithCount = await Promise.all(
      endpoints.map(async (ep) => {
        const detail = await getEndpointDetail(ep.id);
        return {
          ...ep,
          testCaseCount: detail?.testCases.length ?? 0,
        };
      }),
    );

    return c.json({ document: doc, endpoints: endpointsWithCount });
  })

  // POST /api-documents/import — 导入文档
  .post("/import", async (c) => {
    const log = createLogger("api-documents", c.req.header("x-trace-id"));
    log.info("开始导入 API 文档");

    const body = await c.req.json<{
      projectId: string;
      name?: string;
      content: string;
      source?: string;
      updateDocumentId?: string;
    }>();

    if (!body.projectId) return c.json({ error: "projectId 必填" }, 400);
    if (!body.content || typeof body.content !== "string" || !body.content.trim()) {
      return c.json({ error: "content 不能为空" }, 400);
    }

    try {
      const result = await importDocument(body);
      log.info(
        `导入完成: isUpdate=${result.isUpdate}, format=${result.parseResult?.format}, endpoints=${result.parseResult?.endpointCount}`,
      );
      return c.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error("导入失败", message);
      return c.json({ error: message }, 400);
    }
  })

  // POST /api-documents/:id/confirm-update — 确认变更更新
  .post("/:id/confirm-update", async (c) => {
    const log = createLogger("api-documents", c.req.header("x-trace-id"));
    const id = c.req.param("id");
    log.info(`确认更新文档 ${id}`);

    const body = await c.req.json<{
      contentHash: string;
      content: string;
      acceptAdded: string[];
      acceptModified: string[];
      acceptRemoved: string[];
    }>();

    if (!body.contentHash) return c.json({ error: "contentHash 必填" }, 400);
    if (!body.content) return c.json({ error: "content 必填" }, 400);

    try {
      const result = await confirmUpdate(id, body);
      log.info(
        `更新完成: added=${result.added.length}, updated=${result.updated.length}, deleted=${result.deleted.length}, affected=${result.affectedCases.length}`,
      );
      return c.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error("确认更新失败", message);
      return c.json({ error: message }, 400);
    }
  })

  // DELETE /api-documents/:id — 删除文档
  .delete("/:id", async (c) => {
    const log = createLogger("api-documents", c.req.header("x-trace-id"));
    const id = c.req.param("id");
    log.info(`删除文档 ${id}`);

    try {
      const result = await deleteDocument(id);
      log.info(
        `删除完成: endpoints=${result.deletedEndpoints.length}, affectedCases=${result.affectedCases.length}`,
      );
      return c.json({ success: true, ...result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error("删除失败", message);
      return c.json({ error: message }, 400);
    }
  });
