import { z } from "zod";
import { LogEntrySchema } from "./plan-generation-v2.js";
import { TestCaseTagsSchema } from "./test-case.js";

// Status
export const CaseGenStatusSchema = z.enum(["pending", "generating", "completed", "failed"]);
export type CaseGenStatus = z.infer<typeof CaseGenStatusSchema>;

// 生成的用例（采纳前的临时结构）
export const GeneratedCaseSchema = z.object({
  id: z.string().uuid(),
  endpointId: z.string().uuid(),
  name: z.string().min(1),
  request: z.object({
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]),
    path: z.string(),
    headers: z.record(z.string(), z.string()).default({}),
    query: z.record(z.string(), z.string()).default({}),
    body: z.unknown().optional(),
    timeout: z.number().default(30000),
  }),
  expected: z.object({
    status: z.number().nullable().default(null),
    bodyContains: z.string().nullable().default(null),
    bodySchema: z.unknown().nullable().default(null),
  }),
  tags: TestCaseTagsSchema.default({ purpose: ["functional"], strategy: ["positive"], phase: ["full"], priority: "P1" }),
});
export type GeneratedCase = z.infer<typeof GeneratedCaseSchema>;

// 生成结果
export const CaseGenResultSchema = z.object({
  cases: z.array(GeneratedCaseSchema),
  stats: z.object({
    total: z.number(),
    byEndpoint: z.record(z.string(), z.number()),
  }),
});
export type CaseGenResult = z.infer<typeof CaseGenResultSchema>;

// 任务主体
export const CaseGenTaskSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  status: CaseGenStatusSchema,
  endpointIds: z.array(z.string().uuid()),
  tags: z.object({
    purpose: z.array(z.string()).optional(),
    strategy: z.array(z.string()).optional(),
    phase: z.array(z.string()).optional(),
    priority: z.string().optional(),
  }).optional(),
  maxCasesPerEndpoint: z.number().int().min(1).max(50).default(15),
  openclawConnectionId: z.string().uuid(),
  result: CaseGenResultSchema.nullable().default(null),
  error: z.string().nullable().default(null),
  logs: z.array(LogEntrySchema).default([]),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable().default(null),
});
export type CaseGenTask = z.infer<typeof CaseGenTaskSchema>;

// 请求/响应
export const StartCaseGenRequestSchema = z.object({
  endpointIds: z.array(z.string().uuid()).min(1),
  tags: CaseGenTaskSchema.shape.tags.optional(),
  maxCasesPerEndpoint: z.number().int().min(1).max(50).optional(),
  openclawConnectionId: z.string().optional(),
});
export type StartCaseGenRequest = z.infer<typeof StartCaseGenRequestSchema>;

export const StartCaseGenResponseSchema = z.object({
  id: z.string().uuid(),
  status: z.literal("pending"),
  message: z.string(),
});
export type StartCaseGenResponse = z.infer<typeof StartCaseGenResponseSchema>;

export const AdoptCaseGenRequestSchema = z.object({
  caseIds: z.array(z.string().uuid()).min(1),
});
export type AdoptCaseGenRequest = z.infer<typeof AdoptCaseGenRequestSchema>;
