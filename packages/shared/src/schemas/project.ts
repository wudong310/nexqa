import { z } from "zod";
import { VariableValueSchema } from "./environment.js";

export const OpenClawTimeoutSchema = z.object({
  connect: z.number().default(5000),
  handshake: z.number().default(5000),
  chat: z.number().default(30000),
});
export type OpenClawTimeout = z.infer<typeof OpenClawTimeoutSchema>;

export const OpenClawConnectionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  gatewayUrl: z.string().min(1),
  clawRunnerUrl: z.string().min(1),
  testMessage: z.string().default("你好"),
  timeout: OpenClawTimeoutSchema.default({}),
});
export type OpenClawConnection = z.infer<typeof OpenClawConnectionSchema>;

export const ProjectSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  /** O7: 项目描述，max 500 字符 */
  description: z.string().max(500).default(""),
  baseURL: z.string().url(),
  headers: z.record(z.string(), z.string()).default({}),
  variables: z.record(z.string(), VariableValueSchema).default({}),
  /** O7: 持久化选中环境 ID */
  activeEnvironmentId: z.string().uuid().nullable().default(null),
  openclawConnections: z.array(OpenClawConnectionSchema).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Project = z.infer<typeof ProjectSchema>;

export const CreateProjectSchema = ProjectSchema.pick({
  name: true,
  baseURL: true,
  headers: true,
  variables: true,
  openclawConnections: true,
  activeEnvironmentId: true,
}).extend({
  description: z.string().max(500).default(""),
});
export type CreateProject = z.infer<typeof CreateProjectSchema>;

export const UpdateProjectSchema = CreateProjectSchema.partial();
export type UpdateProject = z.infer<typeof UpdateProjectSchema>;
