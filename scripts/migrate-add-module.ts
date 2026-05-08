#!/usr/bin/env tsx
/**
 * Migration: Add `module` field to all api-endpoints records.
 *
 * Uses the backend storage service directly.
 *
 * Usage:
 *   cd apps/backend && npx tsx ../../scripts/migrate-add-module.ts            # dry-run
 *   cd apps/backend && npx tsx ../../scripts/migrate-add-module.ts --apply     # actually write
 */

import { storage } from "../apps/backend/src/services/storage.js";

const COLLECTION = "api-endpoints";
const APPLY = process.argv.includes("--apply");

interface ApiEndpointRecord {
  id: string;
  path: string;
  module?: string;
  [key: string]: unknown;
}

/**
 * 从 API 路径中提取业务模块名。
 * 去掉公共前缀后取第一段路径作为模块名。
 */
function extractModule(path: string): string {
  const stripped = path.replace(/^\/(?:console\/api|nexqa\/api|api)\//, "");
  const firstSegment = stripped.split("/")[0];
  return firstSegment && !firstSegment.startsWith(":")
    ? firstSegment
    : "uncategorized";
}

async function main() {
  console.log(`🔧 Mode: ${APPLY ? "APPLY" : "DRY-RUN (use --apply to write)"}\n`);

  const all = await storage.list<ApiEndpointRecord>(COLLECTION);
  console.log(`Found ${all.length} api-endpoint records.\n`);

  const moduleStats = new Map<string, number>();
  let updated = 0;
  let alreadySet = 0;

  for (const ep of all) {
    const mod = extractModule(ep.path);

    if (ep.module && ep.module !== "uncategorized") {
      alreadySet++;
      moduleStats.set(ep.module, (moduleStats.get(ep.module) || 0) + 1);
      continue;
    }

    ep.module = mod;
    moduleStats.set(mod, (moduleStats.get(mod) || 0) + 1);

    if (APPLY) {
      await storage.write(COLLECTION, ep.id, ep);
    }
    updated++;
  }

  // ── Report ──────────────────────────────────────────

  console.log("Module distribution:");
  const sorted = Array.from(moduleStats.entries()).sort(
    (a, b) => b[1] - a[1],
  );
  for (const [mod, count] of sorted) {
    console.log(`  ${mod.padEnd(30)} ${count}`);
  }

  console.log(`\n📊 Total: ${all.length}`);
  console.log(`  Already set: ${alreadySet}`);
  console.log(`  ${APPLY ? "Updated" : "Would update"}: ${updated}`);

  if (!APPLY && updated > 0) {
    console.log("\n💡 Run with --apply to write changes.");
  }
}

main();
