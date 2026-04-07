import { useEffect, useRef } from "react";

/** Supported shortcut identifiers */
export type ShortcutId =
  | "send"
  | "search"
  | "new-case"
  | "close";

export interface ShortcutDef {
  id: ShortcutId;
  /** Display label */
  label: string;
  /** Human-readable key combo (macOS style shown to user) */
  display: string;
  /** Description */
  description: string;
  /** Keys to match: modifier + key (lowercase) */
  key: string;
  /** Require Cmd (Mac) / Ctrl (Win/Linux) */
  mod?: boolean;
  /** Require Shift */
  shift?: boolean;
}

export const SHORTCUTS: ShortcutDef[] = [
  {
    id: "send",
    label: "发送 / 执行",
    display: "⌘ Enter",
    description: "执行当前测试用例或提交表单",
    key: "enter",
    mod: true,
  },
  {
    id: "search",
    label: "搜索",
    display: "⌘ K",
    description: "聚焦搜索框或打开命令面板",
    key: "k",
    mod: true,
  },
  {
    id: "new-case",
    label: "新建用例",
    display: "⌘ N",
    description: "新建测试用例（当前在 API 测试页时）",
    key: "n",
    mod: true,
  },
  {
    id: "close",
    label: "关闭",
    display: "Esc",
    description: "关闭当前弹窗或侧边面板",
    key: "escape",
    mod: false,
  },
];

type ShortcutHandlers = Partial<Record<ShortcutId, () => void>>;

const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.userAgent);

function matchesShortcut(e: KeyboardEvent, def: ShortcutDef): boolean {
  const modKey = isMac ? e.metaKey : e.ctrlKey;
  if (def.mod && !modKey) return false;
  if (!def.mod && modKey) return false;
  if (def.shift && !e.shiftKey) return false;
  if (!def.shift && e.shiftKey) return false;
  return e.key.toLowerCase() === def.key;
}

/**
 * Register keyboard shortcut handlers.
 * Only matched shortcuts will be prevented from default browser behaviour.
 */
export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Skip if user is typing in an input / textarea / contentEditable
      // UNLESS the shortcut explicitly uses a modifier key (Cmd/Ctrl)
      const target = e.target as HTMLElement | null;
      const isEditable =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      for (const def of SHORTCUTS) {
        if (!matchesShortcut(e, def)) continue;
        const handler = handlersRef.current[def.id];
        if (!handler) continue;

        // For non-modifier shortcuts (like Escape), skip if in editable UNLESS explicitly handled
        if (!def.mod && isEditable) continue;

        e.preventDefault();
        e.stopPropagation();
        handler();
        return;
      }
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);
}

/** Format shortcut for display — replaces ⌘ with Ctrl on non-Mac */
export function formatShortcutDisplay(display: string): string {
  if (isMac) return display;
  return display.replace("⌘", "Ctrl");
}
