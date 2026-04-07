import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Link, useLocation } from "@tanstack/react-router";
import {
  BarChart3,
  Clock,
  ClipboardList,
  FileText,
  FlaskConical,
  GitCompare,
  Globe,
  LayoutDashboard,
  Link2,
  Menu,
  Plug,
  Settings,
  Settings2,
  ShieldAlert,
  X,
} from "lucide-react";
import { useState } from "react";
import { ProjectSwitcher } from "./project-switcher";

const projectNavItems = [
  {
    to: "/p/$projectId/dashboard" as const,
    label: "概览",
    icon: LayoutDashboard,
  },
  {
    to: "/p/$projectId/api" as const,
    label: "API 测试",
    icon: FlaskConical,
  },
  {
    to: "/p/$projectId/chains" as const,
    label: "测试链",
    icon: Link2,
  },
  {
    to: "/p/$projectId/plans" as const,
    label: "测试方案",
    icon: ClipboardList,
  },
  {
    to: "/p/$projectId/coverage" as const,
    label: "覆盖率",
    icon: BarChart3,
  },
  {
    to: "/p/$projectId/history" as const,
    label: "执行历史",
    icon: Clock,
  },
  {
    to: "/p/$projectId/reports" as const,
    label: "测试报告",
    icon: FileText,
  },
  {
    to: "/p/$projectId/environments" as const,
    label: "环境管理",
    icon: Globe,
  },
  {
    to: "/p/$projectId/cicd" as const,
    label: "CI/CD",
    icon: GitCompare,
  },
  {
    to: "/p/$projectId/openclaw" as const,
    label: "OpenClaw",
    icon: Plug,
  },
  {
    to: "/p/$projectId/settings" as const,
    label: "项目设置",
    icon: Settings2,
  },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  const projectId = location.pathname.match(/^\/p\/([^/]+)/)?.[1];

  function isActive(to: string): boolean {
    const resolved = to.replace("$projectId", projectId || "");
    if (to.endsWith("/settings") && to.includes("$projectId")) {
      return location.pathname === resolved;
    }
    return location.pathname.startsWith(resolved);
  }

  const isGlobalSettingsActive = location.pathname === "/settings";

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "flex flex-col border-r bg-sidebar text-sidebar-foreground transition-all duration-200",
          collapsed ? "w-16" : "w-56",
        )}
      >
        {/* ① Brand */}
        <div className="flex h-14 items-center justify-between border-b px-4">
          {!collapsed && <span className="text-lg font-bold">NexQA</span>}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? (
              <Menu className="h-4 w-4" />
            ) : (
              <X className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* ② Project switcher */}
        {!collapsed && (
          <div className="px-3 pt-3 pb-2">
            <ProjectSwitcher currentProjectId={projectId} />
          </div>
        )}

        <Separator />

        {/* ③ Project nav */}
        <nav className="flex-1 px-2 py-1 space-y-1">
          {projectId &&
            projectNavItems.map((item) => {
              const active = isActive(item.to);

              if (collapsed) {
                return (
                  <Tooltip key={item.to}>
                    <TooltipTrigger asChild>
                      <Link to={item.to} params={{ projectId }}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn(
                            "h-9 w-9",
                            active && "bg-accent text-foreground",
                          )}
                        >
                          <item.icon className="h-4 w-4" />
                        </Button>
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right">{item.label}</TooltipContent>
                  </Tooltip>
                );
              }

              return (
                <Link key={item.to} to={item.to} params={{ projectId }}>
                  <Button
                    variant="ghost"
                    className={cn(
                      "w-full justify-start gap-3 px-3 h-9 text-sm font-normal text-muted-foreground hover:text-foreground relative",
                      active && "font-medium text-foreground bg-accent",
                    )}
                  >
                    {active && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-primary rounded-r-full" />
                    )}
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </Button>
                </Link>
              );
            })}
        </nav>

        <Separator />

        {/* ④ Global */}
        <div className="px-2 py-2 space-y-1">
          <ThemeToggle collapsed={collapsed} />

          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Link to="/settings">
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "h-9 w-9",
                      isGlobalSettingsActive && "bg-accent text-foreground",
                    )}
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">全局设置</TooltipContent>
            </Tooltip>
          ) : (
            <Link to="/settings">
              <Button
                variant="ghost"
                className={cn(
                  "w-full justify-start gap-3 px-3 h-9 text-sm font-normal text-muted-foreground hover:text-foreground relative",
                  isGlobalSettingsActive &&
                    "font-medium text-foreground bg-accent",
                )}
              >
                {isGlobalSettingsActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-primary rounded-r-full" />
                )}
                <Settings className="h-4 w-4 shrink-0" />
                <span>全局设置</span>
              </Button>
            </Link>
          )}
        </div>
      </aside>
    </TooltipProvider>
  );
}
