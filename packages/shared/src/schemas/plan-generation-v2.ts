import { z } from "zod";

// ─── LogEntry 数据模型 ─────────────────────────────────────────────────────────

/** Agent 事件日志条目 */
export const LogEntrySchema = z.object({
  event: z.string(),
  text: z.string(),
  timestamp: z.string(),
});
export type LogEntry = z.infer<typeof LogEntrySchema>;

// ─── PlanGenerationV2 数据模型 ─────────────────────────────────────────────────

export const PlanGenV2StatusSchema = z.enum([
  "pending",
  "generating",
  "completed",
  "failed",
]);
export type PlanGenV2Status = z.infer<typeof PlanGenV2StatusSchema>;

/** 扩展状态：用于记录列表展示（兼容旧数据） */
export const PlanGenRecordStatusSchema = z.enum([
  "generating",
  "completed_pending",
  "completed_adopted",
  "failed",
]);
export type PlanGenRecordStatus = z.infer<typeof PlanGenRecordStatusSchema>;

/** Agent 返回的结构化结果 — Zod 校验 */
export const PlanGenV2ResultSchema = z.object({
  parsedIntent: z.object({
    type: z.string(),
    scope: z.string(),
    urgency: z.enum(["normal", "quick"]),
  }),
  plan: z.object({
    name: z.string(),
    description: z.string(),
    stages: z
      .array(
        z.object({
          name: z.string(),
          order: z.number(),
          selection: z.record(z.unknown()).default({}),
          criteria: z
            .object({
              minPassRate: z.number().default(0.9),
              maxP0Fails: z.number().default(0),
              maxP1Fails: z.number().default(5),
            })
            .default({}),
          gate: z.boolean().default(false),
        }),
      )
      .default([]),
    execution: z
      .object({
        concurrency: z.number().default(3),
        retryOnFail: z.number().default(0),
        timeoutMs: z.number().default(30000),
        stopOnGateFail: z.boolean().default(true),
      })
      .default({}),
    criteria: z
      .object({
        minPassRate: z.number().default(0.95),
        maxP0Fails: z.number().default(0),
        maxP1Fails: z.number().default(3),
      })
      .default({}),
    reasoning: z.string().default(""),
  }),
});
export type PlanGenV2Result = z.infer<typeof PlanGenV2ResultSchema>;

/** 方案生成记录 */
export const PlanGenerationV2Schema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  status: PlanGenV2StatusSchema,
  intent: z.string().min(1),
  scope: z
    .object({
      gitSourceIds: z.array(z.string().uuid()).optional(),
      endpointIds: z.array(z.string().uuid()).optional(),
      changedOnly: z.boolean().optional(),
    })
    .optional(),
  openclawConnectionId: z.string().uuid(),
  result: PlanGenV2ResultSchema.nullable().default(null),
  error: z.string().nullable().default(null),
  adoptedPlanId: z.string().uuid().nullable().default(null), // 新增：采纳后关联
  logs: z.array(LogEntrySchema).default([]), // Agent 事件日志
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable().default(null),
});
export type PlanGenerationV2 = z.infer<typeof PlanGenerationV2Schema>;

/** 采纳请求 */
export const AdoptPlanGenRequestSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
});
export type AdoptPlanGenRequest = z.infer<typeof AdoptPlanGenRequestSchema>;

/** 采纳响应 */
export const AdoptPlanGenResponseSchema = z.object({
  planId: z.string().uuid(),
  // 注意：plan 字段在路由层填充，这里用 any 避免循环依赖
  plan: z.any(),
});
export type AdoptPlanGenResponse = z.infer<typeof AdoptPlanGenResponseSchema>;