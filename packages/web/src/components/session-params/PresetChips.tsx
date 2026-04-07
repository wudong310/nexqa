import { useState, useRef, useEffect } from "react";
import type { SessionParams } from "./useSessionParams";
import type { Preset } from "./usePresets";
import { X, Star, Check } from "lucide-react";

interface PresetChipsProps {
  presets: Preset[];
  activePresetId: string | null;
  onApply: (params: SessionParams) => void;
  onSave: (name: string) => void;
  onRemove: (id: string) => void;
  onSetDefault?: (id: string) => void;
  connected?: boolean;
  showGuide?: boolean;
  onDismissGuide?: () => void;
}

export function PresetChips({
  presets,
  activePresetId,
  onApply,
  onSave,
  onRemove,
  onSetDefault,
  connected,
  showGuide,
  onDismissGuide,
}: PresetChipsProps) {
  const [naming, setNaming] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [contextMenuId, setContextMenuId] = useState<string | null>(null);
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (naming && inputRef.current) {
      inputRef.current.focus();
    }
  }, [naming]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showDropdown) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showDropdown]);

  // Close context menu when clicking outside
  useEffect(() => {
    if (!contextMenuId) return;
    const handler = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenuId(null);
        setContextMenuPos(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [contextMenuId]);

  const handleSave = () => {
    const trimmed = nameValue.trim();
    if (trimmed) {
      onSave(trimmed);
      setNameValue("");
      setNaming(false);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, presetId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenuId(presetId);
    setContextMenuPos({ x: e.clientX, y: e.clientY });
  };

  const displayPresets = presets.slice(0, 5);
  const hasMore = presets.length > 5;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        {/* Save preset button */}
        {naming ? (
          <div className="flex items-center gap-0.5">
            <input
              ref={inputRef}
              className="h-5 w-[80px] rounded border border-input bg-background px-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
              placeholder="预设名称"
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onBlur={() => {
                if (!nameValue.trim()) setNaming(false);
                else handleSave();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
                if (e.key === "Escape") { setNaming(false); setNameValue(""); }
              }}
            />
          </div>
        ) : (
          <button
            type="button"
            className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setNaming(true)}
            title="保存预设"
          >
            <Star className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Preset chips */}
        {displayPresets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={`group relative inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs transition-colors ${
              activePresetId === preset.id
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            }`}
            onClick={() => onApply(preset.params)}
            onContextMenu={(e) => handleContextMenu(e, preset.id)}
            title={`应用预设: ${preset.name}${preset.isDefault ? " (默认)" : ""}\n右键可设为默认`}
          >
            {preset.isDefault && <Check className="h-2.5 w-2.5" />}
            {preset.name}
            <span
              className="hidden group-hover:inline-flex items-center justify-center h-3 w-3 rounded-full hover:bg-destructive/20"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(preset.id);
              }}
            >
              <X className="h-2 w-2" />
            </span>
          </button>
        ))}

        {/* More dropdown */}
        {hasMore && (
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowDropdown(!showDropdown)}
            >
              ▾
            </button>
            {showDropdown && (
              <div className="absolute right-0 top-full mt-1 z-50 rounded-md border bg-popover p-1 shadow-md min-w-[120px]">
                {presets.slice(5).map((preset) => (
                  <div
                    key={preset.id}
                    className="group flex items-center justify-between rounded px-2 py-1 text-xs hover:bg-accent cursor-pointer"
                    onClick={() => {
                      onApply(preset.params);
                      setShowDropdown(false);
                    }}
                    onContextMenu={(e) => handleContextMenu(e, preset.id)}
                  >
                    <span className="flex items-center gap-1">
                      {preset.isDefault && <Check className="h-2.5 w-2.5" />}
                      {preset.name}
                    </span>
                    <button
                      type="button"
                      className="hidden group-hover:inline-flex h-3.5 w-3.5 items-center justify-center rounded hover:bg-destructive/20"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemove(preset.id);
                      }}
                    >
                      <X className="h-2 w-2" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Context menu for "set as default" */}
        {contextMenuId && contextMenuPos && (
          <div
            ref={contextMenuRef}
            className="fixed z-[100] rounded-md border bg-popover p-1 shadow-md min-w-[100px]"
            style={{ left: contextMenuPos.x, top: contextMenuPos.y }}
          >
            <button
              type="button"
              className="flex items-center gap-1.5 w-full rounded px-2 py-1 text-xs hover:bg-accent cursor-pointer text-left"
              onClick={() => {
                onSetDefault?.(contextMenuId);
                setContextMenuId(null);
                setContextMenuPos(null);
              }}
            >
              <Check className="h-3 w-3" />
              设为默认
            </button>
          </div>
        )}
      </div>

      {/* Guide hint for empty presets */}
      {showGuide && connected && presets.length === 0 && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span>💡 保存当前参数为预设，方便下次快速切换</span>
          <button
            type="button"
            className="inline-flex items-center justify-center h-3.5 w-3.5 rounded hover:bg-muted transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onDismissGuide?.();
            }}
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </div>
      )}
    </div>
  );
}
