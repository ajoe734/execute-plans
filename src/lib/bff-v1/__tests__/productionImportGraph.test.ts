// ACG-FE-DEPGRAPH-20260828 — production import graph gate.
//
// Guards two failure modes discovered in the bff-v1 module graph:
//   1. Strongly-connected components (import cycles) among production
//      modules — including type-only edges, since both runtime and
//      `import type` cycles confuse bundlers/tsc project references and
//      make the module graph impossible to reason about incrementally.
//   2. "Self-barrel" imports: a module inside src/lib/bff-v1 pulling its
//      own dependencies back in through the package's own `@/lib/bff-v1`
//      barrel (index.ts) instead of importing the concrete file directly.
//      That pattern trivially creates a cycle through index.ts for any
//      module index.ts re-exports.
//
// This test statically parses `import ... from "..."` specifiers (comments
// stripped) across production .ts/.tsx files under src/lib/bff-v1 (excluding
// __tests__ and mocks fixtures) and asserts the resulting directed graph is
// acyclic, with no self-barrel edges.

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const BFF_V1_ROOT = path.join(process.cwd(), "src/lib/bff-v1");

function collectProductionFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "__tests__" || entry.name === "mocks") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectProductionFiles(full));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    if (/\.test\.(ts|tsx)$/.test(entry.name)) continue;
    out.push(full);
  }
  return out;
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

const IMPORT_RE = /from\s+["']([^"']+)["']/g;

function resolveSpecifier(fromFile: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith(".")) {
    base = path.normalize(path.join(path.dirname(fromFile), specifier));
  } else if (specifier === "@/lib/bff-v1" || specifier.startsWith("@/lib/bff-v1/")) {
    const rest = specifier.slice("@/lib/bff-v1".length);
    base = path.normalize(path.join(BFF_V1_ROOT, `.${rest}`));
  } else {
    return null;
  }
  const candidates = [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")];
  return candidates.find((c) => fs.existsSync(c) && fs.statSync(c).isFile()) ?? null;
}

function buildGraph(files: string[]): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();
  for (const file of files) {
    const source = stripComments(fs.readFileSync(file, "utf8"));
    const deps = new Set<string>();
    for (const match of source.matchAll(IMPORT_RE)) {
      const specifier = match[1];
      if (!specifier.startsWith(".") && !specifier.startsWith("@/lib/bff-v1")) continue;
      const resolved = resolveSpecifier(file, specifier);
      if (resolved && resolved !== file) deps.add(resolved);
    }
    graph.set(file, deps);
  }
  return graph;
}

function findCycles(graph: Map<string, Set<string>>): string[][] {
  const state = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  const cycles: string[][] = [];

  function visit(node: string) {
    state.set(node, 1);
    stack.push(node);
    for (const dep of graph.get(node) ?? []) {
      const depState = state.get(dep);
      if (depState === undefined) {
        visit(dep);
      } else if (depState === 1) {
        const idx = stack.indexOf(dep);
        cycles.push([...stack.slice(idx), dep]);
      }
    }
    stack.pop();
    state.set(node, 2);
  }

  for (const node of graph.keys()) {
    if (!state.has(node)) visit(node);
  }
  return cycles;
}

function relPath(p: string): string {
  return path.relative(process.cwd(), p);
}

const productionFiles = collectProductionFiles(BFF_V1_ROOT);
const graph = buildGraph(productionFiles);

describe("bff-v1 production import graph gate", () => {
  it("has no import cycles (runtime or type-only) among production modules", () => {
    const cycles = findCycles(graph);
    const rendered = cycles.map((c) => c.map(relPath).join(" -> "));
    expect(rendered, "found cycle(s) in src/lib/bff-v1 production import graph").toEqual([]);
  });

  it("forbids self-barrel imports (a bff-v1 module importing its own @/lib/bff-v1 barrel)", () => {
    const offenders: string[] = [];
    for (const file of productionFiles) {
      if (path.resolve(file) === path.resolve(BFF_V1_ROOT, "index.ts")) continue;
      const source = stripComments(fs.readFileSync(file, "utf8"));
      for (const match of source.matchAll(IMPORT_RE)) {
        const specifier = match[1];
        if (specifier === "@/lib/bff-v1") {
          offenders.push(relPath(file));
          break;
        }
      }
    }
    expect(offenders, "modules importing the bff-v1 barrel from within bff-v1 itself").toEqual([]);
  });

  it("sanity-checks the graph builder actually walked the bff-v1 module set", () => {
    expect(productionFiles.length).toBeGreaterThan(20);
    expect(graph.has(path.join(BFF_V1_ROOT, "index.ts"))).toBe(true);
  });
});
