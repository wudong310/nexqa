import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ImageSendMode } from "@/lib/openclaw-client";
import { Check, ChevronDown } from "lucide-react";

interface ImageSendModeSelectorProps {
  mode: ImageSendMode;
  onChange: (mode: ImageSendMode) => void;
  disabled?: boolean;
}

const MODE_OPTIONS: {
  value: ImageSendMode;
  icon: string;
  label: string;
  shortLabel: string;
  description: string;
}[] = [
  {
    value: "auto",
    icon: "🔮",
    label: "智能选择",
    shortLabel: "智能",
    description: "根据图片大小自动选择最优方式",
  },
  {
    value: "direct",
    icon: "⚡",
    label: "直接发送",
    shortLabel: "直发",
    description: "Base64 直发，速度更快",
  },
  {
    value: "proxy",
    icon: "☁️",
    label: "服务器中转",
    shortLabel: "中转",
    description: "经服务器代理，支持大图",
  },
];

export function ImageSendModeSelector({
  mode,
  onChange,
  disabled,
}: ImageSendModeSelectorProps) {
  const current = MODE_OPTIONS.find((o) => o.value === mode)!;
  const isDefault = mode === "auto";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          className={`inline-flex items-center gap-1 px-2 py-1 transition-colors focus:outline-none disabled:opacity-50 ${
            isDefault
              ? "text-muted-foreground text-xs hover:text-foreground"
              : "rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold hover:bg-primary/15"
          }`}
        >
          <span>{current.icon}</span>
          <span>{current.shortLabel}</span>
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {MODE_OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => onChange(option.value)}
            className="flex items-start gap-3 py-2 cursor-pointer"
          >
            <span className="text-base shrink-0 mt-0.5">{option.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium">{option.label}</span>
                {mode === option.value && (
                  <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {option.description}
              </p>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Re-export for convenience */
export { MODE_OPTIONS as IMAGE_SEND_MODE_OPTIONS };
