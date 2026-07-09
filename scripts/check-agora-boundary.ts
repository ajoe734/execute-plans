#!/usr/bin/env node
/**
 * PM-11 — Agora boundary scan.
 * Fails when Management-only labels leak into Agora user UI.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SCAN_DIR = "src/agora";
const ALLOWLIST = ["src/agora/__tests__"];

const FORBIDDEN: { token: RegExp; message: string }[] = [
  { token: /Pathreon Management/g, message: 'Visible "Pathreon Management" leaked into Agora — keep operator labels in Management' },
  { token: /Governance Queue/g, message: 'Visible "Governance Queue" leaked into Agora' },
  { token: /Runtime Binding/g, message: 'Visible "Runtime Binding" leaked into Agora' },
  { token: /Capital Binding Live/g, message: 'Visible "Capital Binding Live" leaked into Agora' },
  { token: /Operator Gate/g, message: 'Visible "Operator Gate" leaked into Agora' },
  { token: /Artifact State/g, message: 'Visible "Artifact State" leaked into Agora' },
  { token: /Deployment Stage/g, message: 'Visible "Deployment Stage" leaked into Agora' },
  { token: /Strict Publish Audit/g, message: 'Visible "Strict Publish Audit" leaked into Agora' },
  { token: /BFF HA/g, message: 'Visible "BFF HA" leaked into Agora' },
];

let violations = 0;

function walk(dir: string) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = relative(ROOT, full);
    if (ALLOWLIST.some((p) => rel.startsWith(p))) continue;
    const st = statSync(full);
    if (st.isDirectory()) { walk(full); continue; }
    if (!/\.(tsx?|md)$/.test(name)) continue;
    const src = readFileSync(full, "utf8");
    for (const rule of FORBIDDEN) {
      const m = src.match(rule.token);
      if (m) {
        for (const hit of m) {
          console.error(`[agora-boundary] ${rel} :: ${hit} — ${rule.message}`);
          violations += 1;
        }
      }
    }
  }
}

walk(join(ROOT, SCAN_DIR));

if (violations > 0) {
  console.error(`\n${violations} forbidden Management-only token(s) leaked into Agora.`);
  process.exit(1);
}
console.log("[agora-boundary] OK — no Management-only labels leaked into Agora.");
