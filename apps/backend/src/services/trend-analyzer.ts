import type { Settings } from "@nexqa/shared";
import { generateText } from "ai";
import { v4 as uuid } from "uuid";
import { createLlmModel } from "./llm.js";
import { createLogger } from "./logger.js";
import { storage } from "./storage.js";
import {
  aggregateTrends,
  type TrendDataPoint,
} from "./trend-engine.js";
import {
  TREND_ANALYSIS_SYSTEM_PROMPT,
  buildTrendAnalysisPrompt,
} from "../prompts/trend-analysis.js";

// ── Types ─────────────────────────────────────────────

export type InsightType = "improvement" | "regression" | "anomaly";
export type RiskLevel = "critical" | "warning" | "info";

export interface TrendInsight {
  id: string;
  projectId: string;
  /** 标注点对应的日期 */
  date: string;
  /** 该点的通过率 */
  passRate: number;
  type: InsightType;
  severity: RiskLevel;
  /** 关联指标名 */
  metric: string;
  /** 一行摘要 */
  title: string;
  /** 分析详情 */
  description: string;
  /** 相关数据点 */
  dataPoints: number[];
  detectedAt: string;
  /** AI 建议 */
  suggestion?: string | null;
  confidence: number;
}

export interface RiskCause {
  description: string;
  relatedCases?: string[];
}

export interface RiskAlert {
  id: string;
  projectId: string;
  level: RiskLevel;
  title: string;
  description: string;
  recommendation: string;
  /** 最近 N 次通过率趋势 */
  trend: number[];
  /** 预测下次通过率 */
  prediction?: number | null;
  causes: RiskCause[];
  confidence: number;
  createdAt: string;
  dismissedAt?: string | null;
}

export interface TrendAnalysisResult {
  projectId: string;
  analyzedAt: string;
  insights: TrendInsight[];
  risks: RiskAlert[];
}

// ── Layer 1: 固定阈值 + 环比变化 ──────────────────────

function layer1StaticRules(
  data: TrendDataPoint[],
  projectId: string,
): { insights: TrendInsight[]; risks: RiskAlert[] } {
  const insights: TrendInsight[] = [];
  const risks: RiskAlert[] = [];
  const now = new Date().toISOString();

  if (data.length === 0) return { insights, risks };

  const latest = data[data.length - 1];
  const passRate = latest.avgPassRate;

  // 固定阈值检测
  if (passRate < 0.70) {
    risks.push({
      id: uuid(),
      projectId,
      level: "critical",
      title: "通过率严重不足",
      description: `当前通过率 ${(passRate * 100).toFixed(1)}%，低于 70% 警戒线`,
      recommendation: "立即排查大面积失败原因，考虑暂停发版",
      trend: data.slice(-5).map((d) => d.avgPassRate),
      prediction: null,
      causes: [{ description: `最新周期通过率仅 ${(passRate * 100).toFixed(1)}%` }],
      confidence: 0.95,
      createdAt: now,
      dismissedAt: null,
    });
  } else if (passRate < 0.85) {
    risks.push({
      id: uuid(),
      projectId,
      level: "warning",
      title: "通过率低于警戒值",
      description: `当前通过率 ${(passRate * 100).toFixed(1)}%，低于 85% 建议值`,
      recommendation: "检查近期失败用例，优先修复高频失败项",
      trend: data.slice(-5).map((d) => d.avgPassRate),
      prediction: null,
      causes: [{ description: `最新周期通过率 ${(passRate * 100).toFixed(1)}%` }],
      confidence: 0.90,
      createdAt: now,
      dismissedAt: null,
    });
  }

  // 连续下降检测（≥3 个数据点）
  if (data.length >= 3) {
    const recent3 = data.slice(-3);
    const isDecreasing =
      recent3[0].avgPassRate > recent3[1].avgPassRate &&
      recent3[1].avgPassRate > recent3[2].avgPassRate;

    if (isDecreasing) {
      const rates = recent3.map((d) => d.avgPassRate);
      // 简单线性外推预测
      const delta = rates[2] - rates[1];
      const prediction = Math.max(0, Math.min(1, rates[2] + delta));

      risks.push({
        id: uuid(),
        projectId,
        level: "critical",
        title: "通过率持续下降",
        description: `连续 3 个周期通过率递减：${rates.map((r) => (r * 100).toFixed(1) + "%").join(" → ")}`,
        recommendation: "运行 AI 回归测试，排查根因",
        trend: rates,
        prediction: Math.round(prediction * 10000) / 10000,
        causes: [{ description: "连续多周期通过率下降，存在系统性问题" }],
        confidence: 0.85,
        createdAt: now,
        dismissedAt: null,
      });
    }
  }

  // 环比变化检测（相邻两点）
  if (data.length >= 2) {
    const prev = data[data.length - 2];
    const curr = data[data.length - 1];
    const delta = curr.avgPassRate - prev.avgPassRate;

    // 骤降 > 5%
    if (delta < -0.05) {
      insights.push({
        id: uuid(),
        projectId,
        date: curr.period,
        passRate: curr.avgPassRate,
        type: "regression",
        severity: delta < -0.10 ? "critical" : "warning",
        metric: "passRate",
        title: `通过率从 ${(prev.avgPassRate * 100).toFixed(1)}% 下降至 ${(curr.avgPassRate * 100).toFixed(1)}%`,
        description: `环比下降 ${(Math.abs(delta) * 100).toFixed(1)} 个百分点`,
        dataPoints: [prev.avgPassRate, curr.avgPassRate],
        detectedAt: now,
        suggestion: "检查该周期新增的失败用例，排查是否有 API 变更",
        confidence: 0.80,
      });
    }

    // 骤升 > 5%
    if (delta > 0.05) {
      insights.push({
        id: uuid(),
        projectId,
        date: curr.period,
        passRate: curr.avgPassRate,
        type: "improvement",
        severity: "info",
        metric: "passRate",
        title: `通过率从 ${(prev.avgPassRate * 100).toFixed(1)}% 跃升至 ${(curr.avgPassRate * 100).toFixed(1)}%`,
        description: `环比上升 ${(delta * 100).toFixed(1)} 个百分点`,
        dataPoints: [prev.avgPassRate, curr.avgPassRate],
        detectedAt: now,
        suggestion: null,
        confidence: 0.80,
      });
    }
  }

  // 执行量骤变检测
  if (data.length >= 2) {
    const prev = data[data.length - 2];
    const curr = data[data.length - 1];
    if (prev.batchCount > 0 && curr.batchCount === 0) {
      risks.push({
        id: uuid(),
        projectId,
        level: "info",
        title: "测试执行中断",
        description: "当前周期无任何批次执行，可能存在 CI/CD 流程中断",
        recommendation: "检查 CI/CD 流水线和定时任务是否正常运行",
        trend: data.slice(-5).map((d) => d.avgPassRate),
        prediction: null,
        causes: [{ description: "当前周期批次数为 0" }],
        confidence: 0.70,
        createdAt: now,
        dismissedAt: null,
      });
    }
  }

  return { insights, risks };
}

// ── Layer 2: Z-Score + EWMA 统计检测 ──────────────────

interface AnomalySignal {
  date: string;
  passRate: number;
  metric: string;
  zScore: number;
  ewma: number;
  severity: "critical" | "warning";
  direction: "drop" | "spike";
}

function layer2StatisticalDetection(
  data: TrendDataPoint[],
): AnomalySignal[] {
  if (data.length < 5) return [];

  const signals: AnomalySignal[] = [];
  const passRates = data.map((d) => d.avgPassRate);

  // ── Z-Score 检测 ──
  // 用除最后一个点外的历史数据算 mean/stdDev
  const history = passRates.slice(0, -1);
  const latest = passRates[passRates.length - 1];

  const mean = history.reduce((a, b) => a + b, 0) / history.length;
  const variance = history.reduce((a, b) => a + (b - mean) ** 2, 0) / history.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev > 0.001) {
    const zScore = (latest - mean) / stdDev;
    if (zScore < -2) {
      signals.push({
        date: data[data.length - 1].period,
        passRate: latest,
        metric: "passRate",
        zScore: Math.round(zScore * 100) / 100,
        ewma: 0, // 后面填
        severity: zScore < -3 ? "critical" : "warning",
        direction: "drop",
      });
    }
    if (zScore > 2) {
      signals.push({
        date: data[data.length - 1].period,
        passRate: latest,
        metric: "passRate",
        zScore: Math.round(zScore * 100) / 100,
        ewma: 0,
        severity: "warning",
        direction: "spike",
      });
    }
  }

  // ── EWMA 检测 ──
  // α = 2 / (N + 1), N = window size
  const alpha = 2 / (Math.min(history.length, 10) + 1);
  let ewma = history[0];
  for (let i = 1; i < history.length; i++) {
    ewma = alpha * history[i] + (1 - alpha) * ewma;
  }

  // EWMA 偏离检测：最新点与 EWMA 的偏差
  const ewmaDiff = latest - ewma;
  if (stdDev > 0.001 && Math.abs(ewmaDiff / stdDev) > 2) {
    // 如果还没被 Z-Score 检测到，补充 EWMA 信号
    const alreadyDetected = signals.some(
      (s) => s.date === data[data.length - 1].period && s.metric === "passRate",
    );
    if (!alreadyDetected) {
      signals.push({
        date: data[data.length - 1].period,
        passRate: latest,
        metric: "passRate",
        zScore: stdDev > 0.001 ? Math.round(((latest - mean) / stdDev) * 100) / 100 : 0,
        ewma: Math.round(ewma * 10000) / 10000,
        severity: "warning",
        direction: ewmaDiff < 0 ? "drop" : "spike",
      });
    }
  }

  // 更新 ewma 值到所有 signals
  for (const s of signals) {
    s.ewma = Math.round(ewma * 10000) / 10000;
  }

  return signals;
}

// ── Layer 3: LLM 智能分析 ─────────────────────────────

function parseLlmJson(text: string): unknown {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }
  return JSON.parse(cleaned);
}

async function getLlmConfig(): Promise<Settings["llm"] | null> {
  const raw = await storage.readRaw("settings.json");
  if (!raw) return null;
  const settings = JSON.parse(raw) as Settings;
  return settings.llm || null;
}

async function layer3LlmAnalysis(
  data: TrendDataPoint[],
  anomalySignals: AnomalySignal[],
  projectId: string,
  log: ReturnType<typeof createLogger>,
): Promise<{ insights: TrendInsight[]; risks: RiskAlert[] }> {
  const llmConfig = await getLlmConfig();
  if (!llmConfig) {
    log.info("未配置 LLM，跳过 Layer 3 分析");
    return { insights: [], risks: [] };
  }

  const now = new Date().toISOString();

  // 构建表格
  const trendTable = data
    .map(
      (d) =>
        `| ${d.period} | ${d.batchCount} | ${(d.avgPassRate * 100).toFixed(1)}% | ${d.totalCases} | ${d.totalPassed} | ${d.totalFailed} |`,
    )
    .join("\n");

  // 失败类型分布趋势
  const allFailTypes = new Set<string>();
  for (const d of data) {
    for (const ft of Object.keys(d.failureTypes)) allFailTypes.add(ft);
  }
  const failureTypesTrend =
    allFailTypes.size > 0
      ? data
          .map((d) => {
            const parts = [...allFailTypes].map(
              (ft) => `${ft}=${d.failureTypes[ft] || 0}`,
            );
            return `${d.period}: ${parts.join(", ")}`;
          })
          .join("\n")
      : "无失败类型分布数据";

  // 异常信号
  const anomalyText =
    anomalySignals.length > 0
      ? anomalySignals
          .map(
            (s) =>
              `- ${s.date}: ${s.metric} Z-Score=${s.zScore}, EWMA=${s.ewma}, 方向=${s.direction}, 严重度=${s.severity}`,
          )
          .join("\n")
      : "Layer 1+2 未检测到异常信号";

  const prompt = buildTrendAnalysisPrompt({
    days: data.length,
    trendTable,
    failureTypesTrend: failureTypesTrend,
    anomalySignals: anomalyText,
  });

  try {
    const model = createLlmModel(llmConfig);
    log.info("调用 LLM 进行趋势深度分析");

    const { text } = await generateText({
      model,
      system: TREND_ANALYSIS_SYSTEM_PROMPT,
      prompt,
      maxRetries: 2,
    });

    const parsed = parseLlmJson(text) as {
      overallTrend?: string;
      insights?: Array<{
        date: string;
        passRate: number;
        type: InsightType;
        title: string;
        analysis: string;
        suggestion?: string | null;
        confidence: number;
      }>;
      risks?: Array<{
        level: RiskLevel;
        title: string;
        trend?: number[];
        prediction?: number | null;
        causes?: Array<{ description: string }>;
        suggestion: string;
        confidence: number;
      }>;
    };

    const insights: TrendInsight[] = (parsed.insights || []).map((i) => ({
      id: uuid(),
      projectId,
      date: i.date,
      passRate: i.passRate,
      type: i.type || "anomaly",
      severity: i.type === "regression" ? "warning" : i.type === "anomaly" ? "critical" : "info",
      metric: "passRate",
      title: i.title,
      description: i.analysis,
      dataPoints: [i.passRate],
      detectedAt: now,
      suggestion: i.suggestion || null,
      confidence: i.confidence || 0.5,
    }));

    const risks: RiskAlert[] = (parsed.risks || []).map((r) => ({
      id: uuid(),
      projectId,
      level: r.level || "info",
      title: r.title,
      description: (r.causes || []).map((c) => c.description).join("; "),
      recommendation: r.suggestion,
      trend: r.trend || [],
      prediction: r.prediction ?? null,
      causes: r.causes || [],
      confidence: r.confidence || 0.5,
      createdAt: now,
      dismissedAt: null,
    }));

    return { insights, risks };
  } catch (err) {
    log.warn(
      `LLM 趋势分析失败: ${err instanceof Error ? err.message : err}`,
    );
    return { insights: [], risks: [] };
  }
}

// ── Dedup helpers ─────────────────────────────────────

/** 对 insights 按 date+type 去重，优先保留 confidence 高的 */
function deduplicateInsights(insights: TrendInsight[]): TrendInsight[] {
  const map = new Map<string, TrendInsight>();
  for (const i of insights) {
    const key = `${i.date}:${i.type}:${i.metric}`;
    const existing = map.get(key);
    if (!existing || i.confidence > existing.confidence) {
      map.set(key, i);
    }
  }
  return [...map.values()];
}

/** 对 risks 按 title 去重，优先保留 confidence 高的 */
function deduplicateRisks(risks: RiskAlert[]): RiskAlert[] {
  const map = new Map<string, RiskAlert>();
  for (const r of risks) {
    const key = r.title;
    const existing = map.get(key);
    if (!existing || r.confidence > existing.confidence) {
      map.set(key, r);
    }
  }
  return [...map.values()];
}

// ── Public API ────────────────────────────────────────

const INSIGHTS_COLLECTION = "trend-insights";
const RISKS_COLLECTION = "quality-risks";

/**
 * 触发趋势 AI 分析（三层策略）。
 * 分析已有趋势数据（aggregateTrends），识别异常点，生成洞察和风险预警。
 */
export async function analyzeTrends(
  projectId: string,
  timeRange: string = "30d",
  force: boolean = false,
): Promise<TrendAnalysisResult> {
  const log = createLogger("trend-analyzer");

  // 解析 timeRange
  const rangeMatch = timeRange.match(/^(\d+)d$/);
  const rangeDays = rangeMatch ? Number(rangeMatch[1]) : 30;

  log.info(
    `开始趋势分析: projectId=${projectId}, range=${rangeDays}d, force=${force}`,
  );

  // 获取趋势数据
  const trendResult = await aggregateTrends(projectId, "day", rangeDays);
  const data = trendResult.data;

  if (data.length === 0) {
    log.info("无趋势数据，跳过分析");
    return {
      projectId,
      analyzedAt: new Date().toISOString(),
      insights: [],
      risks: [],
    };
  }

  // Layer 1: 固定阈值 + 环比变化
  log.info("Layer 1: 固定规则检测");
  const l1 = layer1StaticRules(data, projectId);

  // Layer 2: 统计检测（需 5+ 数据点）
  log.info(`Layer 2: 统计检测 (数据点=${data.length})`);
  const anomalySignals = layer2StatisticalDetection(data);

  // 将 Layer 2 异常信号转为 insights
  const l2Insights: TrendInsight[] = anomalySignals.map((s) => ({
    id: uuid(),
    projectId,
    date: s.date,
    passRate: s.passRate,
    type: s.direction === "drop" ? ("regression" as const) : ("anomaly" as const),
    severity: s.severity,
    metric: s.metric,
    title:
      s.direction === "drop"
        ? `通过率异常下降 (Z-Score=${s.zScore})`
        : `通过率异常上升 (Z-Score=${s.zScore})`,
    description: `统计检测：Z-Score=${s.zScore}, EWMA基线=${(s.ewma * 100).toFixed(1)}%`,
    dataPoints: [s.passRate],
    detectedAt: new Date().toISOString(),
    suggestion:
      s.direction === "drop" ? "建议排查近期变更，可能有 API 不兼容更新" : null,
    confidence: Math.min(0.95, 0.7 + Math.abs(s.zScore) * 0.05),
  }));

  // Layer 3: LLM 智能分析（可选）
  log.info("Layer 3: LLM 深度分析");
  const l3 = await layer3LlmAnalysis(data, anomalySignals, projectId, log);

  // 合并 + 去重
  const allInsights = deduplicateInsights([
    ...l1.insights,
    ...l2Insights,
    ...l3.insights,
  ]);
  const allRisks = deduplicateRisks([...l1.risks, ...l3.risks]);

  // 持久化
  for (const insight of allInsights) {
    await storage.write(INSIGHTS_COLLECTION, insight.id, insight);
  }
  for (const risk of allRisks) {
    await storage.write(RISKS_COLLECTION, risk.id, risk);
  }

  log.info(
    `趋势分析完成: ${allInsights.length} 个洞察, ${allRisks.length} 个风险`,
  );

  return {
    projectId,
    analyzedAt: new Date().toISOString(),
    insights: allInsights,
    risks: allRisks,
  };
}

/**
 * 获取某项目的趋势洞察列表
 */
export async function getInsights(projectId: string): Promise<TrendInsight[]> {
  const all = await storage.list<TrendInsight>(INSIGHTS_COLLECTION);
  return all
    .filter((i) => i.projectId === projectId)
    .sort((a, b) => (b.detectedAt || "").localeCompare(a.detectedAt || ""));
}

/**
 * 获取某项目的风险预警列表（排除已忽略的）
 */
export async function getRisks(projectId: string): Promise<RiskAlert[]> {
  const all = await storage.list<RiskAlert>(RISKS_COLLECTION);
  return all
    .filter((r) => r.projectId === projectId && !r.dismissedAt)
    .sort((a, b) => {
      // 按严重度排序：critical > warning > info
      const levelOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
      const levelDiff = (levelOrder[a.level] ?? 9) - (levelOrder[b.level] ?? 9);
      if (levelDiff !== 0) return levelDiff;
      return b.createdAt.localeCompare(a.createdAt);
    });
}

/**
 * 忽略某条风险预警
 */
export async function dismissRisk(riskId: string): Promise<boolean> {
  const risk = await storage.read<RiskAlert>(RISKS_COLLECTION, riskId);
  if (!risk) return false;
  risk.dismissedAt = new Date().toISOString();
  await storage.write(RISKS_COLLECTION, risk.id, risk);
  return true;
}

// ── Exports for testing ───────────────────────────────
export {
  layer1StaticRules as _layer1StaticRules,
  layer2StatisticalDetection as _layer2StatisticalDetection,
};
