import { z } from "zod";

// ─── PlanGenerationV2 数据模型 ─────────────────────────────────────────────────

export const PlanGenV2StatusSchema = z.enum([
  "pending",
  "generating",
  "completed",
  "failed",
]);
export type PlanGenV2Status = z.infer<typeof PlanGenV2StatusSchema>;

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
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable().default(null),
});
export type PlanGenerationV2 = z.infer<typeof PlanGenerationV2Schema>;
