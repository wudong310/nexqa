export const ANALYSIS_SYSTEM_PROMPT = `你是 NexQA 的 AI 测试分析引擎。你的任务是分析 API 测试失败结果的根因，分类失败原因，并给出修复建议。

你的行为准则：
- 分析基于实际的请求-响应数据，不要凭空推测
- 置信度反映你的确定程度：>0.9 = 非常确定，0.7-0.9 = 较确定，<0.7 = 不太确定
- 如果无法确定根因，归类为 "unknown" 并说明需要更多信息
- 修复建议要具体且可操作，说清楚是开发/测试/运维该做什么
- 对于可以自动修复的用例问题（如 Schema 更新），提供具体的修改 patch`;

export const ANALYSIS_OUTPUT_SCHEMA = `{
  "overallAssessment": {
    "status": "healthy | has-issues | critical",
    "summary": "一句话总结"
  },
  "analyses": [
    {
      "resultId": "对应的 resultId",
      "rootCause": "api-bug | api-change | env-issue | auth-expired | test-case-error | test-data-issue | flaky | dependency-fail | timeout | unknown",
      "confidence": 0.92,
      "analysis": "分析过程描述",
      "suggestion": {
        "target": "api | test-case | environment | test-chain",
        "summary": "一句话建议",
        "details": "详细说明"
      },
      "autoFix": null
    }
  ],
  "actionItems": [
    {
      "priority": "P0 | P1 | P2",
      "action": "建议的行动",
      "target": "开发 | 测试 | 运维",
      "resultIds": ["相关的 resultId"]
    }
  ]
}`;

export function buildAnalysisPrompt(failedResults: unknown[]): string {
  return `## 任务：分析批次测试失败结果

### 输入
以下是本次测试批次中所有失败用例的数据：

${JSON.stringify(failedResults, null, 2)}

每个失败用例包含：
- resultId: 结果 ID
- caseName: 用例名称
- endpoint: API 端点（如 POST /api/users）
- expected: 预期结果（status, bodyContains, bodySchema）
- actual: 实际响应（status, headers, body, duration）
- failType: 基础失败类型（status_mismatch/schema_violation/timeout 等）
- failReason: 基础失败原因描述

### 分类标准
将每个失败分类为以下之一：
- api-bug: API 代码有 Bug。信号：返回 500 + 异常堆栈；逻辑结果明显错误
- api-change: API 行为变了但用例没更新。信号：响应结构变了（多字段/少字段/类型变了）
- env-issue: 环境问题。信号：连接超时/拒绝；DNS 解析失败；证书错误
- auth-expired: 认证过期。信号：返回 401 且非预期
- test-case-error: 用例本身有问题。信号：预期值明显不合理
- test-data-issue: 测试数据问题。信号：引用的资源 ID 不存在（404）
- flaky: 不稳定。信号：时而通过时而失败
- dependency-fail: 上游依赖失败导致
- timeout: 超时。信号：响应时间远超正常值
- unknown: 无法确定

### 输出格式
严格按以下 JSON 格式输出（不要包含 markdown 代码块标记）：
${ANALYSIS_OUTPUT_SCHEMA}`;
}

export function buildSingleCaseAnalysisPrompt(failedResult: unknown): string {
  return `## 任务：分析单个测试失败结果

### 输入
以下是一个失败用例的完整数据：

${JSON.stringify(failedResult, null, 2)}

### 分类标准
分类为以下之一：
- api-bug / api-change / env-issue / auth-expired / test-case-error / test-data-issue / flaky / dependency-fail / timeout / unknown

### 输出格式
严格按以下 JSON 格式输出（不要包含 markdown 代码块标记）：
{
  "rootCause": "分类",
  "confidence": 0.92,
  "analysis": "分析过程描述",
  "suggestion": {
    "target": "api | test-case | environment | test-chain",
    "summary": "一句话建议",
    "details": "详细说明"
  }
}`;
}
