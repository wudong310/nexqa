/**
 * security-payloads.ts — 内置安全 Payload 库
 *
 * 7 大类 30+ payload，来自需求文档 §3.3.2。
 * 设计为无害检测（detect, not exploit）。
 */

import type { SecurityPayload, SecurityTestType } from "./security-types.js";

export const SECURITY_PAYLOADS: Record<SecurityTestType, SecurityPayload[]> = {
  "sql-injection": [
    {
      payload: "' OR 1=1 --",
      context: "字符串参数",
      detectRule: {
        type: "status",
        condition: "status !== 400 && status !== 422",
        vulnerable: "字符串参数未过滤 SQL 特殊字符",
      },
    },
    {
      payload: "'; DROP TABLE users;--",
      context: "字符串参数",
      detectRule: {
        type: "status",
        condition: "status < 500",
        vulnerable: "可能存在 SQL 注入，服务未报错",
      },
    },
    {
      payload: "1 UNION SELECT null,null,null--",
      context: "数字参数",
      detectRule: {
        type: "body-contains",
        condition: "null",
        vulnerable: "UNION 注入可能成功",
      },
    },
    {
      payload: "' AND SLEEP(3)--",
      context: "字符串参数",
      detectRule: {
        type: "timing",
        condition: "duration > 3000",
        vulnerable: "基于时间的 SQL 盲注",
      },
    },
    {
      payload: "1' AND '1'='1",
      context: "字符串参数",
      detectRule: {
        type: "status",
        condition: "status === 200",
        vulnerable: "布尔型 SQL 注入",
      },
    },
  ],

  xss: [
    {
      payload: "<script>alert(1)</script>",
      context: "字符串参数",
      detectRule: {
        type: "body-contains",
        condition: "<script>alert(1)</script>",
        vulnerable: "XSS — 响应中未转义 script 标签",
      },
    },
    {
      payload: '"><img src=x onerror=alert(1)>',
      context: "字符串参数",
      detectRule: {
        type: "body-contains",
        condition: "onerror=",
        vulnerable: "XSS — 响应中未转义 HTML 属性",
      },
    },
    {
      payload: "javascript:alert(document.cookie)",
      context: "URL 参数",
      detectRule: {
        type: "body-contains",
        condition: "javascript:",
        vulnerable: "XSS — 接受 javascript: 协议",
      },
    },
    {
      payload: "<svg onload=alert(1)>",
      context: "字符串参数",
      detectRule: {
        type: "body-contains",
        condition: "onload=",
        vulnerable: "XSS — SVG 事件处理器未过滤",
      },
    },
  ],

  idor: [
    {
      payload: "00000000-0000-0000-0000-000000000000",
      context: "路径参数（UUID）",
      detectRule: {
        type: "status",
        condition: "status !== 403 && status !== 404",
        vulnerable: "IDOR — 使用其他 ID 未返回 403/404",
      },
    },
    {
      payload: "1",
      context: "路径参数（数字 ID）",
      detectRule: {
        type: "status",
        condition: "status === 200",
        vulnerable: "IDOR — 可能访问到其他用户的资源",
      },
    },
  ],

  "auth-bypass": [
    {
      payload: "", // 移除 Authorization header
      context: "需要认证的接口",
      detectRule: {
        type: "status",
        condition: "status !== 401 && status !== 403",
        vulnerable: "认证绕过 — 无 token 未被拒绝",
      },
    },
    {
      payload: "Bearer invalid-token",
      context: "需要认证的接口",
      detectRule: {
        type: "status",
        condition: "status !== 401 && status !== 403",
        vulnerable: "认证绕过 — 无效 token 未被拒绝",
      },
    },
    {
      payload:
        "Bearer eyJhbGciOiJub25lIn0.eyJzdWIiOiIxMjM0NTY3ODkwIn0.",
      context: "JWT 认证",
      detectRule: {
        type: "status",
        condition: "status !== 401",
        vulnerable: "JWT alg=none 绕过",
      },
    },
  ],

  "info-disclosure": [
    {
      payload: "{invalid json",
      context: "POST 请求 body",
      detectRule: {
        type: "body-contains",
        condition: "stack",
        vulnerable: "信息泄露 — 错误响应包含堆栈跟踪",
      },
    },
    {
      payload: {},
      context: "POST 请求空 body",
      detectRule: {
        type: "body-contains",
        condition: "stack|trace|exception|debug",
        vulnerable: "信息泄露 — 错误信息过于详细",
      },
    },
  ],

  "rate-limit": [
    {
      payload: "__repeat:50",
      context: "任何接口",
      detectRule: {
        type: "status",
        condition: "allStatus200",
        vulnerable: "无速率限制 — 50 次请求全部成功",
      },
    },
  ],

  overflow: [
    {
      payload: "A".repeat(10000),
      context: "字符串参数",
      detectRule: {
        type: "status",
        condition: "status === 500",
        vulnerable: "溢出 — 超长输入导致服务端 500 错误",
      },
    },
    {
      payload: -1,
      context: "数字参数（应为正数）",
      detectRule: {
        type: "status",
        condition: "status !== 400 && status !== 422",
        vulnerable: "负数未被校验",
      },
    },
    {
      payload: 99999999999,
      context: "数字参数",
      detectRule: {
        type: "status",
        condition: "status === 500",
        vulnerable: "超大数字导致溢出",
      },
    },
  ],

  "path-traversal": [
    {
      payload: "../../etc/passwd",
      context: "文件路径参数",
      detectRule: {
        type: "body-contains",
        condition: "root:",
        vulnerable: "路径遍历 — 可读取系统文件",
      },
    },
    {
      payload: "..\\..\\windows\\system32\\config\\sam",
      context: "文件路径参数",
      detectRule: {
        type: "status",
        condition: "status !== 400 && status !== 404",
        vulnerable: "路径遍历 — Windows 路径未被拦截",
      },
    },
    {
      payload: "%2e%2e%2f%2e%2e%2fetc%2fpasswd",
      context: "URL 编码路径",
      detectRule: {
        type: "body-contains",
        condition: "root:",
        vulnerable: "路径遍历 — URL 编码绕过",
      },
    },
  ],

  ssrf: [
    {
      payload: "http://127.0.0.1:80",
      context: "URL 类型参数",
      detectRule: {
        type: "status",
        condition: "status !== 400 && status !== 422",
        vulnerable: "SSRF — 允许请求本地地址",
      },
    },
    {
      payload: "http://169.254.169.254/latest/meta-data/",
      context: "URL 类型参数",
      detectRule: {
        type: "status",
        condition: "status !== 400 && status !== 422",
        vulnerable: "SSRF — 允许请求云元数据端点",
      },
    },
    {
      payload: "http://[::1]:80",
      context: "URL 类型参数",
      detectRule: {
        type: "status",
        condition: "status !== 400 && status !== 422",
        vulnerable: "SSRF — IPv6 本地地址未被拦截",
      },
    },
  ],

  "command-injection": [
    {
      payload: "; ls -la",
      context: "可能传入命令行的参数",
      detectRule: {
        type: "body-contains",
        condition: "total ",
        vulnerable: "命令注入 — 响应包含 ls 输出",
      },
    },
    {
      payload: "| cat /etc/passwd",
      context: "可能传入命令行的参数",
      detectRule: {
        type: "body-contains",
        condition: "root:",
        vulnerable: "命令注入 — 管道操作符未过滤",
      },
    },
    {
      payload: "$(sleep 3)",
      context: "可能传入命令行的参数",
      detectRule: {
        type: "timing",
        condition: "duration > 3000",
        vulnerable: "命令注入 — 命令替换被执行",
      },
    },
    {
      payload: "`sleep 3`",
      context: "可能传入命令行的参数",
      detectRule: {
        type: "timing",
        condition: "duration > 3000",
        vulnerable: "命令注入 — 反引号命令被执行",
      },
    },
  ],

  "mass-assignment": [],
};

// ── OWASP Top 10 2021 映射 ────────────────────────────

export const OWASP_TOP_10: { category: string; testTypes: SecurityTestType[] }[] = [
  {
    category: "A01:2021 - Broken Access Control",
    testTypes: ["idor", "auth-bypass", "path-traversal"],
  },
  {
    category: "A02:2021 - Cryptographic Failures",
    testTypes: [],
  },
  {
    category: "A03:2021 - Injection",
    testTypes: ["sql-injection", "xss", "command-injection"],
  },
  {
    category: "A04:2021 - Insecure Design",
    testTypes: [],
  },
  {
    category: "A05:2021 - Security Misconfiguration",
    testTypes: ["info-disclosure"],
  },
  {
    category: "A06:2021 - Vulnerable and Outdated Components",
    testTypes: [],
  },
  {
    category: "A07:2021 - Identification and Authentication Failures",
    testTypes: ["auth-bypass"],
  },
  {
    category: "A08:2021 - Software and Data Integrity Failures",
    testTypes: ["mass-assignment"],
  },
  {
    category: "A09:2021 - Security Logging and Monitoring Failures",
    testTypes: [],
  },
  {
    category: "A10:2021 - Server-Side Request Forgery (SSRF)",
    testTypes: ["ssrf"],
  },
];

// ── CWE 映射 ─────────────────────────────────────────

export const CWE_MAP: Record<SecurityTestType, string> = {
  "sql-injection": "CWE-89",
  xss: "CWE-79",
  "path-traversal": "CWE-22",
  "auth-bypass": "CWE-287",
  idor: "CWE-639",
  "mass-assignment": "CWE-915",
  "rate-limit": "CWE-770",
  "info-disclosure": "CWE-209",
  ssrf: "CWE-918",
  "command-injection": "CWE-78",
  overflow: "CWE-120",
};

// ── 内置修复建议模板 ──────────────────────────────────

export const REMEDIATION_TEMPLATES: Record<
  SecurityTestType,
  { summary: string; details: string; codeExample?: string; reference: string }
> = {
  "sql-injection": {
    summary: "使用参数化查询，不要拼接 SQL 字符串",
    details:
      "在数据库查询中使用参数化语句（如 ? 占位符或 ORM 的 parameterized queries），永远不要将用户输入直接拼接到 SQL 语句中。",
    codeExample:
      '// 错误\ndb.query(`SELECT * FROM users WHERE name = \'${name}\'`)\n\n// 正确\ndb.query(\'SELECT * FROM users WHERE name = ?\', [name])',
    reference: "https://owasp.org/Top10/A03_2021-Injection/",
  },
  xss: {
    summary: "对所有用户输入进行 HTML 转义输出",
    details:
      "使用框架内置的 HTML 转义功能。对于 React，默认已转义 JSX 中的字符串。避免使用 dangerouslySetInnerHTML。对于服务端渲染，使用专门的转义库。",
    codeExample:
      "// 错误: 直接输出用户输入\nres.send(`<div>${userInput}</div>`)\n\n// 正确: 使用转义函数\nres.send(`<div>${escapeHtml(userInput)}</div>`)",
    reference: "https://owasp.org/Top10/A03_2021-Injection/",
  },
  "path-traversal": {
    summary: "对文件路径参数进行白名单校验和路径规范化",
    details:
      "使用 path.resolve() 或 path.normalize() 规范化路径后，检查是否在允许的目录范围内。禁止 .. 序列。",
    reference: "https://owasp.org/Top10/A01_2021-Broken_Access_Control/",
  },
  "auth-bypass": {
    summary: "确保所有需要认证的接口都有有效的 token 校验中间件",
    details:
      "在路由层面添加认证中间件，校验 JWT 签名、过期时间。拒绝 alg=none 的 JWT。",
    reference:
      "https://owasp.org/Top10/A07_2021-Identification_and_Authentication_Failures/",
  },
  idor: {
    summary: "在查询前校验当前用户是否有权限访问该资源",
    details:
      "在处理函数中，比较 req.user.id 与目标资源的 owner，如不匹配且非管理员，返回 403 Forbidden。",
    reference: "https://owasp.org/Top10/A01_2021-Broken_Access_Control/",
  },
  "mass-assignment": {
    summary: "使用白名单限制请求可更新的字段",
    details:
      "创建 DTO 或使用 pick/omit 只提取允许更新的字段，不要直接将 req.body 传入数据库操作。",
    reference:
      "https://owasp.org/Top10/A08_2021-Software_and_Data_Integrity_Failures/",
  },
  "rate-limit": {
    summary: "添加速率限制中间件",
    details:
      "使用 express-rate-limit、hono rate-limit 等中间件限制 IP/用户的请求频率。登录接口尤其重要。",
    reference: "https://owasp.org/Top10/A05_2021-Security_Misconfiguration/",
  },
  "info-disclosure": {
    summary: "生产环境关闭详细错误信息，统一返回通用错误",
    details:
      '在全局错误处理中间件中，捕获所有异常并返回通用的 "Internal Server Error"，不要暴露堆栈跟踪、数据库信息。',
    reference: "https://owasp.org/Top10/A05_2021-Security_Misconfiguration/",
  },
  ssrf: {
    summary: "对 URL 参数进行白名单校验，禁止内网地址",
    details:
      "验证用户提供的 URL：拒绝 127.0.0.1、localhost、169.254.x.x、10.x.x.x、172.16-31.x.x、192.168.x.x 等内网地址。使用 DNS 解析后再校验 IP。",
    reference: "https://owasp.org/Top10/A10_2021-Server-Side_Request_Forgery/",
  },
  "command-injection": {
    summary: "避免将用户输入传入 shell 命令，使用安全的 API 替代",
    details:
      "使用 child_process.execFile (非 exec) 并传入参数数组而非拼接字符串。更好的做法是使用语言内置 API 替代 shell 命令。",
    reference: "https://owasp.org/Top10/A03_2021-Injection/",
  },
  overflow: {
    summary: "对输入长度和范围进行校验",
    details:
      "在接口层面使用 zod/joi 等 schema 校验库限制字符串最大长度、数字范围。拒绝超出范围的输入。",
    reference: "https://owasp.org/Top10/A05_2021-Security_Misconfiguration/",
  },
};
