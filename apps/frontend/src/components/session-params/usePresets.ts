import { useState, useCallback, useEffect } from "react";
import type { SessionParams } from "./useSessionParams";

export interface Preset {
  id: string;
  name: string;
  params: SessionParams;
  isDefault?: boolean;
}

function storageKey(connectionId: string): string {
  return `openclaw:presets:${connectionId}`;
}

function loadPresets(connectionId: string): Preset[] {
  try {
    const raw = localStorage.getItem(storageKey(connectionId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePresets(connectionId: string, presets: Preset[]): void {
  localStorage.setItem(storageKey(connectionId), JSON.stringify(presets));
}

export function usePresets(connectionId: string | null) {
  const [presets, setPresets] = useState<Preset[]>([]);

  useEffect(() => {
    if (connectionId) {
      setPresets(loadPresets(connectionId));
    } else {
      setPresets([]);
    }
  }, [connectionId]);

  const addPreset = useCallback(
    (name: string, params: SessionParams) => {
      if (!connectionId) return;
      const preset: Preset = { id: crypto.randomUUID(), name, params: { ...params }, isDefault: false };
      const updated = [...presets, preset];
      setPresets(updated);
      savePresets(connectionId, updated);
    },
    [connectionId, presets],
  );

  const removePreset = useCallback(
    (id: string) => {
      if (!connectionId) return;
      const updated = presets.filter((p) => p.id !== id);
      setPresets(updated);
      savePresets(connectionId, updated);
    },
    [connectionId, presets],
  );

  const setDefaultPreset = useCallback(
    (id: string) => {
      if (!connectionId) return;
      const updated = presets.map((p) => ({
        ...p,
        isDefault: p.id === id,
      }));
      setPresets(updated);
      savePresets(connectionId, updated);
    },
    [connectionId, presets],
  );

  const getDefaultPreset = useCallback((): Preset | null => {
    return presets.find((p) => p.isDefault) ?? null;
  }, [presets]);

  const matchPreset = useCallback(
    (params: SessionParams): string | null => {
      const match = presets.find(
        (p) =>
          p.params.channel === params.channel &&
          p.params.accountId === params.accountId &&
          p.params.peerId === params.peerId &&
          p.params.senderName === params.senderName &&
          p.params.chatType === params.chatType &&
          p.params.agentId === params.agentId,
      );
      return match?.id ?? null;
    },
    [presets],
  );

  return { presets, addPreset, removePreset, setDefaultPreset, getDefaultPreset, matchPreset };
}
