/**
 * AdoptConfirmDialog — 采纳确认弹窗
 *
 * 预览方案概要：
 * - 名称（可编辑）
 * - 描述（可编辑）
 * - 阶段列表（只读）
 * - 执行配置（只读）
 */

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAdoptPlanGen } from "@/hooks/usePlanGenRecords";
import type { PlanGenRecord } from "@/types/plan-gen-v2";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

// ── Types ───────────────────────────────────────────

interface AdoptConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: PlanGenRecord | null;
  projectId: string;
}

// ── Component ───────────────────────────────────────

export function AdoptConfirmDialog({
  open,
  onOpenChange,
  record,
  projectId,
}: AdoptConfirmDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const adoptMutation = useAdoptPlanGen(projectId);

  // Sync form state when record changes
  useEffect(() => {
    if (record?.result?.plan) {
      setName(record.result.plan.name);
      setDescription(record.result.plan.description || "");
    }
  }, [record]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      // Keep values for smooth re-open
    }
  }, [open]);

  const handleAdopt = useCallback(() => {
    if (!record) return;

    adoptMutation.mutate(
      {
        generationId: record.id,
        name: name.trim() || undefined,
        description: description.trim() || undefined,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
        },
      }
    );
  }, [record, name, description, adoptMutation, onOpenChange]);

  if (!record?.result?.plan) return null;

  const plan = record.result.plan;
  const stages = plan.stages ?? [];
  const execution = plan.execution;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>采纳测试方案</DialogTitle>
          <DialogDescription>
            确认后将创建新的测试方案，可在列表中查看和编辑
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 max-h-[400px] overflow-y-auto">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">方案名称</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="输入方案名称"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">方案描述</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="输入方案描述"
              rows={2}
              className="resize-none"
            />
          </div>

          {/* Stages */}
          {stages.length > 0 && (
            <div className="space-y-2">
              <Label className="text-muted-foreground">阶段 ({stages.length})</Label>
              <div className="space-y-1">
                {stages.map((stage, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 text-xs p-2 rounded bg-muted/50"
                  >
                    <span className="font-mono text-muted-foreground">
                      {i + 1}.
                    </span>
                    <span className="font-medium">{stage.name}</span>
                    {stage.gate && (
                      <Badge variant="outline" className="text-[10px] h-4">
                        门禁
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Execution config */}
          <div className="space-y-2">
            <Label className="text-muted-foreground">执行配置</Label>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="text-xs">
                并发: {execution?.concurrency ?? 3}
              </Badge>
              <Badge variant="secondary" className="text-xs">
                重试: {execution?.retryOnFail ?? 0}次
              </Badge>
              <Badge variant="secondary" className="text-xs">
                超时: {(execution?.timeoutMs ?? 30000) / 1000}s
              </Badge>
              {execution?.stopOnGateFail && (
                <Badge variant="secondary" className="text-xs">
                  门禁失败停止
                </Badge>
              )}
            </div>
          </div>

          {/* Criteria */}
          <div className="space-y-2">
            <Label className="text-muted-foreground">通过标准</Label>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="text-xs">
                通过率 ≥{Math.round((plan.criteria?.minPassRate ?? 0.95) * 100)}%
              </Badge>
              <Badge variant="outline" className="text-xs">
                P0 失败 ≤{plan.criteria?.maxP0Fails ?? 0}
              </Badge>
              <Badge variant="outline" className="text-xs">
                P1 失败 ≤{plan.criteria?.maxP1Fails ?? 3}
              </Badge>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={adoptMutation.isPending}
          >
            取消
          </Button>
          <Button
            onClick={handleAdopt}
            disabled={adoptMutation.isPending}
            className="bg-violet-600 hover:bg-violet-700 text-white"
          >
            {adoptMutation.isPending && (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            )}
            确认采纳
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
