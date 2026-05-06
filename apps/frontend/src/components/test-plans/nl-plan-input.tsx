import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Flame,
  Loader2,
  Package,
  RefreshCw,
  Shield,
  Sparkles,
} from "lucide-react";
import { useState } from "react";

const quickIntents = [
  {
    icon: Flame,
    label: "跑个冒烟",
    value: "跑个冒烟测试",
    emoji: "🔥",
    color: "text-orange-500",
  },
  {
    icon: Package,
    label: "我要发版",
    value: "我要发版，跑完整测试",
    emoji: "📦",
    color: "text-blue-500",
  },
  {
    icon: Shield,
    label: "安全检查",
    value: "上线前安全检查",
    emoji: "🛡️",
    color: "text-red-500",
  },
  {
    icon: RefreshCw,
    label: "回归测试",
    value: "回归测试",
    emoji: "🔁",
    color: "text-green-500",
  },
];

interface NLPlanInputProps {
  onSubmit: (intent: string) => void;
  isGenerating: boolean;
  compact?: boolean;
}

export function NLPlanInput({
  onSubmit,
  isGenerating,
  compact,
}: NLPlanInputProps) {
  const [input, setInput] = useState("");

  return (
    <Card className="border-violet-200/50 dark:border-violet-800/50 bg-violet-50/20 dark:bg-violet-950/10">
      <CardContent className={cn("space-y-3", compact ? "pt-3 pb-2" : "pt-4 pb-3")}>
        {/* Title */}
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-violet-500" />
          <span className="text-sm font-medium">
            告诉 AI 你要做什么测试
          </span>
        </div>

        {/* Input row */}
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="描述你的测试目标，如'我要发版'"
            className="flex-1 text-sm"
            onKeyDown={(e) =>
              e.key === "Enter" && input.trim() && !isGenerating && onSubmit(input)
            }
            disabled={isGenerating}
          />
          <Button
            size="sm"
            disabled={!input.trim() || isGenerating}
            onClick={() => onSubmit(input)}
            className="bg-violet-600 hover:bg-violet-700 text-white gap-1.5 shrink-0"
          >
            {isGenerating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            生成
          </Button>
        </div>

        {/* Quick intent tags */}
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-muted-foreground leading-6">
            快捷意图:
          </span>
          {quickIntents.map((qi) => (
            <Button
              key={qi.label}
              variant="outline"
              size="sm"
              className="h-6 text-xs gap-1 px-2"
              onClick={() => onSubmit(qi.value)}
              disabled={isGenerating}
            >
              <qi.icon className={cn("h-3 w-3", qi.color)} />
              {qi.label}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
