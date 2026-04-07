import { z } from "zod";
import { PhaseSchema, PrioritySchema, PurposeSchema, StrategySchema } from "./test-case.js";

// ── TestPlan 数据模型 ─────────────────────────────────

export const TestPlanSelectionSchema = z.object({
  tags: z
    .object({
      purpose: z.array(PurposeSchema).optional(),
      strategy: z.array(StrategySchema).optional(),
      phase: z.array(PhaseSchema).optional(),
      priority: z.array(PrioritySchema).optional(),
    })
    .optional(),
  endpointIds: z.array(z.string().uuid()).optional(),
  chainIds: z.array(z.string().uuid()).optional(),
  caseIds: z.array(z.string().uuid()).optional(),
});
export type TestPlanSelection = z.infer<typeof TestPlanSelectionSchema>;

export const TestPlanExecutionSchema = z.object({
  environmentId: z.string().uuid().nullable().default(null),
  stages: z.boolean().default(true),
  concurrency: z.number().int().min(1).max(10).default(3),
  retryOnFail: z.number().int().min(0).max(3).default(0),
  timeoutMs: z.number().int().min(1000).max(120000).default(30000),
  stopOnGateFail: z.boolean().default(true),
});
export type TestPlanExecution = z.infer<typeof TestPlanExecutionSchema>;

export const TestPlanCriteriaSchema = z.object({
  minPassRate: z.number().min(0).max(1).default(0.95),
  maxP0Fails: z.number().int().min(0).default(0),
  maxP1Fails: z.number().int().min(0).default(3),
});
export type TestPlanCriteria = z.infer<typeof TestPlanCriteriaSchema>;

export const TestPlanSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().default(""),
  selection: TestPlanSelectionSchema.default({}),
  execution: TestPlanExecutionSchema.default({}),
  criteria: TestPlanCriteriaSchema.default({}),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type TestPlan = z.infer<typeof TestPlanSchema>;

export const CreateTestPlanSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
  selection: TestPlanSelectionSchema.default({}),
  execution: TestPlanExecutionSchema.default({}),
  criteria: TestPlanCriteriaSchema.default({}),
});
export type CreateTestPlan = z.infer<typeof CreateTestPlanSchema>;

export const UpdateTestPlanSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  selection: TestPlanSelectionSchema.optional(),
  execution: TestPlanExecutionSchema.partial().optional(),
  criteria: TestPlanCriteriaSchema.partial().optional(),
});
export type UpdateTestPlan = z.infer<typeof UpdateTestPlanSchema>;
