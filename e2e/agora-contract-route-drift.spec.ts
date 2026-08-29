/**
 * SD-AGC-05-FE — Agora Strategy Performance route drift gate.
 *
 * Coverage:
 *   Extracts every concrete network request dispatched by the Strategy
 *   Performance frontend client (src/lib/bff-v1/agora/performance.ts) —
 *   both its HTTP method and its full normalized path — and proves them
 *   against the pinned backend route manifest
 *   (contract_snapshots/agora_performance_backend_routes.json).
 *
 *   Fails closed if:
 *   - Any client request in performance.ts calls an unmanifested path or method
 *   - Any backend manifest route is missing from performance.ts
 *   - The suggestion action route disappears, changes method (e.g. POST -> GET),
 *     or alters path segments
 *   - The pinned backend manifest is missing, malformed, or narrowed
 *
 * Runner: static contract check, no browser required.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_PATH = join(REPO_ROOT, "contract_snapshots", "agora_performance_backend_routes.json");
const CLIENT_PATH = join(REPO_ROOT, "src", "lib", "bff-v1", "agora", "performance.ts");

export type BackendRouteEntry = {
  method: string;
  path: string;
  family: string;
  status: string;
};

export type BackendRouteManifest = {
  metadata: {
    snapshot_date: string;
    backend_repo: string;
    backend_commit: string;
    backend_manifest_path: string;
    source_task: string;
    notes?: string[];
  };
  entries: BackendRouteEntry[];
};

export type ConcreteClientRequest = {
  method: string;
  rawPath: string;
  normalizedPath: string;
};

export function loadManifest(): BackendRouteManifest {
  const raw = readFileSync(MANIFEST_PATH, "utf8");
  const parsed = JSON.parse(raw) as BackendRouteManifest;
  if (!parsed?.metadata?.backend_commit || !Array.isArray(parsed.entries)) {
    throw new Error(`Malformed pinned backend route manifest at ${MANIFEST_PATH}`);
  }
  return parsed;
}

export function normalizePathTemplate(rawPath: string): string {
  let p = rawPath.trim();
  if (
    (p.startsWith("`") && p.endsWith("`")) ||
    (p.startsWith('"') && p.endsWith('"')) ||
    (p.startsWith("'") && p.endsWith("'"))
  ) {
    p = p.slice(1, -1);
  }
  // Replace ${...} interpolations (such as ${encodeURIComponent(...)}) with standard {param}
  return p.replace(/\$\{[^}]+\}/g, "{param}");
}

export function extractConcreteRequestsFromSource(source: string): ConcreteClientRequest[] {
  const requests: ConcreteClientRequest[] = [];
  // Match `request<...>( { ... } )` or `request( { ... } )` invocations in performance.ts
  const requestInvocationRegex = /request(?:<[\s\S]*?>)?\s*\(\s*\{([\s\S]*?)\}\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = requestInvocationRegex.exec(source)) !== null) {
    const block = match[1];
    const methodMatch = block.match(/method:\s*["']([A-Z]+)["']/);
    const pathMatch = block.match(/path:\s*([`'"][^`'"]+[`'"])/);
    if (methodMatch && pathMatch) {
      const method = methodMatch[1];
      const rawPath = pathMatch[1].slice(1, -1);
      const normalizedPath = normalizePathTemplate(pathMatch[1]);
      requests.push({
        method,
        rawPath,
        normalizedPath,
      });
    }
  }
  return requests;
}

export function routeKey(entry: { method: string; path: string }): string {
  return `${entry.method.toUpperCase()} ${entry.path}`;
}

test.describe("Agora Strategy Performance route drift gate", () => {
  test("extracts all concrete requests from performance.ts with full normalized path and HTTP method", () => {
    const source = readFileSync(CLIENT_PATH, "utf8");
    const extracted = extractConcreteRequestsFromSource(source);

    // Must extract at least 4 concrete requests
    expect(extracted.length).toBeGreaterThanOrEqual(4);

    // Every extracted request must have a valid HTTP method and full normalized path starting with /bff/agora/
    for (const req of extracted) {
      expect(["GET", "POST", "PUT", "DELETE", "PATCH"]).toContain(req.method);
      expect(req.normalizedPath.startsWith("/bff/agora/")).toBe(true);
      expect(req.normalizedPath).not.toContain("${");
    }

    // Proves that no direct fetch calls bypass request() in performance.ts
    const nonHelperFetchMatches = source
      .split("\n")
      .filter((line, idx) => line.includes("fetch(") && !line.includes("const response = await fetch("));
    expect(
      nonHelperFetchMatches,
      "performance.ts must route all network requests through request() helper",
    ).toHaveLength(0);
  });

  test("proves every concrete client request in performance.ts exists in the pinned backend manifest with exact method and full normalized path", () => {
    const source = readFileSync(CLIENT_PATH, "utf8");
    const extracted = extractConcreteRequestsFromSource(source);
    const manifest = loadManifest();
    const manifestMap = new Map(manifest.entries.map((entry) => [routeKey(entry), entry]));

    for (const req of extracted) {
      const key = `${req.method.toUpperCase()} ${req.normalizedPath}`;
      const entry = manifestMap.get(key);

      expect(
        entry,
        `Concrete frontend request "${key}" from performance.ts has no matching route in pinned backend manifest (method or path mismatch / route drift)`,
      ).toBeDefined();

      expect(
        entry?.status,
        `Backend route "${key}" is marked as "${entry?.status}", not "implemented"`,
      ).toBe("implemented");

      expect(entry?.family).toBe("agora-core");
    }
  });

  test("proves every route in the pinned backend manifest is exercised by a concrete client request in performance.ts", () => {
    const source = readFileSync(CLIENT_PATH, "utf8");
    const extracted = extractConcreteRequestsFromSource(source);
    const clientRouteKeys = new Set(extracted.map((r) => `${r.method.toUpperCase()} ${r.normalizedPath}`));
    const manifest = loadManifest();

    for (const entry of manifest.entries) {
      const key = routeKey(entry);
      expect(
        clientRouteKeys.has(key),
        `Pinned backend manifest route "${key}" is not exercised by any concrete request in performance.ts`,
      ).toBe(true);
    }
  });

  test("proves the suggestion action route is explicitly bound to POST and the full multi-parameter normalized path", () => {
    const source = readFileSync(CLIENT_PATH, "utf8");
    const extracted = extractConcreteRequestsFromSource(source);

    const suggestionActionReq = extracted.find((r) =>
      r.normalizedPath === "/bff/agora/trading-room/strategies/{param}/performance/suggestions/{param}/actions"
    );

    expect(
      suggestionActionReq,
      "performance.ts must contain the concrete suggestion action route with full normalized path '/bff/agora/trading-room/strategies/{param}/performance/suggestions/{param}/actions'",
    ).toBeDefined();

    expect(
      suggestionActionReq?.method,
      "Suggestion action route must use POST method, not GET or another method",
    ).toBe("POST");

    // Verify it contains both strategy and suggestion parameter interpolations
    expect(suggestionActionReq?.rawPath).toContain("strategies/");
    expect(suggestionActionReq?.rawPath).toContain("/performance/suggestions/");
    expect(suggestionActionReq?.rawPath).toContain("/actions");
  });

  test("fails closed if the suggestion action route method is tampered or path segments are truncated", () => {
    const manifest = loadManifest();
    const manifestMap = new Map(manifest.entries.map((entry) => [routeKey(entry), entry]));

    // 1. Method tampering: GET instead of POST
    const tamperedMethodKey = "GET /bff/agora/trading-room/strategies/{param}/performance/suggestions/{param}/actions";
    expect(manifestMap.get(tamperedMethodKey)).toBeUndefined();

    // 2. Truncated path: literal prefix only
    const truncatedPrefixKey = "POST /bff/agora/trading-room/strategies/{param}/performance";
    expect(manifestMap.get(truncatedPrefixKey)).toBeUndefined();

    // 3. Omitted suggestions segment
    const omittedSegmentKey = "POST /bff/agora/trading-room/strategies/{param}/performance/actions";
    expect(manifestMap.get(omittedSegmentKey)).toBeUndefined();
  });

  test("the pinned backend manifest does not silently narrow its coverage and has valid metadata", () => {
    const manifest = loadManifest();
    expect(manifest.entries.length).toBeGreaterThanOrEqual(4);
    expect(manifest.metadata.backend_repo).toBe("ajoe734/pantheon");
    expect(manifest.metadata.backend_commit).toMatch(/^[0-9a-f]{40}$/);
    expect(manifest.metadata.source_task).toBe("AGORA-AGC-05-PERFORMANCE-BFF-20260827");
  });
});
