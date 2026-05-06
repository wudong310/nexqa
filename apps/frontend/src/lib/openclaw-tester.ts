import type { OpenClawConnection } from "@nexqa/shared";
import { createLogger, getTraceId } from "./logger";

const log = createLogger("openclaw-tester");

type StepName = "ws_connect" | "auth_handshake" | "chat_roundtrip";

export interface TestLogEntry {
  ts: string;
  direction: "send" | "recv" | "info" | "error";
  message: string;
}

export interface TestStepResult {
  name: StepName;
  label: string;
  status: "success" | "failed" | "skipped" | "running";
  duration: number;
  error?: string;
}

export interface OpenClawTestResult {
  steps: TestStepResult[];
  reply?: string;
  totalDuration: number;
  logs: TestLogEntry[];
}

type OnProgress = (result: OpenClawTestResult) => void;

function makeStep(
  name: StepName,
  label: string,
  status: TestStepResult["status"] = "skipped",
): TestStepResult {
  return { name, label, status, duration: 0 };
}

function uuid(): string {
  return crypto.randomUUID();
}

/** 从 ChatEvent 的 message 对象中提取文本 */
function extractTextFromMessage(msg: unknown): string {
  if (!msg || typeof msg !== "object") return "";
  const m = msg as Record<string, unknown>;
  // 优先从 content 数组提取
  if (Array.isArray(m.content)) {
    return (m.content as Array<Record<string, unknown>>)
      .filter((c) => c.type === "text" && typeof c.text === "string")
      .map((c) => c.text as string)
      .join("");
  }
  // 兜底：如果 message 本身是字符串
  if (typeof m.text === "string") return m.text;
  return "";
}

function ts(): string {
  return new Date().toISOString().slice(11, 23);
}

/**
 * Step 1: 建立 WebSocket 连接
 */
function connectWebSocket(
  url: string,
  timeout: number,
  logs: TestLogEntry[],
): Promise<{ ws: WebSocket; duration: number }> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    let timer: ReturnType<typeof setTimeout> | null = null;

    logs.push({ ts: ts(), direction: "info", message: `正在连接 ${url} ...` });
    const ws = new WebSocket(url);

    timer = setTimeout(() => {
      ws.close();
      logs.push({
        ts: ts(),
        direction: "error",
        message: `连接超时 (${timeout}ms)`,
      });
      reject(new Error(`连接超时 (${timeout}ms)`));
    }, timeout);

    ws.onopen = () => {
      if (timer) clearTimeout(timer);
      const dur = Date.now() - start;
      logs.push({
        ts: ts(),
        direction: "info",
        message: `WebSocket 连接已建立 (${dur}ms)`,
      });
      resolve({ ws, duration: dur });
    };

    ws.onerror = () => {
      if (timer) clearTimeout(timer);
      logs.push({
        ts: ts(),
        direction: "error",
        message: "WebSocket 连接失败",
      });
      reject(new Error("WebSocket 连接失败"));
    };
  });
}

/**
 * 调用 claw-runner sign-challenge 接口获取签名后的 connect params
 */
async function fetchConnectParams(
  clawRunnerUrl: string,
  nonce: string,
  logs: TestLogEntry[],
): Promise<Record<string, unknown>> {
  const url = "/nexqa/api/openclaw/proxy-sign-challenge";
  logs.push({
    ts: ts(),
    direction: "send",
    message: `调用 claw-runner (via proxy): ${clawRunnerUrl}`,
  });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clawRunnerUrl, nonce }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`claw-runner signChallenge 失败: ${res.status} ${body}`);
  }

  const data = await res.json();
  logs.push({
    ts: ts(),
    direction: "recv",
    message: `claw-runner 返回 connectParams (deviceId=${data.connectParams?.device?.id?.slice(0, 16)}...)`,
  });

  return data.connectParams;
}

/**
 * Step 2-4: 等待 challenge → 调 claw-runner 签名 → 发送 connect → 处理响应
 */
function performHandshake(
  ws: WebSocket,
  clawRunnerUrl: string,
  timeout: number,
  logs: TestLogEntry[],
): Promise<{ duration: number }> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let waitingConnect = false;
    const connectId = uuid();

    logs.push({
      ts: ts(),
      direction: "info",
      message: "等待 challenge 事件...",
    });

    timer = setTimeout(() => {
      ws.removeEventListener("message", handler);
      logs.push({
        ts: ts(),
        direction: "error",
        message: `握手超时 (${timeout}ms)`,
      });
      reject(new Error(`握手超时 (${timeout}ms)`));
    }, timeout);

    async function handler(event: MessageEvent) {
      try {
        const raw = event.data as string;
        const frame = JSON.parse(raw);

        // 等待 connect.challenge 事件
        if (
          !waitingConnect &&
          frame.type === "event" &&
          frame.event === "connect.challenge" &&
          frame.payload?.nonce
        ) {
          const nonce = frame.payload.nonce;
          logs.push({
            ts: ts(),
            direction: "recv",
            message: `connect.challenge: nonce=${nonce.slice(0, 20)}...`,
          });
          waitingConnect = true;

          // 调 claw-runner 获取签名后的 connect params
          try {
            const connectParams = await fetchConnectParams(
              clawRunnerUrl,
              nonce,
              logs,
            );

            const connectFrame = {
              type: "req",
              id: connectId,
              method: "connect",
              params: connectParams,
            };
            logs.push({
              ts: ts(),
              direction: "send",
              message: `connect 请求 (id=${connectId})`,
            });
            ws.send(JSON.stringify(connectFrame));
          } catch (err) {
            if (timer) clearTimeout(timer);
            ws.removeEventListener("message", handler);
            reject(err);
          }
          return;
        }

        // 处理 connect 响应
        if (frame.type === "res" && frame.id === connectId) {
          if (timer) clearTimeout(timer);
          ws.removeEventListener("message", handler);

          if (frame.ok === false || frame.error) {
            const errMsg = frame.error?.message || "认证失败";
            logs.push({
              ts: ts(),
              direction: "recv",
              message: `connect 响应: 错误 - ${errMsg} (code=${frame.error?.code})`,
            });
            reject(new Error(errMsg));
          } else {
            const dur = Date.now() - start;
            const proto = frame.payload?.protocol;
            const ver = frame.payload?.server?.version;
            logs.push({
              ts: ts(),
              direction: "recv",
              message: `connect 响应: 成功, protocol=${proto}, server=${ver} (${dur}ms)`,
            });
            resolve({ duration: dur });
          }
          return;
        }

        // 其他帧
        logs.push({
          ts: ts(),
          direction: "recv",
          message: `帧: type=${frame.type}, ${raw.length > 200 ? `${raw.slice(0, 200)}...` : raw}`,
        });
      } catch (e) {
        console.warn("[openclaw-tester] handleMessage JSON 解析失败:", e);
      }
    }

    ws.addEventListener("message", handler);
  });
}

/**
 * Step 5: 发送测试消息并等待 AI 回复
 */
function sendTestMessage(
  ws: WebSocket,
  message: string,
  timeout: number,
  logs: TestLogEntry[],
  config: OpenClawConnection,
): Promise<{ duration: number; reply: string }> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const sendId = uuid();
    const idempotencyKey = uuid();
    // Build sessionKey with defaults (session params are no longer in connection config)
    const sessionKey = `agent:main:webchat:default:dm:nexqa-test`;
    let latestDeltaText = "";
    let deltaCount = 0;

    timer = setTimeout(() => {
      ws.removeEventListener("message", handler);
      logs.push({
        ts: ts(),
        direction: "error",
        message: `等待回复超时 (${timeout}ms)`,
      });
      reject(new Error(`等待回复超时 (${timeout}ms)`));
    }, timeout);

    const chatFrame = {
      type: "req",
      id: sendId,
      method: "chat.send",
      params: { sessionKey, message, idempotencyKey },
    };
    logs.push({
      ts: ts(),
      direction: "send",
      message: `chat.send (id=${sendId}) message="${message}"`,
    });
    ws.send(JSON.stringify(chatFrame));

    function handler(event: MessageEvent) {
      try {
        const raw = event.data as string;
        const frame = JSON.parse(raw);

        // chat.send 响应
        if (frame.type === "res" && frame.id === sendId) {
          if (frame.ok === false || frame.error) {
            if (timer) clearTimeout(timer);
            ws.removeEventListener("message", handler);
            const errMsg = frame.error?.message || "发送失败";
            logs.push({
              ts: ts(),
              direction: "recv",
              message: `chat.send 响应: 错误 - ${errMsg}`,
            });
            reject(new Error(errMsg));
            return;
          }
          logs.push({
            ts: ts(),
            direction: "recv",
            message: `chat.send 响应: status=${frame.payload?.status}, runId=${frame.payload?.runId}`,
          });
          return;
        }

        // agent 事件（工具调用进度）
        if (frame.type === "event" && frame.event === "agent") {
          const d = frame.payload?.data;
          if (d?.phase && d?.name) {
            logs.push({
              ts: ts(),
              direction: "recv",
              message: `agent 事件: ${d.phase} tool=${d.name}`,
            });
          }
          return;
        }

        // chat 事件（AI 回复）
        if (
          frame.type === "event" &&
          frame.event === "chat" &&
          frame.payload?.sessionKey === sessionKey
        ) {
          const state = frame.payload.state;

          if (state === "delta") {
            deltaCount++;
            // message 是完整消息对象 {role, content: [{type:"text", text:"累积文本"}]}
            const text = extractTextFromMessage(frame.payload.message);
            if (text) latestDeltaText = text;
            if (deltaCount <= 3 || deltaCount % 10 === 0) {
              logs.push({
                ts: ts(),
                direction: "recv",
                message: `chat delta #${deltaCount}: "${(text || "").slice(0, 80)}"`,
              });
            }
          } else if (state === "final") {
            if (timer) clearTimeout(timer);
            ws.removeEventListener("message", handler);
            const finalText =
              extractTextFromMessage(frame.payload.message) ||
              latestDeltaText ||
              "";
            const dur = Date.now() - start;
            logs.push({
              ts: ts(),
              direction: "recv",
              message: `chat final (${deltaCount} deltas, ${dur}ms): "${finalText.slice(0, 100)}"`,
            });
            resolve({ duration: dur, reply: finalText.slice(0, 500) });
          } else if (state === "aborted") {
            if (timer) clearTimeout(timer);
            ws.removeEventListener("message", handler);
            logs.push({
              ts: ts(),
              direction: "recv",
              message: "chat aborted: 回复被中断",
            });
            resolve({
              duration: Date.now() - start,
              reply: latestDeltaText || "",
            });
          } else if (state === "error") {
            if (timer) clearTimeout(timer);
            ws.removeEventListener("message", handler);
            const errMsg = frame.payload.errorMessage || "AI 回复出错";
            logs.push({
              ts: ts(),
              direction: "error",
              message: `chat error: ${errMsg}`,
            });
            reject(new Error(errMsg));
          }
          return;
        }

        // tick 心跳
        if (frame.type === "event" && frame.event === "tick") {
          logs.push({ ts: ts(), direction: "recv", message: "tick (心跳)" });
          return;
        }

        // 未知帧
        logs.push({
          ts: ts(),
          direction: "recv",
          message: `未知帧: ${raw.length > 150 ? `${raw.slice(0, 150)}...` : raw}`,
        });
      } catch (e) {
        console.warn("[openclaw-tester] handleMessage JSON 解析失败:", e);
      }
    }

    ws.addEventListener("message", handler);
  });
}

/**
 * 执行完整的 OpenClaw 连接测试
 */
export async function testConnection(
  config: OpenClawConnection,
  onProgress?: OnProgress,
): Promise<OpenClawTestResult> {
  const traceId = getTraceId();
  log.info(`开始测试连接: ${config.name}`, {
    gatewayUrl: config.gatewayUrl,
    clawRunnerUrl: config.clawRunnerUrl,
    traceId,
  });

  const totalStart = Date.now();
  const steps: TestStepResult[] = [
    makeStep("ws_connect", "WS 连接"),
    makeStep("auth_handshake", "认证握手"),
    makeStep("chat_roundtrip", "消息收发"),
  ];
  const logs: TestLogEntry[] = [];
  let reply: string | undefined;
  let ws: WebSocket | null = null;

  logs.push({
    ts: ts(),
    direction: "info",
    message: `开始测试: ${config.name} → ${config.gatewayUrl} (via ${config.clawRunnerUrl})`,
  });

  function emit() {
    onProgress?.({
      steps: [...steps],
      reply,
      totalDuration: Date.now() - totalStart,
      logs: [...logs],
    });
  }

  try {
    // Step 1: WS 连接
    steps[0].status = "running";
    emit();
    const wsResult = await connectWebSocket(
      config.gatewayUrl,
      config.timeout.connect,
      logs,
    );
    ws = wsResult.ws;
    steps[0].status = "success";
    steps[0].duration = wsResult.duration;
    log.info(`WS 连接成功, 耗时 ${wsResult.duration}ms`);
    emit();

    // Step 2-4: 握手（challenge → claw-runner 签名 → connect）
    steps[1].status = "running";
    emit();
    const handshakeResult = await performHandshake(
      ws,
      config.clawRunnerUrl,
      config.timeout.handshake,
      logs,
    );
    steps[1].status = "success";
    steps[1].duration = handshakeResult.duration;
    log.info(`认证握手成功, 耗时 ${handshakeResult.duration}ms`);
    emit();

    // Step 5: 消息收发
    steps[2].status = "running";
    emit();
    const chatResult = await sendTestMessage(
      ws,
      config.testMessage || "你好",
      config.timeout.chat,
      logs,
      config,
    );
    steps[2].status = "success";
    steps[2].duration = chatResult.duration;
    reply = chatResult.reply;
    log.info(`消息收发成功, 耗时 ${chatResult.duration}ms`);
    emit();
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "未知错误";
    log.error(`测试失败: ${errMsg}`);

    for (const step of steps) {
      if (step.status === "running") {
        step.status = "failed";
        step.error = errMsg;
      }
    }
    emit();
  } finally {
    if (ws && ws.readyState === WebSocket.OPEN) {
      logs.push({
        ts: ts(),
        direction: "info",
        message: "关闭 WebSocket 连接",
      });
      ws.close();
    }
    logs.push({
      ts: ts(),
      direction: "info",
      message: `测试结束, 总耗时 ${Date.now() - totalStart}ms`,
    });
  }

  const result: OpenClawTestResult = {
    steps,
    reply,
    totalDuration: Date.now() - totalStart,
    logs,
  };
  return result;
}
