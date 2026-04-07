import { z } from "zod";

// ── TestChain 数据模型 ────────────────────────────────

export const ExtractorSchema = z.object({
  varName: z.string().min(1),
  source: z.enum(["body", "header", "status"]),
  expression: z.string(), // JSONPath for body, header name, empty for status
  required: z.boolean().default(true),
});
export type Extractor = z.infer<typeof ExtractorSchema>;

export const InjectorSchema = z.object({
  varName: z.string().min(1),
  target: z.enum(["path", "query", "header", "body"]),
  expression: z.string(), // :id for path, key for query/header, JSONPath for body
});
export type Injector = z.infer<typeof InjectorSchema>;

export const TestChainStepSchema = z.object({
  id: z.string().uuid(),
  caseId: z.string().uuid(),
  label: z.string().default(""),
  extractors: z.array(ExtractorSchema).default([]),
  injectors: z.array(InjectorSchema).default([]),
  delay: z.number().int().min(0).max(10000).default(0),
  overrides: z
    .object({
      headers: z.record(z.string(), z.string()).optional(),
      query: z.record(z.string(), z.string()).optional(),
    })
    .optional(),
});
export type TestChainStep = z.infer<typeof TestChainStepSchema>;

export const TestChainConfigSchema = z.object({
  continueOnFail: z.boolean().default(false),
  cleanupSteps: z.array(z.string().uuid()).default([]),
});
export type TestChainConfig = z.infer<typeof TestChainConfigSchema>;

export const TestChainSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().default(""),
  steps: z.array(TestChainStepSchema).default([]),
  config: TestChainConfigSchema.default({}),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type TestChain = z.infer<typeof TestChainSchema>;

export const CreateTestChainStepSchema = z.object({
  caseId: z.string().uuid(),
  label: z.string().default(""),
  extractors: z.array(ExtractorSchema).default([]),
  injectors: z.array(InjectorSchema).default([]),
  delay: z.number().int().min(0).max(10000).default(0),
  overrides: z
    .object({
      headers: z.record(z.string(), z.string()).optional(),
      query: z.record(z.string(), z.string()).optional(),
    })
    .optional(),
});

export const CreateTestChainSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
  steps: z
    .array(CreateTestChainStepSchema)
    .default([]),
  config: TestChainConfigSchema.default({}),
});
export type CreateTestChain = z.infer<typeof CreateTestChainSchema>;

export const UpdateTestChainSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  steps: z.array(CreateTestChainStepSchema).optional(),
  config: TestChainConfigSchema.partial().optional(),
});
export type UpdateTestChain = z.infer<typeof UpdateTestChainSchema>;
