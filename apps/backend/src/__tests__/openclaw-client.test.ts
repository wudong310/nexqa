/**
 * OpenClaw Client 单元测试
 *
 * 覆盖：
 * - 连接 + 认证成功
 * - 认证失败（错误 token）
 * - sendAndWait 超时
 * - 自动重连
 * - 断开连接时 pending 请求全部 reject
 *
 * 使用 vi.mock 完全替代 ws 模块，避免真实网络调用
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";

// ── Mock WebSocket ────────────────────────────────────────────────────────────

/** Track all created MockWebSocket instances */
let wsInstances: MockWebSocket[] = [];

class MockWebSocket extends EventEmitter {
  static OPEN = 1;
  static CLOSED = 3;
  static CONNECTING = 0;

  readyState = 1; // OPEN by default
  sentMessages: string[] = [];

  constructor(_url: string) {
    super();
    wsInstances.push(this);
    // Fire 'open' asynchronously
    queueMicrotask(() => this.emit("open"));
  }

  send(data: string) {
    this.sentMessages.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.emit("close", 1000, Buffer.from("normal"));
  }
}

vi.mock("ws", () => {
  return {
    default: MockWebSocket,
    __esModule: true,
  };
});

// Suppress logger output
vi.mock("../services/logger.js", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
    withTraceId: vi.fn().mockReturnThis(),
  }),
}));

// Must import after mocks
const { OpenClawBackendClient } = await import("../services/openclaw-client.js");

// ── Helpers ───────────────────────────────────────────────────────────────────

function getLatestWs(): MockWebSocket {
  return wsInstances[wsInstances.length - 1];
}

/** Simulate auth success on latest WS */
function simulateAuthSuccess(ws: MockWebSocket) {
  const authMsg = JSON.parse(ws.sentMessages[0]);
  ws.emit(
    "message",
    JSON.stringify({
      type: "res",
      id: authMsg.id,
      ok: true,
      payload: {},
    }),
  );
}

/** Helper: create connected client */
async function createConnectedClient(): Promise<{
  client: InstanceType<typeof OpenClawBackendClient>;
  ws: MockWebSocket;
}> {
  const client = new OpenClawBackendClient({
    gatewayUrl: "ws://localhost:4800",
    token: "test-token-123",
    sessionKey: "test-session",
    timeout: 60000,
  });

  const connectPromise = client.connect();
  // Wait for microtask to fire 'open'
  await new Promise((r) => setTimeout(r, 10));
  const ws = getLatestWs();
  simulateAuthSuccess(ws);
  await connectPromise;
  return { client, ws };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("OpenClawBackendClient", () => {
  beforeEach(() => {
    wsInstances = [];
  });

  afterEach(() => {
    // Close all instances
    for (const ws of wsInstances) {
      ws.removeAllListeners();
    }
    wsInstances = [];
  });

  describe("connect + authenticate", () => {
    it("should connect and authenticate successfully", async () => {
      const client = new OpenClawBackendClient({
        gatewayUrl: "ws://localhost:4800",
        token: "test-token-123",
      });

      const connectPromise = client.connect();
      await new Promise((r) => setTimeout(r, 10));

      const ws = getLatestWs();
      expect(ws).toBeDefined();
      expect(ws.sentMessages.length).toBe(1);

      const authMsg = JSON.parse(ws.sentMessages[0]);
      expect(authMsg.type).toBe("req");
      expect(authMsg.method).toBe("connect");
      expect(authMsg.params.token).toBe("test-token-123");

      // Simulate auth success
      simulateAuthSuccess(ws);
      await connectPromise;

      expect(client.isConnected).toBe(true);
      client.disconnect();
    });

    it("should reject on authentication failure (bad token)", async () => {
      const client = new OpenClawBackendClient({
        gatewayUrl: "ws://localhost:4800",
        token: "bad-token",
      });

      const connectPromise = client.connect();
      await new Promise((r) => setTimeout(r, 10));

      const ws = getLatestWs();
      const authMsg = JSON.parse(ws.sentMessages[0]);

      // Simulate auth failure
      ws.emit(
        "message",
        JSON.stringify({
          type: "res",
          id: authMsg.id,
          ok: false,
          error: { message: "Invalid token" },
        }),
      );

      await expect(connectPromise).rejects.toThrow("Invalid token");
      expect(client.isConnected).toBe(false);
    });

    it("should not create multiple connections if already connected", async () => {
      const { client } = await createConnectedClient();
      const initialCount = wsInstances.length;

      // Calling connect again should be a no-op
      await client.connect();
      expect(wsInstances.length).toBe(initialCount);

      client.disconnect();
    });
  });

  describe("sendAndWait", () => {
    it("should send message and receive complete reply", async () => {
      const { client, ws } = await createConnectedClient();

      const sendPromise = client.sendAndWait("Analyze this code");
      await new Promise((r) => setTimeout(r, 10));

      // Find the chat.send request
      const chatMsg = JSON.parse(ws.sentMessages[ws.sentMessages.length - 1]);
      expect(chatMsg.type).toBe("req");
      expect(chatMsg.method).toBe("chat.send");
      expect(chatMsg.params.message).toBe("Analyze this code");
      expect(chatMsg.params.sessionKey).toBe("test-session");

      // Ack the send
      ws.emit(
        "message",
        JSON.stringify({
          type: "res",
          id: chatMsg.id,
          ok: true,
          payload: {},
        }),
      );
      await new Promise((r) => setTimeout(r, 10));

      // Simulate final reply
      ws.emit(
        "message",
        JSON.stringify({
          type: "event",
          event: "chat",
          payload: {
            state: "final",
            idempotencyKey: chatMsg.params.idempotencyKey,
            message: {
              content: [{ type: "text", text: "Here are 3 endpoints found." }],
            },
          },
        }),
      );

      const result = await sendPromise;
      expect(result).toBe("Here are 3 endpoints found.");
      client.disconnect();
    });

    it("should accumulate delta messages and resolve on final", async () => {
      const { client, ws } = await createConnectedClient();

      const sendPromise = client.sendAndWait("test message");
      await new Promise((r) => setTimeout(r, 10));

      const chatMsg = JSON.parse(ws.sentMessages[ws.sentMessages.length - 1]);
      const ik = chatMsg.params.idempotencyKey;

      // Ack
      ws.emit(
        "message",
        JSON.stringify({
          type: "res",
          id: chatMsg.id,
          ok: true,
          payload: {},
        }),
      );
      await new Promise((r) => setTimeout(r, 10));

      // Simulate delta
      ws.emit(
        "message",
        JSON.stringify({
          type: "event",
          event: "chat",
          payload: {
            state: "delta",
            idempotencyKey: ik,
            message: { content: [{ type: "text", text: "partial response" }] },
          },
        }),
      );
      await new Promise((r) => setTimeout(r, 10));

      // Simulate final with empty text — should fall back to deltaBuffer
      ws.emit(
        "message",
        JSON.stringify({
          type: "event",
          event: "chat",
          payload: {
            state: "final",
            idempotencyKey: ik,
            message: { content: [{ type: "text", text: "" }] },
          },
        }),
      );

      const result = await sendPromise;
      expect(result).toBe("partial response");
      client.disconnect();
    });

    it("should reject on chat error event", async () => {
      const { client, ws } = await createConnectedClient();

      const sendPromise = client.sendAndWait("test");
      await new Promise((r) => setTimeout(r, 10));

      const chatMsg = JSON.parse(ws.sentMessages[ws.sentMessages.length - 1]);

      // Ack
      ws.emit(
        "message",
        JSON.stringify({
          type: "res",
          id: chatMsg.id,
          ok: true,
          payload: {},
        }),
      );
      await new Promise((r) => setTimeout(r, 10));

      // Error event
      ws.emit(
        "message",
        JSON.stringify({
          type: "event",
          event: "chat",
          payload: {
            state: "error",
            idempotencyKey: chatMsg.params.idempotencyKey,
            errorMessage: "Model rate limited",
          },
        }),
      );

      await expect(sendPromise).rejects.toThrow("Model rate limited");
      client.disconnect();
    });

    it("should reject on chat aborted event", async () => {
      const { client, ws } = await createConnectedClient();

      const sendPromise = client.sendAndWait("test");
      await new Promise((r) => setTimeout(r, 10));

      const chatMsg = JSON.parse(ws.sentMessages[ws.sentMessages.length - 1]);

      // Ack
      ws.emit(
        "message",
        JSON.stringify({
          type: "res",
          id: chatMsg.id,
          ok: true,
          payload: {},
        }),
      );
      await new Promise((r) => setTimeout(r, 10));

      // Aborted event
      ws.emit(
        "message",
        JSON.stringify({
          type: "event",
          event: "chat",
          payload: {
            state: "aborted",
            idempotencyKey: chatMsg.params.idempotencyKey,
          },
        }),
      );

      await expect(sendPromise).rejects.toThrow("回复被中止");
      client.disconnect();
    });

    it("should timeout when no reply is received", async () => {
      const { client, ws } = await createConnectedClient();

      // Use a very short timeout. Immediately attach .catch to avoid unhandled rejection.
      const sendPromise = client.sendAndWait("test", { timeout: 100 });
      // Attach a no-op catch immediately to prevent unhandled rejection warning
      sendPromise.catch(() => {});

      await new Promise((r) => setTimeout(r, 10));

      const chatMsg = JSON.parse(ws.sentMessages[ws.sentMessages.length - 1]);

      // Ack the send
      ws.emit(
        "message",
        JSON.stringify({
          type: "res",
          id: chatMsg.id,
          ok: true,
          payload: {},
        }),
      );

      // Wait past the timeout
      await new Promise((r) => setTimeout(r, 200));

      await expect(sendPromise).rejects.toThrow("超时");
      client.disconnect();
    });
  });

  describe("auto-reconnect", () => {
    it("should reconnect on sendAndWait if disconnected", async () => {
      const { client, ws: ws1 } = await createConnectedClient();
      expect(client.isConnected).toBe(true);

      // Simulate unexpected disconnection
      ws1.readyState = MockWebSocket.CLOSED;
      ws1.emit("close", 1006, Buffer.from("abnormal"));
      expect(client.isConnected).toBe(false);

      // sendAndWait should trigger reconnect
      const sendPromise = client.sendAndWait("reconnect test");
      await new Promise((r) => setTimeout(r, 10));

      // A new WS should have been created
      const ws2 = getLatestWs();
      expect(ws2).not.toBe(ws1);

      // Authenticate the new connection
      simulateAuthSuccess(ws2);
      await new Promise((r) => setTimeout(r, 10));

      // Chat message should have been sent
      const chatMsg = JSON.parse(ws2.sentMessages[ws2.sentMessages.length - 1]);
      expect(chatMsg.method).toBe("chat.send");

      // Ack + final
      ws2.emit(
        "message",
        JSON.stringify({
          type: "res",
          id: chatMsg.id,
          ok: true,
          payload: {},
        }),
      );
      await new Promise((r) => setTimeout(r, 10));

      ws2.emit(
        "message",
        JSON.stringify({
          type: "event",
          event: "chat",
          payload: {
            state: "final",
            idempotencyKey: chatMsg.params.idempotencyKey,
            message: { text: "reconnected reply" },
          },
        }),
      );

      const result = await sendPromise;
      expect(result).toBe("reconnected reply");
      client.disconnect();
    });
  });

  describe("disconnect with pending requests", () => {
    it("should reject all pending requests on disconnect", async () => {
      const { client, ws } = await createConnectedClient();

      // Start a sendAndWait
      const sendPromise = client.sendAndWait("pending test", { timeout: 60000 });
      await new Promise((r) => setTimeout(r, 10));

      const chatMsg = JSON.parse(ws.sentMessages[ws.sentMessages.length - 1]);

      // Ack the send
      ws.emit(
        "message",
        JSON.stringify({
          type: "res",
          id: chatMsg.id,
          ok: true,
          payload: {},
        }),
      );
      await new Promise((r) => setTimeout(r, 10));

      // Disconnect while waiting for chat reply
      client.disconnect();

      await expect(sendPromise).rejects.toThrow("连接已断开");
    });

    it("should reject pending auth on connection close", async () => {
      const client = new OpenClawBackendClient({
        gatewayUrl: "ws://localhost:4800",
        token: "test-token",
      });

      const connectPromise = client.connect();
      await new Promise((r) => setTimeout(r, 10));

      const ws = getLatestWs();
      // Close without auth response
      ws.readyState = MockWebSocket.CLOSED;
      ws.emit("close", 1006, Buffer.from("gone"));

      await expect(connectPromise).rejects.toThrow();
    });
  });

  describe("message text extraction", () => {
    it("should extract text from content array format", async () => {
      const { client, ws } = await createConnectedClient();

      const sendPromise = client.sendAndWait("test");
      await new Promise((r) => setTimeout(r, 10));
      const chatMsg = JSON.parse(ws.sentMessages[ws.sentMessages.length - 1]);

      // Ack
      ws.emit(
        "message",
        JSON.stringify({
          type: "res",
          id: chatMsg.id,
          ok: true,
          payload: {},
        }),
      );
      await new Promise((r) => setTimeout(r, 10));

      // Final with content array
      ws.emit(
        "message",
        JSON.stringify({
          type: "event",
          event: "chat",
          payload: {
            state: "final",
            idempotencyKey: chatMsg.params.idempotencyKey,
            message: {
              content: [
                { type: "text", text: "Hello " },
                { type: "text", text: "World" },
              ],
            },
          },
        }),
      );

      const result = await sendPromise;
      expect(result).toBe("Hello World");
      client.disconnect();
    });

    it("should extract text from plain text format", async () => {
      const { client, ws } = await createConnectedClient();

      const sendPromise = client.sendAndWait("test");
      await new Promise((r) => setTimeout(r, 10));
      const chatMsg = JSON.parse(ws.sentMessages[ws.sentMessages.length - 1]);

      // Ack
      ws.emit(
        "message",
        JSON.stringify({
          type: "res",
          id: chatMsg.id,
          ok: true,
          payload: {},
        }),
      );
      await new Promise((r) => setTimeout(r, 10));

      // Final with plain text
      ws.emit(
        "message",
        JSON.stringify({
          type: "event",
          event: "chat",
          payload: {
            state: "final",
            idempotencyKey: chatMsg.params.idempotencyKey,
            message: { text: "Simple text response" },
          },
        }),
      );

      const result = await sendPromise;
      expect(result).toBe("Simple text response");
      client.disconnect();
    });
  });
});
