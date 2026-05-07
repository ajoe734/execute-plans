#!/usr/bin/env bun
/**
 * codemod-bff-v1.ts — repeatable migration to the canonical `@/lib/bff-v1`
 * surface. Replaces legacy import paths and the deprecated `legacy*` aliases
 * with the canonical names, then prints a migration report.
 *
 * Usage:
 *   bun scripts/codemod-bff-v1.ts            # dry-run + report
 *   bun scripts/codemod-bff-v1.ts --write    # apply edits in place
 *   bun scripts/codemod-bff-v1.ts --json     # machine-readable report
 *
 * The codemod is idempotent — running it on a clean tree is a no-op.
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const SRC = join(ROOT, "src");
const WRITE = process.argv.includes("--write");
const JSON_OUT = process.argv.includes("--json");

// ---- Rule table ------------------------------------------------------------
// Each rule is (regex, replacement, label). Order matters; aliases collapse
// before path rewrites so we don't double-touch a line.
type Rule = { re: RegExp; to: string; label: string };

const RULES: Rule[] = [
  // 1) Drop deprecated `legacyXxx as Xxx` import aliases.
  { re: /\blegacyBff as bff\b/g,                       to: "bff",            label: "alias:legacyBff" },
  { re: /\blegacyRunActionSafe as runActionSafe\b/g,   to: "runActionSafe",  label: "alias:legacyRunActionSafe" },
  { re: /\blegacyUseLiveList as useLiveList\b/g,       to: "useLiveList",    label: "alias:legacyUseLiveList" },

  // 2) Bare deprecated identifiers (rare; keep them on the v1 surface).
  { re: /\blegacyBff\b/g,                              to: "bff",            label: "ident:legacyBff" },
  { re: /\blegacyRunActionSafe\b/g,                    to: "runActionSafe",  label: "ident:legacyRunActionSafe" },
  { re: /\blegacyUseLiveList\b/g,                      to: "useLiveList",    label: "ident:legacyUseLiveList" },

  // 3) Legacy import paths that should now resolve via `@/lib/bff-v1`.
  { re: /from\s+["']@\/lib\/bff\/client["']/g,         to: 'from "@/lib/bff-v1"', label: "path:bff/client" },
  { re: /from\s+["']@\/lib\/bff\/runAction["']/g,      to: 'from "@/lib/bff-v1"', label: "path:bff/runAction" },
  { re: /from\s+["']@\/lib\/useLiveList["']/g,         to: 'from "@/lib/bff-v1"', label: "path:useLiveList" },
];

// Files that define / re-export the legacy aliases — never rewrite them.
const SKIP_FILES = new Set<string>([
  join(SRC, "lib/bff-v1/legacy.ts"),
  join(SRC, "lib/bff-v1/seed.ts"),
  join(SRC, "lib/bff-v1/runActionSafe.ts"),
  join(SRC, "lib/bff-v1/useLiveList.ts"),
  join(SRC, "lib/bff-v1/index.ts"),
]);

// ---- Walk ------------------------------------------------------------------
function* walk(dir: string): Generator<string> {
  for (const ent of readdirSync(dir)) {
    const p = join(dir, ent);
    const st = statSync(p);
    if (st.isDirectory()) { yield* walk(p); continue; }
    if (/\.(ts|tsx|js|jsx)$/.test(ent)) yield p;
  }
}

// ---- Apply -----------------------------------------------------------------
type FileReport = { file: string; hits: Record<string, number>; total: number };
const report: FileReport[] = [];
const totals: Record<string, number> = {};

for (const path of walk(SRC)) {
  if (SKIP_FILES.has(path)) continue;
  const original = readFileSync(path, "utf8");
  let next = original;
  const hits: Record<string, number> = {};

  for (const { re, to, label } of RULES) {
    const matches = next.match(re);
    if (!matches) continue;
    hits[label] = (hits[label] ?? 0) + matches.length;
    totals[label] = (totals[label] ?? 0) + matches.length;
    next = next.replace(re, to);
  }

  if (next !== original) {
    const total = Object.values(hits).reduce((a, b) => a + b, 0);
    report.push({ file: relative(ROOT, path), hits, total });
    if (WRITE) writeFileSync(path, next);
  }
}

// ---- Output ----------------------------------------------------------------
if (JSON_OUT) {
  console.log(JSON.stringify({ mode: WRITE ? "write" : "dry-run", totals, files: report }, null, 2));
  process.exit(0);
}

const grandTotal = Object.values(totals).reduce((a, b) => a + b, 0);
console.log(`bff-v1 codemod — ${WRITE ? "WRITE" : "dry-run"}`);
console.log(`scanned: src/**/*.{ts,tsx}`);
console.log(`files affected: ${report.length}`);
console.log(`total replacements: ${grandTotal}`);
if (grandTotal === 0) {
  console.log("\n✓ Nothing to migrate — tree is on canonical bff-v1.");
  process.exit(0);
}

console.log("\nBy rule:");
for (const [label, n] of Object.entries(totals).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${label.padEnd(28)} ${n}`);
}
console.log("\nTop files:");
for (const r of report.sort((a, b) => b.total - a.total).slice(0, 25)) {
  const summary = Object.entries(r.hits).map(([k, v]) => `${k}=${v}`).join(", ");
  console.log(`  ${r.total.toString().padStart(3)}  ${r.file}  (${summary})`);
}
if (!WRITE) {
  console.log("\n(re-run with --write to apply)");
}
