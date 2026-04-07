/**
 * AI 自动生成测试方案 — Prompt 设计
 *
 * 输入：用户意图 + 项目用例列表摘要 + 可用模板
 * 输出：选中模板 + 用例 ID 列表 + 阶段划分 + 理由
 */

export const PLAN_GEN_SYSTEM_PROMPT = `你是 NexQA 的 AI 测试方案生成引擎。你的任务是理解用户的自然语言测试意图，自动生成合适的测试方案。

测试方案包含：
- 用例选择策略（按标签筛选 + 指定用例/测试链）
- 执行配置（环境、并发、重试、超时）
- 通过标准（最低通过率、最大失败数）
- 可选的分阶段执行（如发版场景的冒烟→功能→安全→性能）

你的配置原则：
- 冒烟：串行(concurrency=1)，不重试，100% 通过
- 功能回归：适度并发(3-5)，重试 1 次，≥95% 通过
- 安全测试：串行，不重试，无通过率门禁（安全测试关注发现而非通过率）
- 性能测试：串行，不重试，只记录基准
- 全量：按实际场景组合上述策略`;

export const PLAN_GEN_OUTPUT_SCHEMA = `{
  "parsedIntent": {
    "type": "release|smoke|security|regression|full|module|quick|custom",
    "scope": "all|module-path 描述",
    "urgency": "normal|quick"
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
          }
        },
        "criteria": { "minPassRate": 1.0, "maxP0Fails": 0, "maxP1Fails": 0 },
        "gate": true
      }
    ],
    "execution": {
      "environmentId": "环境ID或null",
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
    "reasoning": "推理说明：为什么这样配置"
  }
}`;

export interface PlanGenContext {
  projectName: string;
  totalCases: number;
  tagDistribution: string;
  chainList: string;
  environmentList: string;
  lastBatchSummary: string;
  activeEnvironmentId: string | null;
}

export function buildPlanGenPrompt(
  userIntent: string,
  ctx: PlanGenContext,
): string {
  return `## 任务：根据用户意图生成测试方案

### 用户输入
"${userIntent}"

### 项目上下文
- 项目名: ${ctx.projectName}
- 用例总数: ${ctx.totalCases}
- 用例标签分布:
  ${ctx.tagDistribution}
- 已有测试链: ${ctx.chainList || "无"}
- 已有环境: ${ctx.environmentList || "无"}
- 上次执行结果: ${ctx.lastBatchSummary || "无历史数据"}
- 当前活跃环境ID: ${ctx.activeEnvironmentId || "无"}

### 意图分类
请先判断用户意图属于哪种类型：
- release: 发版/上线前的完整检查
- smoke: 快速核心验证
- security: 安全专项测试
- regression: 回归测试（可能指定了变更范围）
- full: 全量测试
- module: 模块级测试（用户指定了模块/路径）
- quick: 快速验证（P0+P1 正向）
- custom: 无法归类，需要更多信息

### 要求
1. 根据意图类型选择合适的方案模板
2. 根据项目上下文调整参数（如用例数量影响并发配置）
3. 如果意图中提到了具体模块（如"只测用户模块"），在 selection 中通过 tags 进行过滤
4. 给出推理说明（为什么这样配置）
5. stages 中 selection.tags 的值必须是实际存在于项目中的标签值
6. environmentId 优先使用当前活跃环境，如果用户指定了环境则使用指定的

### 输出格式（严格 JSON，不要包含 markdown 代码块标记）
${PLAN_GEN_OUTPUT_SCHEMA}`;
}
