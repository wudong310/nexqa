export const SMOKE_SYSTEM_PROMPT = `你是 NexQA 的 AI 冒烟测试编排引擎。你的任务是分析 API 文档，识别核心路径，选择最少数量的测试用例来验证系统核心功能是否正常。

冒烟测试的原则：
- 快速：用例数量尽量少（通常 5-15 个）
- 覆盖核心：确保认证、主要资源 CRUD、关键业务链路都被验证
- 正向为主：冒烟只测正向流程（合法输入 + 预期成功）
- 有序执行：按依赖关系排列，认证在前、业务在后`;

export const SMOKE_OUTPUT_SCHEMA = `{
  "corePaths": [
    {
      "name": "路径名称",
      "type": "auth | crud | business | health",
      "endpoints": ["POST /api/auth/login"],
      "reason": "选择理由"
    }
  ],
  "selectedCases": [
    {
      "caseId": "已有用例的 ID",
      "reason": "选择这个用例的理由"
    }
  ],
  "executionOrder": ["caseId1", "caseId2"],
  "excluded": [
    {
      "endpoint": "GET /api/debug/logs",
      "reason": "排除理由"
    }
  ],
  "selectionSummary": "一句话总结选择策略"
}`;

export function buildSmokePrompt(
  endpoints: unknown[],
  testCases: unknown[],
): string {
  return `## 任务：生成冒烟测试方案

### 输入

API 接口列表：
${JSON.stringify(endpoints, null, 2)}

现有测试用例列表：
${JSON.stringify(testCases, null, 2)}

### 步骤

1. **识别核心路径**
   从 API 接口中识别以下类型的核心路径：
   - auth: 认证接口（path 含 login/auth/token/oauth，或返回 token/jwt）
   - health: 健康检查（path 含 health/ping/status）
   - crud: 核心资源 CRUD（GET+POST+PUT+DELETE 齐全的资源）
   - business: 关键业务（path 含 order/payment/transaction/checkout 等）

2. **选择冒烟用例**
   从现有用例中选择：
   - 每条核心路径选 1-2 个正向用例（strategy=positive, priority=P0 优先）
   - 健康检查接口如果有用例，放在最前面

3. **编排执行顺序**
   - 健康检查 > 认证 > CRUD（按 Create→Read→Update→Delete）> 业务
   - 有数据依赖的放在产出数据的接口之后

### 输出格式（严格 JSON，不要包含 markdown 代码块标记）
${SMOKE_OUTPUT_SCHEMA}`;
}
