import { z } from "zod";

export const GitSourceAuthSchema = z.object({
  type: z.enum(["none", "token", "ssh"]),
  token: z.string().optional(),
});

export const ScanConfigSchema = z.object({
  includePaths: z.array(z.string()).default(["src/**"]),
  excludePaths: z.array(z.string()).default(["node_modules/**", "dist/**", "*.test.*"]),
  framework: z.enum(["auto", "hono", "express", "spring-boot", "fastapi"]).default("auto"),
  maxFileSize: z.number().default(100_000),
  maxTotalFiles: z.number().default(50),
});

export const GitSourceSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  name: z.string().min(1),
  repoUrl: z.string().min(1),
  branch: z.string().default("main"),
  auth: GitSourceAuthSchema.default({ type: "none" }),
  scanConfig: ScanConfigSchema.default({}),
  openclawConnectionId: z.string().uuid(),
  lastScanId: z.string().uuid().nullable().default(null),
  lastScanAt: z.string().datetime().nullable().default(null),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type GitSource = z.infer<typeof GitSourceSchema>;
export type GitSourceAuth = z.infer<typeof GitSourceAuthSchema>;
export type ScanConfig = z.infer<typeof ScanConfigSchema>;
