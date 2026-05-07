// scripts/check-i18n.ts — Phase 16.5 i18n lint.
// Usage: bunx tsx scripts/check-i18n.ts
//
// Reports:
//   1. Keys used via t("...") that are missing in either locale dictionary.
//   2. Asymmetric keys present only in en-US or only in zh-TW.
//   3. Heuristic candidates for hard-coded English UI strings inside .tsx
//      (matches >Word Word< style content between JSX tags).
//
// Exit code is 0 — informational only, so CI never blocks unintentionally.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import en from "../src/i18n/locales/en-US";
import zh from "../src/i18n/locales/zh-TW";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (/\.(tsx?|ts)$/.test(f) && !/\.test\.|\.spec\./.test(f)) out.push(p);
  }
  return out;
}

function flatten(obj: any, prefix = "", out: Set<string> = new Set()): Set<string> {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") flatten(v, key, out);
    else out.add(key);
  }
  return out;
}

const enKeys = flatten(en);
const zhKeys = flatten(zh);
const files = walk(ROOT);

const usedKeys = new Set<string>();
const hardCoded: { file: string; line: number; text: string }[] = [];
const T_RE = /\bt\(\s*["'`]([a-zA-Z0-9_.-]+)["'`]/g;
const HARD_RE = />([A-Z][A-Za-z][A-Za-z0-9 ,.'?!:/&-]{3,})</g;

for (const f of files) {
  const src = readFileSync(f, "utf8");
  let m: RegExpExecArray | null;
  while ((m = T_RE.exec(src))) usedKeys.add(m[1]);
  if (/\.tsx$/.test(f)) {
    const lines = src.split("\n");
    lines.forEach((line, i) => {
      let h: RegExpExecArray | null;
      while ((h = HARD_RE.exec(line))) {
        const text = h[1].trim();
        // Skip obvious non-UI strings.
        if (/^[A-Z]{2,}$/.test(text)) continue;
        if (/^(TODO|FIXME|MIT|UTC)$/.test(text)) continue;
        hardCoded.push({ file: relative(ROOT, f), line: i + 1, text });
      }
    });
  }
}

const missing = [...usedKeys].filter((k) => !enKeys.has(k) || !zhKeys.has(k)).sort();
const onlyEn = [...enKeys].filter((k) => !zhKeys.has(k)).sort();
const onlyZh = [...zhKeys].filter((k) => !enKeys.has(k)).sort();

console.log("=== i18n check ===");
console.log(`en-US keys: ${enKeys.size}   zh-TW keys: ${zhKeys.size}`);
console.log(`t() keys referenced: ${usedKeys.size}`);
console.log(`Missing in dictionaries: ${missing.length}`);
missing.slice(0, 50).forEach((k) => console.log("  -", k));
if (missing.length > 50) console.log(`  …(+${missing.length - 50} more)`);
console.log(`Only in en-US: ${onlyEn.length}`);
onlyEn.slice(0, 20).forEach((k) => console.log("  -", k));
console.log(`Only in zh-TW: ${onlyZh.length}`);
onlyZh.slice(0, 20).forEach((k) => console.log("  -", k));

const byFile = new Map<string, number>();
for (const h of hardCoded) byFile.set(h.file, (byFile.get(h.file) ?? 0) + 1);
const top = [...byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
console.log("\n=== Hard-coded English candidates (top files) ===");
top.forEach(([f, n]) => console.log(`  ${n.toString().padStart(3)}  ${f}`));
console.log(`Total candidates: ${hardCoded.length}`);

// === zh-TW values that look untranslated (English-only, no CJK) ===
const ALLOW_EN = new Set([
  "Pantheon","Persona","Sharpe","Alpha","Memo","Token","PnL","VaR","Beta","Hypothesis",
  "Sandbox","Risk","Severity","Backtest","Score","Findings","MCP","BFF","SSE","API",
  "Workspace","Trace","Backtest","Workflow","Schema","Skill","Watchlist","Studios",
  "Postmortem","Runtime","Canary","Shadow","Suspended","Artifact","Model","Dataset",
  "Report","Container","System Prompt",
]);
function flattenWithValues(obj: any, prefix = "", out: Array<[string, string]> = []): Array<[string, string]> {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") flattenWithValues(v, key, out);
    else if (typeof v === "string") out.push([key, v]);
  }
  return out;
}
const CJK = /[\u4e00-\u9fff]/;
const HAS_LATIN = /[A-Za-z]/;
const PLACEHOLDER = /^\{\{[^}]+\}\}$/;
const CODE_LIKE = /^[a-z0-9._\-*|/+\s]+$/; // formula / slug
const zhFlat = flattenWithValues(zh);
const suspect = zhFlat.filter(([k, v]) => {
  if (CJK.test(v)) return false;
  if (!HAS_LATIN.test(v)) return false;
  if (v.length <= 2) return false;
  if (PLACEHOLDER.test(v)) return false;
  if (/\{\{/.test(v)) return false;
  if (CODE_LIKE.test(v) && /[*|.]/.test(v)) return false; // expressions
  if (/^v\d/.test(v)) return false; // versions
  // strip whitespace tokens; allow if every token is in allowlist
  const tokens = v.replace(/[—–\-,/()\[\]]/g, " ").split(/\s+/).filter(Boolean);
  if (tokens.every((t) => ALLOW_EN.has(t) || /^[\d.%]+$/.test(t) || /^Δ/.test(t))) return false;
  return true;
});
console.log(`\n=== zh-TW values that look untranslated: ${suspect.length} ===`);
suspect.slice(0, 40).forEach(([k, v]) => console.log(`  ${k}\t${v}`));

