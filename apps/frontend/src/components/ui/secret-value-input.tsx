import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, EyeOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface SecretValueInputProps {
  value: string;
  onChange: (v: string) => void;
  isSecret: boolean;
  placeholder?: string;
}

/**
 * 敏感变量值输入框 — password 模式 + 👁 切换 + 5s 自动隐藏
 */
export function SecretValueInput({
  value,
  onChange,
  isSecret,
  placeholder = "变量值",
}: SecretValueInputProps) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);

  // 5 秒自动隐藏
  useEffect(() => {
    if (visible && isSecret) {
      timerRef.current = setTimeout(() => setVisible(false), 5000);
      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
      };
    }
  }, [visible, isSecret]);

  // 切换为非敏感时重置可见性
  useEffect(() => {
    if (!isSecret) setVisible(false);
  }, [isSecret]);

  if (!isSecret) {
    return (
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 text-xs flex-1"
        placeholder={placeholder}
      />
    );
  }

  return (
    <div className="relative flex-1">
      <Input
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 text-xs pr-8 font-mono"
        placeholder="敏感值"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-0.5 top-0.5 h-7 w-7"
        onClick={() => setVisible(!visible)}
        aria-label={visible ? "隐藏值" : "显示值"}
      >
        {visible ? (
          <EyeOff className="h-3 w-3 text-muted-foreground" />
        ) : (
          <Eye className="h-3 w-3 text-muted-foreground" />
        )}
      </Button>
    </div>
  );
}
