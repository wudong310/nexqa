import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { Flame } from "lucide-react";
import { EnvironmentSelector } from "./environment-selector";
import { Sidebar } from "./sidebar";

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const projectId = location.pathname.match(/^\/p\/([^/]+)/)?.[1];

  function handleSmoke() {
    if (!projectId) return;
    navigate({
      to: "/p/$projectId/dashboard",
      params: { projectId },
    });
  }

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex h-screen">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Top bar with environment selector + smoke button */}
          {projectId && (
            <div className="h-10 border-b flex items-center justify-between px-4 shrink-0 bg-background">
              <EnvironmentSelector projectId={projectId} />
              <div className="flex items-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-orange-500 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/30"
                      onClick={handleSmoke}
                    >
                      <Flame className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>AI 一键冒烟测试</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          )}
          <main className="flex-1 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
      <Toaster position="top-right" richColors closeButton visibleToasts={3} />
    </TooltipProvider>
  );
}
