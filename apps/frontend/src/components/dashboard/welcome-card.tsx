import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { FileText, Globe, Flame, X } from "lucide-react";
import { useState } from "react";

interface WelcomeCardProps {
  projectId: string;
  onStartSmoke?: () => void;
}

export function WelcomeCard({ projectId, onStartSmoke }: WelcomeCardProps) {
  const storageKey = `welcome-dismissed-${projectId}`;
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(storageKey) === "true",
  );

  if (dismissed) return null;

  function handleDismiss() {
    localStorage.setItem(storageKey, "true");
    setDismissed(true);
  }

  return (
    <div className="bg-gradient-to-r from-blue-50/80 to-indigo-50/80 dark:from-blue-950/40 dark:to-indigo-950/40 border border-blue-200/50 dark:border-blue-800/50 rounded-xl p-6 relative">
      <button
        onClick={handleDismiss}
        className="absolute top-3 right-3 text-xs text-muted-foreground hover:underline flex items-center gap-1"
      >
        不再提示
        <X className="h-3 w-3" />
      </button>

      <h2 className="text-lg font-semibold mb-4">🎉 项目已创建</h2>
      <p className="text-sm text-muted-foreground mb-4">快速开始:</p>

      <div className="space-y-3">
        {/* Step 1 */}
        <div className="flex items-center gap-4">
          <span className="text-sm font-bold text-blue-600 bg-blue-100 dark:bg-blue-900 dark:text-blue-300 h-6 w-6 rounded-full flex items-center justify-center shrink-0">
            1
          </span>
          <span className="text-sm flex-1">
            导入 API → 自动生成测试用例
          </span>
          <a href={`/nexqa/p/${projectId}/api?action=import`}>
            <Button variant="outline" size="sm">
              <FileText className="h-3.5 w-3.5 mr-1" />
              导入 API
            </Button>
          </a>
        </div>

        {/* Step 2 */}
        <div className="flex items-center gap-4">
          <span className="text-sm font-bold text-blue-600 bg-blue-100 dark:bg-blue-900 dark:text-blue-300 h-6 w-6 rounded-full flex items-center justify-center shrink-0">
            2
          </span>
          <span className="text-sm flex-1">
            配置环境变量（API Token 等）
          </span>
          <Link
            to="/p/$projectId/environments"
            params={{ projectId }}
          >
            <Button variant="outline" size="sm">
              <Globe className="h-3.5 w-3.5 mr-1" />
              环境管理
            </Button>
          </Link>
        </div>

        {/* Step 3 — smoke */}
        <div className="flex items-center gap-4">
          <span className="text-sm font-bold text-blue-600 bg-blue-100 dark:bg-blue-900 dark:text-blue-300 h-6 w-6 rounded-full flex items-center justify-center shrink-0">
            3
          </span>
          <span className="text-sm flex-1">运行你的第一个测试</span>
          <Button variant="outline" size="sm" onClick={onStartSmoke}>
            <Flame className="h-3.5 w-3.5 mr-1 text-orange-500" />
            一键冒烟
          </Button>
        </div>
      </div>
    </div>
  );
}
