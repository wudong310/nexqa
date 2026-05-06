import { useState, useCallback, useRef, useEffect } from "react";
import type { OpenClawConnection } from "@nexqa/shared";

export interface SessionParams {
  channel: string;
  accountId: string;
  peerId: string;
  senderName: string;
  chatType: string;
  agentId: string;
}

export interface SessionParamChange {
  field: keyof SessionParams;
  oldValue: string;
  newValue: string;
}

export function getDefaultParams(_conn: OpenClawConnection | null): SessionParams {
  return {
    channel: "webchat",
    accountId: "default",
    peerId: "",
    senderName: "",
    chatType: "dm",
    agentId: "main",
  };
}

export function buildSessionKey(params: SessionParams): string {
  const agentId = params.agentId || "main";
  const channel = params.channel || "webchat";
  const accountId = params.accountId || "default";
  const chatType = params.chatType || "dm";
  const peerId = params.peerId || "nexqa-test";
  return `agent:${agentId}:${channel}:${accountId}:${chatType}:${peerId}`;
}

export function useSessionParams(conn: OpenClawConnection | null) {
  const [params, setParams] = useState<SessionParams>(() => getDefaultParams(conn));
  const prevConnIdRef = useRef<string | null>(null);

  // Reset params when connection changes
  useEffect(() => {
    const connId = conn?.id ?? null;
    if (connId !== prevConnIdRef.current) {
      prevConnIdRef.current = connId;
      setParams(getDefaultParams(conn));
    }
  }, [conn]);

  const updateParam = useCallback(
    (field: keyof SessionParams, value: string): SessionParamChange | null => {
      let change: SessionParamChange | null = null;
      setParams((prev) => {
        if (prev[field] === value) return prev;
        change = { field, oldValue: prev[field], newValue: value };
        return { ...prev, [field]: value };
      });
      return change;
    },
    [],
  );

  const setAllParams = useCallback((newParams: SessionParams) => {
    setParams(newParams);
  }, []);

  const sessionKey = buildSessionKey(params);

  return { params, updateParam, setAllParams, sessionKey };
}
