import { z } from "zod";

// ── API Document Format ───────────────────────────────

export const ApiFormatSchema = z.enum([
  "openapi3",
  "swagger2",
  "postman-v2",
  "har",
  "curl",
]);
export type ApiFormat = z.infer<typeof ApiFormatSchema>;

// ── API Document ──────────────────────────────────────

export const ApiDocumentSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  name: z.string().min(1),
  format: ApiFormatSchema,
  source: z.string().nullable().default(null),
  contentHash: z.string(),
  endpointCount: z.number().int().min(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ApiDocument = z.infer<typeof ApiDocumentSchema>;

// ── Field Change (for diff) ──────────────────────────

export const FieldChangeSchema = z.object({
  field: z.string(),
  type: z.enum(["added", "removed", "modified"]),
  detail: z.string(),
  breaking: z.boolean(),
});
export type FieldChange = z.infer<typeof FieldChangeSchema>;

// ── API Change Flag (on TestCase) ────────────────────

export const ApiChangeFlagSchema = z.object({
  changedAt: z.string().datetime(),
  changeType: z.enum(["modified", "deleted"]),
  changes: z.array(FieldChangeSchema).optional(),
  documentId: z.string().uuid(),
  documentName: z.string(),
});
export type ApiChangeFlag = z.infer<typeof ApiChangeFlagSchema>;
