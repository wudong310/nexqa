import { HorizontalBar } from "@/components/ui/horizontal-bar";
import { MethodBadge } from "@/components/ui/method-badge";
import type { FailureAnalysis as FailureAnalysisType } from "@/types/coverage";

const FAIL_TYPE_COLORS: Record<string, string> = {
  status_mismatch: "hsl(0, 84%, 60%)",
  schema_violation: "hsl(271, 91%, 65%)",
  body_mismatch: "hsl(25, 95%, 53%)",
  timeout: "hsl(45, 93%, 47%)",
  network_error: "hsl(0, 0%, 45%)",
  auth_failure: "hsl(199, 89%, 48%)",
  variable_error: "hsl(280, 67%, 52%)",
  chain_dependency: "hsl(340, 82%, 52%)",
};

const FAIL_TYPE_LABELS: Record<string, string> = {
  status_mismatch: "状态码不匹配",
  schema_violation: "Schema 错误",
  body_mismatch: "响应体不匹配",
  timeout: "超时",
  network_error: "连接失败",
  auth_failure: "鉴权错误",
  variable_error: "变量错误",
  chain_dependency: "链依赖失败",
};

interface FailureAnalysisPanelProps {
  analysis: FailureAnalysisType;
}

export function FailureAnalysisPanel({ analysis }: FailureAnalysisPanelProps) {
  const byTypeItems = Object.entries(analysis.byType)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([k, v]) => ({
      label: FAIL_TYPE_LABELS[k] ?? k,
      value: v,
      color: FAIL_TYPE_COLORS[k],
    }));

  const byEndpointItems = Object.entries(analysis.byEndpoint)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([k, v]) => ({
      label: k,
      value: v,
    }));

  return (
    <div className="space-y-6">
      {/* Charts row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {byTypeItems.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-muted-foreground mb-3">
              按类型
            </h4>
            <HorizontalBar items={byTypeItems} />
          </div>
        )}
        {byEndpointItems.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-muted-foreground mb-3">
              按接口
            </h4>
            <HorizontalBar items={byEndpointItems} />
          </div>
        )}
      </div>

      {/* Top failures */}
      {analysis.topFailures.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-3">
            Top {Math.min(analysis.topFailures.length, 5)} 失败用例
          </h4>
          <div className="space-y-2">
            {analysis.topFailures.slice(0, 5).map((f, i) => (
              <div
                key={f.caseId}
                className="flex items-start gap-2 p-2 rounded-md border text-xs hover:bg-accent/30"
              >
                <span className="text-muted-foreground w-4 shrink-0">
                  {i + 1}.
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span>❌</span>
                    <span className="font-mono truncate">{f.endpointPath}</span>
                    <span className="truncate text-muted-foreground">
                      {f.caseName}
                    </span>
                  </div>
                  <p className="text-muted-foreground mt-0.5 truncate">
                    failType: {f.failType} · {f.failReason}
                  </p>
                </div>
                {f.isSecurity && (
                  <span className="text-[10px] px-1 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 shrink-0">
                    ⚠️ 安全风险
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
