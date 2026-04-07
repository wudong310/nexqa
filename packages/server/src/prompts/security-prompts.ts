/**
 * security-prompts.ts — 安全扫描 AI Prompt 设计
 *
 * 来自需求文档 §3.3.4
 */

// ── System Prompt ─────────────────────────────────────

export const SECURITY_ANALYSIS_SYSTEM_PROMPT = `你是 NexQA 的 AI 安全测试分析引擎。你的任务是分析 API 接口的安全攻击面，识别潜在的安全风险。

你是安全分析专家，但不直接生成 payload —— payload 来自 NexQA 内置的经过验证的安全 payload 库。你的职责是：
1. 分析每个接口的参数特征，判断可能存在的攻击面
2. 为每个攻击面指定风险等级和推理依据
3. 分析安全测试结果，判断是否存在真实漏洞
4. 生成安全报告和修复建议

安全原则：
- 只在用户指定的测试环境（dev/test）中执行安全测试
- payload 设计为无害检测（detect, not exploit）
- 不会尝试真正的数据破坏操作`;

// ── 攻击面识别 Prompt ─────────────────────────────────

export function buildAttackSurfacePrompt(apiDocSummary: string): string {
  return `## 任务：分析 API 攻击面

### 输入
API 文档：
${apiDocSummary}

### 分析规则
对每个接口的每个参数，判断以下攻击面是否适用：

| 参数特征 | 可能的攻击面 | 风险级别 |
|---------|------------|---------|
| 字符串参数 + 可能用于查询 | sql-injection | high |
| 字符串参数 + 可能被渲染 | xss | high |
| 路径参数 + ID 类型 | idor | high |
| 需要认证的接口 | auth-bypass | high |
| 有 URL 类型参数 | ssrf | medium |
| 字符串参数 + 无长度限制 | overflow | low |
| POST/PUT 接口 + 有敏感字段在响应中 | mass-assignment | medium |
| 任何接口 + 无速率限制说明 | rate-limit | medium |
| 错误处理不明确 | info-disclosure | medium |
| 文件路径参数 | path-traversal | high |
| 可能传入命令行的参数 | command-injection | high |

### 输出格式（严格 JSON）
返回 JSON 数组，每个元素格式如下：
\`\`\`json
{
  "endpointId": "接口 ID",
  "path": "METHOD /path",
  "method": "METHOD",
  "vectors": [
    {
      "type": "sql-injection",
      "target": "body.name",
      "risk": "high",
      "reasoning": "字符串参数，可能拼接 SQL"
    }
  ]
}
\`\`\`

只输出 JSON 数组，不要有任何解释文字。`;
}

// ── 安全报告分析 Prompt ───────────────────────────────

export function buildSecurityReportPrompt(securityTestResults: string): string {
  return `## 任务：分析安全测试结果，生成安全报告

### 输入
安全测试执行结果：
${securityTestResults}

每个结果包含：
- testType: 测试类型（sql-injection/xss/idor...）
- endpoint: 测试的接口
- parameter: 测试的参数
- payload: 使用的 payload
- request: 发送的请求
- response: 收到的响应
- detectRule: 检测规则
- ruleMatched: 检测规则是否匹配（true = 可能存在漏洞）

### 要求
1. 对 ruleMatched=true 的结果进行二次分析，排除误报
2. 确认漏洞等级（critical/high/medium/low/info）
3. 为每个确认的漏洞生成描述、证据、修复建议
4. 生成 OWASP Top 10 覆盖度统计

### 误报排除规则
- SQL 注入：如果所有 payload 都返回相同结果，可能不是注入（只是服务端忽略了特殊字符）
- IDOR：如果返回 200 但 body 是空或错误信息，可能不是越权
- 信息泄露：如果错误信息是通用的（如 "Internal Server Error"），不算泄露

### 输出格式（严格 JSON）
\`\`\`json
{
  "findings": [
    {
      "id": "finding-001",
      "type": "sql-injection",
      "severity": "high",
      "endpoint": "POST /api/users",
      "parameter": "body.name",
      "description": "漏洞描述",
      "evidence": {
        "request": { "method": "POST", "url": "...", "headers": {}, "body": {} },
        "response": { "status": 200, "body": {} },
        "anomaly": "异常点描述"
      },
      "remediation": {
        "summary": "一句话修复建议",
        "details": "详细指导",
        "codeExample": "修复代码示例",
        "reference": "OWASP/CWE 链接"
      },
      "cwe": "CWE-89",
      "owaspTop10": "A03:2021 - Injection"
    }
  ]
}
\`\`\`

只输出 JSON 对象，不要有任何解释文字。`;
}
