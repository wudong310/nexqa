/**
 * check-contract.ts — 前后端 API 契约检查
 *
 * 自动提取前端 api.get/post/put/delete 调用路径 & 后端路由定义，
 * 对比并输出 MATCHED / MISSING IN BACKEND / UNUSED IN FRONTEND。
 *
 * Usage: npx tsx scripts/check-contract.ts
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const WEB_SRC = path.join(ROOT, "packages/web/src");
const SERVER_SRC = path.join(ROOT, "packages/server/src");

// ── Helpers ─────────────────────────────────────────

/** Recursively find files matching extensions */
function walk(dir: string, exts: string[]): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules") {
      results.push(...walk(full, exts));
    } else if (exts.some((ext) => entry.name.endsWith(ext))) {
      results.push(full);
    }
  }
  return results;
}

/** Normalize a path for comparison: strip query params, collapse slashes */
function normalize(p: string): string {
  return p.split("?")[0].replace(/\/+/g, "/").replace(/\/$/, "") || "/";
}

/**
 * Normalize param names so :id, :projectId, :chainId etc.
 * all become :_ for comparison (param naming differs between FE/BE).
 */
function normalizeParams(p: string): string {
  return p.replace(/:[a-zA-Z_]\w*/g, ":_");
}

// ── 1. Extract frontend API paths ──────────────────

interface FrontendCall {
  method: string;
  path: string;
  file: string;
  line: number;
}

function extractFrontendCalls(): FrontendCall[] {
  const files = walk(WEB_SRC, [".ts", ".tsx"]);
  const calls: FrontendCall[] = [];

  for (const file of files) {
    const content = fs.readFileSync(file, "utf-8");
    const lines = content.split("\n");

    // Build a "flattened" version: collapse lines so multi-line api calls
    // become single-line for regex matching. We track original line numbers.
    // Strategy: scan for `api` followed by `.method(` within a small window.

    // Use a global regex on the full content to find all api.method(`path`) calls.
    // The 's' flag makes . match newlines.
    const fullRe =
      /api\s*\.\s*(get|post|put|delete|patch)\s*(?:<[^>]*>)?\s*\(\s*[`"']([^`"']+)[`"']/gs;

    let match: RegExpExecArray | null;
    fullRe.lastIndex = 0;
    while ((match = fullRe.exec(content)) !== null) {
      const method = match[1].toUpperCase();
      let apiPath = match[2];
      // Replace ${...} template vars with :param
      apiPath = apiPath.replace(/\$\{[^}]+\}/g, ":param");
      // Clean up: if the path gets garbled by nested templates,
      // truncate at first space or non-path char
      apiPath = apiPath.replace(/[^a-zA-Z0-9/:._-].*$/, "");
      // Calculate line number from match position
      const lineNum =
        content.substring(0, match.index).split("\n").length;
      calls.push({
        method,
        path: normalize(apiPath),
        file: path.relative(ROOT, file),
        line: lineNum,
      });
    }
  }

  return calls;
}

// ── 2. Extract backend routes ──────────────────────

interface BackendRoute {
  method: string;
  path: string;
  file: string;
  line: number;
}

function extractBackendRoutes(): BackendRoute[] {
  const routes: BackendRoute[] = [];

  // Parse index.ts for app.route() registrations
  const indexPath = path.join(SERVER_SRC, "index.ts");
  const indexContent = fs.readFileSync(indexPath, "utf-8");

  // Match: app.route("/nexqa/api/xxx", xxxRoutes)
  const routeRegex = /app\.route\(\s*"([^"]+)"\s*,\s*(\w+)\s*\)/g;
  // Match: app.get("/nexqa/api/health", ...)
  const inlineRouteRe =
    /app\.(get|post|put|delete|patch)\(\s*"([^"]+)"/g;

  // Collect inline routes (like /nexqa/api/health)
  const indexLines = indexContent.split("\n");
  for (let i = 0; i < indexLines.length; i++) {
    inlineRouteRe.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = inlineRouteRe.exec(indexLines[i])) !== null) {
      const method = m[1].toUpperCase();
      const fullPath = m[2];
      routes.push({
        method,
        path: stripPrefix(fullPath),
        file: path.relative(ROOT, indexPath),
        line: i + 1,
      });
    }
  }

  // Collect route mounts
  interface RouteMountInfo {
    prefix: string;
    varName: string;
  }
  const mounts: RouteMountInfo[] = [];
  let rm: RegExpExecArray | null;
  routeRegex.lastIndex = 0;
  while ((rm = routeRegex.exec(indexContent)) !== null) {
    mounts.push({ prefix: rm[1], varName: rm[2] });
  }

  // Map variable names to import file paths
  const importMap = new Map<string, string>();
  const importRe =
    /import\s*\{([^}]+)\}\s*from\s*["']\.\/routes\/([^"']+)["']/g;
  importRe.lastIndex = 0;
  while ((rm = importRe.exec(indexContent)) !== null) {
    const names = rm[1].split(",").map((n) => n.trim());
    const filePath = rm[2].replace(/\.js$/, ".ts");
    for (const name of names) {
      importMap.set(name, filePath);
    }
  }

  // For each mount, parse the route file
  for (const mount of mounts) {
    const routeFile = importMap.get(mount.varName);
    if (!routeFile) continue;

    const fullFilePath = path.join(SERVER_SRC, "routes", routeFile);
    if (!fs.existsSync(fullFilePath)) continue;

    const content = fs.readFileSync(fullFilePath, "utf-8");
    const fileLines = content.split("\n");

    // Match: .get("/path", ...) or .post("/path", ...)
    const methodRe = /\.(get|post|put|delete|patch)\(\s*"([^"]+)"/g;

    for (let i = 0; i < fileLines.length; i++) {
      methodRe.lastIndex = 0;
      let mm: RegExpExecArray | null;
      while ((mm = methodRe.exec(fileLines[i])) !== null) {
        // Skip non-route .get() calls (like Map.get, headers.get, etc.)
        const beforeDot = fileLines[i].substring(
          0,
          fileLines[i].indexOf(mm[0]),
        );
        if (
          beforeDot.match(
            /\b(Map|headers|params|formData|res|searchParams|url|existingMap|contentType)\s*$/,
          )
        ) {
          continue;
        }

        const method = mm[1].toUpperCase();
        const subPath = mm[2];
        const fullPath = mount.prefix + (subPath === "/" ? "" : subPath);
        routes.push({
          method,
          path: stripPrefix(fullPath),
          file: path.relative(ROOT, fullFilePath),
          line: i + 1,
        });
      }
    }
  }

  return routes;
}

/** Strip /nexqa/api prefix (front-end api client already includes it) */
function stripPrefix(p: string): string {
  return normalize(p.replace(/^\/nexqa\/api/, ""));
}

// ── 3. Compare ─────────────────────────────────────

function main() {
  const frontendCalls = extractFrontendCalls();
  const backendRoutes = extractBackendRoutes();

  // Deduplicate frontend by method + normalized path
  const frontendSet = new Map<string, FrontendCall[]>();
  for (const call of frontendCalls) {
    const key = `${call.method} ${normalizeParams(call.path)}`;
    if (!frontendSet.has(key)) frontendSet.set(key, []);
    frontendSet.get(key)!.push(call);
  }

  // Deduplicate backend by method + normalized path
  const backendSet = new Map<string, BackendRoute[]>();
  for (const route of backendRoutes) {
    const key = `${route.method} ${normalizeParams(route.path)}`;
    if (!backendSet.has(key)) backendSet.set(key, []);
    backendSet.get(key)!.push(route);
  }

  const matched: string[] = [];
  const missingInBackend: string[] = [];
  const unusedInFrontend: string[] = [];

  // Check frontend → backend
  for (const [key, calls] of frontendSet) {
    if (backendSet.has(key)) {
      matched.push(key);
    } else {
      const locations = calls
        .map((c) => `    ${c.file}:${c.line}`)
        .join("\n");
      missingInBackend.push(`${key}\n${locations}`);
    }
  }

  // Check backend → frontend
  for (const [key, routes] of backendSet) {
    if (!frontendSet.has(key)) {
      const locations = routes
        .map((r) => `    ${r.file}:${r.line}`)
        .join("\n");
      unusedInFrontend.push(`${key}\n${locations}`);
    }
  }

  // ── Output ──────────────────────────────────────

  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║      NexQA — 前后端 API 契约检查                    ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  console.log(`📊 统计: 前端 ${frontendSet.size} 条唯一调用, 后端 ${backendSet.size} 条路由\n`);

  if (matched.length > 0) {
    console.log(`✅ MATCHED (${matched.length})`);
    console.log("─".repeat(50));
    for (const m of matched.sort()) {
      console.log(`  ${m}`);
    }
    console.log();
  }

  if (missingInBackend.length > 0) {
    console.log(`❌ MISSING IN BACKEND (${missingInBackend.length})`);
    console.log("─".repeat(50));
    for (const m of missingInBackend.sort()) {
      console.log(`  ${m}`);
    }
    console.log();
  }

  if (unusedInFrontend.length > 0) {
    console.log(`⚠️  UNUSED IN FRONTEND (${unusedInFrontend.length})`);
    console.log("─".repeat(50));
    for (const m of unusedInFrontend.sort()) {
      console.log(`  ${m}`);
    }
    console.log();
  }

  // Summary
  const total = matched.length + missingInBackend.length + unusedInFrontend.length;
  const score = total > 0 ? Math.round((matched.length / frontendSet.size) * 100) : 100;
  console.log("━".repeat(50));
  console.log(
    `前端覆盖率: ${score}% (${matched.length}/${frontendSet.size} 前端调用有对应后端)`,
  );

  if (missingInBackend.length > 0) {
    process.exit(1);
  }
}

main();
