import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ReportListItem } from "@/components/reports/report-list-item";
import { ReportDetail } from "@/components/reports/report-detail";
import { ExportDialog } from "@/components/export/export-dialog";
import { useReports } from "@/hooks/use-reports";
import { useParams } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Download, FileText, RefreshCw, Search } from "lucide-react";
import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import type { TestReport } from "@/types/coverage";

function groupByDate(reports: TestReport[]) {
  const groups: { label: string; reports: TestReport[] }[] = [];
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);

  const grouped = new Map<string, TestReport[]>();

  for (const r of reports) {
    const d = new Date(r.summary.timestamp);
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    let label: string;

    if (day.getTime() === today.getTime()) {
      label = "今天";
    } else if (day.getTime() === yesterday.getTime()) {
      label = "昨天";
    } else {
      label = `${d.getMonth() + 1}月${d.getDate()}日`;
    }

    if (!grouped.has(label)) grouped.set(label, []);
    grouped.get(label)!.push(r);
  }

  for (const [label, rpts] of grouped) {
    groups.push({ label, reports: rpts });
  }

  return groups;
}

export function ReportsPage() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const { data: reports, isLoading, isError } = useReports(projectId);
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredReports = useMemo(() => {
    if (!reports) return [];
    if (!searchQuery) return reports;
    const q = searchQuery.toLowerCase();
    return reports.filter(
      (r) =>
        (r.planName ?? "").toLowerCase().includes(q) ||
        String(r.batchNumber).includes(q),
    );
  }, [reports, searchQuery]);

  const dateGroups = useMemo(
    () => groupByDate(filteredReports),
    [filteredReports],
  );

  const selectedReport = reports?.find((r) => r.id === selectedId) ?? null;

  function handleRefresh() {
    queryClient.invalidateQueries({ queryKey: ["reports", projectId] });
  }

  function renderReportList() {
    return (
      <>
        {/* Search */}
        <div className="p-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="搜索报告..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 text-xs pl-8"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="space-y-2 p-3">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-16" />
                </div>
              ))}
            </div>
          ) : filteredReports.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p>还没有测试报告</p>
              <p className="text-xs mt-1">执行测试方案后将自动生成报告</p>
            </div>
          ) : (
            dateGroups.map((group) => (
              <div key={group.label}>
                <div className="px-3 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider bg-muted/20">
                  {group.label}
                </div>
                {group.reports.map((r) => (
                  <ReportListItem
                    key={r.id}
                    report={r}
                    isSelected={selectedId === r.id}
                    onClick={() => setSelectedId(r.id)}
                  />
                ))}
              </div>
            ))
          )}
        </div>
      </>
    );
  }

  if (isError) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <EmptyState
          icon={<FileText className="h-12 w-12" />}
          title="加载失败"
          description="无法获取测试报告，请检查后端服务"
          action={
            <Button variant="outline" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4 mr-1" />
              重试
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto h-[calc(100vh-3.5rem)]">
      {/* Header */}
      <div className="flex items-center justify-between p-6 pb-0">
        <h1 className="text-xl font-semibold">测试报告</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setExportOpen(true)}>
            <Download className="h-4 w-4 mr-1" />
            导出
          </Button>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-1" />
          </Button>
        </div>
      </div>

      {/* Mobile: Tab view (< sm) */}
      <div className="sm:hidden flex-1 min-h-0">
        <Tabs defaultValue="list" className="h-full flex flex-col">
          <TabsList className="w-full mx-6 mt-2">
            <TabsTrigger value="list" className="flex-1 text-xs">
              报告列表
            </TabsTrigger>
            <TabsTrigger value="detail" className="flex-1 text-xs">
              报告详情
              {selectedReport && (
                <span className="ml-1 text-[10px]">#{selectedReport.batchNumber}</span>
              )}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="list" className="flex-1 overflow-y-auto mt-0">
            {renderReportList()}
          </TabsContent>
          <TabsContent value="detail" className="flex-1 overflow-y-auto mt-0">
            {selectedReport ? (
              <ReportDetail report={selectedReport} onExport={() => setExportOpen(true)} />
            ) : (
              <p className="text-center text-sm text-muted-foreground py-8">
                从列表中选择一份报告
              </p>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Desktop: left/right split (≥ sm) */}
      <div className="hidden sm:flex h-[calc(100%-4rem)]">
        {/* Left: report list */}
        <div className="w-[320px] border-r flex flex-col shrink-0">
          {renderReportList()}
        </div>

        {/* Right: report detail */}
        <div className="flex-1 min-w-0">
          {selectedReport ? (
            <ReportDetail
              report={selectedReport}
              onExport={() => setExportOpen(true)}
            />
          ) : (
            <EmptyState
              icon={<FileText className="h-12 w-12" />}
              title="选择一份报告"
              description="从左侧列表中选择一份报告查看详情"
              className="h-full"
            />
          )}
        </div>
      </div>

      {/* Export dialog */}
      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        report={selectedReport ?? undefined}
      />
    </div>
  );
}
