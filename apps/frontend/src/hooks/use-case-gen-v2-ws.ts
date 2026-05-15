/**
 * use-case-gen-v2-ws — WebSocket 订阅用例生成事件
 *
 * 对标 use-plan-gen-v2-ws.ts，订阅 WebSocket 事件：
 * - 监听 `case-gen-v2:event` 类型
 * - 维护 `logs: LogEntry[]` 状态
 * - 返回 `{ logs, isGenerating }`
 */

import type { LogEntry } from "@/types/case-gen-v2";
import { useEffect, useRef, useState } from "react";

// ── WebSocket Event Types ───────────────────────────

interface CaseGenV2Event {
  type: "case-gen-v2:event";
  taskId: string;
  event: LogEntry["event"];
  text: string;
  timestamp: string;
}

interface CaseGenV2Complete {
  type: "case-gen-v2:complete";
  taskId: string;
}

type WsMessage = CaseGenV2Event | CaseGenV2Complete;

// ── Hook ────────────────────────────────────────────

export function useCaseGenV2Ws(taskId: string | null) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!taskId) {
      setLogs([]);
      setIsGenerating(false);
      return;
    }

    // 获取 WebSocket URL
    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsHost = window.location.host;
    const wsUrl = `${wsProtocol}//${wsHost}/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      // 订阅任务
      ws.send(JSON.stringify({ type: "subscribe", channel: `case-gen-v2:${taskId}` }));
      setIsGenerating(true);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as WsMessage;

        if (msg.type === "case-gen-v2:event" && msg.taskId === taskId) {
          setLogs((prev) => [
            ...prev,
            {
              event: msg.event,
              text: msg.text,
              timestamp: msg.timestamp,
            },
          ]);
        } else if (msg.type === "case-gen-v2:complete" && msg.taskId === taskId) {
          setIsGenerating(false);
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onerror = () => {
      console.error("WebSocket connection error");
    };

    ws.onclose = () => {
      setIsGenerating(false);
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [taskId]);

  return { logs, isGenerating };
}