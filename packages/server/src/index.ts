import { randomUUID } from "node:crypto";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { WebSocketServer, WebSocket as WsWebSocket } from "ws";
import { apiEndpointRoutes } from "./routes/api-endpoints.js";
import { analysisRoutes } from "./routes/analysis.js";
import { batchRunRoutes } from "./routes/batch-runs.js";
import { environmentRoutes } from "./routes/environments.js";
import { fetchUrlRoutes } from "./routes/fetch-url.js";
import { llmRoutes } from "./routes/llm.js";
import { openclawRoutes } from "./routes/openclaw.js";
import { chainGenRoutes } from "./routes/chain-gen.js";
import { projectRoutes } from "./routes/projects.js";
import { settingsRoutes } from "./routes/settings.js";
import { smokeRoutes } from "./routes/smoke.js";
import { testCaseRoutes } from "./routes/test-cases.js";
import { testChainRoutes } from "./routes/test-chains.js";
import { testExecRoutes, testResultRoutes } from "./routes/test-exec.js";
import { testPlanRoutes } from "./routes/test-plans.js";
import { coverageRoutes } from "./routes/coverage.js";
import { reportRoutes } from "./routes/reports.js";
import { projectRegressionRoutes } from "./routes/project-regression.js";
import { projectSecurityRoutes, securityScanRoutes } from "./routes/project-security.js";
import { projectPlanGenRoutes } from "./routes/project-plan-gen.js";
import { projectTrendRoutes } from "./routes/project-trends.js";
import { projectCiRoutes } from "./routes/project-ci.js";
import { projectChainGenRoutes } from "./routes/project-chain-gen.js";
import { projectEnvironmentRoutes } from "./routes/project-environments.js";
import { webhookRoutes } from "./routes/webhooks.js";

type Env = { Variables: { traceId: string } };

const app = new Hono<Env>();

app.use("*", logger());
app.use("*", cors({ origin: "http://localhost:5173" }));

app.use("*", async (c, next) => {
  const traceId = c.req.header("x-trace-id") || randomUUID().slice(0, 8);
  c.set("traceId", traceId);
  c.header("x-trace-id", traceId);
  await next();
});

app.get("/nexqa/api/health", (c) => c.json({ status: "ok" }));
app.route("/nexqa/api/settings", settingsRoutes);
app.route("/nexqa/api/llm", llmRoutes);
app.route("/nexqa/api/projects", projectRoutes);
app.route("/nexqa/api/fetch-url", fetchUrlRoutes);
app.route("/nexqa/api/api-endpoints", apiEndpointRoutes);
app.route("/nexqa/api/test-cases", testCaseRoutes);
app.route("/nexqa/api/test", testExecRoutes);
app.route("/nexqa/api/test-results", testResultRoutes);
app.route("/nexqa/api/environments", environmentRoutes);
app.route("/nexqa/api/batch-runs", batchRunRoutes);
app.route("/nexqa/api/test-plans", testPlanRoutes);
app.route("/nexqa/api/test-chains", testChainRoutes);
app.route("/nexqa/api/coverage", coverageRoutes);
app.route("/nexqa/api/reports", reportRoutes);
app.route("/nexqa/api/analysis", analysisRoutes);
app.route("/nexqa/api/smoke", smokeRoutes);
app.route("/nexqa/api/openclaw", openclawRoutes);
app.route("/nexqa/api/webhooks", webhookRoutes);
app.route("/nexqa/api/chain-gen", chainGenRoutes);
app.route("/nexqa/api/projects", projectRegressionRoutes);
app.route("/nexqa/api/projects", projectSecurityRoutes);
app.route("/nexqa/api/projects", projectPlanGenRoutes);
app.route("/nexqa/api/projects", projectTrendRoutes);
app.route("/nexqa/api/projects", projectCiRoutes);
app.route("/nexqa/api/projects", projectChainGenRoutes);
app.route("/nexqa/api/projects", projectEnvironmentRoutes);
app.route("/nexqa/api/security-scan", securityScanRoutes);

// ── Global error handler ──────────────────────────────
app.onError((err, c) => {
  // Detect ZodError by name (zod is a transitive dependency via @nexqa/shared)
  if (err.name === "ZodError" && "errors" in err) {
    const zodErrors = err.errors as Array<{ path: (string | number)[]; message: string }>;
    const messages = zodErrors.map((e) =>
      e.path.length > 0 ? `${e.path.join(".")}: ${e.message}` : e.message,
    );
    return c.json({ error: messages.join("; ") }, 400);
  }
  console.error("[unhandled]", err);
  return c.json({ error: "Internal Server Error" }, 500);
});

const port = Number(process.env.PORT) || 3456;
console.log(`NexQA server running on http://localhost:${port}`);
const server = serve({ fetch: app.fetch, port });

// --- WebSocket proxy for OpenClaw gateway ---
// Handles upgrade requests to /api/openclaw/ws-proxy?target=<encoded-gateway-url>
// Proxies WebSocket frames bidirectionally, stripping browser Origin header
const wsServer = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url || "/", `http://localhost:${port}`);
  if (url.pathname !== "/nexqa/api/openclaw/ws-proxy") {
    socket.destroy();
    return;
  }

  const target = url.searchParams.get("target");
  if (!target) {
    socket.write("HTTP/1.1 400 Bad Request\r\n\r\nMissing target parameter");
    socket.destroy();
    return;
  }

  // Validate target URL
  let targetUrl: URL;
  try {
    targetUrl = new URL(target);
    if (!["ws:", "wss:"].includes(targetUrl.protocol)) {
      throw new Error("Invalid protocol");
    }
  } catch {
    socket.write("HTTP/1.1 400 Bad Request\r\n\r\nInvalid target URL");
    socket.destroy();
    return;
  }

  console.log(`[ws-proxy] Connecting to gateway: ${target}`);

  // Connect to remote gateway WITHOUT browser Origin header
  const remote = new WsWebSocket(target, {
    // No origin header - this is the key fix
    headers: {},
  });

  remote.on("open", () => {
    console.log(`[ws-proxy] Remote gateway connected`);
    // Accept the client WebSocket upgrade
    wsServer.handleUpgrade(req, socket, head, (clientWs) => {
      console.log(`[ws-proxy] Client WebSocket accepted, bridging`);

      // Bridge: client → remote
      clientWs.on("message", (data, isBinary) => {
        if (remote.readyState === WsWebSocket.OPEN) {
          remote.send(data, { binary: isBinary });
        }
      });

      // Bridge: remote → client
      remote.on("message", (data, isBinary) => {
        if (clientWs.readyState === WsWebSocket.OPEN) {
          clientWs.send(data, { binary: isBinary });
        }
      });

      // Close propagation
      clientWs.on("close", (code, reason) => {
        console.log(`[ws-proxy] Client closed: ${code}`);
        if (remote.readyState === WsWebSocket.OPEN) {
          remote.close(code, reason);
        }
      });

      remote.on("close", (code, reason) => {
        console.log(`[ws-proxy] Remote closed: ${code}`);
        if (clientWs.readyState === WsWebSocket.OPEN) {
          clientWs.close(code, reason);
        }
      });

      // Error handling
      clientWs.on("error", (err) => {
        console.error(`[ws-proxy] Client error:`, err.message);
        remote.close();
      });

      remote.on("error", (err) => {
        console.error(`[ws-proxy] Remote error:`, err.message);
        clientWs.close();
      });
    });
  });

  remote.on("error", (err) => {
    console.error(`[ws-proxy] Failed to connect to remote:`, err.message);
    socket.write("HTTP/1.1 502 Bad Gateway\r\n\r\nFailed to connect to remote gateway");
    socket.destroy();
  });
});

export default app;
export type AppType = typeof app;
