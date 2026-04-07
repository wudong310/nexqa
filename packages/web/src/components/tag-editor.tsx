import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TestCaseTags } from "@nexqa/shared";
import { ChevronDown } from "lucide-react";
import {
  PHASE_OPTIONS,
  PRIORITY_OPTIONS,
  PURPOSE_OPTIONS,
  STRATEGY_OPTIONS,
  priorityColor,
} from "./tag-filter-bar";

function toggleInArray(arr: string[], value: string): string[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

/** Multi-select dropdown using Popover + Checkboxes */
function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: readonly { readonly value: string; readonly label: string; readonly tooltip?: string }[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  const selectedLabels = options
    .filter((o) => selected.includes(o.value))
    .map((o) => o.label);
  const displayText = selectedLabels.length > 0 ? selectedLabels.join(", ") : "请选择...";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-7 min-w-[80px] max-w-[140px] justify-between text-xs font-normal"
        >
          <span className="truncate">{displayText}</span>
          <ChevronDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-2" align="start">
        <div className="space-y-1">
          {options.map((opt) => (
            <label
              key={opt.value}
              className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-accent cursor-pointer"
              title={opt.tooltip}
            >
              <Checkbox
                checked={selected.includes(opt.value)}
                onCheckedChange={() => onChange(toggleInArray(selected, opt.value))}
              />
              {opt.label}
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

const DEFAULT_TAGS: TestCaseTags = {
  purpose: ["functional"],
  strategy: ["positive"],
  phase: ["full"],
  priority: "P1",
};

/** Safely normalise tags — guards against undefined/null/malformed input */
export function safeTags(tags: unknown): TestCaseTags {
  if (!tags || typeof tags !== "object" || Array.isArray(tags)) return { ...DEFAULT_TAGS };
  const t = tags as Record<string, unknown>;
  return {
    purpose: Array.isArray(t.purpose) ? t.purpose : DEFAULT_TAGS.purpose,
    strategy: Array.isArray(t.strategy) ? t.strategy : DEFAULT_TAGS.strategy,
    phase: Array.isArray(t.phase) ? t.phase : DEFAULT_TAGS.phase,
    priority: typeof t.priority === "string" ? t.priority as TestCaseTags["priority"] : DEFAULT_TAGS.priority,
  };
}

interface TagEditorProps {
  tags: TestCaseTags;
  onChange: (tags: TestCaseTags) => void;
}

export function TagEditor({ tags: rawTags, onChange }: TagEditorProps) {
  const tags = safeTags(rawTags);
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Purpose */}
      <MultiSelectDropdown
        label="Purpose"
        options={PURPOSE_OPTIONS}
        selected={tags.purpose}
        onChange={(values) =>
          onChange({ ...tags, purpose: values as TestCaseTags["purpose"] })
        }
      />

      {/* Strategy */}
      <MultiSelectDropdown
        label="Strategy"
        options={STRATEGY_OPTIONS}
        selected={tags.strategy}
        onChange={(values) =>
          onChange({ ...tags, strategy: values as TestCaseTags["strategy"] })
        }
      />

      {/* Phase */}
      <MultiSelectDropdown
        label="Phase"
        options={PHASE_OPTIONS}
        selected={tags.phase}
        onChange={(values) =>
          onChange({ ...tags, phase: values as TestCaseTags["phase"] })
        }
      />

      {/* Priority */}
      <Select
        value={tags.priority}
        onValueChange={(value) =>
          onChange({ ...tags, priority: value as TestCaseTags["priority"] })
        }
      >
        <SelectTrigger className="h-7 w-16 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PRIORITY_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              <span className={`text-xs font-medium ${priorityColor(opt.value).split(" ").slice(1, 3).join(" ")}`}>
                {opt.label}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ── Compact tag display (for list items) ────────────

interface TagBadgesProps {
  tags: TestCaseTags;
  compact?: boolean;
}

export function TagBadges({ tags: rawTags, compact }: TagBadgesProps) {
  const tags = safeTags(rawTags);
  if (compact) {
    return (
      <div className="flex flex-wrap gap-1">
        <Badge variant="outline" className={`text-[10px] h-4 px-1 ${priorityColor(tags.priority)}`}>
          {tags.priority}
        </Badge>
        {tags.phase.map((p) => (
          <Badge key={p} variant="outline" className="text-[10px] h-4 px-1">
            {p}
          </Badge>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-1">
      <Badge variant="outline" className={`text-[10px] h-4 px-1 ${priorityColor(tags.priority)}`}>
        {tags.priority}
      </Badge>
      {tags.purpose.map((p) => (
        <Badge key={`pu-${p}`} variant="secondary" className="text-[10px] h-4 px-1">
          {p}
        </Badge>
      ))}
      {tags.strategy.map((s) => (
        <Badge key={`st-${s}`} variant="secondary" className="text-[10px] h-4 px-1">
          {s}
        </Badge>
      ))}
      {tags.phase.map((p) => (
        <Badge key={`ph-${p}`} variant="outline" className="text-[10px] h-4 px-1">
          {p}
        </Badge>
      ))}
    </div>
  );
}
