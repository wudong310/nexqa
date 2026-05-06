import { cn } from "@/lib/utils";
import * as React from "react";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-16 px-4",
        className,
      )}
    >
      {icon && (
        <div className="mb-4 text-muted-foreground/40">{icon}</div>
      )}
      <h3 className="text-base font-medium text-foreground mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground mb-6 text-center max-w-sm">
          {description}
        </p>
      )}
      {action && <div className="mb-2">{action}</div>}
      {secondaryAction && <div>{secondaryAction}</div>}
    </div>
  );
}
