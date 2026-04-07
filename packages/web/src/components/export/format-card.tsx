import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface FormatCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
}

export function FormatCard({
  icon: Icon,
  title,
  description,
  selected,
  onSelect,
}: FormatCardProps) {
  return (
    <button
      className={cn(
        "border rounded-lg p-4 cursor-pointer transition-all text-left",
        selected
          ? "border-primary bg-primary/5 ring-1 ring-primary"
          : "border-muted hover:border-primary/40",
      )}
      onClick={onSelect}
    >
      <Icon
        className={cn(
          "h-8 w-8 mb-2",
          selected ? "text-primary" : "text-muted-foreground",
        )}
      />
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground mt-1">{description}</p>
    </button>
  );
}
