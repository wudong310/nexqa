/**
 * V2 测试方案生成 Prompt — 基于 OpenClaw Agent 的结构化模板
 *
 * 与 V1（plan-gen.ts）的区别：
 * - V1: 直接调用本地 LLM，提供用例统计为主
 * - V2: 通过 OpenClaw Agent 调用，注入完整 API 端点列表 + Git 变更信息
 *
 * 输入：项目上下文 + API 端点列表 + 变更信息 + 用户意图
 * 输出：parsedIntent + plan（JSON）
 */

// ── Types ─────────────────────────────────────────────

export interface PlanGenV2ProjectContext {
  /** 项目名称 */
  name: string;
  /** 现有用例总数 */
  totalCases: number;
  /** 标签分布描述（purpose/strategy/phase/priority） */
  tagDistribution: string;
}

export interface PlanGenV2Endpoint {
  /** HTTP 方法 */
  method: string;
  /** 路由路径 */
  path: string;
  /** 端点摘要 */
  summary: string;
}

export interface PlanGenV2ApiChanges {
  /** 新增的端点 */
  added: string[];
  /** 变更的端点 */
  updated: string[];
  /** 删除的端点 */
  removed: string[];
}

export interface PlanGenV2PromptParams {
  /** 项目上下文 */
  projectContext: PlanGenV2ProjectContext;
  /** API 端点列表 */
  endpointList: PlanGenV2Endpoint[];
  /** 最近 API 变更（来自 Git 扫描 diff），可选 */
  apiChanges?: PlanGenV2ApiChanges;
  /** 用户自然语言意图 */
  userIntent: string;
}

// ── Output JSON Schema（嵌入 prompt） ─────────────────

const PLAN_GEN_V2_OUTPUT_SCHEMA = `{
  "parsedIntent": {
    "type": "release | smoke | regression | security | full | module | quick | custom",
    "scope": "all | changed | specific",
    "urgency": "normal | quick",
    "focusEndpoints": ["受关注的端点路径，可选"]
  },
  "plan": {
    "name": "方案名称",
    "description": "方案描述",
    "stages": [
      {
        "name": "阶段名称",
        "order": 1,
        "selection": {
          "tags": {
            "purpose": ["functional"],
            "strategy": ["positive"],
            "phase": ["smoke"],
            "priority": ["P0"]
          },
          "endpointIds": ["关联的端点ID，可选"]
        },
        "criteria": { "minPassRate": 1.0, "maxP0Fails": 0, "maxP1Fails": 0 },
        "gate": true
      }
    ],
    "execution": {
      "stages": true,
      "concurrency": 3,
      "retryOnFail": 1,
      "timeoutMs": 30000,
      "stopOnGateFail": true
    },
    "criteria": {
      "minPassRate": 0.95,
      "maxP0Fails": 0,
      "maxP1Fails": 3
    },
    "reasoning": "推理说明：为什么选择这个方案结构"
  }
}`;

// ── Intent-specific hints ─────────────────────────────

const INTENT_HINTS: Record<string, string> = {
  release: `发版场景：建议分阶段（冒烟→功能回归→安全），覆盖所有变更端点，门禁严格。`,
  smoke: `冒烟场景：只测 P0 正向核心路径，串行执行，100% 通过门禁。`,
  regression: `回归场景：重点覆盖变更端点及其上下游依赖，适度并发，≥95% 通过。`,
};

// ── Prompt Builder ────────────────────────────────────

/**
 * 构建 V2 测试方案生成 prompt
 *
 * 设计原则：
 * 1. 角色设定明确（测试架构师）
 * 2. 结构化注入上下文，Agent 可直接推理
 * 3. 变更信息可选注入，有则重点关注
 * 4. 输出格式严格约束为 JSON
 */
export function buildPlanGenV2Prompt(params: PlanGenV2PromptParams): string {
  const { projectContext, endpointList, apiChanges, userIntent } = params;

  // ── 角色设定
  const roleBlock = `你是一个测试架构师。请根据以下项目信息、API 端点和用户意图，生成最优的结构化测试方案。`;

  // ── 项目上下文区
  const projectBlock = `## 项目上下文
- 项目名称: ${projectContext.name}
- 现有用例数: ${projectContext.totalCases}
- 标签分布:
  ${projectContext.tagDistribution}`;

  // ── API 端点列表区（精简表格格式）
  const endpointBlock = buildEndpointBlock(endpointList);

  // ── 最近变更区（可选）
  const changesBlock = apiChanges ? buildChangesBlock(apiChanges) : "";

  // ── 用户意图区
  const intentBlock = `## 用户意图
"${userIntent}"`;

  // ── 意图提示（如能预判类型，注入 hint）
  const hintBlock = buildHintBlock(userIntent);

  // ── 输出约束区
  const outputBlock = `## 输出要求

请严格按以下 JSON 结构输出，不要包含其他文本。如果需要用 markdown 代码块包裹，使用 \`\`\`json 格式。

### 输出 JSON Schema
\`\`\`json
${PLAN_GEN_V2_OUTPUT_SCHEMA}
\`\`\`

### 配置原则
- 冒烟：串行(concurrency=1)，不重试，100% 通过
- 功能回归：适度并发(3-5)，重试 1 次，≥95% 通过
- 安全测试：串行，不重试，无通过率门禁
- 全量：分阶段组合，按场景递进
- 如有 API 变更信息，优先覆盖变更端点及其依赖
- stages 中每个阶段的 selection.tags 值必须是实际可用的标签
- gate=true 表示该阶段是门禁，不通过则后续阶段不执行

### 推理要求
在 reasoning 字段中说明：
1. 意图分类依据
2. 方案结构选择理由
3. 如有变更，哪些端点是重点覆盖目标`;

  // ── 组装完整 prompt
  const sections = [
    roleBlock,
    projectBlock,
    endpointBlock,
    changesBlock,
    intentBlock,
    hintBlock,
    outputBlock,
  ].filter(Boolean);

  return sections.join("\n\n");
}

// ── Internal helpers ──────────────────────────────────

function buildEndpointBlock(endpoints: PlanGenV2Endpoint[]): string {
  if (endpoints.length === 0) {
    return `## API 端点列表\n（暂无端点数据）`;
  }

  const lines = endpoints.map(
    (ep) => `- ${ep.method.toUpperCase()} ${ep.path} — ${ep.summary}`,
  );

  return `## API 端点列表（共 ${endpoints.length} 个）
${lines.join("\n")}`;
}

function buildChangesBlock(changes: PlanGenV2ApiChanges): string {
  const sections: string[] = [];

  if (changes.added.length > 0) {
    sections.push(`### 新增端点\n${changes.added.map((e) => `- ➕ ${e}`).join("\n")}`);
  }
  if (changes.updated.length > 0) {
    sections.push(`### 变更端点\n${changes.updated.map((e) => `- ✏️ ${e}`).join("\n")}`);
  }
  if (changes.removed.length > 0) {
    sections.push(`### 删除端点\n${changes.removed.map((e) => `- ❌ ${e}`).join("\n")}`);
  }

  if (sections.length === 0) {
    return "";
  }

  return `## 最近 API 变更（来自 Git 扫描）

> 以下端点在最近一次代码扫描中检测到变化，测试方案应重点覆盖。

${sections.join("\n\n")}`;
}

function buildHintBlock(userIntent: string): string {
  const lower = userIntent.toLowerCase();

  // 尝试匹配已知意图类型
  const patterns: [string[], string][] = [
    [["发版", "release", "上线", "部署", "deploy", "发布"], "release"],
    [["冒烟", "smoke", "快速验证核心", "基本功能"], "smoke"],
    [["回归", "regression", "变更影响", "改了测一下"], "regression"],
  ];

  for (const [keywords, intentType] of patterns) {
    if (keywords.some((kw) => lower.includes(kw))) {
      const hint = INTENT_HINTS[intentType];
      if (hint) {
        return `## 参考提示\n${hint}`;
      }
    }
  }

  return "";
}
