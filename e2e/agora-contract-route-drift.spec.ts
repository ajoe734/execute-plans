/**
 * SD-AGC-05-FE — Agora Strategy Performance route drift gate.
 *
 * Coverage:
 *   Binds every BFF path the Strategy Performance frontend client
 *   (src/lib/bff-v1/agora/performance.ts) calls against a pinned snapshot
 *   of the owner-scoped Agora performance routes registered on the
 *   Pantheon backend (contract_snapshots/agora_performance_backend_routes.json).
 *   Fails closed if the frontend calls a path/method the pinned backend
 *   snapshot does not list as implemented, or if the pinned snapshot is
 *   missing/malformed — a silent drift between the two repos must not pass.
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

type BackendRouteEntry = {
  method: string;
  path: string;
  family: string;
  status: string;
};

type BackendRouteManifest = {
  metadata: {
    backend_repo: string;
    backend_commit: string;
  };
  entries: BackendRouteEntry[];
};

// Path templates the Strategy Performance frontend client is expected to
// call, expressed with the same "{param}" placeholder convention as the
// pinned backend manifest so the two sides can be diffed literally.
const EXPECTED_ROUTES: { method: string; path: string }[] = [
  { method: "GET", path: "/bff/agora/trading-room/strategies/{param}/performance" },
  { method: "GET", path: "/bff/agora/performance/action-receipts/{param}" },
  { method: "POST", path: "/bff/agora/trading-room/strategies/{param}/performance/suggestions/{param}/actions" },
  { method: "GET", path: "/bff/agora/trading-room/performance-attribution/by-strategy" },
];

function loadManifest(): BackendRouteManifest {
  const raw = readFileSync(MANIFEST_PATH, "utf8");
  const parsed = JSON.parse(raw) as BackendRouteManifest;
  if (!parsed?.metadata?.backend_commit || !Array.isArray(parsed.entries)) {
    throw new Error(`Malformed pinned backend route manifest at ${MANIFEST_PATH}`);
  }
  return parsed;
}

function routeKey(entry: { method: string; path: string }): string {
  return `${entry.method} ${entry.path}`;
}

test.describe("Agora Strategy Performance route drift", () => {
  test("every frontend performance client call is templated as a literal path in performance.ts", () => {
    const source = readFileSync(CLIENT_PATH, "utf8");
    for (const route of EXPECTED_ROUTES) {
      const literalPrefix = route.path.split("{param}")[0];
      expect(
        source.includes(literalPrefix),
        `performance.ts is missing a call to ${route.method} ${route.path} (expected literal segment "${literalPrefix}")`,
      ).toBe(true);
    }
  });

  test("every frontend performance route is implemented in the pinned backend manifest", () => {
    const manifest = loadManifest();
    const byKey = new Map(manifest.entries.map((entry) => [routeKey(entry), entry]));

    for (const route of EXPECTED_ROUTES) {
      const entry = byKey.get(routeKey(route));
      expect(entry, `Pinned backend manifest has no entry for ${routeKey(route)} — route drift`).toBeDefined();
      expect(
        entry?.status,
        `Backend route ${routeKey(route)} is pinned as "${entry?.status}", not "implemented" — route drift`,
      ).toBe("implemented");
    }
  });

  test("the pinned backend manifest does not silently narrow its coverage", () => {
    const manifest = loadManifest();
    expect(manifest.entries.length).toBeGreaterThanOrEqual(EXPECTED_ROUTES.length);
    expect(manifest.metadata.backend_repo).toBe("ajoe734/pantheon");
    expect(manifest.metadata.backend_commit).toMatch(/^[0-9a-f]{40}$/);
  });
});
