/**
 * 简版 JSONPath 解析器
 *
 * 支持的表达式：
 * - $.field           — 顶层字段
 * - $.field.nested    — 嵌套字段
 * - $.array[0]        — 数组索引
 * - $.array[*].field  — 数组通配（取所有元素的 field）
 *
 * 用于测试链变量提取。
 */

interface PathSegment {
  type: "field" | "index" | "wildcard";
  value: string | number;
}

/**
 * 解析 JSONPath 表达式为路径段数组
 *
 * 例：
 *   "$.data.id"        → [{ type: "field", value: "data" }, { type: "field", value: "id" }]
 *   "$.items[0].name"  → [{ type: "field", value: "items" }, { type: "index", value: 0 }, { type: "field", value: "name" }]
 *   "$.items[*].name"  → [{ type: "field", value: "items" }, { type: "wildcard", value: "*" }, { type: "field", value: "name" }]
 */
export function parseJsonPath(expression: string): PathSegment[] {
  if (!expression.startsWith("$")) {
    throw new Error(`Invalid JSONPath: must start with "$", got "${expression}"`);
  }

  const segments: PathSegment[] = [];
  let pos = 1; // skip "$"
  const expr = expression;

  while (pos < expr.length) {
    // Skip leading dot
    if (expr[pos] === ".") {
      pos++;
    }

    // Array accessor: [0] or [*]
    if (expr[pos] === "[") {
      const closeBracket = expr.indexOf("]", pos);
      if (closeBracket === -1) {
        throw new Error(`Invalid JSONPath: unclosed bracket in "${expression}"`);
      }
      const inner = expr.slice(pos + 1, closeBracket);
      if (inner === "*") {
        segments.push({ type: "wildcard", value: "*" });
      } else {
        const idx = Number(inner);
        if (!Number.isInteger(idx) || idx < 0) {
          throw new Error(`Invalid JSONPath: invalid array index "${inner}" in "${expression}"`);
        }
        segments.push({ type: "index", value: idx });
      }
      pos = closeBracket + 1;
      continue;
    }

    // Field name: read until ".", "[", or end
    const start = pos;
    while (pos < expr.length && expr[pos] !== "." && expr[pos] !== "[") {
      pos++;
    }
    if (pos > start) {
      segments.push({ type: "field", value: expr.slice(start, pos) });
    }
  }

  return segments;
}

/**
 * 执行 JSONPath 查询
 *
 * @param data - 要查询的 JSON 对象
 * @param expression - JSONPath 表达式
 * @returns 查询结果。对于 [*] 通配返回数组，否则返回单个值。未找到返回 undefined。
 */
export function queryJsonPath(data: unknown, expression: string): unknown {
  const segments = parseJsonPath(expression);

  if (segments.length === 0) {
    return data;
  }

  return walk(data, segments, 0);
}

function walk(current: unknown, segments: PathSegment[], index: number): unknown {
  if (index >= segments.length) {
    return current;
  }

  if (current === null || current === undefined) {
    return undefined;
  }

  const seg = segments[index];

  switch (seg.type) {
    case "field": {
      if (typeof current !== "object" || Array.isArray(current)) {
        return undefined;
      }
      const obj = current as Record<string, unknown>;
      const value = obj[seg.value as string];
      return walk(value, segments, index + 1);
    }

    case "index": {
      if (!Array.isArray(current)) {
        return undefined;
      }
      const arr = current as unknown[];
      const idx = seg.value as number;
      if (idx >= arr.length) {
        return undefined;
      }
      return walk(arr[idx], segments, index + 1);
    }

    case "wildcard": {
      if (!Array.isArray(current)) {
        return undefined;
      }
      const arr = current as unknown[];
      // 如果没有后续段，返回整个数组
      if (index + 1 >= segments.length) {
        return arr;
      }
      // 对数组每个元素继续 walk
      const results: unknown[] = [];
      for (const item of arr) {
        const result = walk(item, segments, index + 1);
        if (result !== undefined) {
          results.push(result);
        }
      }
      return results;
    }

    default:
      return undefined;
  }
}

/**
 * 使用 JSONPath 在 body 中设置值（用于注入器的 body 注入）
 *
 * 只支持简单的字段路径（不支持 [*] 通配设置）
 *
 * @param data - 目标对象（会被修改）
 * @param expression - JSONPath 表达式
 * @param value - 要设置的值
 */
export function setJsonPath(data: unknown, expression: string, value: unknown): void {
  const segments = parseJsonPath(expression);

  if (segments.length === 0) {
    return;
  }

  let current = data;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    if (current === null || current === undefined) return;

    if (seg.type === "field") {
      if (typeof current !== "object" || Array.isArray(current)) return;
      const obj = current as Record<string, unknown>;
      if (obj[seg.value as string] === undefined) {
        obj[seg.value as string] = {};
      }
      current = obj[seg.value as string];
    } else if (seg.type === "index") {
      if (!Array.isArray(current)) return;
      current = (current as unknown[])[seg.value as number];
    } else {
      // wildcard in set path — not supported
      return;
    }
  }

  // Set the final segment
  const last = segments[segments.length - 1];
  if (last.type === "field" && typeof current === "object" && current !== null && !Array.isArray(current)) {
    (current as Record<string, unknown>)[last.value as string] = value;
  } else if (last.type === "index" && Array.isArray(current)) {
    (current as unknown[])[last.value as number] = value;
  }
}
