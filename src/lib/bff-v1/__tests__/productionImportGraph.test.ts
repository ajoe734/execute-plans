// ACG-FE-DEPGRAPH-20260828 — production import graph gate.
//
// The graph includes every TypeScript module under src/lib/bff-v1 that can be
// shipped as source, including the mock adapters currently imported by
// client.ts. Tests, generated sources, and build output are deliberately
// excluded. Both runtime and type-only static edges are audited.

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import * as ts from "typescript";

const BFF_V1_ROOT = path.join(process.cwd(), "src/lib/bff-v1");
const EXCLUDED_DIRECTORY_NAMES = new Set([
  "__tests__",
  "tests",
  "test",
  "__generated__",
  "generated",
  "dist",
  "build",
  "coverage",
]);
const SOURCE_EXTENSION_RE = /\.(?:ts|tsx|mts|cts)$/;
const TEST_SOURCE_RE = /\.(?:test|spec)\.(?:ts|tsx|mts|cts)$/;
const GENERATED_SOURCE_RE = /(?:^|[._-])generated\.(?:ts|tsx|mts|cts)$/;

function isProductionSourceFile(file: string): boolean {
  const relative = path.relative(BFF_V1_ROOT, file);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return false;
  const segments = relative.split(path.sep);
  if (segments.slice(0, -1).some((segment) => EXCLUDED_DIRECTORY_NAMES.has(segment))) return false;
  const basename = path.basename(file);
  return (
    SOURCE_EXTENSION_RE.test(basename) &&
    !TEST_SOURCE_RE.test(basename) &&
    !GENERATED_SOURCE_RE.test(basename) &&
    !basename.endsWith(".d.ts")
  );
}

function collectProductionFiles(dir: string): string[] {
  const out: string[] = [];
  const entries = fs
    .readdirSync(dir, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    if (entry.isDirectory() && EXCLUDED_DIRECTORY_NAMES.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectProductionFiles(full));
    } else if (entry.isFile() && isProductionSourceFile(full)) {
      out.push(path.normalize(full));
    }
  }
  return out.sort();
}

function extractModuleSpecifiers(file: string): string[] {
  const source = fs.readFileSync(file, "utf8");
  const scriptKind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind);
  const specifiers: string[] = [];

  function addStringLiteral(node: ts.Expression | undefined): void {
    if (node && ts.isStringLiteralLike(node)) specifiers.push(node.text);
  }

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      addStringLiteral(node.moduleSpecifier);
    } else if (ts.isCallExpression(node) && node.arguments.length === 1) {
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === "require";
      if (isDynamicImport || isRequire) addStringLiteral(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return specifiers;
}

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

  const extensionlessBase = base.replace(/\.(?:js|jsx|mjs|cjs)$/, "");
  const candidates = [
    base,
    extensionlessBase,
    `${extensionlessBase}.ts`,
    `${extensionlessBase}.tsx`,
    `${extensionlessBase}.mts`,
    `${extensionlessBase}.cts`,
    path.join(extensionlessBase, "index.ts"),
    path.join(extensionlessBase, "index.tsx"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) ?? null;
}

function buildGraph(files: string[]): Map<string, Set<string>> {
  const productionFiles = new Set(files.map((file) => path.normalize(file)));
  const graph = new Map<string, Set<string>>();
  for (const file of [...productionFiles].sort()) {
    const dependencies = new Set<string>();
    for (const specifier of extractModuleSpecifiers(file)) {
      if (!specifier.startsWith(".") && !specifier.startsWith("@/lib/bff-v1")) continue;
      const resolved = resolveSpecifier(file, specifier);
      if (resolved && productionFiles.has(path.normalize(resolved))) {
        dependencies.add(path.normalize(resolved));
      }
    }
    graph.set(file, dependencies);
  }
  return graph;
}

function compareCycles(left: string[], right: string[]): number {
  const edgeCount = left.length - right.length;
  if (edgeCount !== 0) return edgeCount;
  return left.join("\u0000").localeCompare(right.join("\u0000"));
}

function shortestCycleFrom(graph: Map<string, Set<string>>, start: string): string[] | null {
  const queue: string[][] = [[start]];
  const shortestDepth = new Map<string, number>([[start, 0]]);

  for (let index = 0; index < queue.length; index += 1) {
    const pathToNode = queue[index];
    const node = pathToNode[pathToNode.length - 1];
    const neighbors = [...(graph.get(node) ?? [])].sort();
    for (const neighbor of neighbors) {
      if (neighbor === start) return [...pathToNode, start];
      if (pathToNode.includes(neighbor)) continue;
      const nextDepth = pathToNode.length;
      const seenDepth = shortestDepth.get(neighbor);
      if (seenDepth !== undefined && seenDepth < nextDepth) continue;
      shortestDepth.set(neighbor, nextDepth);
      queue.push([...pathToNode, neighbor]);
    }
  }
  return null;
}

function findShortestCycle(graph: Map<string, Set<string>>): string[] | null {
  let shortest: string[] | null = null;
  for (const start of [...graph.keys()].sort()) {
    const candidate = shortestCycleFrom(graph, start);
    if (candidate && (!shortest || compareCycles(candidate, shortest) < 0)) shortest = candidate;
  }
  return shortest;
}

function relPath(file: string): string {
  return path.relative(process.cwd(), file);
}

const productionFiles = collectProductionFiles(BFF_V1_ROOT);
const graph = buildGraph(productionFiles);

describe("bff-v1 production import graph gate", () => {
  it("has no import cycles (runtime or type-only) among production modules", () => {
    const cycle = findShortestCycle(graph);
    const rendered = cycle?.map(relPath).join(" -> ") ?? null;
    expect(rendered, "shortest cycle in src/lib/bff-v1 production import graph").toBeNull();
  });

  it("reports the deterministic shortest offending cycle", () => {
    const synthetic = new Map<string, Set<string>>([
      ["a", new Set(["c", "b"])],
      ["b", new Set(["a"])],
      ["c", new Set(["d"])],
      ["d", new Set(["a"])],
    ]);
    expect(findShortestCycle(synthetic)).toEqual(["a", "b", "a"]);
  });

  it("includes shipped mock adapters while excluding tests, generated files, and build output", () => {
    expect(productionFiles).toContain(path.join(BFF_V1_ROOT, "mocks/adapters.ts"));
    expect(productionFiles).toContain(path.join(BFF_V1_ROOT, "mocks/registry.ts"));
    expect(isProductionSourceFile(path.join(BFF_V1_ROOT, "feature.test.ts"))).toBe(false);
    expect(isProductionSourceFile(path.join(BFF_V1_ROOT, "generated/contract.ts"))).toBe(false);
    expect(isProductionSourceFile(path.join(BFF_V1_ROOT, "contract.generated.ts"))).toBe(false);
    expect(isProductionSourceFile(path.join(BFF_V1_ROOT, "dist/client.ts"))).toBe(false);
  });

  it("forbids self-barrel imports from bff-v1 implementation modules", () => {
    const offenders = productionFiles
      .filter((file) => path.resolve(file) !== path.resolve(BFF_V1_ROOT, "index.ts"))
      .filter((file) => extractModuleSpecifiers(file).includes("@/lib/bff-v1"))
      .map(relPath)
      .sort();
    expect(offenders, "modules importing the bff-v1 barrel from within bff-v1 itself").toEqual([]);
  });

  it("walks the public barrel and the complete production module set", () => {
    expect(productionFiles.length).toBeGreaterThan(20);
    expect(graph.has(path.join(BFF_V1_ROOT, "index.ts"))).toBe(true);
  });
});
