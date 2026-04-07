import type { OpenClawConnection } from "@nexqa/shared";

export type ConnectionStatus = "disconnected" | "connecting" | "connected";

export type LogDirection = "send" | "recv" | "info" | "error";

export interface ProtocolLogEntry {
  id: string;
  ts: string;
  direction: LogDirection;
  message: string;
  rawJson?: string;
  /** Session key for filtering logs by session. Undefined = global/connection log (shown in all tabs) */
  sessionKey?: string;
}

/** Base64 direct attachment (sent via gateway WS) */
export interface Base64Attachment {
  mimeType: string;
  content: string;
  fileName?: string;
}

/** URL-based attachment (sent via claw-runner proxy) */
export interface UrlAttachment {
  url: string;
  mime: string;
}

export type Attachment = Base64Attachment | UrlAttachment;

export function isBase64Attachment(att: Attachment): att is Base64Attachment {
  return "mimeType" in att && "content" in att;
}

export function isUrlAttachment(att: Attachment): att is UrlAttachment {
  return "url" in att && "mime" in att;
}

export type ImageSendMode = "auto" | "direct" | "proxy";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  /** For assistant messages during streaming */
  streaming?: boolean;
  /** Attachments sent with user messages */
  attachments?: Attachment[];
  /** Actual send mode used for image (direct / proxy) */
  sendMode?: "direct" | "proxy";
  /** Image send status */
  sendStatus?: "sending" | "sent" | "error";
  /** Error message when sendStatus is 'error' */
  errorMessage?: string;
}

export interface AgentActivity {
  phase: string;
  name: string;
  ts: number;
}

export interface OpenClawClientEvents {
  onStatusChange: (status: ConnectionStatus) => void;
  onLog: (entry: ProtocolLogEntry) => void;
  onChatDelta: (runId: string, text: string) => void;
  onChatFinal: (runId: string, text: string) => void;
  onChatError: (runId: string, error: string) => void;
  onChatAborted: (runId: string) => void;
  onAgentEvent: (activity: AgentActivity) => void;
  onError: (error: string) => void;
}

function ts(): string {
  return new Date().toISOString().slice(11, 23);
}

function uuid(): string {
  return crypto.randomUUID();
}

function extractTextFromMessage(msg: unknown): string {
  if (!msg || typeof msg !== "object") return "";
  const m = msg as Record<string, unknown>;
  if (Array.isArray(m.content)) {
    return (m.content as Array<Record<string, unknown>>)
      .filter((c) => c.type === "text" && typeof c.text === "string")
      .map((c) => c.text as string)
      .join("");
  }
  if (typeof m.text === "string") return m.text;
  return "";
}

export class OpenClawClient {
  private ws: WebSocket | null = null;
  private config: OpenClawConnection;
  private events: OpenClawClientEvents;
  private status: ConnectionStatus = "disconnected";
  private connectReqId: string | null = null;
  private pendingRequests = new Map<
    string,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();
  /** Maps runId → latest delta text for fallback on final */
  private latestDeltaText = new Map<string, string>();
  private logIdCounter = 0;

  constructor(config: OpenClawConnection, events: OpenClawClientEvents) {
    this.config = config;
    this.events = events;
  }

  get connectionStatus(): ConnectionStatus {
    return this.status;
  }

  /** Dynamic session key override — when set, used instead of config-derived key */
  private _sessionKeyOverride: string | null = null;
  private _senderNameOverride: string | null = null;

  setSessionKeyOverride(key: string | null): void {
    this._sessionKeyOverride = key;
  }

  setSenderNameOverride(name: string | null): void {
    this._senderNameOverride = name;
  }

  getSessionKey(): string {
    if (this._sessionKeyOverride) return this._sessionKeyOverride;
    // Fallback defaults (session params are always provided via override)
    return `agent:main:webchat:default:dm:nexqa-test`;
  }

  private setStatus(s: ConnectionStatus) {
    this.status = s;
    this.events.onStatusChange(s);
  }

  private addLog(
    direction: LogDirection,
    message: string,
    rawJson?: string,
    sessionKey?: string,
  ): void {
    this.logIdCounter++;
    this.events.onLog({
      id: `log-${this.logIdCounter}`,
      ts: ts(),
      direction,
      message,
      rawJson,
      sessionKey,
    });
  }

  async connect(): Promise<void> {
    if (this.status !== "disconnected") return;
    this.setStatus("connecting");

    try {
      await this.establishConnection();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "连接失败";
      this.addLog("error", msg);
      this.events.onError(msg);
      this.setStatus("disconnected");
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.addLog("info", "主动断开连接");
      this.ws.close();
      this.ws = null;
    }
    this.setStatus("disconnected");
    this.pendingRequests.clear();
    this.latestDeltaText.clear();
  }

  async sendMessage(
    text: string,
    attachments?: Attachment[],
  ): Promise<void> {
    if (this.status !== "connected" || !this.ws) {
      throw new Error("未连接");
    }

    const sendId = uuid();
    const idempotencyKey = uuid();
    const sessionKey = this.getSessionKey();

    const params: Record<string, unknown> = {
      sessionKey,
      message: text,
      idempotencyKey,
    };
    if (attachments && attachments.length > 0) {
      params.attachments = attachments;
    }
    if (this._senderNameOverride) {
      params.senderName = this._senderNameOverride;
    }

    const frame = {
      type: "req",
      id: sendId,
      method: "chat.send",
      params,
    };

    this.sendFrame(frame);

    // Wait for the response (non-blocking, just acknowledge)
    return new Promise<void>((resolve, reject) => {
      this.pendingRequests.set(sendId, {
        resolve: () => resolve(),
        reject: (e) => reject(e),
      });
    });
  }

  /**
   * Send message via claw-runner HTTP proxy.
   * Used for URL-based attachments that claw-runner downloads and converts to base64.
   */
  async sendMessageViaProxy(
    text: string,
    attachments?: UrlAttachment[],
  ): Promise<void> {
    const clawRunnerUrl = this.config.clawRunnerUrl;
    const sessionKey = this.getSessionKey();
    const idempotencyKey = uuid();

    const body: Record<string, unknown> = {
      sessionKey,
      message: text,
      idempotencyKey,
    };
    if (attachments && attachments.length > 0) {
      body.attachments = attachments;
    }
    if (this._senderNameOverride) {
      body.senderName = this._senderNameOverride;
    }

    this.addLog("send", `[proxy] POST ${clawRunnerUrl}/api/chat/send`, JSON.stringify(body));

    // 强制 HTTPS，避免 HTTP→HTTPS 301 重定向导致 POST 降级为 GET
    const safeUrl = clawRunnerUrl.replace(/\/$/, "").replace(/^http:\/\//i, "https://");
    const res = await fetch(`${safeUrl}/api/chat/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      const errMsg = `代理发送失败: ${res.status} ${errText}`;
      this.addLog("error", errMsg);
      throw new Error(errMsg);
    }

    this.addLog("recv", `[proxy] 发送成功 (${res.status})`);
  }

  private sendFrame(frame: unknown): void {
    const raw = JSON.stringify(frame);
    // Extract sessionKey from chat.send params for log filtering
    const f = frame as Record<string, unknown>;
    const frameSessionKey = (f.method === "chat.send" && f.params)
      ? ((f.params as Record<string, unknown>).sessionKey as string | undefined)
      : undefined;
    this.addLog("send", this.summarizeFrame(frame), raw, frameSessionKey);
    this.ws?.send(raw);
  }

  private summarizeFrame(frame: unknown): string {
    const f = frame as Record<string, unknown>;
    if (f.type === "req") {
      return `${f.method} (id=${(f.id as string).slice(0, 8)}...)`;
    }
    return JSON.stringify(frame).slice(0, 100);
  }

  private async establishConnection(): Promise<void> {
    const { gatewayUrl, clawRunnerUrl, timeout } = this.config;

    this.addLog("info", `正在连接 ${gatewayUrl} ...`);

    // Step 1: WebSocket connect via backend proxy to avoid browser Origin header
    // The proxy strips the browser's Origin so gateway doesn't reject us
    const proxyUrl = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/nexqa/api/openclaw/ws-proxy?target=${encodeURIComponent(gatewayUrl)}`;
    this.addLog("info", `使用 WebSocket 代理: ${proxyUrl}`);

    const ws = await new Promise<WebSocket>((resolve, reject) => {
      const wsObj = new WebSocket(proxyUrl);
      const timer = setTimeout(() => {
        wsObj.close();
        reject(new Error(`连接超时 (${timeout.connect}ms)`));
      }, timeout.connect);

      wsObj.onopen = () => {
        clearTimeout(timer);
        this.addLog("info", "WebSocket 连接已建立 (via proxy)");
        resolve(wsObj);
      };
      wsObj.onerror = () => {
        clearTimeout(timer);
        reject(new Error("WebSocket 连接失败"));
      };
    });

    this.ws = ws;

    // Setup persistent message handler
    ws.onmessage = (event) => this.handleMessage(event);
    ws.onclose = () => {
      this.addLog("info", "WebSocket 连接已关闭");
      this.setStatus("disconnected");
      this.pendingRequests.clear();
    };
    ws.onerror = () => {
      this.addLog("error", "WebSocket 错误");
    };

    // Step 2-5: Wait for challenge, sign, connect
    await this.waitForHandshake(clawRunnerUrl, timeout.handshake);
    this.setStatus("connected");
  }

  private waitForHandshake(
    clawRunnerUrl: string,
    timeout: number,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`握手超时 (${timeout}ms)`));
      }, timeout);

      // The connect response will be handled by handleMessage
      // We just need to set up the promise for the connect request
      const onConnect = (ok: boolean, error?: string) => {
        clearTimeout(timer);
        if (ok) {
          resolve();
        } else {
          reject(new Error(error || "认证失败"));
        }
      };

      // Store the resolve/reject for the handshake
      this._handshakeCallback = onConnect;
      this._handshakeClawRunnerUrl = clawRunnerUrl;
    });
  }

  private _handshakeCallback:
    | ((ok: boolean, error?: string) => void)
    | null = null;
  private _handshakeClawRunnerUrl = "";

  private async handleMessage(event: MessageEvent): Promise<void> {
    try {
      const raw = event.data as string;
      const frame = JSON.parse(raw);

      // Log all received frames (extract sessionKey from chat/agent events for filtering)
      const frameSessionKey = (frame.type === "event" && (frame.event === "chat" || frame.event === "agent"))
        ? (frame.payload?.sessionKey as string | undefined)
        : undefined;
      this.addLog("recv", this.summarizeRecvFrame(frame), raw, frameSessionKey);

      // Handle connect.challenge
      if (
        frame.type === "event" &&
        frame.event === "connect.challenge" &&
        frame.payload?.nonce
      ) {
        await this.handleChallenge(frame.payload.nonce);
        return;
      }

      // Handle connect response
      if (frame.type === "res" && frame.id === this.connectReqId) {
        this.connectReqId = null;
        if (frame.ok === false || frame.error) {
          const errMsg = frame.error?.message || "认证失败";
          this._handshakeCallback?.(false, errMsg);
        } else {
          this._handshakeCallback?.(true);
        }
        this._handshakeCallback = null;
        return;
      }

      // Handle other responses
      if (frame.type === "res" && this.pendingRequests.has(frame.id)) {
        const pending = this.pendingRequests.get(frame.id)!;
        this.pendingRequests.delete(frame.id);
        if (frame.ok === false || frame.error) {
          pending.reject(new Error(frame.error?.message || "请求失败"));
        } else {
          pending.resolve(frame.payload);
        }
        return;
      }

      // Handle chat events
      if (frame.type === "event" && frame.event === "chat") {
        this.handleChatEvent(frame.payload);
        return;
      }

      // Handle agent events
      if (frame.type === "event" && frame.event === "agent") {
        this.handleAgentEvent(frame.payload);
        return;
      }

      // tick - ignore silently (already logged)
    } catch (e) {
      console.warn("[openclaw-client] handleMessage JSON 解析失败:", e);
    }
  }

  private async handleChallenge(nonce: string): Promise<void> {
    const clawRunnerUrl = this._handshakeClawRunnerUrl;
    try {
      // Use backend proxy to avoid CORS issues with claw-runner
      const url = "/nexqa/api/openclaw/proxy-sign-challenge";
      this.addLog(
        "info",
        `调用 claw-runner 签名 (via proxy): ${clawRunnerUrl}`,
      );

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clawRunnerUrl, nonce }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`signChallenge 失败: ${res.status} ${body}`);
      }

      const data = await res.json();
      const connectParams = data.connectParams;

      this.addLog("info", "获取签名成功，发送 connect 请求");

      this.connectReqId = uuid();
      this.sendFrame({
        type: "req",
        id: this.connectReqId,
        method: "connect",
        params: connectParams,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "签名失败";
      this.addLog("error", msg);
      this._handshakeCallback?.(false, msg);
      this._handshakeCallback = null;
    }
  }

  private handleChatEvent(payload: Record<string, unknown>): void {
    // 只处理当前会话的消息
    const eventSessionKey = payload.sessionKey as string;
    if (eventSessionKey && eventSessionKey !== this.getSessionKey()) {
      return; // 不是当前会话的消息，忽略
    }

    const { state } = payload;
    const runId = payload.runId as string;

    if (state === "delta") {
      const text = extractTextFromMessage(payload.message);
      if (text) this.latestDeltaText.set(runId, text);
      this.events.onChatDelta(runId, text);
    } else if (state === "final") {
      const text =
        extractTextFromMessage(payload.message) ||
        this.latestDeltaText.get(runId) ||
        "";
      this.latestDeltaText.delete(runId);
      this.events.onChatFinal(runId, text);
    } else if (state === "aborted") {
      this.events.onChatAborted(runId);
      this.latestDeltaText.delete(runId);
    } else if (state === "error") {
      const errMsg =
        (payload.errorMessage as string) || "AI 回复出错";
      this.events.onChatError(runId, errMsg);
      this.latestDeltaText.delete(runId);
    }
  }

  private handleAgentEvent(payload: Record<string, unknown>): void {
    // 只处理当前会话的事件
    const eventSessionKey = payload.sessionKey as string;
    if (eventSessionKey && eventSessionKey !== this.getSessionKey()) {
      return; // 不是当前会话的事件，忽略
    }

    const data = payload.data as Record<string, unknown> | undefined;
    if (data?.phase && data?.name) {
      this.events.onAgentEvent({
        phase: data.phase as string,
        name: data.name as string,
        ts: Date.now(),
      });
    }
  }

  private summarizeRecvFrame(frame: Record<string, unknown>): string {
    if (frame.type === "event") {
      const event = frame.event as string;
      if (event === "tick") return "tick (心跳)";
      if (event === "connect.challenge") return "connect.challenge";
      if (event === "chat") {
        const p = frame.payload as Record<string, unknown>;
        const sk = p?.sessionKey as string;
        const mine = sk === this.getSessionKey();
        const skTag = sk ? (mine ? "[本会话]" : `[其它会话: ${sk}]`) : "[无sessionKey]";
        return `chat: state=${p?.state} ${skTag}`;
      }
      if (event === "agent") {
        const p = frame.payload as Record<string, unknown>;
        const d = p?.data as Record<string, unknown>;
        const sk = p?.sessionKey as string;
        const mine = sk === this.getSessionKey();
        const skTag = sk ? (mine ? "[本会话]" : `[其它会话: ${sk}]`) : "[无sessionKey]";
        return `agent: ${d?.phase} ${d?.name || ""} ${skTag}`;
      }
      return `event: ${event}`;
    }
    if (frame.type === "res") {
      const ok = frame.ok !== false;
      return `response (id=${(frame.id as string)?.slice(0, 8)}...) ${ok ? "ok" : "error"}`;
    }
    return JSON.stringify(frame).slice(0, 80);
  }
}
