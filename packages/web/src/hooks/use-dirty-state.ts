import { useBlocker } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

function isDeepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (typeof a !== "object") return a === b;
  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => isDeepEqual(aObj[key], bObj[key]));
}

export function useDirtyState<T>(initialValue: T) {
  const [current, setCurrent] = useState<T>(initialValue);
  const snapshot = useRef<T>(structuredClone(initialValue));

  const isDirty = useMemo(
    () => !isDeepEqual(current, snapshot.current),
    [current],
  );

  const reset = useCallback(
    (newValue?: T) => {
      const val = newValue ?? current;
      setCurrent(val);
      snapshot.current = structuredClone(val);
    },
    [current],
  );

  return { current, setCurrent, isDirty, reset };
}

/**
 * Comprehensive unsaved-changes guard.
 *
 * Combines two layers of protection:
 * 1. `beforeunload` — intercepts browser refresh / tab close
 * 2. TanStack Router `useBlocker` — intercepts in-app route navigation
 *
 * Returns blocker helpers so the consumer can render an AlertDialog
 * when `status === "blocked"`.
 */
export function useUnsavedChanges(isDirty: boolean) {
  // ── Layer 1: Browser native beforeunload ──
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // ── Layer 2: TanStack Router in-app navigation blocker ──
  const blocker = useBlocker({ condition: isDirty });

  return blocker;
}
