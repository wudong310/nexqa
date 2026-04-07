import { useState, useEffect, useRef } from "react";
import { ClipboardCopy, Check } from "lucide-react";

interface SessionKeyBarProps {
  sessionKey: string;
}

export function SessionKeyBar({ sessionKey }: SessionKeyBarProps) {
  const [copied, setCopied] = useState(false);
  const [highlight, setHighlight] = useState(false);
  const prevKeyRef = useRef(sessionKey);

  // Flash highlight on sessionKey change
  useEffect(() => {
    if (prevKeyRef.current !== sessionKey) {
      prevKeyRef.current = sessionKey;
      setHighlight(true);
      const timer = setTimeout(() => setHighlight(false), 300);
      return () => clearTimeout(timer);
    }
  }, [sessionKey]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(sessionKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // fallback
    }
  };

  return (
    <div
      className={`flex items-center justify-between h-6 px-3 text-xs font-mono transition-colors duration-300 ${
        highlight
          ? "bg-amber-100 dark:bg-amber-900/30"
          : "bg-amber-50 dark:bg-amber-950/20"
      } text-amber-800 dark:text-amber-200 border-t border-amber-200/50 dark:border-amber-800/30`}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="shrink-0">🔑</span>
        <span className="truncate">{sessionKey}</span>
      </div>
      <button
        type="button"
        className="shrink-0 ml-2 inline-flex items-center hover:text-amber-900 dark:hover:text-amber-100 transition-colors"
        onClick={handleCopy}
        title="复制 sessionKey"
      >
        {copied ? <Check className="h-3 w-3" /> : <ClipboardCopy className="h-3 w-3" />}
      </button>
    </div>
  );
}
