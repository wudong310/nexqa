import { v4 as uuid } from "uuid";
import { normalizeVariable, type VariableValue } from "@nexqa/shared";
import { decrypt, isEncrypted } from "./secret-manager.js";

/**
 * Variable resolution engine for NexQA.
 *
 * Resolves `{{variableName}}` placeholders in request URL, headers, query, and body.
 *
 * Resolution priority (highest → lowest):
 *   1. Case-level variables (passed per test case)
 *   2. Environment variables (from the selected Environment)
 *   3. Project-level variables (from Project.variables)
 *   4. Built-in variables (`{{$timestamp}}`, `{{$randomInt}}`, etc.)
 *
 * Unresolved variables are left as-is (the caller can flag them).
 */

// ── Built-in variable generators ──────────────────────

type BuiltinGenerator = () => string;

const BUILTIN_GENERATORS: Record<string, BuiltinGenerator> = {
  $timestamp: () => String(Math.floor(Date.now() / 1000)),
  $timestampMs: () => String(Date.now()),
  $randomInt: () => String(Math.floor(Math.random() * 1000000)),
  $uuid: () => uuid(),
  $randomUUID: () => uuid(),
  $date: () => new Date().toISOString().slice(0, 10), // YYYY-MM-DD
  $isoDate: () => new Date().toISOString(),
  $randomEmail: () => `test-${uuid().slice(0, 8)}@nexqa.local`,
};

// ── Core resolution ───────────────────────────────────

/** Variable pattern: {{variableName}} — allows inner spaces around the name */
const VAR_PATTERN = /\{\{\s*([^{}]+?)\s*\}\}/g;

export interface VariableContext {
  /** Per-test-case variables (highest priority) */
  caseVariables?: Record<string, string>;
  /** Environment-level variables (plain string values — already resolved from VariableEntry) */
  envVariables?: Record<string, string>;
  /** Project-level variables (lower priority than env, higher than builtins) */
  projectVariables?: Record<string, string>;
}

/**
 * Resolve a single `{{name}}` reference against the variable stack.
 * Returns the resolved value or `undefined` if unresolved.
 */
function resolveOne(
  name: string,
  ctx: VariableContext,
): string | undefined {
  // 1. Case-level
  if (ctx.caseVariables?.[name] !== undefined) {
    return ctx.caseVariables[name];
  }

  // 2. Environment-level
  if (ctx.envVariables?.[name] !== undefined) {
    return ctx.envVariables[name];
  }

  // 3. Project-level (new: lower than env, higher than builtins)
  if (ctx.projectVariables?.[name] !== undefined) {
    return ctx.projectVariables[name];
  }

  // 4. Built-in: {{$env.NAME}} — reads from process env
  if (name.startsWith("$env.")) {
    const envKey = name.slice(5); // strip "$env."
    return process.env[envKey] ?? undefined;
  }

  // 4. Built-in generators
  if (BUILTIN_GENERATORS[name]) {
    return BUILTIN_GENERATORS[name]();
  }

  return undefined; // unresolved
}

/**
 * Replace all `{{var}}` tokens in a string.
 * Supports nested references: e.g. envVariables = { baseUrl: "https://api.com" }
 * and the string "{{baseUrl}}/users" → "https://api.com/users".
 *
 * Up to 10 passes to resolve chained references (e.g. {{a}} → "{{b}}" → "value").
 */
export function resolveString(input: string, ctx: VariableContext): string {
  if (typeof input !== "string") return String(input);
  let result = input;
  const MAX_PASSES = 10;

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let changed = false;
    result = result.replace(VAR_PATTERN, (match, name: string) => {
      const value = resolveOne(name, ctx);
      if (value !== undefined) {
        changed = true;
        return value;
      }
      return match; // leave unresolved
    });
    if (!changed) break;
  }

  return result;
}

/**
 * Recursively resolve variables in an object/array/string.
 * - Strings: replace `{{var}}` tokens
 * - Objects: recurse into values (keys are NOT resolved)
 * - Arrays: recurse into elements
 * - Other types (number, boolean, null): pass through unchanged
 */
export function resolveDeep(value: unknown, ctx: VariableContext): unknown {
  if (typeof value === "string") {
    return resolveString(value, ctx);
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveDeep(item, ctx));
  }
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = resolveDeep(v, ctx);
    }
    return result;
  }
  return value; // number, boolean, null, undefined
}

/**
 * Check if a string still contains unresolved `{{var}}` tokens.
 */
export function hasUnresolved(input: string): boolean {
  return VAR_PATTERN.test(input);
}

/**
 * Extract all unresolved variable names from a string.
 */
export function getUnresolvedVars(input: string): string[] {
  const vars: string[] = [];
  const regex = /\{\{\s*([^{}]+?)\s*\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(input)) !== null) {
    vars.push(match[1]);
  }
  return vars;
}

/**
 * Resolve all variable placeholders in a test case request.
 * Returns a new request object with all variables resolved.
 */
export function resolveRequest(
  request: {
    method: string;
    path: string;
    headers: Record<string, string>;
    query: Record<string, string>;
    body?: unknown;
    timeout?: number;
  },
  ctx: VariableContext,
): {
  method: string;
  path: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  body?: unknown;
  timeout?: number;
} {
  // Resolve path
  const resolvedPath = resolveString(request.path, ctx);

  // Resolve headers
  const resolvedHeaders: Record<string, string> = {};
  for (const [key, val] of Object.entries(request.headers)) {
    resolvedHeaders[key] = typeof val === "string" ? resolveString(val, ctx) : String(val);
  }

  // Resolve query params
  const resolvedQuery: Record<string, string> = {};
  for (const [key, val] of Object.entries(request.query)) {
    resolvedQuery[key] = typeof val === "string" ? resolveString(val, ctx) : String(val);
  }

  // Resolve body (deep)
  const resolvedBody =
    request.body !== undefined ? resolveDeep(request.body, ctx) : undefined;

  return {
    method: request.method,
    path: resolvedPath,
    headers: resolvedHeaders,
    query: resolvedQuery,
    body: resolvedBody,
    timeout: request.timeout,
  };
}

/**
 * O5: Flatten a Record<string, VariableValue> into Record<string, string>
 * by normalizing VariableEntry and decrypting secret values.
 * This is used when building VariableContext for execution.
 */
export function flattenVariables(
  vars: Record<string, VariableValue> | Record<string, string> | undefined,
): Record<string, string> {
  if (!vars) return {};
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(vars)) {
    if (typeof v === "string") {
      result[k] = v;
    } else {
      const entry = normalizeVariable(v);
      // Decrypt if encrypted
      result[k] = isEncrypted(entry.value) ? decrypt(entry.value) : entry.value;
    }
  }
  return result;
}
