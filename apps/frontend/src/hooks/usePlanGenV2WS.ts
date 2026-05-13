/**
 * usePlanGenV2WS — WebSocket hook for streaming plan-gen-v2 logs
 *
 * Connects to /nexqa/ws, filters plan-gen-v2:event by generationId,
 * and returns a cumulative log array.
 */

import { useCallback, useEffect, useRef, useState } from "react";

// ── Types ───────────────────────────────────────────

export interface LogEntry {
  event: string;
  text: string;
  timestamp: string;
}

interface WSMessage {
  type: string;
  payload: {
    generationId: string;
    event: string;
    data: {
      text?: string;
      toolName?: string;
      toolInput?: Record<string, unknown>;
      result?: unknown;
    };
    timestamp: string;
  };
}

// ── Hook ────────────────────────────────────────────

export function usePlanGenV2WS(generationId: string | null) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const generationIdRef = useRef(generationId);

  // Keep ref in sync so the onmessage callback always reads the latest value
  generationIdRef.current = generationId;

  const connect = useCallback(() => {
    // Close existing connection if any
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${location.host}/nexqa/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg: WSMessage = JSON.parse(event.data);

        if (msg.type !== "plan-gen-v2:event") return;
        if (msg.payload.generationId !== generationIdRef.current) return;

        const { event: evt, data, timestamp } = msg.payload;

        let text = "";
        switch (evt) {
          case "delta":
            text = data.text ?? "";
            break;
          case "tool_use":
            text = data.toolName ?? "";
            break;
          case "tool_result":
            text = data.toolName ?? "";
            break;
          case "final":
            text = data.text ?? "生成完成";
            break;
          case "error":
            text = data.text ?? "未知错误";
            break;
          default:
            text = data.text ?? "";
        }

        setLogs((prev) => [...prev, { event: evt, text, timestamp }]);
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onerror = () => {
      // WebSocket errors are non-fatal — poll fallback handles completion
    };

    ws.onclose = () => {
      wsRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!generationId) {
      // No active generation — clear logs and disconnect
      setLogs([]);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    // Reset logs for new generation and connect
    setLogs([]);
    connect();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [generationId, connect]);

  return { logs };
}
