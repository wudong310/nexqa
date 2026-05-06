import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SecretTypeSelect } from "@/components/ui/secret-type-select";
import { SecretValueInput } from "@/components/ui/secret-value-input";
import { Plus, X } from "lucide-react";
import * as React from "react";

export interface EnhancedKVPair {
  key: string;
  value: string;
  description?: string;
  secret?: boolean;
}

interface EnhancedKeyValueEditorProps {
  label: string;
  pairs: EnhancedKVPair[];
  onChange: (pairs: EnhancedKVPair[]) => void;
  showDescription?: boolean;
  showSecretToggle?: boolean;
  valuePlaceholder?: string;
  keyPlaceholder?: string;
  descriptionPlaceholder?: string;
  guideTip?: React.ReactNode;
}

export function EnhancedKeyValueEditor({
  label,
  pairs,
  onChange,
  showDescription = false,
  showSecretToggle = false,
  valuePlaceholder = "Value",
  keyPlaceholder = "变量名",
  descriptionPlaceholder = "可选说明",
  guideTip,
}: EnhancedKeyValueEditorProps) {
  function update(
    index: number,
    field: "key" | "value" | "description" | "secret",
    val: string | boolean,
  ) {
    const next = [...pairs];
    next[index] = { ...next[index], [field]: val };
    onChange(next);
  }

  function remove(index: number) {
    onChange(pairs.filter((_, i) => i !== index));
  }

  function add() {
    onChange([
      ...pairs,
      { key: "", value: "", description: "", secret: false },
    ]);
  }

  return (
    <div className="space-y-2">
      {label && (
        <div className="flex items-center justify-between">
          <Label className="text-sm">{label}</Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 text-xs"
            onClick={add}
          >
            <Plus className="h-3 w-3 mr-1" /> 添加
          </Button>
        </div>
      )}

      {guideTip}

      {pairs.length === 0 && (
        <p className="text-xs text-muted-foreground italic">
          暂无，点击添加
        </p>
      )}

      {pairs.map((pair, i) => (
        <div key={i} className="flex items-center gap-2">
          {/* 变量名 */}
          <Input
            placeholder={keyPlaceholder}
            value={pair.key}
            onChange={(e) => update(i, "key", e.target.value)}
            className="h-8 text-xs font-mono w-28"
          />
          {/* 类型选择 */}
          {showSecretToggle && (
            <SecretTypeSelect
              isSecret={pair.secret ?? false}
              onChange={(secret) => update(i, "secret", secret)}
            />
          )}
          {/* 值 */}
          {showSecretToggle ? (
            <SecretValueInput
              value={pair.value}
              onChange={(v) => update(i, "value", v)}
              isSecret={pair.secret ?? false}
              placeholder={valuePlaceholder}
            />
          ) : (
            <Input
              placeholder={valuePlaceholder}
              value={pair.value}
              onChange={(e) => update(i, "value", e.target.value)}
              className="h-8 text-xs flex-1"
            />
          )}
          {/* 说明 */}
          {showDescription && (
            <Input
              placeholder={descriptionPlaceholder}
              value={pair.description ?? ""}
              onChange={(e) => update(i, "description", e.target.value)}
              className="h-8 text-xs w-36 text-muted-foreground hidden sm:block"
            />
          )}
          {/* 删除 */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => remove(i)}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ))}

      {!label && pairs.length === 0 && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 text-xs"
          onClick={add}
        >
          <Plus className="h-3 w-3 mr-1" /> 添加变量
        </Button>
      )}
    </div>
  );
}
