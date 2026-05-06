export const CHAIN_GEN_SYSTEM_PROMPT = `你是 NexQA 的 AI 测试链编排引擎。你的任务是分析 API 接口之间的数据依赖关系，自动编排测试链。

测试链的原则：
- 每条链有明确的测试目标（CRUD 生命周期、认证流程、业务流程等）
- 步骤之间通过提取器/注入器传递数据（如 userId、token）
- 提取器使用 JSONPath 从响应 body 中提取数据
- 注入器将提取的数据注入到后续步骤的 path/query/header/body 中
- 每条链应该包含清理步骤（删除测试数据）
- 标注置信度，不确定的地方如实标低

你的 JSONPath 书写规则：
- body 中的字段：$.data.id, $.data.token, $.items[0].id 等
- 嵌套对象：$.data.user.name
- 数组第一个元素：$.data.items[0]`;

export const CHAIN_GEN_OUTPUT_SCHEMA = `{
  "dependencyGraph": {
    "nodes": [
      {
        "endpointId": "api-endpoint-uuid",
        "path": "POST /api/users",
        "method": "POST",
        "produces": [{ "variable": "userId", "expression": "$.data.id", "type": "string" }],
        "requires": [{ "variable": "token", "target": "header", "expression": "Authorization", "required": true }]
      }
    ],
    "edges": [
      {
        "from": "endpointId-source",
        "to": "endpointId-target",
        "variable": "variableName",
        "fromExpression": "$.data.id",
        "toTarget": "path",
        "toExpression": "id",
        "confidence": 0.95
      }
    ]
  },
  "generatedChains": [
    {
      "name": "链名称",
      "description": "链描述",
      "type": "crud | auth | business | cleanup",
      "steps": [
        {
          "caseId": "test-case-uuid",
          "caseName": "用例名称",
          "label": "步骤标签",
          "extractors": [
            { "varName": "varName", "source": "body", "expression": "$.jsonpath" }
          ],
          "injectors": [
            { "varName": "varName", "target": "header", "expression": "Authorization" }
          ],
          "confidence": 0.95,
          "reasoning": "推理说明"
        }
      ]
    }
  ]
}`;

export function buildChainGenAnalyzePrompt(
  endpoints: unknown[],
  testCases: unknown[],
): string {
  return `## 任务：分析 API 依赖关系并生成测试链

### 输入

API 接口列表（method + path + 参数 + 响应结构）：
${JSON.stringify(endpoints, null, 2)}

现有测试用例列表（caseId + name + endpoint + method + tags）：
${JSON.stringify(testCases, null, 2)}

### 步骤

1. **构建依赖图**
   分析每个 API 接口：
   - 它产出什么数据？（响应中有哪些 ID、token 等可被后续使用的字段）
   - 它需要什么输入？（路径参数、请求头 token、body 中需要上游 ID 等）
   - 与其他接口有什么数据依赖？

2. **识别链路模式**
   - CRUD 链：同一 resource 有 POST+GET+PUT+DELETE → Create→Read→Update→Read(验证)→Delete
   - 认证链：有 login/register + 需要 token 的接口 → Register→Login→使用 Token→Logout
   - 业务流程链：有状态流转的资源（如 order: created→paid→shipped）
   - 清理链：CRUD 链末尾 + 业务流程链末尾，确保测试数据被清理

3. **为每条链选择用例**
   - 从现有用例中选择 strategy=positive, priority=P0 的用例优先
   - 每个接口选 1 个最匹配的用例

4. **配置提取器和注入器**
   - 提取器：从响应 body 中提取后续步骤需要的数据
   - 注入器：将上游数据注入到当前步骤的 path/query/header/body
   - header 注入的 expression 写 header 名称（如 "Authorization"）
   - path 注入的 expression 写路径参数名（如 "id"）
   - body 注入的 expression 写 JSONPath（如 "$.userId"）

5. **标注置信度**
   - 每个步骤标注置信度 0-1
   - JSONPath 明确可推断 → 0.9+
   - JSONPath 需要猜测响应结构 → 0.7-0.9
   - 完全猜测 → <0.7，在 reasoning 中说明不确定的原因

### 输出格式（严格 JSON，不要包含 markdown 代码块标记）
${CHAIN_GEN_OUTPUT_SCHEMA}`;
}
