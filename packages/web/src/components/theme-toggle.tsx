import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Monitor, Moon, Sun } from "lucide-react";

const themeOptions = [
  { value: "light" as const, label: "浅色", icon: Sun },
  { value: "dark" as const, label: "深色", icon: Moon },
  { value: "system" as const, label: "跟随系统", icon: Monitor },
];

export function ThemeToggle({ collapsed = false }: { collapsed?: boolean }) {
  const { theme, resolvedTheme, setTheme } = useTheme();

  const CurrentIcon = resolvedTheme === "dark" ? Moon : Sun;

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <CurrentIcon className="h-4 w-4" />
                <span className="sr-only">切换主题</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="end">
              {themeOptions.map((opt) => (
                <DropdownMenuItem
                  key={opt.value}
                  onClick={() => setTheme(opt.value)}
                  className={theme === opt.value ? "bg-accent" : ""}
                >
                  <opt.icon className="h-4 w-4 mr-2" />
                  {opt.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </TooltipTrigger>
        <TooltipContent side="right">切换主题</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 px-3 h-9 text-sm font-normal text-muted-foreground hover:text-foreground"
        >
          <CurrentIcon className="h-4 w-4 shrink-0" />
          <span>
            {themeOptions.find((o) => o.value === theme)?.label ?? "主题"}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="end">
        {themeOptions.map((opt) => (
          <DropdownMenuItem
            key={opt.value}
            onClick={() => setTheme(opt.value)}
            className={theme === opt.value ? "bg-accent" : ""}
          >
            <opt.icon className="h-4 w-4 mr-2" />
            {opt.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
