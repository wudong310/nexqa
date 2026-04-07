import { z } from "zod";

export const TestCaseRequestSchema = z.object({
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]),
  path: z.string(),
  headers: z.record(z.string(), z.string()).default({}),
  query: z.record(z.string(), z.string()).default({}),
  body: z.unknown().optional(),
  timeout: z.number().default(30000),
});
export type TestCaseRequest = z.infer<typeof TestCaseRequestSchema>;

export const TestCaseExpectedSchema = z.object({
  status: z.number().nullable().default(null),
  bodyContains: z.string().nullable().default(null),
  bodySchema: z.unknown().nullable().default(null),
});
export type TestCaseExpected = z.infer<typeof TestCaseExpectedSchema>;

// ── Structured tag types ──────────────────────────────

export const PurposeSchema = z.enum([
  "functional",
  "auth",
  "data-integrity",
  "security",
  "idempotent",
  "performance",
]);
export type Purpose = z.infer<typeof PurposeSchema>;

export const StrategySchema = z.enum([
  "positive",
  "negative",
  "boundary",
  "destructive",
]);
export type Strategy = z.infer<typeof StrategySchema>;

export const PhaseSchema = z.enum(["smoke", "regression", "full", "targeted"]);
export type Phase = z.infer<typeof PhaseSchema>;

export const PrioritySchema = z.enum(["P0", "P1", "P2", "P3"]);
export type Priority = z.infer<typeof PrioritySchema>;

export const TestCaseTagsSchema = z.object({
  purpose: z.array(PurposeSchema).min(1).default(["functional"]),
  strategy: z.array(StrategySchema).min(1).default(["positive"]),
  phase: z.array(PhaseSchema).min(1).default(["full"]),
  priority: PrioritySchema.default("P1"),
});
export type TestCaseTags = z.infer<typeof TestCaseTagsSchema>;

// ── TestCase schema ───────────────────────────────────

export const TestCaseSchema = z.object({
  id: z.string().uuid(),
  endpointId: z.string().uuid(),
  name: z.string().min(1),
  request: TestCaseRequestSchema,
  expected: TestCaseExpectedSchema,
  tags: TestCaseTagsSchema.default({ purpose: ["functional"], strategy: ["positive"], phase: ["full"], priority: "P1" }),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type TestCase = z.infer<typeof TestCaseSchema>;
