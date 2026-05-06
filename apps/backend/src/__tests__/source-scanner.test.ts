/**
 * Source Scanner 单元测试
 *
 * 覆盖：
 * - extractJson: 纯 JSON / markdown 代码块 / 带前后缀文本 / 无效 JSON
 * - detectLanguage: 不同扩展名 → 正确语言
 * - isRouteFile: 不同框架的路由文件识别
 */

import { describe, it, expect } from "vitest";
import { extractJson, detectLanguage, isRouteFile } from "../services/source-scanner.js";

// ── extractJson ───────────────────────────────────────────────────────────────

describe("extractJson", () => {
  it("should parse pure JSON array", () => {
    const input = '[{"method":"GET","path":"/api/users"}]';
    const result = extractJson(input);
    expect(result).toEqual([{ method: "GET", path: "/api/users" }]);
  });

  it("should parse pure JSON object (wrap in array)", () => {
    const input = '{"method":"POST","path":"/api/items"}';
    const result = extractJson(input);
    expect(result).toEqual([{ method: "POST", path: "/api/items" }]);
  });

  it("should extract JSON from markdown code block (```json)", () => {
    const input = `Here are the endpoints:

\`\`\`json
[{"method":"GET","path":"/api/users"},{"method":"POST","path":"/api/users"}]
\`\`\`

That's all.`;
    const result = extractJson(input);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ method: "GET", path: "/api/users" });
    expect(result[1]).toMatchObject({ method: "POST", path: "/api/users" });
  });

  it("should extract JSON from markdown code block (``` without lang)", () => {
    const input = `Here's the result:

\`\`\`
[{"method":"DELETE","path":"/api/items/:id"}]
\`\`\``;
    const result = extractJson(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ method: "DELETE", path: "/api/items/:id" });
  });

  it("should extract JSON from text with prefix and suffix", () => {
    const input = `I found the following endpoints:
[{"method":"PUT","path":"/api/config"}]
Hope this helps!`;
    const result = extractJson(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ method: "PUT", path: "/api/config" });
  });

  it("should extract single object from text with prefix/suffix", () => {
    const input = `Result: {"method":"PATCH","path":"/api/profile"} done.`;
    const result = extractJson(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ method: "PATCH", path: "/api/profile" });
  });

  it("should return empty array for completely invalid input", () => {
    const result = extractJson("This is not JSON at all, no brackets or braces");
    expect(result).toEqual([]);
  });

  it("should return empty array for malformed JSON", () => {
    const result = extractJson("[{invalid json content}]");
    expect(result).toEqual([]);
  });

  it("should handle empty string", () => {
    const result = extractJson("");
    expect(result).toEqual([]);
  });

  it("should handle nested JSON with whitespace", () => {
    const input = `
    [
      {
        "method": "GET",
        "path": "/api/health",
        "summary": "Health check",
        "queryParams": [],
        "pathParams": [],
        "headers": [],
        "body": null,
        "responses": [{"status": 200, "description": "OK"}],
        "confidence": "high"
      }
    ]
    `;
    const result = extractJson(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      method: "GET",
      path: "/api/health",
      summary: "Health check",
    });
  });
});

// ── detectLanguage ────────────────────────────────────────────────────────────

describe("detectLanguage", () => {
  it("should detect TypeScript for .ts files", () => {
    expect(detectLanguage("src/routes/users.ts")).toBe("typescript");
  });

  it("should detect TypeScript for .tsx files", () => {
    expect(detectLanguage("components/App.tsx")).toBe("typescript");
  });

  it("should detect JavaScript for .js files", () => {
    expect(detectLanguage("lib/utils.js")).toBe("javascript");
  });

  it("should detect JavaScript for .jsx files", () => {
    expect(detectLanguage("components/Button.jsx")).toBe("javascript");
  });

  it("should detect Python for .py files", () => {
    expect(detectLanguage("app/routes.py")).toBe("python");
  });

  it("should detect Go for .go files", () => {
    expect(detectLanguage("handlers/user.go")).toBe("go");
  });

  it("should detect Java for .java files", () => {
    expect(detectLanguage("controllers/UserController.java")).toBe("java");
  });

  it("should detect Kotlin for .kt files", () => {
    expect(detectLanguage("api/Routes.kt")).toBe("kotlin");
  });

  it("should detect Rust for .rs files", () => {
    expect(detectLanguage("src/main.rs")).toBe("rust");
  });

  it("should detect Ruby for .rb files", () => {
    expect(detectLanguage("app/controllers/api.rb")).toBe("ruby");
  });

  it("should detect PHP for .php files", () => {
    expect(detectLanguage("routes/web.php")).toBe("php");
  });

  it("should detect C# for .cs files", () => {
    expect(detectLanguage("Controllers/WeatherController.cs")).toBe("csharp");
  });

  it("should detect Swift for .swift files", () => {
    expect(detectLanguage("Sources/App/routes.swift")).toBe("swift");
  });

  it("should return 'text' for unknown extensions", () => {
    expect(detectLanguage("README.md")).toBe("text");
  });

  it("should return 'text' for files without extensions", () => {
    expect(detectLanguage("Dockerfile")).toBe("text");
  });

  it("should handle paths with dots in directories", () => {
    expect(detectLanguage("src/v2.0/routes.ts")).toBe("typescript");
  });
});

// ── isRouteFile ───────────────────────────────────────────────────────────────

describe("isRouteFile", () => {
  // Generic file name patterns
  describe("generic file name patterns", () => {
    it("should recognize 'route' in filename", () => {
      expect(isRouteFile("src/routes/users.ts", "", "hono")).toBe(true);
    });

    it("should recognize 'router' in filename", () => {
      expect(isRouteFile("src/router.ts", "", "express")).toBe(true);
    });

    it("should recognize 'controller' in filename", () => {
      expect(isRouteFile("app/controller/user.java", "", "spring-boot")).toBe(true);
    });

    it("should recognize 'handler' in filename", () => {
      expect(isRouteFile("handlers/api.go", "", "hono")).toBe(true);
    });

    it("should recognize 'endpoint' in filename", () => {
      expect(isRouteFile("src/endpoints/auth.ts", "", "express")).toBe(true);
    });

    it("should recognize 'api' in filename", () => {
      expect(isRouteFile("src/api/v1.ts", "", "hono")).toBe(true);
    });
  });

  // Hono framework
  describe("hono framework detection", () => {
    it("should detect .get( as route indicator", () => {
      const content = `const app = new Hono();\napp.get("/users", handler);`;
      expect(isRouteFile("src/server.ts", content, "hono")).toBe(true);
    });

    it("should detect .post( as route indicator", () => {
      const content = `export const routes = new Hono().post("/items", handler);`;
      expect(isRouteFile("src/server.ts", content, "hono")).toBe(true);
    });

    it("should detect .put( as route indicator", () => {
      const content = `app.put("/config", handler);`;
      expect(isRouteFile("src/server.ts", content, "hono")).toBe(true);
    });

    it("should detect .delete( as route indicator", () => {
      const content = `app.delete("/items/:id", handler);`;
      expect(isRouteFile("src/server.ts", content, "hono")).toBe(true);
    });

    it("should detect .patch( as route indicator", () => {
      const content = `app.patch("/users/:id", handler);`;
      expect(isRouteFile("src/server.ts", content, "hono")).toBe(true);
    });

    it("should detect 'new Hono' as route indicator", () => {
      const content = `const app = new Hono();`;
      expect(isRouteFile("src/server.ts", content, "hono")).toBe(true);
    });

    it("should detect 'app.route' as route indicator", () => {
      const content = `app.route("/api", apiRoutes);`;
      expect(isRouteFile("src/server.ts", content, "hono")).toBe(true);
    });

    it("should reject non-route hono file", () => {
      const content = `export function formatDate(d: Date) { return d.toISOString(); }`;
      expect(isRouteFile("src/utils.ts", content, "hono")).toBe(false);
    });
  });

  // Express framework
  describe("express framework detection", () => {
    it("should detect router.get as route indicator", () => {
      const content = `router.get("/users", controller.list);`;
      expect(isRouteFile("src/server.ts", content, "express")).toBe(true);
    });

    it("should detect router.post as route indicator", () => {
      const content = `router.post("/users", controller.create);`;
      expect(isRouteFile("src/server.ts", content, "express")).toBe(true);
    });

    it("should detect app.get( as route indicator", () => {
      const content = `app.get("/health", (req, res) => res.json({ok: true}));`;
      expect(isRouteFile("src/server.ts", content, "express")).toBe(true);
    });

    it("should detect express.Router as route indicator", () => {
      const content = `const router = express.Router();`;
      expect(isRouteFile("src/server.ts", content, "express")).toBe(true);
    });

    it("should reject non-route express file", () => {
      const content = `export const config = { port: 3000 };`;
      expect(isRouteFile("src/config.ts", content, "express")).toBe(false);
    });
  });

  // Spring Boot framework
  describe("spring-boot framework detection", () => {
    it("should detect @GetMapping as route indicator", () => {
      const content = `@GetMapping("/users")\npublic List<User> list() {}`;
      expect(isRouteFile("src/UserService.java", content, "spring-boot")).toBe(true);
    });

    it("should detect @PostMapping as route indicator", () => {
      const content = `@PostMapping("/users")\npublic User create(@RequestBody User user) {}`;
      expect(isRouteFile("src/UserService.java", content, "spring-boot")).toBe(true);
    });

    it("should detect @PutMapping as route indicator", () => {
      const content = `@PutMapping("/users/{id}")`;
      expect(isRouteFile("src/UserService.java", content, "spring-boot")).toBe(true);
    });

    it("should detect @DeleteMapping as route indicator", () => {
      const content = `@DeleteMapping("/users/{id}")`;
      expect(isRouteFile("src/UserService.java", content, "spring-boot")).toBe(true);
    });

    it("should detect @RequestMapping as route indicator", () => {
      const content = `@RequestMapping("/api/v1")`;
      expect(isRouteFile("src/UserService.java", content, "spring-boot")).toBe(true);
    });

    it("should detect @RestController as route indicator", () => {
      const content = `@RestController\npublic class UserController {}`;
      expect(isRouteFile("src/UserService.java", content, "spring-boot")).toBe(true);
    });

    it("should reject non-route spring boot file", () => {
      const content = `@Service\npublic class UserService { }`;
      expect(isRouteFile("src/UserService.java", content, "spring-boot")).toBe(false);
    });
  });

  // FastAPI framework
  describe("fastapi framework detection", () => {
    it("should detect @app.get as route indicator", () => {
      const content = `@app.get("/users")\nasync def list_users(): ...`;
      expect(isRouteFile("app/main.py", content, "fastapi")).toBe(true);
    });

    it("should detect @app.post as route indicator", () => {
      const content = `@app.post("/users")\nasync def create_user(): ...`;
      expect(isRouteFile("app/main.py", content, "fastapi")).toBe(true);
    });

    it("should detect @router.get as route indicator", () => {
      const content = `@router.get("/items")\nasync def items(): ...`;
      expect(isRouteFile("app/routers/items.py", content, "fastapi")).toBe(true);
    });

    it("should detect APIRouter as route indicator", () => {
      const content = `router = APIRouter(prefix="/api/v1")`;
      expect(isRouteFile("app/main.py", content, "fastapi")).toBe(true);
    });

    it("should reject non-route fastapi file", () => {
      const content = `class UserSchema(BaseModel):\n    name: str`;
      expect(isRouteFile("app/schemas.py", content, "fastapi")).toBe(false);
    });
  });

  // Auto mode (should always return true)
  describe("auto mode (no filtering)", () => {
    it("should return true for any file in auto mode", () => {
      expect(isRouteFile("src/utils.ts", "const x = 1;", "auto")).toBe(true);
    });

    it("should return true for non-route content in auto mode", () => {
      expect(isRouteFile("config.json", "{}", "auto")).toBe(true);
    });
  });
});
