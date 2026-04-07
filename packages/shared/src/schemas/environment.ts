import { z } from "zod";

/**
 * O5+O6: Variable entry structure — supports secret flag and description.
 * Backward-compatible: plain string values are also accepted.
 */
export const VariableEntrySchema = z.object({
  value: z.string(),
  secret: z.boolean().default(false),
  description: z.string().default(""),
});
export type VariableEntry = z.infer<typeof VariableEntrySchema>;

/** Accepts both plain string (legacy) and VariableEntry object */
export const VariableValueSchema = z.union([z.string(), VariableEntrySchema]);
export type VariableValue = z.infer<typeof VariableValueSchema>;

/** Normalize a variable value to VariableEntry */
export function normalizeVariable(val: VariableValue): VariableEntry {
  if (typeof val === "string") {
    return { value: val, secret: false, description: "" };
  }
  return {
    value: val.value,
    secret: val.secret ?? false,
    description: val.description ?? "",
  };
}

/** Normalize all variables in a record */
export function normalizeVariables(
  vars: Record<string, VariableValue>,
): Record<string, VariableEntry> {
  const result: Record<string, VariableEntry> = {};
  for (const [k, v] of Object.entries(vars)) {
    result[k] = normalizeVariable(v);
  }
  return result;
}

export const EnvironmentSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  name: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, "slug must be lowercase alphanumeric with hyphens"),
  baseURL: z.string().url(),
  headers: z.record(z.string(), z.string()).default({}),
  variables: z.record(z.string(), VariableValueSchema).default({}),
  isDefault: z.boolean().default(false),
  order: z.number().default(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Environment = z.infer<typeof EnvironmentSchema>;

export const CreateEnvironmentSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, "slug must be lowercase alphanumeric with hyphens"),
  baseURL: z.string().url(),
  headers: z.record(z.string(), z.string()).default({}),
  variables: z.record(z.string(), VariableValueSchema).default({}),
  isDefault: z.boolean().default(false),
});
export type CreateEnvironment = z.infer<typeof CreateEnvironmentSchema>;

export const UpdateEnvironmentSchema = CreateEnvironmentSchema.partial();
export type UpdateEnvironment = z.infer<typeof UpdateEnvironmentSchema>;
