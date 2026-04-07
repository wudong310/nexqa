import { Info, X } from "lucide-react";
import { useState } from "react";

interface VarGuideTipProps {
  text: string;
  storageKey: string;
}

export function VarGuideTip({ text, storageKey }: VarGuideTipProps) {
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(storageKey) === "true",
  );

  if (dismissed) return null;

  function handleDismiss() {
    localStorage.setItem(storageKey, "true");
    setDismissed(true);
  }

  return (
    <div className="bg-blue-50/50 dark:bg-blue-950/30 border border-blue-200/50 dark:border-blue-800/50 rounded-lg p-3 flex items-start gap-2">
      <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
      <p className="text-xs text-blue-700 dark:text-blue-300 flex-1">
        {text}
      </p>
      <button
        type="button"
        onClick={handleDismiss}
        className="shrink-0 text-blue-400 hover:text-blue-600 dark:hover:text-blue-200"
        aria-label="关闭提示"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
