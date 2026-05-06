import { describe, expect, it } from "vitest";
import {
  parseJsonPath,
  queryJsonPath,
  setJsonPath,
} from "../services/jsonpath.js";

describe("parseJsonPath", () => {
  it("应解析顶层字段 $.field", () => {
    const segments = parseJsonPath("$.id");
    expect(segments).toEqual([{ type: "field", value: "id" }]);
  });

  it("应解析嵌套字段 $.a.b.c", () => {
    const segments = parseJsonPath("$.data.user.id");
    expect(segments).toEqual([
      { type: "field", value: "data" },
      { type: "field", value: "user" },
      { type: "field", value: "id" },
    ]);
  });

  it("应解析数组索引 $.arr[0]", () => {
    const segments = parseJsonPath("$.items[0]");
    expect(segments).toEqual([
      { type: "field", value: "items" },
      { type: "index", value: 0 },
    ]);
  });

  it("应解析数组索引 + 字段 $.arr[0].name", () => {
    const segments = parseJsonPath("$.items[0].name");
    expect(segments).toEqual([
      { type: "field", value: "items" },
      { type: "index", value: 0 },
      { type: "field", value: "name" },
    ]);
  });

  it("应解析通配符 $.arr[*].field", () => {
    const segments = parseJsonPath("$.items[*].name");
    expect(segments).toEqual([
      { type: "field", value: "items" },
      { type: "wildcard", value: "*" },
      { type: "field", value: "name" },
    ]);
  });

  it("应解析纯 $ 为空段", () => {
    const segments = parseJsonPath("$");
    expect(segments).toEqual([]);
  });

  it("应拒绝不以 $ 开头的表达式", () => {
    expect(() => parseJsonPath("field")).toThrow("must start with");
  });

  it("应拒绝未关闭的方括号", () => {
    expect(() => parseJsonPath("$.items[0")).toThrow("unclosed bracket");
  });

  it("应拒绝非整数索引", () => {
    expect(() => parseJsonPath("$.items[-1]")).toThrow("invalid array index");
    expect(() => parseJsonPath("$.items[abc]")).toThrow("invalid array index");
  });
});

describe("queryJsonPath", () => {
  const sampleData = {
    id: "abc-123",
    code: 0,
    data: {
      user: {
        id: 42,
        name: "Alice",
        email: "alice@example.com",
      },
      items: [
        { id: 1, name: "item-a", tags: ["hot"] },
        { id: 2, name: "item-b", tags: ["new"] },
        { id: 3, name: "item-c", tags: ["hot", "new"] },
      ],
    },
    empty: [],
    nested: { deep: { value: true } },
  };

  it("应提取顶层字段 $.id", () => {
    expect(queryJsonPath(sampleData, "$.id")).toBe("abc-123");
  });

  it("应提取顶层数值字段 $.code", () => {
    expect(queryJsonPath(sampleData, "$.code")).toBe(0);
  });

  it("应提取嵌套字段 $.data.user.name", () => {
    expect(queryJsonPath(sampleData, "$.data.user.name")).toBe("Alice");
  });

  it("应提取深层嵌套 $.nested.deep.value", () => {
    expect(queryJsonPath(sampleData, "$.nested.deep.value")).toBe(true);
  });

  it("应提取数组索引 $.data.items[0].name", () => {
    expect(queryJsonPath(sampleData, "$.data.items[0].name")).toBe("item-a");
  });

  it("应提取数组最后一个元素 $.data.items[2]", () => {
    expect(queryJsonPath(sampleData, "$.data.items[2]")).toEqual({
      id: 3,
      name: "item-c",
      tags: ["hot", "new"],
    });
  });

  it("应通配提取 $.data.items[*].name", () => {
    expect(queryJsonPath(sampleData, "$.data.items[*].name")).toEqual([
      "item-a",
      "item-b",
      "item-c",
    ]);
  });

  it("应通配提取 $.data.items[*].id", () => {
    expect(queryJsonPath(sampleData, "$.data.items[*].id")).toEqual([1, 2, 3]);
  });

  it("对不存在的字段返回 undefined", () => {
    expect(queryJsonPath(sampleData, "$.missing")).toBeUndefined();
    expect(queryJsonPath(sampleData, "$.data.missing.deep")).toBeUndefined();
  });

  it("对越界索引返回 undefined", () => {
    expect(queryJsonPath(sampleData, "$.data.items[99]")).toBeUndefined();
  });

  it("对空数组通配返回空数组", () => {
    expect(queryJsonPath(sampleData, "$.empty[*].x")).toEqual([]);
  });

  it("$ 返回整个对象", () => {
    expect(queryJsonPath(sampleData, "$")).toEqual(sampleData);
  });

  it("应处理 null/undefined 输入", () => {
    expect(queryJsonPath(null, "$.field")).toBeUndefined();
    expect(queryJsonPath(undefined, "$.field")).toBeUndefined();
  });

  it("应处理基本类型输入", () => {
    expect(queryJsonPath("hello", "$.length")).toBeUndefined();
    expect(queryJsonPath(42, "$.field")).toBeUndefined();
  });

  it("应对非数组使用 [0] 返回 undefined", () => {
    expect(queryJsonPath(sampleData, "$.id[0]")).toBeUndefined();
  });

  it("应对非数组使用 [*] 返回 undefined", () => {
    expect(queryJsonPath(sampleData, "$.id[*]")).toBeUndefined();
  });
});

describe("setJsonPath", () => {
  it("应设置顶层字段", () => {
    const data: Record<string, unknown> = { id: 1 };
    setJsonPath(data, "$.name", "Alice");
    expect(data.name).toBe("Alice");
  });

  it("应设置嵌套字段（自动创建中间层）", () => {
    const data: Record<string, unknown> = {};
    setJsonPath(data, "$.data.user", { id: 1 });
    expect((data.data as Record<string, unknown>).user).toEqual({ id: 1 });
  });

  it("应覆盖现有值", () => {
    const data = { name: "old" };
    setJsonPath(data, "$.name", "new");
    expect(data.name).toBe("new");
  });

  it("应设置数组索引", () => {
    const data = { items: ["a", "b", "c"] };
    setJsonPath(data, "$.items[1]", "B");
    expect(data.items[1]).toBe("B");
  });

  it("对 null/undefined 输入不应抛错", () => {
    expect(() => setJsonPath(null, "$.field", "value")).not.toThrow();
    expect(() => setJsonPath(undefined, "$.field", "value")).not.toThrow();
  });
});
