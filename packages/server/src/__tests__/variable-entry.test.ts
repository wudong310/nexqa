import { describe, expect, it } from "vitest";
import {
  normalizeVariable,
  normalizeVariables,
  type VariableEntry,
  type VariableValue,
} from "@nexqa/shared";

describe("VariableEntry normalization", () => {
  it("should normalize plain string to VariableEntry", () => {
    const result = normalizeVariable("hello");
    expect(result).toEqual({ value: "hello", secret: false, description: "" });
  });

  it("should pass through VariableEntry objects", () => {
    const entry: VariableEntry = {
      value: "secret-val",
      secret: true,
      description: "My secret",
    };
    const result = normalizeVariable(entry);
    expect(result).toEqual(entry);
  });

  it("should default secret=false and description='' for partial entry", () => {
    const entry = { value: "test" };
    const result = normalizeVariable(entry as VariableValue);
    expect(result.secret).toBe(false);
    expect(result.description).toBe("");
  });

  it("should normalize a record of mixed values", () => {
    const vars: Record<string, VariableValue> = {
      plain: "hello",
      structured: { value: "world", secret: true, description: "desc" },
    };
    const result = normalizeVariables(vars);
    expect(result.plain).toEqual({ value: "hello", secret: false, description: "" });
    expect(result.structured).toEqual({ value: "world", secret: true, description: "desc" });
  });
});
