import { z } from "zod";

export const LlmProviderSchema = z.enum(["openai-compatible", "anthropic"]);
export type LlmProvider = z.infer<typeof LlmProviderSchema>;

export const LlmConfigSchema = z.object({
  provider: LlmProviderSchema,
  baseURL: z.string().url().optional(),
  apiKey: z.string().min(1),
  model: z.string().min(1),
});
export type LlmConfig = z.infer<typeof LlmConfigSchema>;

export const ThemeSchema = z.enum(["light", "dark", "system"]);
export type Theme = z.infer<typeof ThemeSchema>;

export const StorageConfigSchema = z.object({
  dataDir: z.string().optional(),
  logDir: z.string().optional(),
});
export type StorageConfig = z.infer<typeof StorageConfigSchema>;

export const SettingsSchema = z.object({
  llm: LlmConfigSchema.optional(),
  theme: ThemeSchema.default("system"),
  language: z.enum(["zh-CN", "en"]).default("zh-CN"),
  storage: StorageConfigSchema.optional(),
});
export type Settings = z.infer<typeof SettingsSchema>;
