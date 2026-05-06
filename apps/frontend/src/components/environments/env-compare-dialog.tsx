import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { Environment } from "@nexqa/shared";
import { AlertTriangle, Clipboard, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type VariableEntry = { value: string; secret?: boolean; description?: string };
type VariableRecord = Record<string, string | VariableEntry>;

function resolveVarValue(val: string | VariableEntry | undefined): string | undefined {
  if (val === undefined) return undefined;
  if (typeof val === "string") return val;
  return val.value;
}

function isSecret(val: string | VariableEntry | undefined): boolean {
  if (!val || typeof val === "string") return false;
  return val.secret ?? false;
}

interface RowData {
  key: string;
  values: (string | undefined)[];
  isDifferent: boolean;
  hasMissing: boolean;
  secrets: boolean[];
}

export function EnvCompareDialog({
  open,
  onOpenChange,
  environments,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  environments: Environment[];
}) {
  const [showOnlyDiff, setShowOnlyDiff] = useState(false);

  const allKeys = useMemo(() => {
    const keySet = new Set<string>();
    for (const env of environments) {
      for (const k of Object.keys(env.variables ?? {})) keySet.add(k);
    }
    return Array.from(keySet).sort();
  }, [environments]);

  const rowData: RowData[] = useMemo(
    () =>
      allKeys.map((key) => {
        const values = environments.map((env) =>
          resolveVarValue((env.variables as VariableRecord)?.[key]),
        );
        const secrets = environments.map((env) =>
          isSecret((env.variables as VariableRecord)?.[key]),
        );
        const definedValues = values.filter((v) => v !== undefined);
        const uniqueValues = new Set(definedValues);
        const hasMissing = values.some((v) => v === undefined);
        const isDifferent = uniqueValues.size > 1;
        return { key, values, isDifferent, hasMissing, secrets };
      }),
    [allKeys, environments],
  );

  const filtered = showOnlyDiff
    ? rowData.filter((r) => r.isDifferent || r.hasMissing)
    : rowData;

  const allConsistent = rowData.every((r) => !r.isDifferent && !r.hasMissing);

  function handleCopyJson() {
    const data: Record<string, Record<string, string | null>> = {};
    for (const row of rowData) {
      data[row.key] = {};
      for (let i = 0; i < environments.length; i++) {
        data[row.key][environments[i].slug] = row.values[i] ?? null;
      }
    }
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    toast.success("已复制到剪贴板");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            📊 环境变量对比
          </DialogTitle>
          <DialogDescription>
            对比所有环境的变量差异
          </DialogDescription>
        </DialogHeader>

        {/* Filter toggle */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">筛选:</span>
          <Button
            variant={showOnlyDiff ? "default" : "outline"}
            size="sm"
            className="h-6 text-xs"
            onClick={() => setShowOnlyDiff(true)}
          >
            仅差异项
          </Button>
          <Button
            variant={!showOnlyDiff ? "default" : "outline"}
            size="sm"
            className="h-6 text-xs"
            onClick={() => setShowOnlyDiff(false)}
          >
            全部
          </Button>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto border rounded-lg">
          {allConsistent && showOnlyDiff ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-sm font-medium">✅ 所有环境变量一致</p>
              <p className="text-xs text-muted-foreground mt-1">
                所有环境的变量名和值完全相同，无差异
              </p>
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="sticky left-0 bg-muted/50 z-10 w-40 text-left px-3 py-2 font-medium">
                    变量名
                  </th>
                  {environments.map((env) => (
                    <th
                      key={env.id}
                      className="text-left px-3 py-2 min-w-[180px]"
                    >
                      <div className="font-medium text-sm">{env.name}</div>
                      <div className="text-[10px] text-muted-foreground font-normal">
                        {env.slug}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr
                    key={row.key}
                    className={cn(
                      "border-b last:border-0",
                      row.hasMissing && "bg-orange-50/30 dark:bg-orange-950/20",
                      row.isDifferent &&
                        !row.hasMissing &&
                        "bg-amber-50/50 dark:bg-amber-950/20",
                    )}
                  >
                    <td className="sticky left-0 bg-background z-10 px-3 py-2 font-mono font-medium">
                      <span className="flex items-center gap-1.5">
                        {row.key}
                        {row.isDifferent && (
                          <Zap className="h-3 w-3 text-amber-500" />
                        )}
                        {row.hasMissing && (
                          <AlertTriangle className="h-3 w-3 text-orange-500" />
                        )}
                      </span>
                    </td>
                    {row.values.map((val, i) => (
                      <td key={i} className="px-3 py-2 font-mono">
                        {val === undefined ? (
                          <span className="text-muted-foreground italic text-[10px]">
                            (未设置)
                          </span>
                        ) : row.secrets[i] ? (
                          <span className="text-muted-foreground">••••••••</span>
                        ) : (
                          <span className="break-all">{val}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Zap className="h-3 w-3 text-amber-500" /> 各环境值不同
          </span>
          <span className="flex items-center gap-1">
            <AlertTriangle className="h-3 w-3 text-orange-500" /> 部分环境缺失
          </span>
          <span>(无标记 = 所有环境值一致)</span>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={handleCopyJson}>
            <Clipboard className="h-3.5 w-3.5 mr-1.5" />
            复制为 JSON
          </Button>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
