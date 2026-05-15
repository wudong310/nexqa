/**
 * CaseGenConfigDialog — 用例生成配置弹窗
 *
 * 包含：
 * - 已选端点列表展示
 * - 测试策略多选（positive/negative/boundary/destructive）
 * - 测试目的多选（functional/auth/security/data-integrity/idempotent/performance）
 * - 每端点上限 Slider（5-20，默认15）
 * - 取消/开始生成 按钮
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CaseGenPurpose, CaseGenStrategy } from "@/types/case-gen";
import { Wand2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

// ── Strategy Config ────────────────────────────────

const STRATEGY_CONFIG: Record<
  CaseGenStrategy,
  { label: string; cls: string; tooltip: string }
> = {
  positive: {
    label: "正向",
    cls: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
    tooltip: "验证接口在正常输入下返回预期结果",
  },
  negative: {
    label: "负向",
    cls: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
    tooltip: "验证接口对异常/非法输入的错误处理",
  },
  boundary: {
    label: "边界",
    cls: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    tooltip: "验证接口在临界值（最大/最小/空值）下的行为",
  },
  destructive: {
    label: "破坏性",
    cls: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
    tooltip: "验证接口在极端条件下的稳定性（超大数据、特殊字符、并发等）",
  },
};

const ALL_STRATEGIES: CaseGenStrategy[] = ["positive", "negative", "boundary", "destructive"];
const DEFAULT_STRATEGIES: CaseGenStrategy[] = [...ALL_STRATEGIES];

// ── Purpose Config ─────────────────────────────────

const PURPOSE_CONFIG: Array<{ value: CaseGenPurpose; label: string; desc: string }> = [
  { value: "functional", label: "功能测试", desc: "验证 API 核心功能正确性" },
  { value: "auth", label: "鉴权测试", desc: "未登录、无权限、Token 过期等" },
  { value: "security", label: "安全测试", desc: "SQL 注入、XSS、路径遍历等" },
  { value: "data-integrity", label: "数据完整性", desc: "验证数据一致性和约束" },
  { value: "idempotent", label: "幂等性测试", desc: "重复请求结果一致、无副作用" },
  { value: "performance", label: "性能测试", desc: "响应时间、超时边界验证" },
];

const ALL_PURPOSES: CaseGenPurpose[] = PURPOSE_CONFIG.map((p) => p.value);
const DEFAULT_PURPOSES: CaseGenPurpose[] = [...ALL_PURPOSES];

// ── Helpers ────────────────────────────────────────

function toggleSet<T>(prev: Set<T>, val: T): Set<T> {
  const next = new Set(prev);
  next.has(val) ? next.delete(val) : next.add(val);
  return next;
}

// ── Props ───────────────────────────────────────────

interface CaseGenConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  endpoints: Array<{ id: string; method: string; path: string; name?: string }>;
  onGenerate: (config: {
    strategies: CaseGenStrategy[];
    purposes: CaseGenPurpose[];
    maxCasesPerEndpoint: number;
  }) => void;
  isGenerating?: boolean;
}

// ── Component ───────────────────────────────────────

export function CaseGenConfigDialog({
  open,
  onOpenChange,
  endpoints,
  onGenerate,
  isGenerating = false,
}: CaseGenConfigDialogProps) {
  const [selStrats, setSelStrats] = useState<Set<CaseGenStrategy>>(
    new Set(DEFAULT_STRATEGIES)
  );
  const [selPurposes, setSelPurposes] = useState<Set<CaseGenPurpose>>(
    new Set(DEFAULT_PURPOSES)
  );
  const [maxCases, setMaxCases] = useState("15");

  const canGenerate = endpoints.length > 0 && selStrats.size > 0 && selPurposes.size > 0;

  const handleGenerate = useCallback(() => {
    onGenerate({
      strategies: [...selStrats],
      purposes: [...selPurposes],
      maxCasesPerEndpoint: parseInt(maxCases, 10),
    });
  }, [onGenerate, selStrats, selPurposes, maxCases]);

  const needsIsolation = useMemo(
    () => endpoints.some((ep) => ["DELETE", "PUT", "PATCH"].includes(ep.method.toUpperCase())),
    [endpoints]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-violet-500" />
            AI 用例生成配置
          </DialogTitle>
          <DialogDescription>
            确认端点和测试类型，AI 将自动生成用例
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Endpoint list */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              已选端点（{endpoints.length}）
            </Label>
            <div className="space-y-1.5 max-h-[200px] overflow-y-auto border rounded-md p-2">
              {endpoints.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  暂无选中端点
                </p>
              ) : (
                endpoints.map((ep) => (
                  <div
                    key={ep.id}
                    className="flex items-center gap-3 rounded-md bg-muted/30 px-2.5 py-2"
                  >
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 font-mono shrink-0"
                    >
                      {ep.method.toUpperCase()}
                    </Badge>
                    <span className="text-sm font-mono truncate flex-1">
                      {ep.path}
                    </span>
                    {ep.name && (
                      <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                        {ep.name}
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Strategy selection */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              测试策略
            </Label>
            <div className="flex flex-wrap gap-3">
              {ALL_STRATEGIES.map((s) => (
                <label key={s} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={selStrats.has(s)}
                    onCheckedChange={() => setSelStrats((p) => toggleSet(p, s))}
                  />
                  <Badge
                    variant="secondary"
                    className={`text-xs ${STRATEGY_CONFIG[s].cls}`}
                    title={STRATEGY_CONFIG[s].tooltip}
                  >
                    {STRATEGY_CONFIG[s].label}
                  </Badge>
                </label>
              ))}
            </div>
          </div>

          {/* Purpose selection */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              测试目的
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {PURPOSE_CONFIG.map((p) => (
                <label
                  key={p.value}
                  className="flex items-center gap-2.5 rounded-md border bg-card p-2.5 cursor-pointer hover:bg-accent/50 transition-colors"
                >
                  <Checkbox
                    checked={selPurposes.has(p.value)}
                    onCheckedChange={() => setSelPurposes((prev) => toggleSet(prev, p.value))}
                  />
                  <div className="min-w-0">
                    <span className="text-sm font-medium">{p.label}</span>
                    <p className="text-[11px] text-muted-foreground truncate">{p.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Max cases per endpoint */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              每端点用例上限
            </Label>
            <Select value={maxCases} onValueChange={setMaxCases}>
              <SelectTrigger className="w-[120px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[5, 10, 15, 20].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Isolation warning */}
          {needsIsolation && (
            <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 rounded-md p-2.5">
              ⚠️ 已选端点包含 DELETE/PUT/PATCH，建议启用数据隔离以避免污染真实数据
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={!canGenerate || isGenerating}
            className="bg-violet-600 hover:bg-violet-700 text-white gap-1.5"
          >
            <Wand2 className="h-3.5 w-3.5" />
            开始生成
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}