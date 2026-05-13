#!/usr/bin/env bun
/**
 * BFF frontend route manifest extractor.
 *
 * Scans the execute-plans BFF frontend adapter sources and writes a stable JSON
 * manifest that Pantheon can diff against the live backend route table.
 *
 * Usage:
 *   bun scripts/bff_route_manifest_frontend.ts
 *   bun scripts/bff_route_manifest_frontend.ts --dump
 *   bun scripts/bff_route_manifest_frontend.ts --check
 *   bun scripts/bff_route_manifest_frontend.ts --out contract_snapshots/frontend_routes_manifest.json
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import * as ts from "typescript";

type Mode = "live_required" | "mock_only" | "hybrid";

type ManifestEntry = {
  method: string;
  path: string;
  family: string;
  caller_file: string;
  mode: Mode;
};

type Manifest = {
  metadata: {
    snapshot_date: string;
    source: string;
    generator: string;
    total_routes: number;
    source_files: string[];
    path_builder_count: number;
    mode_values: Mode[];
    notes: string[];
  };
  entries: ManifestEntry[];
};

type EvalContext = {
  sourceFile: ts.SourceFile;
  pathBuilders: Map<string, string>;
  objectBuilders: Map<string, Map<string, string>>;
  identifiers: Map<string, string>;
};

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = process.env.EXECUTE_PLANS_ROOT
  ? process.env.EXECUTE_PLANS_ROOT
  : dirname(dirname(__filename));
const SNAPSHOT_PATH = join(REPO_ROOT, "contract_snapshots", "frontend_routes_manifest.json");

const PATHS_FILE = "src/lib/bff-v1/paths.ts";
const MANAGEMENT_CLIENT_FILE = "src/lib/bff/client.ts";
const V5_FILE = "src/lib/bff/v5.ts";
const AGORA_FILE = "src/lib/bff/agora.ts";
const RUN_ACTION_FILE = "src/lib/bff/runAction.ts";
const LIVE_SSE_FILE = "src/lib/bff-v1/sse/liveSse.ts";

const SOURCE_FILES = [
  PATHS_FILE,
  MANAGEMENT_CLIENT_FILE,
  V5_FILE,
  AGORA_FILE,
  RUN_ACTION_FILE,
  LIVE_SSE_FILE,
] as const;

const MODE_VALUES: Mode[] = ["live_required", "mock_only", "hybrid"];

const MANAGEMENT_LIST_PATH_BUILDERS: Record<string, string> = {
  strategies: "strategies",
  personas: "personas",
  capitalPools: "capitalPools",
  rankingFormulas: "rankingFormulas",
  rebalances: "rebalances",
  deployments: "deployments",
  evolution: "evolutionPrograms",
  research: "researchExperiments",
  artifacts: "artifacts",
  tools: "tools",
  mcpServers: "mcpServers",
  mcpTools: "mcpTools",
  skills: "skills",
  channels: "channels",
  jobs: "jobs",
  runtimes: "runtimes",
  alerts: "alerts",
  incidents: "incidents",
  approvals: "approvals",
  audit: "audit",
};

const FAMILY_RULES: Array<[string, string]> = [
  ["/health", "health"],
  ["/healthz", "health"],
  ["/livez", "health"],
  ["/readyz", "health"],
  ["/metrics", "health"],
  ["/docs", "health"],
  ["/redoc", "health"],
  ["/openapi.json", "health"],
  ["/bff/healthz", "health"],
  ["/bff/readyz", "health"],
  ["/bff/capabilities", "health"],
  ["/bff/feature-flags", "health"],
  ["/bff/actions", "final-contract"],
  ["/bff/v1/commands", "final-contract"],
  ["/bff/me", "session-auth-me"],
  ["/bff/auth", "session-auth-me"],
  ["/bff/logout", "session-auth-me"],
  ["/bff/switch-tenant", "session-auth-me"],
  ["/bff/v1/mcp", "mcp-final"],
  ["/bff/mcp-servers", "mcp-final"],
  ["/bff/mcp-tools", "mcp-final"],
  ["/bff/v5/interventions", "v5-interventions"],
  ["/bff/v5/sentinel", "execute-plans-cutover-smoke"],
  ["/bff/v5/loop-runs", "execute-plans-cutover-smoke"],
  ["/bff/v5/execution", "execute-plans-cutover-smoke"],
  ["/bff/v5/control-room", "execute-plans-cutover-smoke"],
  ["/bff/v5", "execute-plans-cutover-smoke"],
  ["/bff/strategies", "strategy-persona"],
  ["/bff/personas", "strategy-persona"],
  ["/bff/search", "strategy-persona"],
  ["/bff/types", "strategy-persona"],
  ["/bff/capital-pools", "capital-ranking-rebalance"],
  ["/bff/ranking-formulas", "capital-ranking-rebalance"],
  ["/bff/ranking", "capital-ranking-rebalance"],
  ["/bff/rebalances", "capital-ranking-rebalance"],
  ["/bff/rankings", "capital-ranking-rebalance"],
  ["/bff/events/stream", "sse-compatibility"],
  ["/bff/sse", "sse-compatibility"],
  ["/bff/realtime", "sse-compatibility"],
  ["/bff/evolution-programs", "evolution-experiment-jobs-events"],
  ["/bff/experiments", "evolution-experiment-jobs-events"],
  ["/bff/research-experiments", "evolution-experiment-jobs-events"],
  ["/bff/jobs", "evolution-experiment-jobs-events"],
  ["/bff/events", "evolution-experiment-jobs-events"],
  ["/bff/artifacts", "evolution-experiment-jobs-events"],
  ["/bff/reviews", "governance-runtime-risk-audit"],
  ["/bff/approvals", "governance-runtime-risk-audit"],
  ["/bff/deployments", "governance-runtime-risk-audit"],
  ["/bff/runtimes", "governance-runtime-risk-audit"],
  ["/bff/risk", "governance-runtime-risk-audit"],
  ["/bff/incidents", "governance-runtime-risk-audit"],
  ["/bff/alerts", "governance-runtime-risk-audit"],
  ["/bff/audit", "governance-runtime-risk-audit"],
  ["/bff/command-confirmations", "governance-runtime-risk-audit"],
  ["/bff/confirm-tokens", "governance-runtime-risk-audit"],
  ["/bff/agora/committee", "agora-extended"],
  ["/bff/agora/persona-lab", "agora-extended"],
  ["/bff/agora/handoffs", "agora-extended"],
  ["/bff/agora/channels", "agora-extended"],
  ["/bff/agora", "agora-core"],
  ["/bff/research/tasks", "agora-core"],
  ["/bff/memory", "agora-core"],
  ["/bff/insights", "agora-core"],
  ["/bff/tools", "tools-mcp-skills"],
  ["/bff/mcp", "tools-mcp-skills"],
  ["/bff/skills", "tools-mcp-skills"],
  ["/bff/channels", "agora-extended"],
  ["/api/v1/stream", "sse-substrate"],
  ["/api/v1/approvals/stream", "sse-substrate"],
  ["/api/v1/agora/ask/stream", "sse-substrate"],
  ["/api/v1/runtime", "sse-substrate"],
  ["/api/v1/incidents/stream", "sse-substrate"],
  ["/api/v1/kill-switch/updates", "sse-substrate"],
  ["/api/v1/internal/sse", "sse-substrate"],
  ["/api/v1/operator", "operator"],
  ["/api/v1", "api-v1"],
];

function sourceFile(relPath: string): ts.SourceFile {
  const absPath = join(REPO_ROOT, relPath);
  const text = readFileSync(absPath, "utf8");
  return ts.createSourceFile(absPath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function pathMatchesPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}{`);
}

function inferFamily(path: string): string {
  for (const [prefix, family] of FAMILY_RULES) {
    if (pathMatchesPrefix(path, prefix)) return family;
  }
  return "unknown";
}

function normalizePath(path: string): string {
  let cleaned = String(path || "").trim().split("?", 1)[0].replace(/\/+$/, "");
  if (!cleaned) cleaned = "/";
  cleaned = cleaned.replace(/\$\{[^}]+\}/g, "{param}");
  return cleaned.replace(/\{[^/{}]+\}/g, "{param}");
}

function entryKey(entry: ManifestEntry): string {
  return `${entry.method} ${entry.path} ${entry.caller_file} ${entry.mode}`;
}

function addEntry(entries: Map<string, ManifestEntry>, entry: Omit<ManifestEntry, "family">): void {
  const normalizedPath = normalizePath(entry.path);
  if (!normalizedPath.startsWith("/")) return;
  const normalized: ManifestEntry = {
    method: entry.method.toUpperCase(),
    path: normalizedPath,
    family: inferFamily(normalizedPath),
    caller_file: entry.caller_file,
    mode: entry.mode,
  };
  entries.set(entryKey(normalized), normalized);
}

function propertyNameText(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return undefined;
}

function isStringLike(node: ts.Node): node is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
}

function unwrapExpression(node: ts.Expression): ts.Expression {
  let current = node;
  while (ts.isParenthesizedExpression(current) || ts.isAsExpression(current) || ts.isSatisfiesExpression(current)) {
    current = current.expression;
  }
  return current;
}

function stringLiteralValue(node: ts.Node | undefined): string | undefined {
  return node && isStringLike(node) ? node.text : undefined;
}

function objectProperty(object: ts.ObjectLiteralExpression, name: string): ts.Expression | undefined {
  for (const prop of object.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    if (propertyNameText(prop.name) === name) return prop.initializer;
  }
  return undefined;
}

function findVariableObject(source: ts.SourceFile, name: string): ts.ObjectLiteralExpression | undefined {
  let found: ts.ObjectLiteralExpression | undefined;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name && node.initializer) {
      const initializer = unwrapExpression(node.initializer);
      if (ts.isObjectLiteralExpression(initializer)) found = initializer;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

function collectStringConstants(source: ts.SourceFile): Map<string, string> {
  const constants = new Map<string, string>();
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      const value = stringLiteralValue(node.initializer);
      if (value !== undefined) constants.set(node.name.text, value);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return constants;
}

function calleeName(node: ts.Expression): string | undefined {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  return undefined;
}

function propertyAccessTarget(node: ts.Expression): { objectName: string; propertyName: string } | undefined {
  if (!ts.isPropertyAccessExpression(node) || !ts.isIdentifier(node.expression)) return undefined;
  return { objectName: node.expression.text, propertyName: node.name.text };
}

function templateSegmentValue(node: ts.Expression, ctx: EvalContext): string {
  return evalPathExpression(node, ctx) ?? "{param}";
}

function evalArrowPath(node: ts.ArrowFunction | ts.FunctionExpression, ctx: EvalContext): string | undefined {
  const identifiers = new Map(ctx.identifiers);
  for (const param of node.parameters) {
    if (ts.isIdentifier(param.name)) identifiers.set(param.name.text, "{param}");
  }
  const nextCtx: EvalContext = { ...ctx, identifiers };
  if (ts.isBlock(node.body)) return undefined;
  return evalPathExpression(node.body, nextCtx);
}

function evalPropertyOrCall(node: ts.PropertyAccessExpression, ctx: EvalContext): string | undefined {
  const target = propertyAccessTarget(node);
  if (!target) return undefined;
  if (target.objectName === "paths") return ctx.pathBuilders.get(target.propertyName);
  return ctx.objectBuilders.get(target.objectName)?.get(target.propertyName);
}

function evalPathExpression(node: ts.Expression, ctx: EvalContext): string | undefined {
  if (isStringLike(node)) return node.text;

  if (ts.isIdentifier(node)) return ctx.identifiers.get(node.text);

  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) {
    return evalPathExpression(node.expression, ctx);
  }

  if (ts.isTemplateExpression(node)) {
    let out = node.head.text;
    for (const span of node.templateSpans) {
      out += templateSegmentValue(span.expression, ctx);
      out += span.literal.text;
    }
    return out;
  }

  if (ts.isNoSubstitutionTemplateLiteral(node)) return node.text;

  if (ts.isPropertyAccessExpression(node)) {
    return evalPropertyOrCall(node, ctx);
  }

  if (ts.isCallExpression(node)) {
    const directName = calleeName(node.expression);
    if (directName === "encodeURIComponent" || directName === "enc") return "{param}";
    if (ts.isPropertyAccessExpression(node.expression)) {
      const path = evalPropertyOrCall(node.expression, ctx);
      if (path) return path;
    }
    return undefined;
  }

  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = evalPathExpression(node.left, ctx);
    const right = evalPathExpression(node.right, ctx);
    if (left !== undefined && right !== undefined) return `${left}${right}`;
  }

  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    return evalArrowPath(node, ctx);
  }

  return undefined;
}

function extractPathBuilders(pathsSource: ts.SourceFile): Map<string, string> {
  const identifiers = collectStringConstants(pathsSource);
  const ctx: EvalContext = {
    sourceFile: pathsSource,
    pathBuilders: new Map(),
    objectBuilders: new Map(),
    identifiers,
  };
  const pathsObject = findVariableObject(pathsSource, "paths");
  if (!pathsObject) throw new Error(`Could not find exported paths object in ${PATHS_FILE}`);

  for (const prop of pathsObject.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const name = propertyNameText(prop.name);
    if (!name) continue;
    const init = prop.initializer;
    if (!ts.isArrowFunction(init) && !ts.isFunctionExpression(init)) continue;
    const path = evalArrowPath(init, ctx);
    if (path) ctx.pathBuilders.set(name, normalizePath(path));
  }
  return ctx.pathBuilders;
}

function extractObjectBuilders(source: ts.SourceFile, name: string, baseCtx: EvalContext): Map<string, string> {
  const result = new Map<string, string>();
  const object = findVariableObject(source, name);
  if (!object) return result;
  const ctx: EvalContext = { ...baseCtx, sourceFile: source };
  for (const prop of object.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const propName = propertyNameText(prop.name);
    if (!propName) continue;
    const init = prop.initializer;
    if (!ts.isArrowFunction(init) && !ts.isFunctionExpression(init)) continue;
    const path = evalArrowPath(init, ctx);
    if (path) result.set(propName, normalizePath(path));
  }
  return result;
}

function collectPathVariables(source: ts.SourceFile, baseCtx: EvalContext): Map<string, string> {
  const vars = new Map<string, string>();
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const ctx: EvalContext = {
        ...baseCtx,
        sourceFile: source,
        identifiers: new Map([...baseCtx.identifiers, ...vars]),
      };
      const path = evalPathExpression(node.initializer, ctx);
      if (path && normalizePath(path).startsWith("/")) vars.set(node.name.text, normalizePath(path));
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return vars;
}

function baseContext(source: ts.SourceFile, pathBuilders: Map<string, string>): EvalContext {
  return {
    sourceFile: source,
    pathBuilders,
    objectBuilders: new Map(),
    identifiers: collectStringConstants(source),
  };
}

function extractStringArray(source: ts.SourceFile, variableName: string): string[] {
  const values: string[] = [];
  const visit = (node: ts.Node): void => {
    if (!ts.isVariableDeclaration(node) || !ts.isIdentifier(node.name) || node.name.text !== variableName) {
      ts.forEachChild(node, visit);
      return;
    }
    const init = node.initializer ? unwrapExpression(node.initializer) : undefined;
    if (!init || !ts.isArrayLiteralExpression(init)) return;
    for (const element of init.elements) {
      const value = stringLiteralValue(element);
      if (value) values.push(value);
    }
  };
  visit(source);
  return values;
}

function collectVariableObjects(source: ts.SourceFile): Map<string, ts.ObjectLiteralExpression> {
  const objects = new Map<string, ts.ObjectLiteralExpression>();
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
      objects.set(node.name.text, node.initializer);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return objects;
}

function extractManagementRoutes(pathBuilders: Map<string, string>, entries: Map<string, ManifestEntry>): void {
  const relPath = MANAGEMENT_CLIENT_FILE;
  const source = sourceFile(relPath);
  const families = extractStringArray(source, "MANAGEMENT_FAMILIES");
  const adapters = collectVariableObjects(source);
  const ctx = baseContext(source, pathBuilders);

  for (const family of families) {
    const listBuilder = MANAGEMENT_LIST_PATH_BUILDERS[family];
    const listPath = listBuilder ? pathBuilders.get(listBuilder) : undefined;
    if (listPath) {
      addEntry(entries, { method: "GET", path: listPath, caller_file: relPath, mode: "hybrid" });
    }

    const adapter = adapters.get(family);
    const getExpr = adapter ? objectProperty(adapter, "get") : undefined;
    if (!getExpr || !ts.isCallExpression(getExpr)) continue;
    if (calleeName(getExpr.expression) !== "liveOrMockDetail") continue;
    const pathArg = getExpr.arguments[0];
    if (!pathArg || !ts.isExpression(pathArg)) continue;
    const detailPath = evalPathExpression(pathArg, ctx);
    if (detailPath) {
      addEntry(entries, { method: "GET", path: detailPath, caller_file: relPath, mode: "hybrid" });
    }
  }
}

function requestObjectRoute(node: ts.CallExpression, ctx: EvalContext): { method: string; path: string } | undefined {
  const req = node.arguments[0];
  if (!req || !ts.isObjectLiteralExpression(req)) return undefined;
  const methodExpr = objectProperty(req, "method");
  const pathExpr = objectProperty(req, "path");
  const method = stringLiteralValue(methodExpr);
  const path = pathExpr && ts.isExpression(pathExpr) ? evalPathExpression(pathExpr, ctx) : undefined;
  if (!method || !path) return undefined;
  return { method, path };
}

function contextForCallerFile(source: ts.SourceFile, pathBuilders: Map<string, string>): EvalContext {
  const ctx = baseContext(source, pathBuilders);
  const livePaths = extractObjectBuilders(source, "livePaths", ctx);
  if (livePaths.size > 0) ctx.objectBuilders.set("livePaths", livePaths);
  const pathVars = collectPathVariables(source, ctx);
  for (const [name, value] of pathVars) ctx.identifiers.set(name, value);
  return ctx;
}

function extractWrapperRoutes(relPath: string, pathBuilders: Map<string, string>, entries: Map<string, ManifestEntry>): void {
  const source = sourceFile(relPath);
  const ctx = contextForCallerFile(source, pathBuilders);
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const name = calleeName(node.expression);
      const mode: Mode | undefined =
        name === "withStrictLiveOrMock" ? "live_required"
        : name === "withLiveOrMock" ? "hybrid"
        : undefined;
      if (mode) {
        const route = requestObjectRoute(node, ctx);
        if (route) addEntry(entries, { ...route, caller_file: relPath, mode });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

function extractSseRoute(pathBuilders: Map<string, string>, entries: Map<string, ManifestEntry>): void {
  const relPath = LIVE_SSE_FILE;
  const source = sourceFile(relPath);
  const ctx = contextForCallerFile(source, pathBuilders);
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && calleeName(node.expression) === "buildSseUrl") {
      const pathArg = node.arguments[0];
      const path = pathArg && ts.isExpression(pathArg) ? evalPathExpression(pathArg, ctx) : undefined;
      if (path) addEntry(entries, { method: "GET", path, caller_file: relPath, mode: "hybrid" });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

function sortEntries(entries: ManifestEntry[]): ManifestEntry[] {
  return [...entries].sort((a, b) =>
    a.family.localeCompare(b.family)
    || a.method.localeCompare(b.method)
    || a.path.localeCompare(b.path)
    || a.caller_file.localeCompare(b.caller_file)
    || a.mode.localeCompare(b.mode)
  );
}

export function buildManifest(): Manifest {
  const pathsSource = sourceFile(PATHS_FILE);
  const pathBuilders = extractPathBuilders(pathsSource);
  const entries = new Map<string, ManifestEntry>();

  extractManagementRoutes(pathBuilders, entries);
  extractWrapperRoutes(V5_FILE, pathBuilders, entries);
  extractWrapperRoutes(AGORA_FILE, pathBuilders, entries);
  extractWrapperRoutes(RUN_ACTION_FILE, pathBuilders, entries);
  extractSseRoute(pathBuilders, entries);

  const sortedEntries = sortEntries([...entries.values()]);
  return {
    metadata: {
      snapshot_date: new Date().toISOString().slice(0, 10),
      source: "execute-plans frontend BFF adapter sources",
      generator: "scripts/bff_route_manifest_frontend.ts",
      total_routes: sortedEntries.length,
      source_files: [...SOURCE_FILES],
      path_builder_count: pathBuilders.size,
      mode_values: MODE_VALUES,
      notes: [
        "Generated from frontend live adapter call sites; runtime behavior is unchanged.",
        "Dynamic path segments are normalized to {param} for backend manifest diffing.",
        "withStrictLiveOrMock call sites are classified as live_required; withLiveOrMock and live SSE are hybrid.",
        "src/lib/bff-v1/paths.ts is scanned as the path-builder registry used to resolve caller expressions.",
      ],
    },
    entries: sortedEntries,
  };
}

function routeKeys(manifest: Manifest): Set<string> {
  return new Set(manifest.entries.map((entry) => `${entry.method} ${entry.path} ${entry.caller_file} ${entry.mode}`));
}

function main(argv: string[]): number {
  const dump = argv.includes("--dump");
  const check = argv.includes("--check");
  const outIndex = argv.indexOf("--out");
  const outPath = outIndex >= 0 ? join(REPO_ROOT, argv[outIndex + 1] ?? "") : SNAPSHOT_PATH;
  if (outIndex >= 0 && !argv[outIndex + 1]) throw new Error("--out requires a path");

  const manifest = buildManifest();
  const text = `${JSON.stringify(manifest, null, 2)}\n`;

  if (dump) {
    process.stdout.write(text);
    return 0;
  }

  if (check) {
    if (!existsSync(outPath)) {
      process.stderr.write(`[check] snapshot not found: ${relative(REPO_ROOT, outPath)}\n`);
      return 1;
    }
    const existing = JSON.parse(readFileSync(outPath, "utf8")) as Manifest;
    const existingKeys = routeKeys(existing);
    const newKeys = routeKeys(manifest);
    const added = [...newKeys].filter((key) => !existingKeys.has(key)).sort();
    const removed = [...existingKeys].filter((key) => !newKeys.has(key)).sort();
    if (added.length > 0 || removed.length > 0) {
      if (added.length > 0) process.stderr.write(`[check] new routes:\n${added.map((key) => `  + ${key}`).join("\n")}\n`);
      if (removed.length > 0) process.stderr.write(`[check] removed routes:\n${removed.map((key) => `  - ${key}`).join("\n")}\n`);
      return 1;
    }
    return 0;
  }

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, text, "utf8");
  process.stdout.write(`wrote ${relative(REPO_ROOT, outPath)} (${manifest.entries.length} routes)\n`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
