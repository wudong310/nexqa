import { AttackSurfaceMatrix } from "@/components/security/attack-surface-matrix";
import { OwaspCoverageList } from "@/components/security/owasp-coverage-list";
import { SeverityCountCards } from "@/components/security/severity-count-cards";
import { VulnerabilityCard } from "@/components/security/vulnerability-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useAttackSurface, useSecurityReport } from "@/hooks/use-security";
import type { SeverityLevel } from "@/types/security";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
  ArrowLeft,
  Download,
  ShieldAlert,
} from "lucide-react";
import { useMemo, useState } from "react";

export function SecurityReportPage() {
  const { projectId, taskId } = useParams({
    from: "/p/$projectId/security/$taskId",
  });
  const navigate = useNavigate();

  const { data: report, isLoading: reportLoading } = useSecurityReport(taskId);
  const { data: surfaceData } = useAttackSurface(taskId);

  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<"findings" | "surface">(
    "findings",
  );

  const filteredFindings = useMemo(() => {
    if (!report?.findings) return [];
    if (severityFilter === "all") return report.findings;
    return report.findings.filter((f) => f.severity === severityFilter);
  }, [report?.findings, severityFilter]);

  function handleExport() {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `security-report-${taskId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (reportLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-7 w-64" />
        <div className="flex gap-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-16 w-[72px]" />
          ))}
        </div>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
    );
  }

  if (!report) {
    return (
      <div className="p-6 max-w-4xl mx-auto text-center py-16">
        <ShieldAlert className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <h2 className="text-lg font-semibold">报告不存在</h2>
        <p className="text-sm text-muted-foreground mt-1">
          安全扫描可能尚未完成
        </p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() =>
            navigate({
              to: "/p/$projectId/dashboard",
              params: { projectId },
            })
          }
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          返回概览
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() =>
              navigate({
                to: "/p/$projectId/dashboard",
                params: { projectId },
              })
            }
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-red-500" />
              安全扫描报告
            </h1>
            <p className="text-xs text-muted-foreground">
              {report.createdAt
                ? new Date(report.createdAt).toLocaleString("zh-CN")
                : ""}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={handleExport}
        >
          <Download className="h-3.5 w-3.5" />
          导出报告
        </Button>
      </div>

      {/* Severity counts */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <SeverityCountCards summary={report.summary} />
          <p className="text-xs text-muted-foreground">
            扫描: {report.summary.totalTests} 个用例 · 发现{" "}
            {report.summary.vulnerabilities} 个漏洞
            {report.summary.high > 0 &&
              `，其中 ${report.summary.high} 个高危需要立即修复`}
          </p>
        </CardContent>
      </Card>

      {/* Tab: Findings | Attack Surface */}
      <div className="flex items-center gap-4 border-b">
        <button
          type="button"
          className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "findings"
              ? "border-red-500 text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setActiveTab("findings")}
        >
          漏洞列表 ({report.findings.length})
        </button>
        <button
          type="button"
          className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "surface"
              ? "border-red-500 text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setActiveTab("surface")}
        >
          攻击面矩阵
        </button>
      </div>

      {/* Findings tab */}
      {activeTab === "findings" && (
        <div className="space-y-4">
          {/* Filter */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">严重度:</span>
            <Select
              value={severityFilter}
              onValueChange={setSeverityFilter}
            >
              <SelectTrigger className="h-8 w-28 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">
                  全部
                </SelectItem>
                <SelectItem value="critical" className="text-xs">
                  严重
                </SelectItem>
                <SelectItem value="high" className="text-xs">
                  高危
                </SelectItem>
                <SelectItem value="medium" className="text-xs">
                  中危
                </SelectItem>
                <SelectItem value="low" className="text-xs">
                  低危
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Vulnerability list */}
          {filteredFindings.length === 0 ? (
            <div className="text-center py-8">
              <ShieldAlert className="h-8 w-8 text-green-500 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                {severityFilter === "all"
                  ? "未发现安全漏洞 🎉"
                  : "该严重度没有发现漏洞"}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredFindings.map((finding) => (
                <VulnerabilityCard
                  key={finding.id}
                  finding={finding}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Attack surface tab */}
      {activeTab === "surface" && (
        <div>
          {surfaceData ? (
            <AttackSurfaceMatrix data={surfaceData} />
          ) : (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">
                攻击面数据加载中...
              </p>
            </div>
          )}
        </div>
      )}

      <Separator />

      {/* OWASP Top 10 Coverage */}
      {report.owaspCoverage && report.owaspCoverage.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">OWASP Top 10 覆盖度</CardTitle>
          </CardHeader>
          <CardContent>
            <OwaspCoverageList coverage={report.owaspCoverage} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
