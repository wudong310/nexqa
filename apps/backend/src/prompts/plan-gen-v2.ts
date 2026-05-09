/**
 * @deprecated 此模块已废弃（REQ-201 SKILL 封装改造）
 *
 * prompt 构建职责已移至 OpenClaw Agent nexqa SKILL。
 * Agent 在 SKILL.md 指导下自主查询数据并构建推理上下文，不再由后端拼装巨型 prompt。
 *
 * 保留此文件仅为向后兼容参考，不应再被 import。
 * 如有编译引用请删除。
 *
 * 替代方案：~/Studio/skills/tools/nexqa/SKILL.md
 * 相关设计：~/Studio/knowledge/projects/nexqa/tech-designs/REQ-201-nexqa-skill-architecture.md
 */

// ── Types (保留供参考，不再使用) ─────────────────────────────────────────────

/** @deprecated */
export interface PlanGenV2ProjectContext {
  name: string;
  totalCases: number;
  tagDistribution: string;
}

/** @deprecated */
export interface PlanGenV2Endpoint {
  method: string;
  path: string;
  summary: string;
}

/** @deprecated */
export interface PlanGenV2ApiChanges {
  added: string[];
  updated: string[];
  removed: string[];
}

/** @deprecated */
export interface PlanGenV2PromptParams {
  projectContext: PlanGenV2ProjectContext;
  endpointList: PlanGenV2Endpoint[];
  apiChanges?: PlanGenV2ApiChanges;
  userIntent: string;
}

/**
 * @deprecated 不再使用 — Agent 自主构建推理上下文
 *
 * 保留空实现以防止编译错误（如有残余引用）。
 */
export function buildPlanGenV2Prompt(_params: PlanGenV2PromptParams): string {
  throw new Error(
    "buildPlanGenV2Prompt 已废弃。prompt 构建已移至 OpenClaw Agent nexqa SKILL。",
  );
}
