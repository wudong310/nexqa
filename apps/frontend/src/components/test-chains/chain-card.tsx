import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TestChain } from "@nexqa/shared";
import {
  ChevronRight,
  Link2,
  Loader2,
  Pencil,
  Play,
  Trash2,
} from "lucide-react";

interface ChainCardProps {
  chain: TestChain;
  onEdit: () => void;
  onDelete: () => void;
  onExecute: () => void;
  isExecuting?: boolean;
}

export function ChainCard({
  chain,
  onEdit,
  onDelete,
  onExecute,
  isExecuting,
}: ChainCardProps) {
  const stepCount = chain.steps.length;
  const extractorCount = chain.steps.reduce(
    (sum, s) => sum + s.extractors.length,
    0,
  );

  return (
    <Card className="hover:border-primary/50 transition-colors group">
      <CardHeader className="py-3 px-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-primary/10 text-primary shrink-0">
            <Link2 className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base truncate">{chain.name}</CardTitle>
            {chain.description && (
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {chain.description}
              </p>
            )}
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        </div>
      </CardHeader>
      <CardContent className="pt-0 px-4 pb-3">
        <div className="flex items-center gap-2 mb-3">
          <Badge variant="secondary" className="text-xs">
            {stepCount} 个步骤
          </Badge>
          {extractorCount > 0 && (
            <Badge variant="outline" className="text-xs">
              {extractorCount} 个变量
            </Badge>
          )}
          {chain.config.continueOnFail && (
            <Badge
              variant="outline"
              className="text-xs text-amber-600 border-amber-200 dark:border-amber-800"
            >
              失败继续
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={(e) => {
              e.stopPropagation();
              onExecute();
            }}
            disabled={isExecuting || stepCount === 0}
          >
            {isExecuting ? (
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
            ) : (
              <Play className="h-3 w-3 mr-1" />
            )}
            执行
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
          >
            <Pencil className="h-3 w-3 mr-1" />
            编辑
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-destructive hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 className="h-3 w-3 mr-1" />
            删除
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
