/**
 * OpenClaw Gateway WebSocket 后端客户端
 *
 * 使用 shared-secret token 认证，封装连接管理 + 消息收发。
 * 支持自动重连、超时控制、流式消息聚合。
 */

import WebSocket from "ws";
import { randomUUID } from "node:crypto";
import { createLogger } from "./logger.js";

const log = createLogger("openclaw-client");

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OpenClawClientConfig {
  /** Gateway WebSocket 地址，如 ws://localhost:4800 */
  gatewayUrl: string;
  /** shared-secret token */
  token: string;
  /** 默认 session key，默认 "nexqa" */
  sessionKey?: string;
  /** sendAndWait 超时，默认 60000ms */
  timeout?: number;
}

export interface OpenClawMessage {
  role: "user" | "assistant";
  content: string;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
}

interface ChatWaiter {
  resolve: (text: string) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  deltaBuffer: string;
  /** 关联的 idempotencyKey，用于匹配 chat 事件 */
  idempotencyKey: string;
}

// ─── Client ───────────────────────────────────────────────────────────────────

export class OpenClawBackendClient {
  private ws: WebSocket | null = null;
  private config: OpenClawClientConfig;
  private _isConnected = false;
  private connecting: Promise<void> | null = null;

  /** 用于请求-响应匹配 */
  private pendingRequests = new Map<string, PendingRequest>();
  /** 用于等待 chat 完整回复 */
  private chatWaiters = new Map<string, ChatWaiter>();

  constructor(config: OpenClawClientConfig) {
    this.config = {
      sessionKey: "nexqa",
      timeout: 60000,
      ...config,
    };
  }

  get isConnected(): boolean {
    return (
      this._isConnected &&
      this.ws !== null &&
      this.ws.readyState === WebSocket.OPEN
    );
  }

  // ─── 连接管理 ─────────────────────────────────────────────────────────────

  /** 连接 Gateway（含 shared-secret 认证） */
  async connect(): Promise<void> {
    if (this.isConnected) return;
    if (this.connecting) return this.connecting;

    this.connecting = this._connect();
    try {
      await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  private _connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const url = this.config.gatewayUrl;
      log.info(`正在连接 Gateway: ${url}`);

      const ws = new WebSocket(url);
      const connectTimeout = setTimeout(() => {
        ws.close();
        reject(new Error(`连接超时: ${url}`));
      }, 15000);

      ws.on("open", () => {
        clearTimeout(connectTimeout);
        log.info("WebSocket 连接已建立，开始认证");
        this.ws = ws;
        this.setupListeners(ws);
        this.authenticate()
          .then(() => {
            this._isConnected = true;
            log.info("Gateway 认证成功");
            resolve();
          })
          .catch((err) => {
            this.ws = null;
            ws.close();
            reject(err);
          });
      });

      ws.on("error", (err) => {
        clearTimeout(connectTimeout);
        log.error("WebSocket 连接失败", err.message);
        reject(new Error(`WebSocket 连接失败: ${err.message}`));
      });
    });
  }

  /** 断开连接 */
  disconnect(): void {
    this._isConnected = false;
    if (this.ws) {
      log.info("主动断开 Gateway 连接");
      this.ws.close();
      this.ws = null;
    }
    this.cleanup();
  }

  private cleanup(): void {
    // 拒绝所有 pending
    for (const [, req] of this.pendingRequests) {
      if (req.timer) clearTimeout(req.timer);
      req.reject(new Error("连接已断开"));
    }
    this.pendingRequests.clear();

    for (const [, waiter] of this.chatWaiters) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error("连接已断开"));
    }
    this.chatWaiters.clear();
  }

  // ─── 认证 ─────────────────────────────────────────────────────────────────

  private authenticate(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const reqId = randomUUID();
      const timer = setTimeout(() => {
        this.pendingRequests.delete(reqId);
        reject(new Error("认证超时"));
      }, 10000);

      this.pendingRequests.set(reqId, {
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
        timer,
      });

      this.sendRaw({
        type: "req",
        id: reqId,
        method: "connect",
        params: { token: this.config.token },
      });
    });
  }

  // ─── 消息收发 ──────────────────────────────────────────────────────────────

  /**
   * 发消息并等待完整回复
   *
   * 内部流程：
   * 1. 确保已连接（自动重连）
   * 2. 发送 chat.send 帧
   * 3. 收集 delta 事件
   * 4. 等到 final=true 时返回完整文本
   * 5. 超时抛异常
   */
  async sendAndWait(
    message: string,
    options?: {
      sessionKey?: string;
      timeout?: number;
      systemPrompt?: string;
    },
  ): Promise<string> {
    // 自动重连
    if (!this.isConnected) {
      log.info("连接已断开，尝试重连...");
      await this.connect();
    }

    const sessionKey = options?.sessionKey ?? this.config.sessionKey!;
    const timeout = options?.timeout ?? this.config.timeout!;
    const idempotencyKey = randomUUID();
    const reqId = randomUUID();

    // 发送 chat.send
    const params: Record<string, unknown> = {
      sessionKey,
      message,
      idempotencyKey,
    };
    if (options?.systemPrompt) {
      params.systemPrompt = options.systemPrompt;
    }

    this.sendRaw({
      type: "req",
      id: reqId,
      method: "chat.send",
      params,
    });

    // 等待 chat.send 的 res 确认（不阻塞 chat 事件收集）
    const ackPromise = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(reqId);
        reject(new Error("chat.send 请求确认超时"));
      }, 10000);

      this.pendingRequests.set(reqId, {
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
        timer,
      });
    });

    // 注册 chat waiter（用 idempotencyKey 匹配）
    const chatPromise = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.chatWaiters.delete(idempotencyKey);
        reject(new Error(`等待回复超时 (${timeout}ms)`));
      }, timeout);

      this.chatWaiters.set(idempotencyKey, {
        resolve: (text) => {
          clearTimeout(timer);
          resolve(text);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
        timer,
        deltaBuffer: "",
        idempotencyKey,
      });
    });

    // 等待发送确认
    await ackPromise;
    log.info(`chat.send 已确认 (session=${sessionKey})`);

    // 等待完整回复
    const reply = await chatPromise;
    log.info(`收到完整回复 (${reply.length} chars)`);
    return reply;
  }

  // ─── WebSocket 事件处理 ────────────────────────────────────────────────────

  private setupListeners(ws: WebSocket): void {
    ws.on("message", (data) => {
      try {
        const raw = data.toString();
        const frame = JSON.parse(raw) as Record<string, unknown>;
        this.handleFrame(frame);
      } catch (err) {
        log.error(
          "消息解析失败",
          err instanceof Error ? err.message : String(err),
        );
      }
    });

    ws.on("close", (code, reason) => {
      log.warn(`Gateway 连接关闭: code=${code} reason=${reason.toString()}`);
      this._isConnected = false;
      this.ws = null;
      this.cleanup();
    });

    ws.on("error", (err) => {
      log.error("Gateway WebSocket 错误", err.message);
    });
  }

  private handleFrame(frame: Record<string, unknown>): void {
    const type = frame.type as string;

    // 响应帧
    if (type === "res") {
      const id = frame.id as string;
      const pending = this.pendingRequests.get(id);
      if (pending) {
        this.pendingRequests.delete(id);
        if (frame.ok === false || frame.error) {
          const errObj = frame.error as Record<string, unknown> | undefined;
          const errMsg =
            (errObj?.message as string) || "请求失败";
          pending.reject(new Error(errMsg));
        } else {
          pending.resolve(frame.payload);
        }
      }
      return;
    }

    // 事件帧
    if (type === "event") {
      const event = frame.event as string;

      if (event === "chat") {
        this.handleChatEvent(frame.payload as Record<string, unknown>);
        return;
      }

      // tick 心跳 - 忽略
      if (event === "tick") return;

      // connect.challenge - 不应在 shared-secret 模式下收到
      if (event === "connect.challenge") {
        log.warn("收到 connect.challenge，shared-secret 模式不应收到此事件");
        return;
      }

      // 其他事件忽略
      return;
    }
  }

  private handleChatEvent(payload: Record<string, unknown>): void {
    if (!payload) return;

    const state = payload.state as string;
    const runId = payload.runId as string;

    // 匹配 waiter：通过 sessionKey + runId
    // 由于 Gateway 可能不回传 idempotencyKey，
    // 我们用 sessionKey 匹配第一个等待的 waiter
    const waiter = this.findWaiter(payload);
    if (!waiter) return;

    if (state === "delta") {
      const text = this.extractText(payload.message);
      waiter.deltaBuffer = text; // delta 是累积的
      return;
    }

    if (state === "final") {
      const text =
        this.extractText(payload.message) || waiter.deltaBuffer;
      // 从 map 中移除
      this.removeWaiter(waiter);
      waiter.resolve(text);
      return;
    }

    if (state === "error") {
      const errMsg =
        (payload.errorMessage as string) || "AI 回复出错";
      this.removeWaiter(waiter);
      waiter.reject(new Error(errMsg));
      return;
    }

    if (state === "aborted") {
      this.removeWaiter(waiter);
      waiter.reject(new Error("回复被中止"));
      return;
    }
  }

  private findWaiter(
    payload: Record<string, unknown>,
  ): ChatWaiter | undefined {
    // 如果 payload 包含 idempotencyKey，精确匹配
    const ik = payload.idempotencyKey as string | undefined;
    if (ik && this.chatWaiters.has(ik)) {
      return this.chatWaiters.get(ik);
    }

    // 兜底：如果只有一个 waiter（常见场景），直接返回
    if (this.chatWaiters.size === 1) {
      return this.chatWaiters.values().next().value;
    }

    // 多个 waiter 时通过 sessionKey 匹配
    const sessionKey = payload.sessionKey as string | undefined;
    if (sessionKey) {
      for (const [, w] of this.chatWaiters) {
        // waiter 没有 sessionKey 信息，返回第一个
        return w;
      }
    }

    return undefined;
  }

  private removeWaiter(waiter: ChatWaiter): void {
    this.chatWaiters.delete(waiter.idempotencyKey);
  }

  private extractText(message: unknown): string {
    if (!message || typeof message !== "object") return "";
    const m = message as Record<string, unknown>;
    // content 数组格式
    if (Array.isArray(m.content)) {
      return (m.content as Array<Record<string, unknown>>)
        .filter((c) => c.type === "text" && typeof c.text === "string")
        .map((c) => c.text as string)
        .join("");
    }
    // 纯文本格式
    if (typeof m.text === "string") return m.text;
    if (typeof m.content === "string") return m.content;
    return "";
  }

  // ─── 发送工具 ──────────────────────────────────────────────────────────────

  private sendRaw(frame: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket 未连接");
    }
    const raw = JSON.stringify(frame);
    this.ws.send(raw);
  }
}

// ─── 工厂函数 ──────────────────────────────────────────────────────────────────

/**
 * 创建 OpenClaw 后端客户端实例
 */
export function createOpenClawClient(
  config: OpenClawClientConfig,
): OpenClawBackendClient {
  return new OpenClawBackendClient(config);
}
