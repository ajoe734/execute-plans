// Pinned-BFF bearer credential hygiene: redaction of credential material from evidence.
// Redacts credential-bearing text (Authorization bearer values, JWT-shaped
// strings, and literal secret values) from evidence files before upload.
import fs from "node:fs";
import path from "node:path";

const JWT = /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g;
const BEARER = /(Bearer\s+)[A-Za-z0-9._~+/=-]{6,}/gi;

export function redactCredentialText(text, literals = []) {
  let out = String(text).replace(BEARER, "$1[REDACTED]").replace(JWT, "[REDACTED-JWT]");
  for (const lit of literals) {
    if (lit && lit.length >= 6) out = out.split(lit).join("[REDACTED]");
  }
  return out;
}

export function redactDirectory(dir, literals = []) {
  let changed = 0;
  const walk = (d) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, ent.name);
      if (ent.isDirectory()) { walk(f); continue; }
      if (!ent.isFile() || !/\.(json|log|txt|md|xml|html|ndjson|jsonl|csv)$/i.test(ent.name)) continue;
      const before = fs.readFileSync(f, "utf8");
      const after = redactCredentialText(before, literals);
      if (after !== before) { fs.writeFileSync(f, after); changed++; }
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return changed;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const literals = [process.env.BFF_AUTH_TOKEN, process.env.PANTHEON_BFF_SMOKE_BEARER_TOKEN];
  for (const dir of process.argv.slice(2)) {
    console.log(`redacted ${redactDirectory(dir, literals)} file(s) in ${dir}`);
  }
}
