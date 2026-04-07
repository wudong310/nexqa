import { SmokeTestCard } from "@/components/dashboard/smoke-test-card";
import { WelcomeCard } from "@/components/dashboard/welcome-card";
import { TrendChartWithInsights } from "@/components/dashboard/trend-chart-insights";
import { QualityRiskSection } from "@/components/dashboard/quality-risk-section";
import { SmokeConfirmSheet } from "@/components/ai/smoke-confirm-sheet";
import { SecurityScanSheet } from "@/components/ai/security-scan-sheet";
import { FloatingProgress } from "@/components/ai/floating-progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { useTrendAnalysis, useTrendInsights, useQualityRisks, useDismissRisk } from "@/hooks/use-trend-analysis";
import { useSmokeGenerate, useSmokeExecute, useSmokeStatus } from "@/hooks/use-ai";
import { useSecurityScan, useSecurityStatus } from "@/hooks/use-security";
import type { BatchRun, Environment } from "@nexqa/shared";
import type { CorePath } from "@/types/ai";
import type { SecurityTestType } from "@/types/security";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import {
  CheckCircle,
  Clock,
  FileText,
  Flame,
  FlaskConical,
  Globe,
  Link2,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

// ── Stats Card ──────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  isLoading,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  isLoading?: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            {isLoading ? (
              <Skeleton className="h-5 w-12" />
            ) : (
              <p className="text-lg font-semibold">{value}</p>
            )}
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Recent Batch Item ───────────────────────────────────

function RecentBatchItem({ batch }: { batch: BatchRun }) {
  const passRate =
    batch.totalCases > 0
      ? Math.round((batch.passedCases / batch.totalCases) * 100)
      : 0;
  const statusIcon =
    batch.status === "completed" ? (
      <CheckCircle className="h-4 w-4 text-green-600" />
    ) : batch.status === "failed" ? (
      <XCircle className="h-4 w-4 text-red-600" />
    ) : (
      <Clock className="h-4 w-4 text-muted-foreground" />
    );

  return (
    <div className="flex items-center justify-between py-2.5 border-b last:border-0">
      <div className="flex items-center gap-2 min-w-0">
        {statusIcon}
        <span className="text-sm truncate">{batch.name}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Badge variant="outline" className="text-xs">
          {passRate}% 通过
        </Badge>
        <span className="text-xs text-muted-foreground">
          {batch.totalCases} 用例
        </span>
      </div>
    </div>
  );
}

// ── Dashboard Page ──────────────────────────────────────

export function DashboardPage() {
  const { projectId } = useParams({ from: "/p/$projectId/dashboard" });
  const navigate = useNavigate();

  // Queries
  const { data: project, isLoading: projectLoading } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => api.get<Record<string, unknown>>(`/projects/detail?id=${projectId}`),
  });

  const { data: environments = [] } = useQuery<Environment[]>({
    queryKey: ["environments", projectId],
    queryFn: () => api.get(`/environments?projectId=${projectId}`),
  });

  const { data: batchRuns = [], isLoading: batchLoading } = useQuery<
    BatchRun[]
  >({
    queryKey: ["batchRuns", projectId],
    queryFn: () =>
      api
        .get<{ items: BatchRun[] }>(`/batch-runs?projectId=${projectId}`)
        .then((d) => d.items),
  });

  // Derived stats
  const caseCount = (project as Record<string, unknown> | undefined)?.caseCount ?? "—";
  const chainCount = (project as Record<string, unknown> | undefined)?.chainCount ?? "—";
  const lastPassRate = useMemo(() => {
    const latest = batchRuns[0];
    if (!latest || latest.totalCases === 0) return "—";
    return `${Math.round((latest.passedCases / latest.totalCases) * 100)}%`;
  }, [batchRuns]);

  // Welcome card visibility
  const showWelcome =
    environments.length <= 1 &&
    batchRuns.length === 0 &&
    !localStorage.getItem(`welcome-dismissed-${projectId}`);

  // ── Trend analysis + quality risk state ───────────────
  const [trendTimeRange, setTrendTimeRange] = useState("7d");
  const trendAnalysisMutation = useTrendAnalysis(projectId);
  const { data: trendInsights = [] } = useTrendInsights(projectId);
  const { data: qualityRisks = [] } = useQualityRisks(projectId);
  const dismissRiskMutation = useDismissRisk(projectId);

  const trendData = useMemo(() => {
    return batchRuns
      .slice(0, trendTimeRange === "7d" ? 7 : trendTimeRange === "30d" ? 30 : 90)
      .reverse()
      .map((b) => ({
        date: new Date(b.createdAt ?? "").toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" }),
        passRate: b.totalCases > 0 ? b.passedCases / b.totalCases : 0,
      }));
  }, [batchRuns, trendTimeRange]);

  const handleTrendAnalysis = useCallback(() => {
    trendAnalysisMutation.mutate({ timeRange: trendTimeRange, force: true });
  }, [trendAnalysisMutation, trendTimeRange]);

  // ── Smoke test state ──────────────────────────────────
  const [smokeSheetOpen, setSmokeSheetOpen] = useState(false);
  const [smokeStatus, setSmokeStatus] = useState<
    "analyzing" | "ready" | "executing"
  >("analyzing");
  const [corePaths, setCorePaths] = useState<CorePath[]>([]);
  const [totalSmokeCases, setTotalSmokeCases] = useState(0);
  const [smokeTaskId, setSmokeTaskId] = useState<string | undefined>();

  // Floating progress
  const [floatingVisible, setFloatingVisible] = useState(false);
  const [floatingStatus, setFloatingStatus] = useState<
    "running" | "success" | "error"
  >("running");
  const [floatingProgress, setFloatingProgress] = useState({
    current: 0,
    total: 0,
  });
  const [elapsed, setElapsed] = useState("0s");

  const generateMutation = useSmokeGenerate(projectId);
  const executeMutation = useSmokeExecute();
  const { data: smokeStatusData } = useSmokeStatus(smokeTaskId);

  // Watch smoke status polling
  useEffect(() => {
    if (!smokeStatusData) return;
    if (smokeStatusData.status === "running" && smokeStatusData.progress) {
      setFloatingProgress({
        current: smokeStatusData.progress.current,
        total: smokeStatusData.progress.total,
      });
    }
    if (smokeStatusData.status === "completed") {
      setFloatingStatus("success");
      setSmokeTaskId(undefined);
    }
    if (smokeStatusData.status === "failed") {
      setFloatingStatus("error");
      setSmokeTaskId(undefined);
    }
  }, [smokeStatusData]);

  // Timer for elapsed
  useEffect(() => {
    if (!floatingVisible || floatingStatus !== "running") return;
    const start = Date.now();
    const interval = setInterval(() => {
      const sec = ((Date.now() - start) / 1000).toFixed(1);
      setElapsed(`${sec}s`);
    }, 100);
    return () => clearInterval(interval);
  }, [floatingVisible, floatingStatus]);

  const handleStartSmoke = useCallback(() => {
    setSmokeSheetOpen(true);
    setSmokeStatus("analyzing");
    setCorePaths([]);
    setTotalSmokeCases(0);

    const defaultEnv = environments.find((e) => e.isDefault);
    generateMutation.mutate(defaultEnv?.id, {
      onSuccess: (data) => {
        setCorePaths(data.corePaths ?? []);
        setTotalSmokeCases(data.totalCases ?? 0);
        setSmokeStatus("ready");
      },
      onError: (error) => {
        setSmokeStatus("ready");
        toast.error(
          `冒烟分析失败: ${error instanceof Error ? error.message : "未知错误"}`,
        );
      },
    });
  }, [environments, generateMutation]);

  const handleSmokeConfirm = useCallback(() => {
    if (!generateMutation.data?.taskId) {
      toast.error("冒烟任务生成失败，请稍后重试");
      return;
    }
    setSmokeStatus("executing");
    executeMutation.mutate(generateMutation.data.taskId, {
      onSuccess: () => {
        setSmokeSheetOpen(false);
        setSmokeTaskId(generateMutation.data?.taskId);
        setFloatingVisible(true);
        setFloatingStatus("running");
        setFloatingProgress({ current: 0, total: totalSmokeCases });
        toast.success(`冒烟测试已开始，共 ${totalSmokeCases} 个用例`);
      },
      onError: (error) => {
        setSmokeStatus("ready");
        toast.error(
          `冒烟测试执行失败: ${error instanceof Error ? error.message : "未知错误"}`,
        );
      },
    });
  }, [executeMutation, generateMutation.data, totalSmokeCases]);

  // ── Security scan state ─────────────────────────────────
  const [securitySheetOpen, setSecuritySheetOpen] = useState(false);
  const [securityScanId, setSecurityScanId] = useState<string | undefined>();

  const securityScanMutation = useSecurityScan(projectId);
  const { data: securityStatusData } = useSecurityStatus(securityScanId);

  // ── Floating progress for security ────────────────────
  const [secFloatingVisible, setSecFloatingVisible] = useState(false);
  const [secFloatingStatus, setSecFloatingStatus] = useState<
    "running" | "success" | "error"
  >("running");
  const [secFloatingProgress, setSecFloatingProgress] = useState({
    current: 0,
    total: 0,
  });
  const [secElapsed, setSecElapsed] = useState("0s");

  // Watch security status polling
  useEffect(() => {
    if (!securityStatusData) return;
    if (securityStatusData.progress) {
      setSecFloatingProgress({
        current: securityStatusData.progress.current,
        total: securityStatusData.progress.total,
      });
    }
    if (securityStatusData.status === "completed") {
      setSecFloatingStatus("success");
    }
    if (securityStatusData.status === "failed") {
      setSecFloatingStatus("error");
      setSecurityScanId(undefined);
    }
  }, [securityStatusData]);

  // Timer for security elapsed
  useEffect(() => {
    if (!secFloatingVisible || secFloatingStatus !== "running") return;
    const start = Date.now();
    const interval = setInterval(() => {
      const sec = ((Date.now() - start) / 1000).toFixed(1);
      setSecElapsed(`${sec}s`);
    }, 100);
    return () => clearInterval(interval);
  }, [secFloatingVisible, secFloatingStatus]);

  const handleStartSecurityScan = useCallback(
    (environmentId: string, testTypes: SecurityTestType[]) => {
      securityScanMutation.mutate(
        { environmentId, testTypes },
        {
          onSuccess: (data) => {
            setSecurityScanId(data.scanId);
            setSecuritySheetOpen(false);
            setSecFloatingVisible(true);
            setSecFloatingStatus("running");
            setSecFloatingProgress({ current: 0, total: 0 });
            toast.success("安全扫描已开始");
          },
          onError: (error) => {
            toast.error(
              `安全扫描启动失败: ${error instanceof Error ? error.message : "未知错误"}`,
            );
          },
        },
      );
    },
    [securityScanMutation],
  );

  const handleViewSecurityReport = useCallback(() => {
    if (securityScanId) {
      navigate({
        to: "/p/$projectId/security/$taskId",
        params: { projectId, taskId: securityScanId },
      });
    }
  }, [navigate, projectId, securityScanId]);

  const defaultEnvName =
    environments.find((e) => e.isDefault)?.name ?? environments[0]?.name;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold">
          {projectLoading ? (
            <Skeleton className="h-7 w-48" />
          ) : (
            (project as Record<string, unknown>)?.name as string ?? "项目概览"
          )}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">项目概览</p>
      </div>

      {/* Welcome card */}
      {showWelcome && (
        <WelcomeCard projectId={projectId} onStartSmoke={handleStartSmoke} />
      )}

      {/* Stats row */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="用例"
          value={caseCount as string | number}
          icon={FlaskConical}
          isLoading={projectLoading}
        />
        <StatCard
          label="测试链"
          value={chainCount as string | number}
          icon={Link2}
          isLoading={projectLoading}
        />
        <StatCard
          label="环境"
          value={environments.length}
          icon={Globe}
        />
        <StatCard
          label="上次通过率"
          value={lastPassRate}
          icon={CheckCircle}
          isLoading={batchLoading}
        />
      </div>

      {/* Quality Risk Warnings */}
      <QualityRiskSection
        risks={qualityRisks}
        onDismiss={(id) => dismissRiskMutation.mutate(id)}
        onRefresh={handleTrendAnalysis}
      />

      {/* Trend Chart + AI Insights */}
      {trendData.length > 1 && (
        <Card>
          <CardContent className="pt-6">
            <TrendChartWithInsights
              data={trendData}
              insights={trendInsights}
              isAnalyzing={trendAnalysisMutation.isPending}
              onAnalyze={handleTrendAnalysis}
              timeRange={trendTimeRange}
              onTimeRangeChange={setTrendTimeRange}
            />
          </CardContent>
        </Card>
      )}

      {/* AI Quick actions */}
      <div>
        <h2 className="text-base font-semibold mb-3">AI 快捷操作</h2>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
          <SmokeTestCard onStartSmoke={handleStartSmoke} />
          {/* Security scan card */}
          <Card className="group hover:border-red-300 dark:hover:border-red-700 transition-colors">
            <CardContent className="pt-6 text-center space-y-3">
              <div className="mx-auto h-12 w-12 rounded-xl bg-red-100 dark:bg-red-950/50 flex items-center justify-center">
                <ShieldAlert className="h-6 w-6 text-red-500" />
              </div>
              <h3 className="text-sm font-semibold">AI 安全扫描</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                识别 API 攻击面，自动生成安全测试并执行
              </p>
              <Button
                size="sm"
                className="bg-red-500 hover:bg-red-600 text-white"
                onClick={() => setSecuritySheetOpen(true)}
              >
                <ShieldAlert className="h-3.5 w-3.5 mr-1.5" />
                开始扫描
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Recent executions */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold">最近执行</h2>
          <Link
            to="/p/$projectId/history"
            params={{ projectId }}
          >
            <Button variant="ghost" size="sm" className="text-xs">
              查看全部
            </Button>
          </Link>
        </div>
        <Card>
          <CardContent className="pt-4">
            {batchLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : batchRuns.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                暂无执行记录
              </p>
            ) : (
              batchRuns.slice(0, 5).map((batch) => (
                <RecentBatchItem key={batch.id} batch={batch} />
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Smoke confirm sheet */}
      <SmokeConfirmSheet
        open={smokeSheetOpen}
        onOpenChange={setSmokeSheetOpen}
        status={smokeStatus}
        corePaths={corePaths}
        totalCases={totalSmokeCases}
        envName={defaultEnvName}
        estimatedTime="3 秒"
        projectId={projectId}
        onConfirm={handleSmokeConfirm}
        onCancel={() => setSmokeSheetOpen(false)}
        onError={(error) => toast.error(`冒烟测试失败: ${error.message}`)}
      />

      {/* Floating progress */}
      {floatingVisible && (
        <FloatingProgress
          icon={Flame}
          label="冒烟测试执行中"
          current={floatingProgress.current}
          total={floatingProgress.total}
          elapsed={elapsed}
          status={floatingStatus}
          onViewDetail={() =>
            navigate({
              to: "/p/$projectId/history",
              params: { projectId },
            })
          }
          onDismiss={() => setFloatingVisible(false)}
        />
      )}

      {/* Security scan sheet */}
      <SecurityScanSheet
        open={securitySheetOpen}
        onOpenChange={setSecuritySheetOpen}
        environments={environments}
        onStartScan={handleStartSecurityScan}
        isScanning={securityScanMutation.isPending}
        scanStatus={securityStatusData}
        onViewReport={handleViewSecurityReport}
        onRetry={() => setSecuritySheetOpen(true)}
        onCancel={() => {
          setSecuritySheetOpen(false);
          setSecurityScanId(undefined);
        }}
      />

      {/* Security floating progress */}
      {secFloatingVisible && (
        <FloatingProgress
          icon={ShieldAlert}
          label="安全扫描执行中"
          current={secFloatingProgress.current}
          total={secFloatingProgress.total}
          elapsed={secElapsed}
          status={secFloatingStatus}
          onViewDetail={handleViewSecurityReport}
          onDismiss={() => setSecFloatingVisible(false)}
        />
      )}
    </div>
  );
}
