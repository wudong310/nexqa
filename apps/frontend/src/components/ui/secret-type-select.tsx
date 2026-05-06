import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Lock } from "lucide-react";

interface SecretTypeSelectProps {
  isSecret: boolean;
  onChange: (secret: boolean) => void;
}

/**
 * 普通 / 🔒 敏感 类型选择下拉
 */
export function SecretTypeSelect({ isSecret, onChange }: SecretTypeSelectProps) {
  return (
    <Select
      value={isSecret ? "secret" : "plain"}
      onValueChange={(v) => onChange(v === "secret")}
    >
      <SelectTrigger className="h-8 w-24 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="plain" className="text-xs">
          普通
        </SelectItem>
        <SelectItem value="secret" className="text-xs">
          <span className="flex items-center gap-1">
            <Lock className="h-3 w-3" /> 敏感
          </span>
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
