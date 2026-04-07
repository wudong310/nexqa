import { z } from "zod";

export const FailTypeSchema = z.enum([
  "status_mismatch",
  "schema_violation",
  "body_mismatch",
  "timeout",
  "network_error",
  "auth_failure",
  "unknown",
  "script_error",
  "variable_error",
  "chain_dependency",
]);
export type FailType = z.infer<typeof FailTypeSchema>;

export const TestResultResponseSchema = z.object({
  status: z.number(),
  statusText: z.string(),
  headers: z.record(z.string(), z.string()).default({}),
  body: z.unknown(),
  duration: z.number(),
});
export type TestResultResponse = z.infer<typeof TestResultResponseSchema>;

export const TestResultSchema = z.object({
  id: z.string().uuid(),
  caseId: z.string().uuid(),
  projectId: z.string().uuid(),
  timestamp: z.string().datetime(),
  request: z.object({
    method: z.string(),
    url: z.string(),
    headers: z.record(z.string(), z.string()).default({}),
    body: z.unknown().optional(),
  }),
  response: TestResultResponseSchema,
  passed: z.boolean(),
  failReason: z.string().nullable().default(null),
  failType: FailTypeSchema.nullable().default(null),
});
export type TestResult = z.infer<typeof TestResultSchema>;
