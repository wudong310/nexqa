#!/usr/bin/env tsx
/**
 * NexQA Data Validator
 *
 * Scans ~/Datas/api-test/ and validates every JSON file against
 * the expected schema for each collection.
 *
 * Usage:
 *   tsx scripts/validate-data.ts          # validate only
 *   tsx scripts/validate-data.ts --fix    # validate + auto-fix simple issues
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// ─── Config ──────────────────────────────────────────────────────────

const DATA_DIR = path.join(os.homedir(), "Datas", "api-test");
const FIX_MODE = process.argv.includes("--fix");

// ─── Schema definitions ─────────────────────────────────────────────

interface FieldDef {
  name: string;
  type: "string" | "number" | "boolean" | "object" | "array";
  optional?: boolean;
  /** For string fields: validate as ISO datetime */
  datetime?: boolean;
  /** For string fields: validate as UUID */
  uuid?: boolean;
  /** Nullable field */
  nullable?: boolean;
}

interface CollectionSchema {
  collection: string;
  fields: FieldDef[];
  /** Foreign-key references: fieldName → collection */
  refs?: Record<string, string>;
}

const SCHEMAS: CollectionSchema[] = [
  {
    collection: "projects",
    fields: [
      { name: "id", type: "string", uuid: true },
      { name: "name", type: "string" },
      { name: "baseURL", type: "string" },
      { name: "createdAt", type: "string", datetime: true },
      { name: "updatedAt", type: "string", datetime: true },
    ],
  },
  {
    collection: "environments",
    fields: [
      { name: "id", type: "string", uuid: true },
      { name: "projectId", type: "string", uuid: true },
      { name: "name", type: "string" },
      { name: "slug", type: "string" },
      { name: "baseURL", type: "string" },
      { name: "createdAt", type: "string", datetime: true },
      { name: "updatedAt", type: "string", datetime: true },
    ],
    refs: { projectId: "projects" },
  },
  {
    collection: "api-endpoints",
    fields: [
      { name: "id", type: "string", uuid: true },
      { name: "projectId", type: "string", uuid: true },
      { name: "method", type: "string" },
      { name: "path", type: "string" },
      { name: "createdAt", type: "string", datetime: true },
      { name: "updatedAt", type: "string", datetime: true },
    ],
    refs: { projectId: "projects" },
  },
  {
    collection: "test-cases",
    fields: [
      { name: "id", type: "string", uuid: true },
      { name: "endpointId", type: "string", uuid: true },
      { name: "name", type: "string" },
      { name: "request", type: "object" },
      { name: "expected", type: "object" },
      { name: "createdAt", type: "string", datetime: true },
      { name: "updatedAt", type: "string", datetime: true },
    ],
    refs: { endpointId: "api-endpoints" },
  },
  {
    collection: "batch-runs",
    fields: [
      { name: "id", type: "string", uuid: true },
      { name: "projectId", type: "string", uuid: true },
      { name: "createdAt", type: "string", datetime: true },
    ],
    refs: { projectId: "projects" },
  },
  {
    collection: "test-results",
    fields: [
      { name: "id", type: "string", uuid: true },
      { name: "caseId", type: "string", uuid: true },
      { name: "projectId", type: "string", uuid: true },
      { name: "createdAt", type: "string", datetime: true, optional: true },
      { name: "timestamp", type: "string", datetime: true, optional: true },
    ],
    refs: { caseId: "test-cases", projectId: "projects" },
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidDatetime(s: string): boolean {
  return !Number.isNaN(Date.parse(s));
}

/** Load all IDs for a collection into a Set */
function loadIds(collection: string): Set<string> {
  const dir = path.join(DATA_DIR, collection);
  const ids = new Set<string>();
  if (!fs.existsSync(dir)) return ids;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    ids.add(f.replace(/\.json$/, ""));
  }
  return ids;
}

// ─── Validator ───────────────────────────────────────────────────────

interface Issue {
  file: string;
  collection: string;
  problems: string[];
  fixed: string[];
}

function validate(): void {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║          NexQA Data Validator                   ║");
  console.log(`║  Mode: ${FIX_MODE ? "--fix (auto-repair)" : "validate only"}${"".padEnd(FIX_MODE ? 23 : 25)}║`);
  console.log(`║  Data: ${DATA_DIR.replace(os.homedir(), "~")}${"".padEnd(Math.max(0, 33 - DATA_DIR.replace(os.homedir(), "~").length))}║`);
  console.log("╚══════════════════════════════════════════════════╝\n");

  // Pre-load all ID sets for reference checking
  const idSets: Record<string, Set<string>> = {};
  for (const schema of SCHEMAS) {
    idSets[schema.collection] = loadIds(schema.collection);
  }

  const allIssues: Issue[] = [];
  let totalFiles = 0;
  let totalPassed = 0;
  const stats: Record<string, { total: number; passed: number; failed: number }> = {};

  for (const schema of SCHEMAS) {
    const dir = path.join(DATA_DIR, schema.collection);
    if (!fs.existsSync(dir)) {
      console.log(`⚠️  Collection directory not found: ${schema.collection}/`);
      stats[schema.collection] = { total: 0, passed: 0, failed: 0 };
      continue;
    }

    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
    stats[schema.collection] = { total: files.length, passed: 0, failed: 0 };

    for (const file of files) {
      totalFiles++;
      const filePath = path.join(dir, file);
      const expectedId = file.replace(/\.json$/, "");
      const problems: string[] = [];
      const fixed: string[] = [];

      // 1. Parse JSON
      let data: Record<string, unknown>;
      try {
        const raw = fs.readFileSync(filePath, "utf-8");
        data = JSON.parse(raw);
      } catch (err) {
        problems.push(`JSON parse error: ${(err as Error).message}`);
        allIssues.push({ file: `${schema.collection}/${file}`, collection: schema.collection, problems, fixed });
        stats[schema.collection].failed++;
        continue;
      }

      // 2. id vs filename
      if (data.id !== expectedId) {
        if (FIX_MODE) {
          const oldId = data.id;
          data.id = expectedId;
          fixed.push(`id fixed: was "${oldId}" → "${expectedId}"`);
        } else {
          problems.push(`id mismatch: data.id="${data.id}" ≠ filename="${expectedId}"`);
        }
      }

      // 3. Field validation
      const fileStat = fs.statSync(filePath);
      for (const field of schema.fields) {
        const val = data[field.name];

        // Missing field
        if (val === undefined || val === null) {
          if (field.optional) continue;
          if (field.nullable && val === null) continue;

          // Auto-fix timestamps
          if (
            FIX_MODE &&
            field.datetime &&
            (field.name === "createdAt" || field.name === "updatedAt")
          ) {
            data[field.name] = fileStat.mtime.toISOString();
            fixed.push(`${field.name} set from file mtime`);
            continue;
          }

          problems.push(`missing required field: ${field.name}`);
          continue;
        }

        // Type check
        const actualType = Array.isArray(val) ? "array" : typeof val;
        if (actualType !== field.type) {
          problems.push(
            `${field.name}: expected type "${field.type}", got "${actualType}"`,
          );
          continue;
        }

        // UUID check
        if (field.uuid && typeof val === "string" && !UUID_RE.test(val)) {
          problems.push(`${field.name}: invalid UUID "${val}"`);
        }

        // Datetime check
        if (field.datetime && typeof val === "string" && !isValidDatetime(val)) {
          problems.push(`${field.name}: invalid datetime "${val}"`);
        }
      }

      // 4. Reference checks
      if (schema.refs) {
        for (const [fieldName, targetCollection] of Object.entries(schema.refs)) {
          const refId = data[fieldName];
          if (typeof refId !== "string") continue;
          const targetIds = idSets[targetCollection];
          if (targetIds && !targetIds.has(refId)) {
            problems.push(
              `${fieldName}: references non-existent ${targetCollection} "${refId}"`,
            );
          }
        }
      }

      // 5. Write fixes
      if (FIX_MODE && fixed.length > 0) {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
      }

      if (problems.length > 0) {
        allIssues.push({
          file: `${schema.collection}/${file}`,
          collection: schema.collection,
          problems,
          fixed,
        });
        stats[schema.collection].failed++;
      } else {
        stats[schema.collection].passed++;
        totalPassed++;
        if (fixed.length > 0) {
          allIssues.push({
            file: `${schema.collection}/${file}`,
            collection: schema.collection,
            problems: [],
            fixed,
          });
        }
      }
    }
  }

  // ─── Report ──────────────────────────────────────────────────────

  console.log("┌──────────────────────────────────────────────────┐");
  console.log("│  Collection Summary                              │");
  console.log("├──────────────────┬───────┬────────┬──────────────┤");
  console.log("│ Collection       │ Total │ Passed │ Failed       │");
  console.log("├──────────────────┼───────┼────────┼──────────────┤");
  for (const [name, s] of Object.entries(stats)) {
    const icon = s.failed > 0 ? "❌" : "✅";
    console.log(
      `│ ${icon} ${name.padEnd(14)} │ ${String(s.total).padStart(5)} │ ${String(s.passed).padStart(6)} │ ${String(s.failed).padStart(12)} │`,
    );
  }
  console.log("├──────────────────┼───────┼────────┼──────────────┤");
  const totalFailed = totalFiles - totalPassed;
  console.log(
    `│ TOTAL            │ ${String(totalFiles).padStart(5)} │ ${String(totalPassed).padStart(6)} │ ${String(totalFailed).padStart(12)} │`,
  );
  console.log("└──────────────────┴───────┴────────┴──────────────┘");
  console.log();

  // Issues detail
  const issuesWithProblems = allIssues.filter((i) => i.problems.length > 0);
  const issuesWithFixes = allIssues.filter((i) => i.fixed.length > 0);

  if (issuesWithProblems.length > 0) {
    console.log(`\n❌ Issues found (${issuesWithProblems.length} files):\n`);
    for (const issue of issuesWithProblems) {
      console.log(`  📄 ${issue.file}`);
      for (const p of issue.problems) {
        console.log(`     ⚠️  ${p}`);
      }
    }
  }

  if (FIX_MODE && issuesWithFixes.length > 0) {
    console.log(`\n🔧 Auto-fixed (${issuesWithFixes.length} files):\n`);
    for (const issue of issuesWithFixes) {
      console.log(`  📄 ${issue.file}`);
      for (const f of issue.fixed) {
        console.log(`     ✅ ${f}`);
      }
    }
  }

  if (issuesWithProblems.length === 0) {
    console.log("\n🎉 All data files are valid!\n");
  }

  // Exit code
  process.exit(issuesWithProblems.length > 0 ? 1 : 0);
}

validate();
