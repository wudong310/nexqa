import { Hono } from "hono";
import type { GitSource, ScanRecord, Project } from "@nexqa/shared";
import { runScan } from "../services/source-scanner.js";
import { storage } from "../services/storage.js";

const COLLECTION_GIT_SOURCES = "git-sources";
const COLLECTION_SCAN_RECORDS = "scan-records";

/**
 * 获取 OpenClaw Gateway token
 * 优先从 settings 的 openclawToken 字段读取，其次从环境变量 OPENCLAW_GATEWAY_TOKEN 读取
 */
async function getOpenClawToken(): Promise<string | null> {
  try {
    const raw = await storage.readRaw("settings.json");
    if (raw) {
      const settings = JSON.parse(raw);
      if (settings.openclawToken) return settings.openclawToken as string;
    }
  } catch {
    // settings 解析失败，继续尝试环境变量
  }
  return process.env.OPENCLAW_GATEWAY_TOKEN ?? null;
}

export const scanRoutes = new Hono()
  // POST /git-sources/:id/scan — 触发扫描（异步，立即返回 ScanRecord）
  .post("/git-sources/:id/scan", async (c) => {
    const id = c.req.param("id");

    // 1. 读取 GitSource
    const gitSource = await storage.read<GitSource>(COLLECTION_GIT_SOURCES, id);
    if (!gitSource) {
      return c.json({ error: "Git source 不存在" }, 404);
    }

    // 2. 读取 Project，获取 OpenClaw 连接配置
    const project = await storage.read<Project>("projects", gitSource.projectId);
    if (!project) {
      return c.json({ error: "项目不存在" }, 404);
    }

    const conn = project.openclawConnections?.find(
      (item) => item.id === gitSource.openclawConnectionId,
    );
    if (!conn) {
      return c.json({ error: "OpenClaw 连接配置不存在" }, 400);
    }

    // 3. 获取 token
    const token = await getOpenClawToken();
    if (!token) {
      return c.json(
        { error: "OpenClaw Gateway token 未配置，请在设置中配置 openclawToken 或设置环境变量 OPENCLAW_GATEWAY_TOKEN" },
        400,
      );
    }

    const openclawConfig = {
      gatewayUrl: conn.gatewayUrl,
      token,
    };

    // 4. 解析可选参数
    const body = await c.req.json().catch(() => ({}));
    const options = body.branch ? { branch: body.branch as string } : undefined;

    // 5. 异步触发扫描（fire-and-forget）
    // runScan 内部第一步就创建并持久化 ScanRecord(status=pending)
    // 使用 Promise wrapper 等待初始 record 创建后再返回
    const scanResultPromise = runScan(gitSource, openclawConfig, options);

    // 给 runScan 微任务时间完成第一步（创建 + 持久化初始 record）
    // runScan 的第一个 await 是 saveScanRecord，会在下一个 microtick 完成
    await new Promise<void>((resolve) => setImmediate(resolve));

    // 从 storage 查找刚创建的最新 scan record
    const allRecords = await storage.list<ScanRecord>(COLLECTION_SCAN_RECORDS);
    const latestRecord = allRecords
      .filter((r) => r.gitSourceId === id)
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0];

    // 后台继续执行扫描，不阻塞响应
    void scanResultPromise.catch(() => {
      // runScan 内部已处理错误并更新 record 状态，此处防止 unhandled rejection
    });

    if (latestRecord) {
      return c.json(latestRecord, 202);
    }

    // fallback：极端情况下 record 还未落库，返回基本信息
    return c.json(
      { message: "扫描已触发", gitSourceId: id, status: "pending" },
      202,
    );
  })

  // GET /scan-records — 列表查询
  .get("/scan-records", async (c) => {
    const gitSourceId = c.req.query("gitSourceId");
    if (!gitSourceId) {
      return c.json({ error: "gitSourceId 参数必填" }, 400);
    }

    const limitStr = c.req.query("limit");
    const offsetStr = c.req.query("offset");
    const limit = limitStr ? Math.max(1, parseInt(limitStr, 10) || 20) : 20;
    const offset = offsetStr ? Math.max(0, parseInt(offsetStr, 10) || 0) : 0;

    const allRecords = await storage.list<ScanRecord>(COLLECTION_SCAN_RECORDS);

    // 按 gitSourceId 过滤
    const filtered = allRecords.filter((r) => r.gitSourceId === gitSourceId);

    // 按 startedAt 倒序
    filtered.sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    );

    // 分页
    const total = filtered.length;
    const items = filtered.slice(offset, offset + limit);

    return c.json({ items, total, limit, offset });
  })

  // GET /scan-records/:id — 详情
  .get("/scan-records/:id", async (c) => {
    const id = c.req.param("id");
    const record = await storage.read<ScanRecord>(COLLECTION_SCAN_RECORDS, id);
    if (!record) {
      return c.json({ error: "扫描记录不存在" }, 404);
    }
    return c.json(record);
  });
