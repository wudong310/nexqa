export const TREND_ANALYSIS_SYSTEM_PROMPT = `你是 NexQA 的趋势分析引擎。分析 API 测试的历史趋势数据，识别问题模式，生成洞察和风险预警。

你的行为准则：
- 分析基于实际的趋势数据，不要凭空推测
- 置信度反映你的确定程度：>0.9 = 非常确定，0.7-0.9 = 较确定，<0.7 = 不太确定
- 仅对有显著变化的点生成洞察，不要给每个数据点都标注
- 风险预警要具体且可操作，明确说清楚原因和建议
- 优先使用 Layer 1/2 已检测到的异常信号，在此基础上深入分析`;

export function buildTrendAnalysisPrompt(input: {
  days: number;
  trendTable: string;
  failureTypesTrend: string;
  anomalySignals: string;
}): string {
  return `## 趋势数据（最近 ${input.days} 天）

| 日期 | 批次数 | 通过率 | 总用例 | 通过 | 失败 |
|------|--------|--------|--------|------|------|
${input.trendTable}

## 失败类型分布趋势
${input.failureTypesTrend}

## 自动检测到的异常信号（Layer 1+2）
${input.anomalySignals}

## 请分析
1. 趋势判断：质量在改善、恶化还是稳定？
2. 关键转折点：通过率显著变化的点，推测原因
3. 根因推测：结合失败类型分布推断问题来源
4. 风险预警：按当前趋势，下一阶段的风险
5. 行动建议：具体可操作的建议

## 输出格式（严格 JSON，不要有额外文字）
{
  "overallTrend": "improving | degrading | stable | volatile",
  "insights": [
    {
      "date": "YYYY-MM-DD",
      "passRate": 0.91,
      "type": "improvement | regression | anomaly",
      "title": "一行摘要",
      "analysis": "详细分析",
      "suggestion": "建议（可选，null 表示无建议）",
      "confidence": 0.85
    }
  ],
  "risks": [
    {
      "level": "critical | warning | info",
      "title": "风险标题",
      "trend": [0.97, 0.93, 0.91],
      "prediction": 0.88,
      "causes": [{ "description": "原因描述" }],
      "suggestion": "建议",
      "confidence": 0.85
    }
  ]
}`;
}
