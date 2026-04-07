import { z } from "zod";
import { FailTypeSchema } from "./test-result.js";

export const BatchRunStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
]);
export type BatchRunStatus = z.infer<typeof BatchRunStatusSchema>;

export const BatchRunSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  name: z.string().min(1),
  environmentId: z.string().uuid().nullable().default(null),
  status: BatchRunStatusSchema.default("pending"),

  // Counters
  totalCases: z.number().int().min(0).default(0),
  passedCases: z.number().int().min(0).default(0),
  failedCases: z.number().int().min(0).default(0),
  skippedCases: z.number().int().min(0).default(0),

  // Failure breakdown by type
  failureBreakdown: z.record(FailTypeSchema, z.number().int().min(0)).default({}),

  // Timestamps
  startedAt: z.string().datetime().nullable().default(null),
  completedAt: z.string().datetime().nullable().default(null),
  createdAt: z.string().datetime(),
});
export type BatchRun = z.infer<typeof BatchRunSchema>;

export const CreateBatchRunSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1),
  environmentId: z.string().uuid().nullable().default(null),
  /** Optional filter: only run cases matching these IDs */
  caseIds: z.array(z.string().uuid()).optional(),
  /** Optional filter: only run cases matching these endpoint IDs */
  endpointIds: z.array(z.string().uuid()).optional(),
  /** Optional filter: only run cases matching these tags */
  tagFilter: z
    .object({
      purpose: z.array(z.string()).optional(),
      strategy: z.array(z.string()).optional(),
      phase: z.array(z.string()).optional(),
      priority: z.string().optional(),
    })
    .optional(),
});
export type CreateBatchRun = z.infer<typeof CreateBatchRunSchema>;

/**
 * Links a TestResult to a specific BatchRun.
 * Stored in the "batch-run-results" collection.
 */
export const BatchRunResultSchema = z.object({
  id: z.string().uuid(),
  batchRunId: z.string().uuid(),
  resultId: z.string().uuid(),
  caseId: z.string().uuid(),
  passed: z.boolean(),
  failType: FailTypeSchema.nullable().default(null),
});
export type BatchRunResult = z.infer<typeof BatchRunResultSchema>;
