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

export const PlanGenVersionSchema = z.enum(["v1", "v2", "auto"]).default("auto");
export type PlanGenVersion = z.infer<typeof PlanGenVersionSchema>;

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
  /**
   * 方案生成版本策略：
   * - "auto"（默认）：有 OpenClaw 连接用 V2，无则降级 V1
   * - "v1"：强制使用 V1（LLM 直调 + 规则引擎）
   * - "v2"：强制使用 V2（OpenClaw Agent），无连接时报错
   */
  planGenVersion: PlanGenVersionSchema,
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
  planGenVersion: true,
}).extend({
  description: z.string().max(500).default(""),
});
export type CreateProject = z.infer<typeof CreateProjectSchema>;

export const UpdateProjectSchema = CreateProjectSchema.partial();
export type UpdateProject = z.infer<typeof UpdateProjectSchema>;
