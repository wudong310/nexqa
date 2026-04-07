import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Flame } from "lucide-react";

interface SmokeTestCardProps {
  onStartSmoke: () => void;
}

export function SmokeTestCard({ onStartSmoke }: SmokeTestCardProps) {
  return (
    <Card className="group hover:border-orange-300 dark:hover:border-orange-700 transition-colors">
      <CardContent className="pt-6 text-center space-y-3">
        <div className="mx-auto h-12 w-12 rounded-xl bg-orange-100 dark:bg-orange-950/50 flex items-center justify-center">
          <Flame className="h-6 w-6 text-orange-500" />
        </div>
        <h3 className="text-sm font-semibold">AI 一键冒烟</h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          AI 自动识别核心路径，一键执行冒烟测试
        </p>
        <Button
          size="sm"
          className="bg-orange-500 hover:bg-orange-600 text-white"
          onClick={onStartSmoke}
        >
          <Flame className="h-3.5 w-3.5 mr-1.5" />
          开始冒烟
        </Button>
      </CardContent>
    </Card>
  );
}
