import { describe, expect, it } from "vitest";
import {
  getUnresolvedVars,
  hasUnresolved,
  resolveDeep,
  resolveRequest,
  resolveString,
  type VariableContext,
} from "../services/variable-engine.js";

describe("resolveString", () => {
  it("should resolve case-level variables", () => {
    const ctx: VariableContext = {
      caseVariables: { userId: "42", name: "Alice" },
    };
    expect(resolveString("/users/{{userId}}", ctx)).toBe("/users/42");
    expect(resolveString("Hello {{name}}!", ctx)).toBe("Hello Alice!");
  });

  it("should resolve environment variables", () => {
    const ctx: VariableContext = {
      envVariables: { baseUrl: "https://api.example.com", token: "abc123" },
    };
    expect(resolveString("{{baseUrl}}/users", ctx)).toBe(
      "https://api.example.com/users",
    );
  });

  it("should respect priority: case > env > builtin", () => {
    const ctx: VariableContext = {
      caseVariables: { key: "from-case" },
      envVariables: { key: "from-env" },
    };
    expect(resolveString("{{key}}", ctx)).toBe("from-case");

    const ctx2: VariableContext = {
      envVariables: { key: "from-env" },
    };
    expect(resolveString("{{key}}", ctx2)).toBe("from-env");
  });

  it("should respect priority: case > env > project > builtin", () => {
    const ctx: VariableContext = {
      caseVariables: { key: "from-case" },
      envVariables: { key: "from-env" },
      projectVariables: { key: "from-project" },
    };
    expect(resolveString("{{key}}", ctx)).toBe("from-case");

    const ctx2: VariableContext = {
      envVariables: { key: "from-env" },
      projectVariables: { key: "from-project" },
    };
    expect(resolveString("{{key}}", ctx2)).toBe("from-env");

    const ctx3: VariableContext = {
      projectVariables: { key: "from-project" },
    };
    expect(resolveString("{{key}}", ctx3)).toBe("from-project");
  });

  it("should resolve project-level variables when env/case don't have it", () => {
    const ctx: VariableContext = {
      caseVariables: { caseOnly: "c1" },
      envVariables: { envOnly: "e1" },
      projectVariables: { projOnly: "p1", shared: "from-project" },
    };
    expect(resolveString("{{projOnly}}", ctx)).toBe("p1");
    expect(resolveString("{{caseOnly}}", ctx)).toBe("c1");
    expect(resolveString("{{envOnly}}", ctx)).toBe("e1");
  });

  it("should resolve built-in {{$timestamp}}", () => {
    const before = Math.floor(Date.now() / 1000);
    const result = resolveString("{{$timestamp}}", {});
    const after = Math.floor(Date.now() / 1000);
    const ts = Number(result);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it("should resolve built-in {{$randomInt}}", () => {
    const result = resolveString("{{$randomInt}}", {});
    const num = Number(result);
    expect(num).toBeGreaterThanOrEqual(0);
    expect(num).toBeLessThan(1000000);
  });

  it("should resolve built-in {{$uuid}} as valid UUID format", () => {
    const result = resolveString("{{$uuid}}", {});
    expect(result).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("should resolve built-in {{$randomUUID}}", () => {
    const result = resolveString("{{$randomUUID}}", {});
    expect(result).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("should resolve built-in {{$date}} as YYYY-MM-DD", () => {
    const result = resolveString("{{$date}}", {});
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("should resolve built-in {{$isoDate}} as ISO string", () => {
    const result = resolveString("{{$isoDate}}", {});
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("should resolve built-in {{$randomEmail}}", () => {
    const result = resolveString("{{$randomEmail}}", {});
    expect(result).toMatch(/^test-[a-f0-9]{8}@nexqa\.local$/);
  });

  it("should resolve {{$env.NAME}} from process.env", () => {
    process.env.TEST_VAR_ENGINE = "hello-from-env";
    const result = resolveString("{{$env.TEST_VAR_ENGINE}}", {});
    expect(result).toBe("hello-from-env");
    delete process.env.TEST_VAR_ENGINE;
  });

  it("should leave {{$env.MISSING}} unresolved if env var not set", () => {
    delete process.env.DEFINITELY_NOT_SET_XYZ;
    const result = resolveString("{{$env.DEFINITELY_NOT_SET_XYZ}}", {});
    expect(result).toBe("{{$env.DEFINITELY_NOT_SET_XYZ}}");
  });

  it("should handle nested/chained references", () => {
    const ctx: VariableContext = {
      envVariables: {
        baseUrl: "https://api.example.com",
        fullPath: "{{baseUrl}}/v2",
      },
    };
    expect(resolveString("{{fullPath}}/users", ctx)).toBe(
      "https://api.example.com/v2/users",
    );
  });

  it("should leave unresolved variables as-is", () => {
    const result = resolveString("{{missing}}/test", {});
    expect(result).toBe("{{missing}}/test");
  });

  it("should resolve multiple variables in one string", () => {
    const ctx: VariableContext = {
      envVariables: { host: "api.com", version: "v3" },
    };
    expect(resolveString("https://{{host}}/{{version}}/users", ctx)).toBe(
      "https://api.com/v3/users",
    );
  });

  it("should handle spaces around variable names", () => {
    const ctx: VariableContext = {
      caseVariables: { userId: "42" },
    };
    expect(resolveString("{{ userId }}", ctx)).toBe("42");
    expect(resolveString("{{  userId  }}", ctx)).toBe("42");
  });

  it("should not resolve when there are no placeholders", () => {
    expect(resolveString("just a plain string", {})).toBe(
      "just a plain string",
    );
  });
});

describe("resolveDeep", () => {
  it("should resolve strings inside objects", () => {
    const ctx: VariableContext = {
      envVariables: { token: "abc123" },
    };
    const result = resolveDeep(
      {
        Authorization: "Bearer {{token}}",
        plain: "no-vars",
        count: 42,
      },
      ctx,
    );
    expect(result).toEqual({
      Authorization: "Bearer abc123",
      plain: "no-vars",
      count: 42,
    });
  });

  it("should resolve strings inside arrays", () => {
    const ctx: VariableContext = {
      caseVariables: { id: "99" },
    };
    const result = resolveDeep(["{{id}}", "static", 123], ctx);
    expect(result).toEqual(["99", "static", 123]);
  });

  it("should resolve nested objects deeply", () => {
    const ctx: VariableContext = {
      envVariables: { name: "Alice", role: "admin" },
    };
    const result = resolveDeep(
      {
        user: {
          name: "{{name}}",
          permissions: {
            role: "{{role}}",
          },
        },
      },
      ctx,
    );
    expect(result).toEqual({
      user: {
        name: "Alice",
        permissions: { role: "admin" },
      },
    });
  });

  it("should pass through null, undefined, booleans, numbers", () => {
    const ctx: VariableContext = {};
    expect(resolveDeep(null, ctx)).toBeNull();
    expect(resolveDeep(undefined, ctx)).toBeUndefined();
    expect(resolveDeep(true, ctx)).toBe(true);
    expect(resolveDeep(42, ctx)).toBe(42);
  });
});

describe("hasUnresolved", () => {
  it("should detect unresolved variables", () => {
    expect(hasUnresolved("{{missing}}")).toBe(true);
    expect(hasUnresolved("no vars here")).toBe(false);
    expect(hasUnresolved("already resolved value")).toBe(false);
  });
});

describe("getUnresolvedVars", () => {
  it("should extract unresolved variable names", () => {
    const vars = getUnresolvedVars("{{foo}}/{{bar}}/test");
    expect(vars).toEqual(["foo", "bar"]);
  });

  it("should return empty array for no variables", () => {
    expect(getUnresolvedVars("no vars")).toEqual([]);
  });
});

describe("resolveRequest", () => {
  it("should resolve path, headers, query, and body", () => {
    const ctx: VariableContext = {
      envVariables: {
        baseUrl: "https://api.example.com",
        token: "bearer-xyz",
        userId: "42",
      },
    };
    const result = resolveRequest(
      {
        method: "POST",
        path: "{{baseUrl}}/users/{{userId}}",
        headers: { Authorization: "{{token}}" },
        query: { user: "{{userId}}" },
        body: { name: "test", ref: "{{userId}}" },
        timeout: 5000,
      },
      ctx,
    );

    expect(result.path).toBe("https://api.example.com/users/42");
    expect(result.headers.Authorization).toBe("bearer-xyz");
    expect(result.query.user).toBe("42");
    expect((result.body as Record<string, unknown>).ref).toBe("42");
    expect(result.method).toBe("POST");
    expect(result.timeout).toBe(5000);
  });

  it("should handle request with no body", () => {
    const result = resolveRequest(
      {
        method: "GET",
        path: "/health",
        headers: {},
        query: {},
      },
      {},
    );
    expect(result.body).toBeUndefined();
    expect(result.path).toBe("/health");
  });
});
