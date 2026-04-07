import { useState, useRef, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ParamBadgeProps {
  label: string;
  value: string;
  displayValue?: string;
  type: "text" | "select";
  options?: { value: string; label: string }[];
  placeholder?: string;
  onChange: (value: string) => void;
}

export function ParamBadge({
  label,
  value,
  displayValue,
  type,
  options,
  placeholder,
  onChange,
}: ParamBadgeProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  useEffect(() => {
    setEditValue(value);
  }, [value]);

  const handleConfirm = () => {
    setEditing(false);
    if (editValue !== value) {
      onChange(editValue);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleConfirm();
    }
    if (e.key === "Escape") {
      setEditing(false);
      setEditValue(value);
    }
  };

  if (editing && type === "select" && options) {
    return (
      <Select
        value={value}
        onValueChange={(v) => {
          onChange(v);
          setEditing(false);
        }}
        open={true}
        onOpenChange={(open) => {
          if (!open) setEditing(false);
        }}
      >
        <SelectTrigger className="h-5 w-auto min-w-[80px] text-xs px-1.5 py-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (editing && type === "text") {
    return (
      <input
        ref={inputRef}
        className="h-5 min-w-[60px] max-w-[120px] rounded border border-input bg-background px-1.5 text-xs font-mono outline-none focus:ring-1 focus:ring-ring"
        value={editValue}
        placeholder={placeholder}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleConfirm}
        onKeyDown={handleKeyDown}
      />
    );
  }

  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs font-mono text-foreground hover:bg-accent transition-colors cursor-pointer select-none"
      onClick={() => setEditing(true)}
      title={`${label}: ${value || "(空)"}`}
    >
      {displayValue || value || <span className="text-muted-foreground italic">{placeholder || label}</span>}
    </button>
  );
}
