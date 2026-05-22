#!/usr/bin/env node
/**
 * PM-1 — Management visible-naming guard.
 *
 * Fails when forbidden marketing-metaphor tokens appear in user-visible code
 * paths (src/management, src/i18n, src/agora). Internal symbol names (e.g.
 * `OneRingCockpitPage`, `_core.tsx`, `ringBearerId` field, file names) are
 * NOT flagged — only string literals, JSX text, and i18n values.
 *
 * Usage:  bun scripts/check-management-naming.ts
 *         (or)  node --experimental-strip-types scripts/check-management-naming.ts
 *
 * Exits 1 on violation; 0 on clean.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();

interface Rule { token: RegExp; message: string }

// HARD-FORBIDDEN visible tokens (case-sensitive where they're product-name-like).
const RULES: Rule[] = [
  { token: /One Ring/g, message: 'Visible "One Ring" — use "Pathreon Management Cockpit"' },
  { token: /Ring Bearer/gi, message: 'Visible "Ring Bearer" — use "Persona Owner"' },
  { token: /Ring Persona/gi, message: 'Visible "Ring Persona" — use "AI Persona"' },
  { token: /Sauron/g, message: 'Visible "Sauron" — forbidden' },
  { token: /魔戒/g, message: 'Visible 魔戒 — use "Pathreon Management"' },
  { token: /至尊魔戒/g, message: 'Visible 至尊魔戒 — forbidden' },
];

const SCAN_DIRS = ["src/management", "src/i18n", "src/agora"];

// Files whose CONTENT is allowed to mention the tokens for documentation /
// back-compat reasons. Each entry is a substring match against the file path.
const ALLOWLIST = [
  // The naming guard test itself describes the forbidden tokens.
  "src/lib/v5/management/__tests__",
  // Top-of-file changelog comments may reference the historical IA name.
];

interface Hit { file: string; line: number; col: number; snippet: string; rule: Rule }

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      walk(p, out);
    } else if (/\.(ts|tsx|js|jsx|md)$/.test(entry)) {
      out.push(p);
    }
  }
  return out;
}

function shouldSkip(path: string): boolean {
  const rel = relative(ROOT, path).replace(/\\/g, "/");
  return ALLOWLIST.some((a) => rel.includes(a));
}

function stripCommentLine(line: string): string {
  // Crude single-line // and #-style comment strip (good enough for token scan).
  const cIdx = line.indexOf("//");
  return cIdx >= 0 ? line.slice(0, cIdx) : line;
}

const hits: Hit[] = [];
for (const dir of SCAN_DIRS) {
  const abs = join(ROOT, dir);
  try { statSync(abs); } catch { continue; }
  for (const file of walk(abs)) {
    if (shouldSkip(file)) continue;
    const text = readFileSync(file, "utf8");
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const code = stripCommentLine(lines[i]);
      if (!code.trim()) continue;
      for (const rule of RULES) {
        rule.token.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = rule.token.exec(code)) !== null) {
          hits.push({ file: relative(ROOT, file), line: i + 1, col: m.index + 1, snippet: lines[i].trim(), rule });
        }
      }
    }
  }
}

if (hits.length > 0) {
  console.error(`\n✗ Management naming guard (PM-1): ${hits.length} violation(s).\n`);
  for (const h of hits) {
    console.error(`  ${h.file}:${h.line}:${h.col}  — ${h.rule.message}`);
    console.error(`    ${h.snippet}`);
  }
  console.error("\nFix: replace visible label with Pathreon Management vocabulary, or move text into a `//` comment.\n");
  process.exit(1);
}

console.log("✓ Management naming guard (PM-1): no forbidden visible tokens.");
