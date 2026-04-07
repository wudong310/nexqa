import { Button } from "@/components/ui/button";
import { Circle, Loader2, Save } from "lucide-react";

export function SaveButton({
  isDirty,
  isSaving,
  disabled,
  onSave,
}: {
  isDirty: boolean;
  isSaving: boolean;
  /** Extra disable condition (e.g. empty required field) */
  disabled?: boolean;
  onSave: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      {isDirty && (
        <span className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
          <Circle className="h-2 w-2 fill-amber-500 text-amber-500 animate-pulse" />
          有未保存的修改
        </span>
      )}
      <Button onClick={onSave} disabled={!isDirty || isSaving || disabled}>
        {isSaving ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
            保存中...
          </>
        ) : (
          <>
            <Save className="h-4 w-4 mr-1.5" />
            保存{isDirty ? "修改" : ""}
          </>
        )}
      </Button>
    </div>
  );
}
