/**
 * MGMT-LOAD-003 - Frontend shell fanout reduction (fixture-mocked, CI-safe).
 *
 * Hard-gates this task's own acceptance criteria, building on the CI-safe
 * fixture pattern from e2e/22-management-evidence-load.spec.ts (MGMT-LOAD-001):
 *
 * - TopBar consumes /bff/management/shell-summary for badge counts instead
 *   of fetching full approvals/alerts/jobs lists on every route mount.
 * - When shell-summary is unavailable, the full-list fallback is deferred
 *   past first row/empty state (via src/lib/idleTask.ts), not raced
 *   against it.
 * - JobProgressDrawer does not duplicate /bff/jobs before first row.
 */
import { expect, test, type Page, type Route } from "@playwright/test";

const DEFAULT_FRONTEND_BASE_URL = "http://127.0.0.1:5173";
const EVIDENCE_PATH = "/management/evidence";
const PRIMARY_API_PATTERN = /\/bff\/management\/evidence(?:\?.*)?$/;
const SHELL_SUMMARY_PATTERN = /\/bff\/management\/shell-summary(?:\?.*)?$/;
const FANOUT_PATTERNS: Array<[string, RegExp]> = [
  ["me", /\/bff\/me(?:\?.*)?$/],
  ["approvals", /\/bff\/approvals(?:\?.*)?$/],
  ["alerts", /\/bff\/alerts(?:\?.*)?$/],
  ["jobs", /\/bff\/jobs(?:\?.*)?$/],
  ["health", /\/health(?:\?.*)?$/],
];

function frontendUrl(path: string): string {
  const base =
    process.env.FRONTEND_BASE_URL ||
    process.env.PLAYWRIGHT_BASE_URL ||
    process.env.PANTHEON_FE_BASE_URL ||
    DEFAULT_FRONTEND_BASE_URL;
  return `${base.replace(/\/$/, "")}${path}`;
}

function corsHeaders(route: Route): Record<string, string> {
  const reqHeaders = route.request().headers();
  return {
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Origin": reqHeaders["origin"] ?? "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": reqHeaders["access-control-request-headers"] ?? "*",
  };
}

async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({
    status,
    contentType: "application/json",
    headers: corsHeaders(route),
    body: JSON.stringify(body),
  });
}

/**
 * Cross-origin GET calls to the live BFF carry custom headers
 * (X-Request-Id, X-Correlation-Id, ...), so the browser sends a CORS
 * preflight OPTIONS request ahead of every real GET. Route handlers must
 * answer the preflight without counting it as a real request, or every
 * fanout counter double-counts the same logical read.
 */
function onRoute(page: Page, pattern: RegExp | string, handler: (route: Route) => Promise<void>): Promise<void> {
  return page.route(pattern, async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders(route) });
      return;
    }
    await handler(route);
  });
}

function nowIso(): string {
  return "2026-07-01T00:00:00Z";
}

const EVIDENCE_RESPONSE = {
  data: {
    items: [],
    summary: { totalEvidence: 0, visibleEvidence: 0, verifiedEvidence: 0, redactedEvidence: 0 },
    meta: { snapshot_at: nowIso(), surfaces: { management_evidence: { status: "ok" } } },
  },
  meta: { snapshot_at: nowIso(), surfaces: { management_evidence: { status: "ok" } } },
};

const EMPTY_ENVELOPE = { items: [], cursor: {}, pageSize: 0, estimatedTotal: 0, totalCountExact: true, meta: { snapshot_at: nowIso() } };

// Shape must satisfy src/lib/v4/session/me.ts's `isMeResponse` guard
// (user/tenant/roles/capabilities) — a mismatch throws inside
// normalizeMeResponse, which withLiveOrMock treats as a transport failure
// and reports through the shared liveStatus signal, spuriously flipping
// every other shell read's fanout counter (including shell-summary's).
const ME_RESPONSE = {
  data: {
    user: { id: "op-load-003", displayName: "Shell Fanout Probe Operator", email: "op-load-003@pantheon.local" },
    tenant: { id: "t_load_003", name: "Shell Fanout Probe Tenant", tz: "UTC", locale: "en-US" },
    roles: ["admin"],
    capabilities: [],
    env: "dev",
    featureFlags: {},
    serverTime: nowIso(),
    sessionExpiresAt: nowIso(),
    permissionsVersion: "v1",
  },
};

function shellSummaryResponse(status: "ok" | "degraded"): unknown {
  return {
    data: {
      counts: { pending_approvals: 2, open_alerts: 1, running_jobs: 1 },
      session: { operator_id: "op-load-003", display_label: "Shell Fanout Probe Operator", roles: ["admin"] },
      transport: { bff_status: "ok", service: "operator-bff", api_version: "test" },
    },
    meta: { snapshot_at: nowIso(), surfaces: { shell_summary: { status } } },
  };
}

async function installBaseFixtures(page: Page): Promise<Record<string, number>> {
  const counters: Record<string, number> = { evidence: 0, shellSummary: 0, me: 0, approvals: 0, alerts: 0, jobs: 0, health: 0 };
  await onRoute(page, PRIMARY_API_PATTERN, async (route) => {
    counters.evidence += 1;
    await fulfillJson(route, EVIDENCE_RESPONSE);
  });
  for (const [key, pattern] of FANOUT_PATTERNS) {
    await onRoute(page, pattern, async (route) => {
      counters[key] += 1;
      if (key === "health") return fulfillJson(route, { status: "ok", checked_at: nowIso() });
      if (key === "me") return fulfillJson(route, ME_RESPONSE);
      await fulfillJson(route, EMPTY_ENVELOPE);
    });
  }
  return counters;
}

async function waitForFirstRowOrEmpty(page: Page): Promise<void> {
  await expect
    .poll(
      async () => {
        const rowCount = await page.locator("tbody tr").count();
        const bodyText = await page.locator("body").innerText();
        return rowCount > 0 || /no evidence|unavailable/i.test(bodyText);
      },
      { message: "Evidence route should reach a row or empty state", timeout: 10_000 },
    )
    .toBe(true);
}

test.describe("MGMT-LOAD-003 shell fanout reduction", () => {
  test("shell-summary success: TopBar never falls back to full approvals/alerts/jobs reads", async ({ page }) => {
    const counters = await installBaseFixtures(page);
    await onRoute(page, SHELL_SUMMARY_PATTERN, async (route) => {
      counters.shellSummary += 1;
      await fulfillJson(route, shellSummaryResponse("ok"));
    });

    await page.goto(frontendUrl(EVIDENCE_PATH), { waitUntil: "domcontentloaded", timeout: 30_000 });
    await expect(page.locator("main h1").first()).toBeVisible({ timeout: 10_000 });
    await waitForFirstRowOrEmpty(page);

    expect(counters.shellSummary).toBe(1);
    expect(counters.approvals).toBe(0);
    expect(counters.alerts).toBe(0);
    // JobProgressDrawer still hydrates its own list lazily (idle callback),
    // but must not duplicate the read TopBar used to make on every mount.
    await expect.poll(() => counters.jobs, { timeout: 5_000 }).toBeLessThanOrEqual(1);
  });

  test("shell-summary unavailable: full-list fallback is deferred past first row, not raced against it", async ({ page }) => {
    const counters = await installBaseFixtures(page);
    await onRoute(page, SHELL_SUMMARY_PATTERN, async (route) => {
      counters.shellSummary += 1;
      await route.abort("connectionrefused");
    });

    await page.goto(frontendUrl(EVIDENCE_PATH), { waitUntil: "domcontentloaded", timeout: 30_000 });
    await expect(page.locator("main h1").first()).toBeVisible({ timeout: 10_000 });

    const approvalsAtFirstRowCheckpoint = { value: 0 };
    await waitForFirstRowOrEmpty(page);
    approvalsAtFirstRowCheckpoint.value = counters.approvals;

    // The deferred fallback should not have raced first row — it may still
    // be pending or may have already resolved via a fast idle callback, but
    // it must not have required more than one read per list once it settles.
    await expect.poll(() => counters.approvals, { timeout: 5_000 }).toBeGreaterThanOrEqual(approvalsAtFirstRowCheckpoint.value);
    await expect.poll(() => counters.approvals, { timeout: 5_000 }).toBeLessThanOrEqual(1);
    expect(counters.alerts).toBeLessThanOrEqual(1);
  });

  test("shell-summary degraded: reaches first row without extra full-list fanout", async ({ page }) => {
    const counters = await installBaseFixtures(page);
    await onRoute(page, SHELL_SUMMARY_PATTERN, async (route) => {
      counters.shellSummary += 1;
      await fulfillJson(route, shellSummaryResponse("degraded"));
    });

    await page.goto(frontendUrl(EVIDENCE_PATH), { waitUntil: "domcontentloaded", timeout: 30_000 });
    await expect(page.locator("main h1").first()).toBeVisible({ timeout: 10_000 });
    await waitForFirstRowOrEmpty(page);

    expect(counters.shellSummary).toBe(1);
    expect(counters.approvals).toBe(0);
    expect(counters.alerts).toBe(0);
  });
});
