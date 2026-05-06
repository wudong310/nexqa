import { CoverageStatCard } from "@/components/coverage/coverage-stat-card";
import { CoverageMatrix } from "@/components/coverage/coverage-matrix";
import { CoverageSuggestionAlert } from "@/components/coverage/coverage-suggestion-alert";
import { TrendSection } from "@/components/trends/trend-section";
import { ExportDialog } from "@/components/export/export-dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useCoverage } from "@/hooks/use-coverage";
import { useParams } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Hash, Layers, Network, RefreshCw, Download, BarChart3 } from "lucide-react";
import { useState } from "react";

export function CoveragePage() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const { data, isLoading, isError } = useCoverage(projectId);
  const queryClient = useQueryClient();
  const [exportOpen, setExportOpen] = useState(false);

  function handleRefresh() {
    queryClient.invalidateQueries({ queryKey: ["coverage", projectId] });
    queryClient.invalidateQueries({ queryKey: ["trends", projectId] });
  }

  if (isError) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <EmptyState
          icon={<BarChart3 className="h-12 w-12" />}
          title="加载失败"
          description="无法获取覆盖率数据，请检查后端服务是否启动"
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
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">覆盖率仪表板</h1>
          <p className="text-sm text-muted-foreground mt-1">
            分析测试用例对 API 接口的覆盖情况
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-1" />
            刷新
          </Button>
          <Button variant="outline" size="sm" onClick={() => setExportOpen(true)}>
            <Download className="h-4 w-4 mr-1" />
            导出报告
          </Button>
        </div>
      </div>

      {/* Overview cards */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">概览</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <CoverageStatCard
            title="接口覆盖率"
            icon={Network}
            percentage={data?.endpoint ?? 0}
            covered={data?.endpointCovered ?? 0}
            total={data?.endpointTotal ?? 0}
            uncovered={(data?.endpointTotal ?? 0) - (data?.endpointCovered ?? 0)}
            uncoveredLabel={`${(data?.endpointTotal ?? 0) - (data?.endpointCovered ?? 0)} 个接口未覆盖`}
            loading={isLoading}
          />
          <CoverageStatCard
            title="方法覆盖率"
            icon={Layers}
            percentage={data?.scenario ?? 0}
            covered={data?.scenarioCovered ?? 0}
            total={data?.scenarioTotal ?? 0}
            uncovered={(data?.scenarioTotal ?? 0) - (data?.scenarioCovered ?? 0)}
            uncoveredLabel={`${(data?.scenarioTotal ?? 0) - (data?.scenarioCovered ?? 0)} 个方法对未覆盖`}
            loading={isLoading}
          />
          <CoverageStatCard
            title="状态码覆盖率"
            icon={Hash}
            percentage={data?.statusCode ?? 0}
            covered={data?.statusCodeCovered ?? 0}
            total={data?.statusCodeTotal ?? 0}
            uncovered={(data?.statusCodeTotal ?? 0) - (data?.statusCodeCovered ?? 0)}
            uncoveredLabel={`${(data?.statusCodeTotal ?? 0) - (data?.statusCodeCovered ?? 0)} 个状态码未覆盖`}
            loading={isLoading}
          />
        </div>
      </div>

      <Separator />

      {/* Coverage matrix */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">覆盖矩阵</h3>
        {isLoading ? (
          <Skeleton className="h-[300px] w-full rounded-lg" />
        ) : data ? (
          <CoverageMatrix cells={data.matrix ?? []} endpoints={data.endpoints ?? []} />
        ) : null}
      </div>

      {/* Suggestions */}
      {data && (data.suggestions ?? []).length > 0 && (
        <>
          <Separator />
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-3">建议</h3>
            <CoverageSuggestionAlert suggestions={data.suggestions ?? []} />
          </div>
        </>
      )}

      <Separator />

      {/* Trend section */}
      <TrendSection projectId={projectId} />

      {/* Export dialog */}
      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
      />
    </div>
  );
}
