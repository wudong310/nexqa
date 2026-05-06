import {
  TagFilterBar,
  type TagFilter,
} from "@/components/tag-filter-bar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search,
  Trash2,
} from "lucide-react";
import type React from "react";

interface ApiTestToolbarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  tagFilter: TagFilter;
  onTagFilterChange: (filter: TagFilter) => void;
  onDeleteChecked: () => void;
  isDeleting: boolean;
  checkedCount: number;
  stats: { epCount: number; caseCount: number };
}

export function ApiTestToolbar({
  searchQuery,
  onSearchChange,
  searchInputRef,
  tagFilter,
  onTagFilterChange,
  onDeleteChecked,
  isDeleting,
  checkedCount,
  stats,
}: ApiTestToolbarProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* 搜索框 */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          ref={searchInputRef}
          placeholder="搜索接口..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-8 w-52 text-xs pl-8"
        />
      </div>

      {/* 多维筛选 */}
      <TagFilterBar filter={tagFilter} onChange={onTagFilterChange} />

      {/* 批量删除 */}
      {checkedCount > 0 && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive border-destructive/50"
              disabled={isDeleting}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              删除选中 ({checkedCount})
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>确认删除</AlertDialogTitle>
              <AlertDialogDescription>
                确定要删除选中的 {checkedCount} 个端点吗？此操作不可撤销。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
                onClick={onDeleteChecked}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                确认删除
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* 统计 */}
      <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">
        {stats.caseCount} 用例 / {stats.epCount} 接口
      </span>
    </div>
  );
}
