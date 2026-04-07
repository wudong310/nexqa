import { describe, expect, it } from "vitest";
import { flattenVariables } from "../services/variable-engine.js";
import { encrypt } from "../services/secret-manager.js";

describe("flattenVariables", () => {
  it("should pass through plain string records", () => {
    const result = flattenVariables({ a: "hello", b: "world" });
    expect(result).toEqual({ a: "hello", b: "world" });
  });

  it("should extract value from VariableEntry", () => {
    const result = flattenVariables({
      apiVersion: { value: "v2", secret: false, description: "Version" },
    });
    expect(result).toEqual({ apiVersion: "v2" });
  });

  it("should decrypt encrypted secret values", () => {
    const encrypted = encrypt("my-secret-token");
    const result = flattenVariables({
      token: { value: encrypted, secret: true, description: "Auth token" },
    });
    expect(result.token).toBe("my-secret-token");
  });

  it("should handle mixed plain + structured variables", () => {
    const result = flattenVariables({
      plain: "hello",
      structured: { value: "world", secret: false, description: "" },
    });
    expect(result).toEqual({ plain: "hello", structured: "world" });
  });

  it("should handle undefined input", () => {
    expect(flattenVariables(undefined)).toEqual({});
  });

  it("should handle empty record", () => {
    expect(flattenVariables({})).toEqual({});
  });
});
