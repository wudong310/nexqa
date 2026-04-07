import { useState } from "react";
import { ChevronRight, ChevronDown, Dices } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ParamBadge } from "./ParamBadge";
import { PresetChips } from "./PresetChips";
import type { SessionParams, SessionParamChange } from "./useSessionParams";
import type { Preset } from "./usePresets";

const CHANNEL_OPTIONS = [
  { value: "webchat", label: "webchat" },
  { value: "telegram", label: "telegram" },
  { value: "wecom", label: "wecom" },
  { value: "discord", label: "discord" },
  { value: "whatsapp", label: "whatsapp" },
  { value: "slack", label: "slack" },
];

const CHAT_TYPE_OPTIONS = [
  { value: "dm", label: "dm" },
  { value: "group", label: "group" },
];

function randomPeerId(): string {
  return `user-${Math.random().toString(36).slice(2, 8)}`;
}

interface SessionParamsBarProps {
  params: SessionParams;
  onParamChange: (field: keyof SessionParams, value: string) => SessionParamChange | null;
  onApplyPreset: (params: SessionParams) => void;
  presets: Preset[];
  activePresetId: string | null;
  onSavePreset: (name: string) => void;
  onRemovePreset: (id: string) => void;
  onSetDefaultPreset?: (id: string) => void;
  connected?: boolean;
}

export function SessionParamsBar({
  params,
  onParamChange,
  onApplyPreset,
  presets,
  activePresetId,
  onSavePreset,
  onRemovePreset,
  onSetDefaultPreset,
  connected,
}: SessionParamsBarProps) {
  const [expanded, setExpanded] = useState(false);
  const [showPresetGuide, setShowPresetGuide] = useState(true);

  return (
    <div className="border-b bg-background/50 overflow-hidden transition-all duration-200">
      {/* Collapsed row */}
      <div className="flex items-center h-8 px-3 gap-1.5">
        <button
          type="button"
          className="shrink-0 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <span className="font-medium">会话参数</span>
        </button>

        <span className="text-muted-foreground/40">│</span>

        {/* Badges (shown in collapsed mode) */}
        {!expanded && (
          <>
            <ParamBadge
              label="channel"
              value={params.channel}
              type="select"
              options={CHANNEL_OPTIONS}
              onChange={(v) => onParamChange("channel", v)}
            />
            <ParamBadge
              label="accountId"
              value={params.accountId}
              type="text"
              placeholder="default"
              onChange={(v) => onParamChange("accountId", v)}
            />
            <ParamBadge
              label="peerId"
              value={params.peerId}
              displayValue={params.peerId || undefined}
              type="text"
              placeholder="用户ID"
              onChange={(v) => onParamChange("peerId", v)}
            />
            <ParamBadge
              label="senderName"
              value={params.senderName}
              displayValue={params.senderName || undefined}
              type="text"
              placeholder="显示名称"
              onChange={(v) => onParamChange("senderName", v)}
            />
            <ParamBadge
              label="chatType"
              value={params.chatType}
              type="select"
              options={CHAT_TYPE_OPTIONS}
              onChange={(v) => onParamChange("chatType", v)}
            />
            <ParamBadge
              label="agentId"
              value={params.agentId}
              type="text"
              placeholder="main"
              onChange={(v) => onParamChange("agentId", v)}
            />
          </>
        )}

        <div className="flex-1" />

        {/* Preset controls */}
        <PresetChips
          presets={presets}
          activePresetId={activePresetId}
          onApply={onApplyPreset}
          onSave={onSavePreset}
          onRemove={onRemovePreset}
          onSetDefault={onSetDefaultPreset}
          connected={connected}
          showGuide={showPresetGuide}
          onDismissGuide={() => setShowPresetGuide(false)}
        />
      </div>

      {/* Expanded form */}
      {expanded && (
        <div className="px-3 pb-2 pt-1">
          <div className="grid grid-cols-6 gap-2">
            {/* channel */}
            <div className="space-y-0.5">
              <label className="text-[10px] text-muted-foreground font-medium">channel</label>
              <Select
                value={params.channel}
                onValueChange={(v) => onParamChange("channel", v)}
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHANNEL_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* accountId */}
            <div className="space-y-0.5">
              <label className="text-[10px] text-muted-foreground font-medium">accountId</label>
              <Input
                className="h-7 text-xs font-mono"
                placeholder="default"
                value={params.accountId}
                onChange={(e) => onParamChange("accountId", e.target.value)}
              />
            </div>

            {/* peerId */}
            <div className="space-y-0.5">
              <label className="text-[10px] text-muted-foreground font-medium">peerId</label>
              <div className="flex gap-1">
                <Input
                  className="h-7 text-xs font-mono flex-1"
                  placeholder="用户ID"
                  value={params.peerId}
                  onChange={(e) => onParamChange("peerId", e.target.value)}
                />
                <button
                  type="button"
                  className="shrink-0 h-7 w-7 inline-flex items-center justify-center rounded-md border border-input text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  onClick={() => onParamChange("peerId", randomPeerId())}
                  title="随机生成"
                >
                  <Dices className="h-3 w-3" />
                </button>
              </div>
            </div>

            {/* senderName */}
            <div className="space-y-0.5">
              <label className="text-[10px] text-muted-foreground font-medium">senderName</label>
              <Input
                className="h-7 text-xs font-mono"
                placeholder="显示名称"
                value={params.senderName}
                onChange={(e) => onParamChange("senderName", e.target.value)}
              />
            </div>

            {/* chatType */}
            <div className="space-y-0.5">
              <label className="text-[10px] text-muted-foreground font-medium">chatType</label>
              <Select
                value={params.chatType}
                onValueChange={(v) => onParamChange("chatType", v)}
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHAT_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* agentId */}
            <div className="space-y-0.5">
              <label className="text-[10px] text-muted-foreground font-medium">agentId</label>
              <Input
                className="h-7 text-xs font-mono"
                placeholder="main"
                value={params.agentId}
                onChange={(e) => onParamChange("agentId", e.target.value)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
