import { z } from "zod";

export const ScanStatusSchema = z.enum([
  "pending", "analyzing", "importing", "completed", "failed",
]);
export type ScanStatus = z.infer<typeof ScanStatusSchema>;

export const ScanChangeSchema = z.object({
  type: z.enum(["added", "updated", "removed"]),
  method: z.string(),
  path: z.string(),
  summary: z.string().default(""),
  endpointId: z.string().uuid().optional(),
  fields: z.array(z.object({
    field: z.string(),
    detail: z.string(),
  })).optional(),
});
export type ScanChange = z.infer<typeof ScanChangeSchema>;

export const ScanResultSchema = z.object({
  endpointsFound: z.number().default(0),
  endpointsNew: z.number().default(0),
  endpointsUpdated: z.number().default(0),
  endpointsRemoved: z.number().default(0),
  changes: z.array(ScanChangeSchema).default([]),
});

export const ScanRecordSchema = z.object({
  id: z.string().uuid(),
  gitSourceId: z.string().uuid(),
  projectId: z.string().uuid(),
  status: ScanStatusSchema,
  branch: z.string(),
  commitHash: z.string().nullable().default(null),
  scannedFiles: z.array(z.string()).default([]),
  totalFilesFound: z.number().default(0),
  result: ScanResultSchema.nullable().default(null),
  error: z.string().nullable().default(null),
  openclawRunId: z.string().nullable().default(null),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable().default(null),
});
export type ScanRecord = z.infer<typeof ScanRecordSchema>;
export type ScanResult = z.infer<typeof ScanResultSchema>;
