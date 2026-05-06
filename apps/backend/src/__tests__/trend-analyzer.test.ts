import { describe, expect, it, vi, beforeEach } from "vitest";

// ── Mock storage ──────────────────────────────────────

const { mockStorage } = vi.hoisted(() => {
  const mockStorage = {
    list: vi.fn(),
    read: vi.fn(),
    write: vi.fn(),
    remove: vi.fn(),
    readRaw: vi.fn(),
    writeRaw: vi.fn(),
  };
  return { mockStorage };
});

vi.mock("../services/storage.js", () => ({
  storage: mockStorage,
}));

import {
  _layer1StaticRules as layer1StaticRules,
  _layer2StatisticalDetection as layer2StatisticalDetection,
  analyzeTrends,
  getInsights,
  getRisks,
  dismissRisk,
  type TrendInsight,
  type RiskAlert,
} from "../services/trend-analyzer.js";

import type { TrendDataPoint } from "../services/trend-engine.js";

// ── Helper: 构造 TrendDataPoint ───────────────────────

function makePoint(
  period: string,
  avgPassRate: number,
  opts?: Partial<TrendDataPoint>,
): TrendDataPoint {
  const total = opts?.totalCases ?? 100;
  const passed = Math.round(total * avgPassRate);
  return {
    period,
    batchCount: opts?.batchCount ?? 1,
    avgPassRate,
    totalCases: total,
    totalPassed: passed,
    totalFailed: total - passed,
    failureTypes: opts?.failureTypes ?? {},
  };
}

// ── Layer 1 Tests ─────────────────────────────────────

describe("Layer 1: 固定规则引擎", () => {
  it("通过率低于 70% 时生成 critical 风险", () => {
    const data = [makePoint("2026-03-31", 0.65)];
    const { risks } = layer1StaticRules(data, "proj-001");

    expect(risks.length).toBeGreaterThanOrEqual(1);
    const critical = risks.find((r) => r.title === "通过率严重不足");
    expect(critical).toBeDefined();
    expect(critical!.level).toBe("critical");
  });

  it("通过率 70%-85% 时生成 warning 风险", () => {
    const data = [makePoint("2026-03-31", 0.80)];
    const { risks } = layer1StaticRules(data, "proj-001");

    const warning = risks.find((r) => r.title === "通过率低于警戒值");
    expect(warning).toBeDefined();
    expect(warning!.level).toBe("warning");
  });

  it("通过率 >= 85% 不生成阈值风险", () => {
    const data = [makePoint("2026-03-31", 0.95)];
    const { risks } = layer1StaticRules(data, "proj-001");

    const thresholdRisks = risks.filter(
      (r) => r.title === "通过率严重不足" || r.title === "通过率低于警戒值",
    );
    expect(thresholdRisks).toHaveLength(0);
  });

  it("连续 3 个周期下降时生成'通过率持续下降'风险", () => {
    const data = [
      makePoint("2026-03-29", 0.97),
      makePoint("2026-03-30", 0.93),
      makePoint("2026-03-31", 0.91),
    ];
    const { risks } = layer1StaticRules(data, "proj-001");

    const decreasing = risks.find((r) => r.title === "通过率持续下降");
    expect(decreasing).toBeDefined();
    expect(decreasing!.level).toBe("critical");
    expect(decreasing!.trend).toEqual([0.97, 0.93, 0.91]);
    expect(decreasing!.prediction).toBeDefined();
    expect(decreasing!.prediction!).toBeLessThan(0.91);
  });

  it("连续 3 个周期不全部下降时不生成下降风险", () => {
    const data = [
      makePoint("2026-03-29", 0.90),
      makePoint("2026-03-30", 0.93),
      makePoint("2026-03-31", 0.91),
    ];
    const { risks } = layer1StaticRules(data, "proj-001");

    const decreasing = risks.find((r) => r.title === "通过率持续下降");
    expect(decreasing).toBeUndefined();
  });

  it("环比骤降 > 5% 生成 regression 洞察", () => {
    const data = [
      makePoint("2026-03-30", 0.97),
      makePoint("2026-03-31", 0.90),
    ];
    const { insights } = layer1StaticRules(data, "proj-001");

    const regression = insights.find((i) => i.type === "regression");
    expect(regression).toBeDefined();
    expect(regression!.date).toBe("2026-03-31");
    expect(regression!.dataPoints).toEqual([0.97, 0.90]);
  });

  it("环比骤升 > 5% 生成 improvement 洞察", () => {
    const data = [
      makePoint("2026-03-30", 0.85),
      makePoint("2026-03-31", 0.95),
    ];
    const { insights } = layer1StaticRules(data, "proj-001");

    const improvement = insights.find((i) => i.type === "improvement");
    expect(improvement).toBeDefined();
    expect(improvement!.severity).toBe("info");
  });

  it("环比变化 <= 5% 不生成环比洞察", () => {
    const data = [
      makePoint("2026-03-30", 0.93),
      makePoint("2026-03-31", 0.91),
    ];
    const { insights } = layer1StaticRules(data, "proj-001");

    expect(insights).toHaveLength(0);
  });

  it("空数据返回空结果", () => {
    const { insights, risks } = layer1StaticRules([], "proj-001");
    expect(insights).toHaveLength(0);
    expect(risks).toHaveLength(0);
  });

  it("当前周期执行量为 0 时生成中断预警", () => {
    const data = [
      makePoint("2026-03-30", 0.95, { batchCount: 3 }),
      makePoint("2026-03-31", 0, { batchCount: 0, totalCases: 0 }),
    ];
    const { risks } = layer1StaticRules(data, "proj-001");

    const interrupt = risks.find((r) => r.title === "测试执行中断");
    expect(interrupt).toBeDefined();
    expect(interrupt!.level).toBe("info");
  });
});

// ── Layer 2 Tests ─────────────────────────────────────

describe("Layer 2: 统计检测", () => {
  it("数据不足 5 个点时返回空", () => {
    const data = [
      makePoint("2026-03-28", 0.95),
      makePoint("2026-03-29", 0.94),
      makePoint("2026-03-30", 0.96),
      makePoint("2026-03-31", 0.50), // 骤降但数据点不够
    ];
    const signals = layer2StatisticalDetection(data);
    expect(signals).toHaveLength(0);
  });

  it("检测到统计异常（Z-Score < -2）", () => {
    // 前 6 个点稳定在 0.95 附近，最后一个骤降到 0.70
    const data = [
      makePoint("2026-03-25", 0.95),
      makePoint("2026-03-26", 0.94),
      makePoint("2026-03-27", 0.96),
      makePoint("2026-03-28", 0.95),
      makePoint("2026-03-29", 0.94),
      makePoint("2026-03-30", 0.95),
      makePoint("2026-03-31", 0.70), // 异常骤降
    ];
    const signals = layer2StatisticalDetection(data);

    expect(signals.length).toBeGreaterThanOrEqual(1);
    const drop = signals.find((s) => s.direction === "drop");
    expect(drop).toBeDefined();
    expect(drop!.zScore).toBeLessThan(-2);
    expect(drop!.severity).toBe("critical"); // Z < -3
  });

  it("稳定数据不生成信号", () => {
    const data = [
      makePoint("2026-03-25", 0.95),
      makePoint("2026-03-26", 0.94),
      makePoint("2026-03-27", 0.96),
      makePoint("2026-03-28", 0.95),
      makePoint("2026-03-29", 0.94),
      makePoint("2026-03-30", 0.95),
    ];
    const signals = layer2StatisticalDetection(data);
    expect(signals).toHaveLength(0);
  });

  it("检测异常上升（Z-Score > 2）", () => {
    // 前面通过率低，最后一个突然升高
    const data = [
      makePoint("2026-03-25", 0.60),
      makePoint("2026-03-26", 0.61),
      makePoint("2026-03-27", 0.59),
      makePoint("2026-03-28", 0.60),
      makePoint("2026-03-29", 0.62),
      makePoint("2026-03-30", 0.61),
      makePoint("2026-03-31", 0.95), // 异常骤升
    ];
    const signals = layer2StatisticalDetection(data);

    const spike = signals.find((s) => s.direction === "spike");
    expect(spike).toBeDefined();
    expect(spike!.zScore).toBeGreaterThan(2);
  });
});

// ── analyzeTrends 集成测试 ────────────────────────────

describe("analyzeTrends 集成", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // 默认无 LLM 配置
    mockStorage.readRaw.mockResolvedValue(null);
    mockStorage.write.mockResolvedValue(undefined);
  });

  it("无趋势数据返回空结果", async () => {
    mockStorage.list
      .mockResolvedValueOnce([]) // batch-runs (from aggregateTrends)
      .mockResolvedValueOnce([]); // batch-run-results

    const result = await analyzeTrends("proj-001", "30d");

    expect(result.projectId).toBe("proj-001");
    expect(result.insights).toHaveLength(0);
    expect(result.risks).toHaveLength(0);
    expect(result.analyzedAt).toBeDefined();
  });

  it("单批次低通过率触发固定阈值预警", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const batches = [
      {
        id: "b1",
        projectId: "proj-001",
        status: "completed",
        totalCases: 100,
        passedCases: 60,
        failedCases: 40,
        completedAt: `${today}T10:00:00.000Z`,
        failureBreakdown: { status_mismatch: 30, timeout: 10 },
      },
    ];

    mockStorage.list
      .mockResolvedValueOnce(batches) // batch-runs
      .mockResolvedValueOnce([])       // batch-run-results
      .mockResolvedValueOnce([])       // trend-insights (getInsights call inside)
      .mockResolvedValueOnce([]);      // quality-risks (getRisks call inside)

    const result = await analyzeTrends("proj-001", "30d");

    expect(result.risks.length).toBeGreaterThanOrEqual(1);
    const critical = result.risks.find((r) => r.level === "critical");
    expect(critical).toBeDefined();
  });

  it("持久化洞察和风险到 storage", async () => {
    // 构造两天的数据：昨天 97%，今天 85%（下降 12%）
    const now = new Date();
    const yesterday = new Date(now.getTime() - 86400000);
    const todayStr = now.toISOString().slice(0, 10);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    const batches = [
      {
        id: "b1",
        projectId: "proj-001",
        status: "completed",
        totalCases: 100,
        passedCases: 97,
        failedCases: 3,
        completedAt: `${yesterdayStr}T10:00:00.000Z`,
        failureBreakdown: {},
      },
      {
        id: "b2",
        projectId: "proj-001",
        status: "completed",
        totalCases: 100,
        passedCases: 85,
        failedCases: 15,
        completedAt: `${todayStr}T10:00:00.000Z`,
        failureBreakdown: { status_mismatch: 10, timeout: 5 },
      },
    ];

    mockStorage.list
      .mockResolvedValueOnce(batches) // batch-runs (from aggregateTrends)
      .mockResolvedValueOnce([]);      // batch-run-results (from aggregateTrends)

    const result = await analyzeTrends("proj-001", "30d");

    // 应有 regression insight（97% → 85%，下降 12%）
    const regressionInsight = result.insights.find((i) => i.type === "regression");
    expect(regressionInsight).toBeDefined();
    expect(regressionInsight!.passRate).toBeCloseTo(0.85, 1);

    // 验证 storage.write 被调用（持久化）
    expect(mockStorage.write).toHaveBeenCalled();
    const writeCallCollections = mockStorage.write.mock.calls.map(
      (call: unknown[]) => call[0],
    );
    expect(writeCallCollections).toContain("trend-insights");
  });
});

// ── getInsights / getRisks 测试 ───────────────────────

describe("getInsights", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("返回指定项目的洞察，按时间倒序", async () => {
    const insights: TrendInsight[] = [
      {
        id: "i1",
        projectId: "proj-001",
        date: "2026-03-30",
        passRate: 0.97,
        type: "improvement",
        severity: "info",
        metric: "passRate",
        title: "通过率跃升",
        description: "...",
        dataPoints: [0.90, 0.97],
        detectedAt: "2026-03-30T12:00:00.000Z",
        suggestion: null,
        confidence: 0.85,
      },
      {
        id: "i2",
        projectId: "proj-001",
        date: "2026-03-31",
        passRate: 0.91,
        type: "regression",
        severity: "warning",
        metric: "passRate",
        title: "通过率下降",
        description: "...",
        dataPoints: [0.97, 0.91],
        detectedAt: "2026-03-31T12:00:00.000Z",
        suggestion: "检查变更",
        confidence: 0.90,
      },
      {
        id: "i3",
        projectId: "proj-002", // 其他项目
        date: "2026-03-31",
        passRate: 0.80,
        type: "regression",
        severity: "critical",
        metric: "passRate",
        title: "其他项目",
        description: "...",
        dataPoints: [0.80],
        detectedAt: "2026-03-31T12:00:00.000Z",
        suggestion: null,
        confidence: 0.80,
      },
    ];

    mockStorage.list.mockImplementation(async (collection: string) => {
      if (collection === "trend-insights") return insights;
      return [];
    });

    const result = await getInsights("proj-001");

    expect(result).toHaveLength(2);
    // 按 detectedAt 倒序
    expect(result[0].id).toBe("i2");
    expect(result[1].id).toBe("i1");
  });
});

describe("getRisks", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("返回未忽略的风险，按严重度排序", async () => {
    const risks: RiskAlert[] = [
      {
        id: "r1",
        projectId: "proj-001",
        level: "info",
        title: "信息",
        description: "...",
        recommendation: "...",
        trend: [0.95],
        prediction: null,
        causes: [],
        confidence: 0.70,
        createdAt: "2026-03-31T12:00:00.000Z",
        dismissedAt: null,
      },
      {
        id: "r2",
        projectId: "proj-001",
        level: "critical",
        title: "严重",
        description: "...",
        recommendation: "...",
        trend: [0.95, 0.80, 0.70],
        prediction: 0.60,
        causes: [],
        confidence: 0.90,
        createdAt: "2026-03-31T11:00:00.000Z",
        dismissedAt: null,
      },
      {
        id: "r3",
        projectId: "proj-001",
        level: "warning",
        title: "已忽略",
        description: "...",
        recommendation: "...",
        trend: [0.85],
        prediction: null,
        causes: [],
        confidence: 0.80,
        createdAt: "2026-03-31T10:00:00.000Z",
        dismissedAt: "2026-03-31T13:00:00.000Z", // 已忽略
      },
    ];

    mockStorage.list.mockImplementation(async (collection: string) => {
      if (collection === "quality-risks") return risks;
      return [];
    });

    const result = await getRisks("proj-001");

    expect(result).toHaveLength(2); // r3 已忽略被排除
    expect(result[0].id).toBe("r2"); // critical 排在前
    expect(result[1].id).toBe("r1"); // info 排在后
  });
});

describe("dismissRisk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("忽略已存在的风险", async () => {
    const risk: RiskAlert = {
      id: "r1",
      projectId: "proj-001",
      level: "warning",
      title: "风险",
      description: "...",
      recommendation: "...",
      trend: [0.85],
      prediction: null,
      causes: [],
      confidence: 0.80,
      createdAt: "2026-03-31T12:00:00.000Z",
      dismissedAt: null,
    };

    mockStorage.read.mockResolvedValue(risk);
    mockStorage.write.mockResolvedValue(undefined);

    const ok = await dismissRisk("r1");

    expect(ok).toBe(true);
    expect(mockStorage.write).toHaveBeenCalledWith(
      "quality-risks",
      "r1",
      expect.objectContaining({ dismissedAt: expect.any(String) }),
    );
  });

  it("风险不存在时返回 false", async () => {
    mockStorage.read.mockResolvedValue(null);

    const ok = await dismissRisk("nonexistent");
    expect(ok).toBe(false);
  });
});
