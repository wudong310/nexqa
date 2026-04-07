import { describe, expect, it } from "vitest";
import { normaliseTags } from "../routes/test-cases.js";

describe("normaliseTags", () => {
  // ── Structured format (already correct) ──────────────

  it("should pass through valid structured tags unchanged", () => {
    const input = {
      purpose: ["functional"],
      strategy: ["negative"],
      phase: ["full"],
      priority: "P0",
    };
    const result = normaliseTags(input);
    expect(result.strategy).toEqual(["negative"]);
    expect(result.priority).toBe("P0");
  });

  it("should apply defaults for partial structured tags", () => {
    const result = normaliseTags({});
    expect(result.purpose).toEqual(["functional"]);
    expect(result.strategy).toEqual(["positive"]);
    expect(result.phase).toEqual(["full"]);
    expect(result.priority).toBe("P1");
  });

  // ── Array input (no longer supported — returns defaults) ─

  it("should return defaults for array input (legacy format removed)", () => {
    const result = normaliseTags(["冒烟", "正向"]);
    expect(result.purpose).toEqual(["functional"]);
    expect(result.strategy).toEqual(["positive"]);
    expect(result.phase).toEqual(["full"]);
    expect(result.priority).toBe("P1");
  });

  // ── Simplified API format { type, priority, labels } ─

  it("should map type: 'negative' → strategy: ['negative']", () => {
    const result = normaliseTags({
      priority: "P0",
      type: "negative",
      labels: [],
    });
    expect(result.strategy).toEqual(["negative"]);
    expect(result.priority).toBe("P0");
  });

  it("should map type: 'boundary' → strategy: ['boundary']", () => {
    const result = normaliseTags({
      priority: "P1",
      type: "boundary",
      labels: [],
    });
    expect(result.strategy).toEqual(["boundary"]);
    expect(result.priority).toBe("P1");
  });

  it("should map type: 'positive' → strategy: ['positive']", () => {
    const result = normaliseTags({
      priority: "P2",
      type: "positive",
      labels: [],
    });
    expect(result.strategy).toEqual(["positive"]);
    expect(result.priority).toBe("P2");
  });

  it("should map type: 'destructive' → strategy: ['destructive']", () => {
    const result = normaliseTags({
      type: "destructive",
    });
    expect(result.strategy).toEqual(["destructive"]);
  });

  it("should handle simplified format with only type field", () => {
    const result = normaliseTags({ type: "negative" });
    expect(result.strategy).toEqual(["negative"]);
    // Defaults for other fields
    expect(result.purpose).toEqual(["functional"]);
    expect(result.phase).toEqual(["full"]);
    expect(result.priority).toBe("P1");
  });

  it("should handle simplified format with unknown type gracefully", () => {
    const result = normaliseTags({ type: "unknown-type" });
    // Falls back to defaults since unknown type can't be mapped
    expect(result.strategy).toEqual(["positive"]);
    expect(result.purpose).toEqual(["functional"]);
  });

  // ── Edge cases ───────────────────────────────────────

  it("should return defaults for null input", () => {
    const result = normaliseTags(null);
    expect(result.strategy).toEqual(["positive"]);
    expect(result.purpose).toEqual(["functional"]);
  });

  it("should return defaults for undefined input", () => {
    const result = normaliseTags(undefined);
    expect(result.strategy).toEqual(["positive"]);
    expect(result.purpose).toEqual(["functional"]);
  });

  it("should return defaults for number input", () => {
    const result = normaliseTags(42);
    expect(result.strategy).toEqual(["positive"]);
  });

  it("should prefer explicit strategy over type mapping", () => {
    // If both strategy and type are present, strategy field takes precedence via safeParse
    const result = normaliseTags({
      strategy: ["boundary"],
      type: "negative",
      priority: "P0",
    });
    expect(result.strategy).toEqual(["boundary"]);
    expect(result.priority).toBe("P0");
  });
});
