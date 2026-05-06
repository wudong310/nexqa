import { api } from "@/lib/api";
import { useCallback, useEffect, useRef, useState } from "react";

type Status = "unknown" | "checking" | "online" | "offline";

interface ProjectStatus {
  status: Status;
  latency: number;
  lastChecked: number | null;
  check: () => void;
}

const BASE_INTERVAL = 10_000;
const MAX_INTERVAL = 5 * 60_000;
const BACKOFF_FACTOR = 1.5;

export function useProjectStatus(projectId: string | undefined): ProjectStatus {
  const [status, setStatus] = useState<Status>("unknown");
  const [latency, setLatency] = useState(0);
  const [lastChecked, setLastChecked] = useState<number | null>(null);
  const intervalRef = useRef(BASE_INTERVAL);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const mountedRef = useRef(true);

  const doCheck = useCallback(async () => {
    if (!projectId) return;
    setStatus("checking");
    try {
      const res = await api.get<{
        online: boolean;
        status: number;
        latency: number;
      }>(`/projects/ping?id=${projectId}`);
      if (!mountedRef.current) return;
      if (res.online) {
        setStatus("online");
        setLatency(res.latency);
        intervalRef.current = BASE_INTERVAL;
      } else {
        setStatus("offline");
        setLatency(0);
        intervalRef.current = Math.min(
          intervalRef.current * BACKOFF_FACTOR,
          MAX_INTERVAL,
        );
      }
    } catch {
      if (!mountedRef.current) return;
      setStatus("offline");
      setLatency(0);
      intervalRef.current = Math.min(
        intervalRef.current * BACKOFF_FACTOR,
        MAX_INTERVAL,
      );
    }
    if (mountedRef.current) {
      setLastChecked(Date.now());
    }
  }, [projectId]);

  const scheduleNext = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      await doCheck();
      if (mountedRef.current) scheduleNext();
    }, intervalRef.current);
  }, [doCheck]);

  const check = useCallback(() => {
    intervalRef.current = BASE_INTERVAL;
    if (timerRef.current) clearTimeout(timerRef.current);
    doCheck().then(() => {
      if (mountedRef.current) scheduleNext();
    });
  }, [doCheck, scheduleNext]);

  useEffect(() => {
    mountedRef.current = true;
    if (!projectId) {
      setStatus("unknown");
      return;
    }
    doCheck().then(() => {
      if (mountedRef.current) scheduleNext();
    });
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [projectId, doCheck, scheduleNext]);

  return { status, latency, lastChecked, check };
}
