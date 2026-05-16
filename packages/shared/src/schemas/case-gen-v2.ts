import { z } from "zod";
import { LogEntrySchema } from "./plan-generation-v2.js";
import {
  TestCaseRequestSchema,
  TestCaseExpectedSchema,
  TestCaseTagsSchema,
} from "./test-case.js";

// ─── CaseGenTask 数据模型 ─────────────────────────────────────────────────────

/** 生成任务状态 */
export const CaseGenTaskStatusSchema = z.enum([
  "pending",
  "generating",
  "completed",
  "failed",
]);
export type CaseGenTaskStatus = z.infer<typeof CaseGenTaskStatusSchema>;

/** 生成的用例（未持久化，等待采纳） */
export const GeneratedCaseSchema = z.object({
  id: z.string().uuid(), // 临时 ID
  endpointId: z.string().uuid(),
  name: z.string().min(1),
  request: TestCaseRequestSchema,
  expected: TestCaseExpectedSchema,
  tags: TestCaseTagsSchema,
});
export type GeneratedCase = z.infer<typeof GeneratedCaseSchema>;

/** 生成结果统计 */
export const CaseGenStatsSchema = z.object({
  total: z.number(),
  byEndpoint: z.record(z.string(), z.number()),
});
export type CaseGenStats = z.infer<typeof CaseGenStatsSchema>;

/** 生成结果 */
export const CaseGenResultSchema = z.object({
  cases: z.array(GeneratedCaseSchema),
  stats: CaseGenStatsSchema,
});
export type CaseGenResult = z.infer<typeof CaseGenResultSchema>;

/** 生成任务 */
export const CaseGenTaskSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  status: CaseGenTaskStatusSchema,

  // 输入参数
  endpointIds: z.array(z.string().uuid()),
  tags: z
    .object({
      purpose: z.array(z.string()).optional(),
      strategy: z.array(z.string()).optional(),
      phase: z.array(z.string()).optional(),
      priority: z.string().optional(),
    })
    .optional(),
  maxCasesPerEndpoint: z.number().default(15),
  openclawConnectionId: z.string().uuid(),

  // 输出结果
  generatedCases: z.array(GeneratedCaseSchema).default([]),

  // 错误信息
  error: z.string().nullable().default(null),

  // 日志
  logs: z.array(LogEntrySchema).default([]),

  // 时间戳
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable().default(null),
});
export type CaseGenTask = z.infer<typeof CaseGenTaskSchema>;

// ─── 请求/响应 Schema ─────────────────────────────────────────────────────────

/** 启动生成请求 */
export const StartCaseGenRequestSchema = z.object({
  endpointIds: z.array(z.string().uuid()).min(1, "至少选择一个端点"),
  tags: z
    .object({
      purpose: z.array(z.string()).optional(),
      strategy: z.array(z.string()).optional(),
      phase: z.array(z.string()).optional(),
      priority: z.string().optional(),
    })
    .optional(),
  maxCasesPerEndpoint: z.number().min(1).max(50).default(15),
  openclawConnectionId: z.string().min(1, "openclawConnectionId 不能为空"),
});
export type StartCaseGenRequest = z.infer<typeof StartCaseGenRequestSchema>;

/** 启动生成响应 */
export const StartCaseGenResponseSchema = z.object({
  id: z.string().uuid(),
  status: CaseGenTaskStatusSchema,
  message: z.string(),
});
export type StartCaseGenResponse = z.infer<typeof StartCaseGenResponseSchema>;

/** 采纳请求 */
export const AdoptRequestSchema = z.object({
  caseIds: z.array(z.string().uuid()).optional(),
});
export type AdoptRequest = z.infer<typeof AdoptRequestSchema>;
