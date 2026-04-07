import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

// ── Width presets (per UI spec) ─────────────────────
// S=480  M=540  L=600   <640px → full-width (responsive)
const WIDTH_MAP = {
  S: "w-full sm:w-[480px] sm:max-w-[480px]",
  M: "w-full sm:w-[540px] sm:max-w-[540px]",
  L: "w-full sm:w-[600px] sm:max-w-[600px]",
} as const;

// ── Props ───────────────────────────────────────────

export interface AISheetLayoutProps {
  /** Sheet open state (controlled) */
  open: boolean;
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void;
  /** Title text shown in the SheetHeader */
  title: string;
  /** Icon shown before the title (e.g. <Sparkles />) */
  titleIcon: React.ReactNode;
  /** Optional description below the title */
  description?: string;
  /** Sheet width preset: S=480 M=540 L=600 */
  width?: "S" | "M" | "L";
  /** Scrollable body content */
  children: React.ReactNode;
  /** Sticky footer (action buttons). Rendered inside a border-t container. */
  footer?: React.ReactNode;
}

/**
 * Shared AI Sheet skeleton.
 *
 * Provides the standard layout used by all AI feature sheets:
 *   SheetHeader (title + description)
 *   → flex-1 scrollable body
 *   → optional sticky footer
 *
 * Usage:
 * ```tsx
 * <AISheetLayout
 *   open={open}
 *   onOpenChange={setOpen}
 *   title="AI 智能分析"
 *   titleIcon={<Sparkles className="h-5 w-5 text-violet-500" />}
 *   description="AI 正在分析..."
 *   width="M"
 *   footer={<Button>采纳</Button>}
 * >
 *   {body content}
 * </AISheetLayout>
 * ```
 */
export function AISheetLayout({
  open,
  onOpenChange,
  title,
  titleIcon,
  description,
  width = "M",
  children,
  footer,
}: AISheetLayoutProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className={cn(WIDTH_MAP[width], "flex flex-col")}
        side="right"
      >
        {/* ── Header ────────────────────────────── */}
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {titleIcon}
            {title}
          </SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>

        {/* ── Scrollable body ───────────────────── */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {children}
        </div>

        {/* ── Sticky footer ─────────────────────── */}
        {footer && (
          <div className="flex items-center justify-end gap-2 px-4 py-3 border-t shrink-0">
            {footer}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
