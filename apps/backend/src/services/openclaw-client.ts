/**
 * OpenClaw Gateway WebSocket 后端客户端
 *
 * 使用 shared-secret token 认证，封装连接管理 + 消息收发。
 * 支持自动重连、超时控制、流式消息聚合。
 */

import { randomUUID } from "node:crypto";
import WebSocket from "ws";
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

/** Session 事件 */
export interface SessionEvent {
  state: string;
  message?: unknown;
  runId?: string;
  toolCalls?: unknown;
}

/** Session 事件处理器 */
export type SessionEventHandler = (event: SessionEvent) => void;

// ─── Client ───────────────────────────────────────────────────────────────────

export class OpenClawBackendClient {
  private ws: WebSocket | null = null;
  private config: OpenClawClientConfig;
  private _isConnected = false;
  private connecting: Promise<void> | null = null;

  /** connect lifecycle callbacks */
  private connectResolve: (() => void) | null = null;
  private connectReject: ((err: Error) => void) | null = null;

  /** 用于请求-响应匹配 */
  private pendingRequests = new Map<string, PendingRequest>();
  /** 用于等待 chat 完整回复 */
  private chatWaiters = new Map<string, ChatWaiter>();
  /** Session 事件处理器 */
  private sessionEventHandlers = new Map<string, SessionEventHandler>();
  /** 活跃订阅 */
  private activeSubscriptions = new Map<string, boolean>();

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
        log.info("WebSocket 连接已建立，等待 connect.challenge");
        this.ws = ws;
        this.setupListeners(ws);
        // 认证由 handleFrame 中收到 connect.challenge 后触发
        this.connectResolve = resolve;
        this.connectReject = reject;
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

    // 清理订阅
    this.sessionEventHandlers.clear();
    this.activeSubscriptions.clear();

    // 清理 connect 生命周期回调
    if (this.connectReject) {
      this.connectReject(new Error("连接已断开"));
      this.connectReject = null;
      this.connectResolve = null;
    }
  }

  // ─── 认证 ─────────────────────────────────────────────────────────────────

  /**
   * 发送符合 Gateway 协议的 connect 请求。
   * 由 handleFrame 在收到 connect.challenge 后调用。
   */
  private sendConnectRequest(): void {
    const reqId = randomUUID();
    const timer = setTimeout(() => {
      this.pendingRequests.delete(reqId);
      this.connectReject?.(new Error("认证超时"));
      this.connectReject = null;
      this.connectResolve = null;
    }, 10000);

    this.pendingRequests.set(reqId, {
      resolve: () => {
        clearTimeout(timer);
        this._isConnected = true;
        log.info("Gateway 认证成功");
        this.connectResolve?.();
        this.connectResolve = null;
        this.connectReject = null;
      },
      reject: (err) => {
        clearTimeout(timer);
        this.connectReject?.(err);
        this.connectReject = null;
        this.connectResolve = null;
      },
      timer,
    });

    this.sendRaw({
      type: "req",
      id: reqId,
      method: "connect",
      params: {
        minProtocol: 3,
        maxProtocol: 3,
        client: {
          id: "gateway-client",
          version: "1.0.0",
          platform: process.platform,
          mode: "backend",
        },
        auth: {
          token: this.config.token,
        },
        role: "operator",
        scopes: ["operator.admin"],
      },
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
          const errMsg = (errObj?.message as string) || "请求失败";
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

      // 处理 chat 事件（Gateway 流式进度广播）
      // chat 事件包含 state: "delta"|"final"|"error"、runId、message
      // 这是 Agent 流式输出的核心通道，不需要订阅特定 session
      if (event === "chat") {
        this.handleChatStreamEvent(frame.payload as Record<string, unknown>);
        this.handleChatEvent(frame.payload as Record<string, unknown>);
        return;
      }

      // 处理 session 消息事件（transcript 更新，不含 state 字段）
      // 保留此处理以兼容旧逻辑，但核心事件流已改为 chat 事件
      if (event === "session.message") {
        const payload = frame.payload as Record<string, unknown>;
        const sessionKey = payload.sessionKey as string | undefined;

        // 调用注册的事件处理器
        if (sessionKey) {
          const handler = this.sessionEventHandlers.get(sessionKey);
          if (handler) {
            handler({
              state: payload.state as string,
              message: payload.message,
              runId: payload.runId as string,
              toolCalls: payload.toolCalls,
            });
          }
        }
        return;
      }

      // tick 心跳 - 忽略
      if (event === "tick") return;

      // connect.challenge - Gateway 协议要求收到后再发 connect
      if (event === "connect.challenge") {
        log.info("收到 connect.challenge，发送 connect 请求");
        this.sendConnectRequest();
        return;
      }

      // 其他事件忽略
      return;
    }
  }

  /**
   * 处理 chat 事件（Gateway 流式进度广播）
   *
   * Gateway 的 chat 事件是全局广播，payload 包含：
   * - sessionKey: 关联的 session
   * - state: "delta" | "final" | "error" | "aborted"
   * - runId: 运行 ID
   * - message: 消息内容
   *
   * 此方法按 sessionKey 过滤，查找对应的 sessionEventHandlers 并调用。
   */
  private handleChatStreamEvent(payload: Record<string, unknown>): void {
    if (!payload) return;

    const sessionKey = payload.sessionKey as string | undefined;
    const state = payload.state as string;
    const runId = payload.runId as string;
    const message = payload.message;

    // 按 sessionKey 查找事件处理器
    if (!sessionKey) return;
    const handler = this.sessionEventHandlers.get(sessionKey);
    if (!handler) return;

    // 构造 SessionEvent 并传递给 handler
    const event: SessionEvent = {
      state,
      message,
      runId,
    };

    handler(event);
  }

  /**
   * 处理 chat 事件（用于 sendAndWait 的内部 waiter）
   *
   * 此方法用于处理 sendAndWait() 方法的流式响应收集。
   */
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
      // 保留 run 期间收到的最长 delta 文本
      // Gateway 每个 turn 独立推送 delta（从短到长累积该 turn 的文本）
      // 跨 turn 时长度会重置，但包含 JSON 的 turn 通常是最长的
      if (text.length > waiter.deltaBuffer.length) {
        waiter.deltaBuffer = text;
      }
      return;
    }

    if (state === "final") {
      const finalText = this.extractText(payload.message);
      // Gateway 的 final message 经过 display projection 可能被截断（默认 maxChars=8000）
      // 所以优先使用 deltaBuffer（完整的流式文本），其次使用 final message
      const text =
        waiter.deltaBuffer.length > finalText.length
          ? waiter.deltaBuffer
          : finalText || waiter.deltaBuffer;
      // 如果 text 为空且消息只包含 tool_use/tool_call，说明是中间 turn
      // agent 还在执行 tool calls，真正的最终回复尚未产生，跳过不 resolve
      if (!text && this.isToolOnlyTurn(payload.message)) {
        log.debug("跳过中间 tool-only turn 的 final 事件，继续等待最终回复");
        return;
      }
      // 从 map 中移除
      this.removeWaiter(waiter);
      waiter.resolve(text);
      return;
    }

    if (state === "error") {
      const errMsg = (payload.errorMessage as string) || "AI 回复出错";
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

  private findWaiter(payload: Record<string, unknown>): ChatWaiter | undefined {
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

  /**
   * 判断消息是否只包含 tool_use/tool_call 内容块（无文本输出）。
   * 用于识别 agent 多步 tool call 场景中的中间 turn。
   */
  private isToolOnlyTurn(message: unknown): boolean {
    if (!message || typeof message !== "object") return false;
    const m = message as Record<string, unknown>;
    if (!Array.isArray(m.content)) return false;
    const content = m.content as Array<Record<string, unknown>>;
    if (content.length === 0) return false;
    return content.every(
      (c) => c.type === "tool_use" || c.type === "tool_call",
    );
  }

  // ─── 发送工具 ──────────────────────────────────────────────────────────────

  private sendRaw(frame: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket 未连接");
    }
    const raw = JSON.stringify(frame);
    this.ws.send(raw);
  }

  // ─── Session 管理 ────────────────────────────────────────────────────────────

  /**
   * 创建 Agent session
   *
   * @param options.agentId - Agent ID（如 "nexqa"）
   * @param options.key - Session key（如 "plan-gen-{uuid}"）
   * @param options.initialMessage - 初始消息（可选）
   * @returns sessionId 和 sessionKey
   */
  async createSession(options: {
    agentId: string;
    key: string;
    initialMessage?: string;
  }): Promise<{ sessionId: string; sessionKey: string }> {
    if (!this.isConnected) {
      await this.connect();
    }

    const reqId = randomUUID();

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(reqId);
        reject(new Error("createSession 请求超时"));
      }, 15_000);

      this.pendingRequests.set(reqId, {
        resolve: (payload) => {
          clearTimeout(timer);
          const p = payload as { sessionId?: string; key?: string } | undefined;
          resolve({
            sessionId: p?.sessionId ?? reqId,
            sessionKey: p?.key ?? options.key,
          });
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
        timer,
      });

      const params: Record<string, unknown> = {
        agentId: options.agentId,
        key: options.key,
      };
      if (options.initialMessage) {
        params.message = options.initialMessage;
      }

      this.sendRaw({
        type: "req",
        id: reqId,
        method: "sessions.create",
        params,
      });
    });
  }

  /**
   * 向已有 session 发送消息
   */
  async sendToSession(options: {
    key: string;
    message: string;
  }): Promise<void> {
    if (!this.isConnected) {
      await this.connect();
    }

    const reqId = randomUUID();

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(reqId);
        reject(new Error("sendToSession 请求超时"));
      }, 10_000);

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
        method: "sessions.send",
        params: {
          key: options.key,
          message: options.message,
        },
      });
    });
  }

  /**
   * 订阅 session 消息事件流
   *
   * @param options.key - Session key
   * @param options.onEvent - 事件回调
   * @returns unsubscribe 函数
   */
  async subscribeToSession(options: {
    key: string;
    onEvent: SessionEventHandler;
  }): Promise<() => void> {
    if (!this.isConnected) {
      await this.connect();
    }

    const subscriptionId = randomUUID();

    // 发送订阅请求
    const reqId = randomUUID();
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(reqId);
        reject(new Error("subscribe 请求超时"));
      }, 10_000);

      this.pendingRequests.set(reqId, {
        resolve: () => {
          clearTimeout(timer);
          this.activeSubscriptions.set(subscriptionId, true);
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
        method: "sessions.messages.subscribe",
        params: { key: options.key },
      });
    });

    // 注册事件处理器
    this.sessionEventHandlers.set(options.key, options.onEvent);

    // 返回 unsubscribe 函数
    return () => {
      this.activeSubscriptions.delete(subscriptionId);
      this.sessionEventHandlers.delete(options.key);
    };
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
