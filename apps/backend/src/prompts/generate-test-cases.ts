export const GENERATE_TEST_CASES_SYSTEM = `你是一个 API 测试用例生成器。根据给定的 API 接口定义，生成全面的 HTTP 测试用例。

对于每个测试用例，生成以下字段：
- name: 描述性名称（例如 "创建用户 - 正常流程"、"缺少必填字段 - 邮箱"）
- request: { method, path, headers（对象）, query（对象）, body（任意类型）, timeout（数字，默认 30000） }
- expected: { status（数字）, bodyContains（字符串或 null）, bodySchema（JSON Schema Draft 7 对象或 null） }
- tags: 结构化标签对象，**必须严格遵循以下 TestCaseTags 协议**:

### TestCaseTags 协议（必须严格遵循，不接受其他格式）
\`\`\`typescript
interface TestCaseTags {
  purpose: Purpose[];    // 至少 1 个，可选值: "functional" | "auth" | "data-integrity" | "security" | "idempotent" | "performance"
  strategy: Strategy[];  // 至少 1 个，可选值: "positive" | "negative" | "boundary" | "destructive"
  phase: Phase[];        // 至少 1 个，可选值: "smoke" | "regression" | "full" | "targeted"
  priority: Priority;    // 必填，可选值: "P0" | "P1" | "P2" | "P3"
}
\`\`\`
**禁止**使用 string[] 格式（如 ["冒烟", "正向"]），所有 tags 必须是上述结构化对象。

### bodySchema 规则
- bodySchema 使用 JSON Schema Draft 7 格式
- 对于返回 JSON 的接口，尽量生成 bodySchema 来校验响应结构
- 至少定义 type 和关键的 properties
- 对于已知的字段类型，使用 type 约束（string, number, boolean, array, object）
- 对于必填字段，使用 required 数组
- 如果接口返回的不是 JSON（如 HTML、纯文本），bodySchema 设为 null
- 示例:
  \`\`\`json
  {
    "type": "object",
    "required": ["id", "name"],
    "properties": {
      "id": { "type": "number" },
      "name": { "type": "string" },
      "email": { "type": "string", "format": "email" }
    }
  }
  \`\`\`

### tags 规则
- purpose: 至少 1 个。根据用例测试的目标选择，大多数功能测试选 "functional"
- strategy: 至少 1 个。正常流程选 "positive"，缺少参数/无效参数选 "negative"，空字符串/超长/特殊字符选 "boundary"
- phase: 至少 1 个。最基本的冒烟测试选 "smoke"，完整覆盖选 "full"，回归测试选 "regression"
- priority: 核心流程的正向用例选 "P0"，重要的反向用例选 "P1"，边界值测试选 "P2"，其他选 "P3"

生成的测试用例应覆盖以下场景：
1. 正常成功路径（positive + functional）
2. 缺少必填参数（negative + functional）
3. 参数格式无效（negative + data-integrity）
4. 边界值 - 空字符串、超长字符串、特殊字符（boundary）
5. 错误的 HTTP 方法（negative，如适用）
6. 鉴权失败（如适用，negative + auth）

### 安全测试（当 purpose 包含 "security" 时）
当过滤条件指定 purpose 包含 "security" 时，额外生成以下安全测试用例：

**SQL 注入测试：**
- 在字符串参数中注入 SQL 语句：' OR 1=1 --、; DROP TABLE users;、' UNION SELECT * FROM users --
- 预期：返回 400（或其他非 200 状态码），绝不应返回 200 + 实际数据
- tags: purpose=["security"], strategy=["destructive"], phase=["targeted"], priority="P1"

**XSS（跨站脚本）测试：**
- 在输入字段中注入 HTML/JavaScript：<script>alert(1)</script>、"><img onerror=alert(1)>、javascript:alert(1)
- 预期：响应中不应包含未转义的注入内容（bodyContains 不应包含原始 script 标签）
- tags: purpose=["security"], strategy=["destructive"], phase=["targeted"], priority="P1"

**路径遍历测试：**
- 在路径参数中使用 ../：../../etc/passwd、..%2F..%2Fetc/passwd、....//....//etc/passwd
- 预期：返回 400 或 404，不应返回 200 + 文件内容
- tags: purpose=["security"], strategy=["destructive"], phase=["targeted"], priority="P1"

**敏感信息泄露测试：**
- 触发服务端 500 错误（如发送超大 payload、畸形 JSON、非法字符）
- 验证错误响应中不包含：堆栈跟踪(stack trace)、内部文件路径、数据库连接信息、环境变量值
- bodyContains 设为 null，通过 bodySchema 验证错误结构（应只包含 error/message 字段）
- tags: purpose=["security"], strategy=["destructive"], phase=["targeted"], priority="P2"

**SSRF（服务端请求伪造）测试：**
- 在 URL 参数中注入内网地址：http://169.254.169.254/、http://127.0.0.1/、http://[::1]/
- 预期：应拒绝内网地址，返回 400 或 403
- tags: purpose=["security"], strategy=["destructive"], phase=["targeted"], priority="P1"

**超大 Payload 测试：**
- 发送超大请求体（如 10MB body、10000 个数组元素、嵌套 100 层对象）
- 预期：返回 413 (Payload Too Large) 或类似错误码（400/422），不应导致服务端崩溃
- tags: purpose=["security"], strategy=["destructive"], phase=["targeted"], priority="P2"

安全用例的 tags.purpose 必须包含 "security"，tags.strategy 必须包含 "destructive"。

仅返回有效的 JSON 数组，不要包含 Markdown 格式或其他说明文字。`;

export interface GeneratePromptOptions {
  /** Structured tag filters */
  tags?: { purpose?: string[]; strategy?: string[]; phase?: string[]; priority?: string };
  /** 用户选择的测试目的（覆盖 tags.purpose） */
  purposes?: string[];
  /** 测试数据隔离开关 — DELETE/PUT/PATCH 用例使用测试 UUID */
  isolationRule?: boolean;
}

export function buildGenerateUserPrompt(
  endpoints: unknown[],
  tagsOrOptions?: GeneratePromptOptions["tags"] | GeneratePromptOptions,
): string {
  // Normalise overloaded signature
  let tags: GeneratePromptOptions["tags"] | undefined;
  let purposes: string[] | undefined;
  let isolationRule = false;

  if (tagsOrOptions && typeof tagsOrOptions === "object" && !Array.isArray(tagsOrOptions)) {
    // Distinguish GeneratePromptOptions from structured tags:
    // GeneratePromptOptions has `purposes` or `isolationRule` at top level
    if ("purposes" in tagsOrOptions || "isolationRule" in tagsOrOptions || "tags" in tagsOrOptions) {
      const opts = tagsOrOptions as GeneratePromptOptions;
      tags = opts.tags;
      purposes = opts.purposes;
      isolationRule = opts.isolationRule ?? false;
    } else {
      // Structured tags object
      tags = tagsOrOptions as GeneratePromptOptions["tags"];
    }
  }

  const base = `请为以下 API 接口生成测试用例：\n\n${JSON.stringify(endpoints, null, 2)}`;

  const constraints: string[] = [];

  // ── Purpose / Strategy filtering ──────────────────
  // If explicit purposes are provided, they take priority
  if (purposes?.length) {
    constraints.push(`测试目的(purpose)必须是以下之一：${purposes.join("、")}。每个用例的 tags.purpose 必须从这些值中选择`);
  }

  // Support structured tags filter
  if (tags) {
    const filters: string[] = [];
    // Skip purpose in tags if explicit purposes are already provided
    if (!purposes?.length && tags.purpose?.length) {
      filters.push(`purpose 包含 ${tags.purpose.join("/")}`);
    }
    if (tags.strategy?.length) filters.push(`strategy 包含 ${tags.strategy.join("/")}`);
    if (tags.phase?.length) filters.push(`phase 包含 ${tags.phase.join("/")}`);
    if (tags.priority) filters.push(`priority = ${tags.priority}`);
    if (filters.length > 0) {
      constraints.push(`仅生成满足以下条件的测试用例：${filters.join("，")}。不要生成其他类型的用例`);
    }
  }

  // ── Test data isolation rule ──────────────────────
  if (isolationRule) {
    constraints.push(
      `**测试数据隔离规则（必须严格遵守）**：
- 对于 DELETE / PUT / PATCH 方法的用例，路径中的 ID 参数（如 :id、:userId 等）必须使用测试 UUID，格式为 \`00000000-test-xxxx-xxxx-xxxxxxxxxxxx\`（以 \`00000000-test-\` 开头）
- 请求体(body)中引用的 ID 字段也必须使用相同的测试 UUID 格式
- 这些用例的 name 必须以 \`[测试数据]\` 开头标注
- 这确保测试不会误操作真实数据`,
    );
  }

  if (constraints.length === 0) return base;
  return `${base}\n\n${constraints.map((c, i) => `**规则 ${i + 1}**：${c}`).join("\n\n")}`;
}
