// scripts/list-hardcoded.ts — print every hard-coded English candidate with file:line
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
const ROOT = join(__dirname, "..", "src");
function walk(dir: string, out: string[] = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f); const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(f) && !/\.test\./.test(f)) out.push(p);
  }
  return out;
}
const HARD_RE = />([A-Z][A-Za-z][A-Za-z0-9 ,.'?!:/&-]{3,})</g;
const filter = process.argv[2];
for (const f of walk(ROOT)) {
  const rel = relative(ROOT, f);
  if (filter && !rel.includes(filter)) continue;
  const lines = readFileSync(f, "utf8").split("\n");
  lines.forEach((line, i) => {
    let m: RegExpExecArray | null;
    while ((m = HARD_RE.exec(line))) {
      const t = m[1].trim();
      if (/^[A-Z]{2,}$/.test(t)) continue;
      console.log(`${rel}:${i+1}  ${t}`);
    }
  });
}
