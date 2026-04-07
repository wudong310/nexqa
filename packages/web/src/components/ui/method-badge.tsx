import { cn } from "@/lib/utils";

const methodColors: Record<string, string> = {
  GET: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  POST: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300",
  PUT: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  DELETE: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  PATCH: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
};

interface MethodBadgeProps {
  method: string;
  className?: string;
}

export function MethodBadge({ method, className }: MethodBadgeProps) {
  const upper = method.toUpperCase();
  return (
    <span
      className={cn(
        "text-[10px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0",
        methodColors[upper] ?? "bg-muted text-muted-foreground",
        className,
      )}
    >
      {upper}
    </span>
  );
}
