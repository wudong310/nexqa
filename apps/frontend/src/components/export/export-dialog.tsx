import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FormatCard } from "./format-card";
import { PreviewPanel } from "./preview-panel";
import type { ExportFormat, TestReport } from "@/types/coverage";
import { useExportReport } from "@/hooks/use-reports";
import { Download, FileCode, FileText, Globe, Braces, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const FORMATS: {
  value: ExportFormat;
  icon: typeof FileText;
  title: string;
  description: string;
  ext: string;
}[] = [
  {
    value: "markdown",
    icon: FileText,
    title: "Markdown 报告",
    description: "适合粘贴到飞书/Jira",
    ext: "md",
  },
  {
    value: "html",
    icon: Globe,
    title: "HTML 网页报告",
    description: "可在浏览器中查看/邮件发送",
    ext: "html",
  },
  {
    value: "junit",
    icon: FileCode,
    title: "JUnit XML 报告",
    description: "CI/CD 集成标准格式",
    ext: "xml",
  },
  {
    value: "json",
    icon: Braces,
    title: "JSON 数据",
    description: "程序消费的原始数据",
    ext: "json",
  },
];

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report?: TestReport;
}

export function ExportDialog({ open, onOpenChange, report }: ExportDialogProps) {
  const [format, setFormat] = useState<ExportFormat>("markdown");
  const exportMutation = useExportReport();

  async function handleExport() {
    if (!report) return;
    try {
      const result = await exportMutation.mutateAsync({
        reportId: report.id,
        format,
      });
      // Trigger download
      const ext = FORMATS.find((f) => f.value === format)?.ext ?? "txt";
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nexqa-report-${report.batchNumber}-${new Date(report.summary.timestamp).toISOString().slice(0, 10)}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`报告已导出为 ${format.toUpperCase()}`);
      onOpenChange(false);
    } catch {
      toast.error("导出失败");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[640px]">
        <DialogHeader>
          <DialogTitle>导出测试报告</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 mt-2">
          {/* Format selection */}
          <div>
            <h4 className="text-xs font-medium text-muted-foreground mb-3">
              导出格式
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {FORMATS.map((f) => (
                <FormatCard
                  key={f.value}
                  icon={f.icon}
                  title={f.title}
                  description={f.description}
                  selected={format === f.value}
                  onSelect={() => setFormat(f.value)}
                />
              ))}
            </div>
          </div>

          {/* Scope */}
          {report && (
            <div className="text-xs text-muted-foreground">
              导出范围: 当前报告 ({report.planName ?? "批次"} #{report.batchNumber},{" "}
              {new Date(report.summary.timestamp).toLocaleDateString("zh-CN")})
            </div>
          )}

          {/* Preview */}
          <PreviewPanel format={format} />

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button
              onClick={handleExport}
              disabled={exportMutation.isPending || !report}
              className="min-w-[100px]"
            >
              {exportMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  导出中...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-1" />
                  导出
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
