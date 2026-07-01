/**
 * MGMT-LOAD-001 - Evidence route-load readiness probe (fixture-mocked, CI-safe).
 *
 * Mirrors the hosted probe in scripts/probe-route-load-baseline.mjs but runs
 * against the local dev server with mocked BFF routes, so it can gate CI
 * without depending on the hosted dev environment.
 *
 * This spec asserts readiness via content milestones (heading visible,
 * primary Evidence API returned, first row/empty-state visible) and never
 * waits on Playwright `networkidle`, because the shared platform shell opens
 * `/bff/events/stream`, a long-lived SSE connection, on every management
 * route. `networkidle` never resolves for that page shape. See
 * docs/04/pantheon_management_console_load_gap_2026-07-01/MANAGEMENT_CONSOLE_LOAD_GAP_SPEC.md
 * sections 2.6 and 4.5.
 *
 * The non-primary-request count is recorded as a soft-fail annotation, not a
 * hard budget gate. Enforcing the budget is MGMT-LOAD-006's job once the
 * shell-summary endpoint (MGMT-LOAD-002) and shell fanout fix (MGMT-LOAD-003)
 * land; this spec only needs to keep the baseline honest.
 */
import { expect, test, type Page, type Route, type TestInfo } from "@playwright/test";

const DEFAULT_FRONTEND_BASE_URL = "http://127.0.0.1:5173";
const EVIDENCE_PATH = "/management/evidence";
const PRIMARY_API_PATTERN = /\/bff\/management\/evidence(?:\?.*)?$/;
const SHELL_FANOUT_PATTERNS: Array<[string, RegExp]> = [
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
  return {
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Origin": route.request().headers()["origin"] ?? "*",
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

function nowIso(): string {
  return "2026-07-01T00:00:00Z";
}

const EVIDENCE_RESPONSE = {
  data: {
    items: [
      {
        refId: "evref-load-001",
        ref_id: "evref-load-001",
        title: "Load baseline evidence packet",
        sourceType: "unknown",
        source_type: "unknown",
        linkType: "provenance",
        link_type: "provenance",
        capturedAt: nowIso(),
        captured_at: nowIso(),
        credibility: { tier: "producer_record", verified: true },
        linkedObjectSummary: { entityType: "artifact", entity_type: "artifact", entityRef: "art-load-001", entity_ref: "art-load-001" },
        linked_object_summary: { entityType: "artifact", entity_type: "artifact", entityRef: "art-load-001", entity_ref: "art-load-001" },
        resolvedLink: { availability: "unavailable", displayLabel: "Source unavailable", display_label: "Source unavailable" },
        resolved_link: { availability: "unavailable", displayLabel: "Source unavailable", display_label: "Source unavailable" },
        redacted: false,
      },
    ],
    summary: { totalEvidence: 1, visibleEvidence: 1, verifiedEvidence: 1, redactedEvidence: 0 },
    meta: { snapshot_at: nowIso(), surfaces: { management_evidence: { status: "ok" } } },
  },
  meta: { snapshot_at: nowIso(), surfaces: { management_evidence: { status: "ok" } } },
};

const EMPTY_ENVELOPE = { items: [], cursor: {}, pageSize: 0, estimatedTotal: 0, totalCountExact: true, meta: { snapshot_at: nowIso() } };

async function installEvidenceFixtures(page: Page): Promise<Record<string, number>> {
  const counters: Record<string, number> = { me: 0, approvals: 0, alerts: 0, jobs: 0, health: 0, evidence: 0 };
  await page.route(PRIMARY_API_PATTERN, async (route) => {
    counters.evidence += 1;
    await fulfillJson(route, EVIDENCE_RESPONSE);
  });
  for (const [key, pattern] of SHELL_FANOUT_PATTERNS) {
    await page.route(pattern, async (route) => {
      counters[key] += 1;
      if (key === "health") {
        await fulfillJson(route, { status: "ok", checked_at: nowIso() });
        return;
      }
      if (key === "me") {
        await fulfillJson(route, {
          data: {
            operator_id: "op-load-001",
            display_name: "Load Probe Operator",
            roles: ["admin"],
            session: { authenticated: true, checked_at: nowIso() },
          },
        });
        return;
      }
      await fulfillJson(route, EMPTY_ENVELOPE);
    });
  }
  return counters;
}

test.describe("MGMT-LOAD-001 Evidence route-load readiness", () => {
  test("reaches heading, primary API, and first-row milestones without networkidle", async ({ page }, testInfo: TestInfo) => {
    const counters = await installEvidenceFixtures(page);
    const requestLog: Array<{ path: string; startMs: number }> = [];
    const navStartedAt = Date.now();
    page.on("request", (req) => {
      const url = req.url();
      if (url.includes("/bff/") || url.includes("/health")) {
        requestLog.push({ path: new URL(url).pathname, startMs: Date.now() - navStartedAt });
      }
    });

    const primaryApiPromise = page.waitForResponse(
      (res) => PRIMARY_API_PATTERN.test(new URL(res.url()).pathname) && res.request().method() === "GET",
      { timeout: 10_000 },
    );

    // Never `networkidle`: the shell opens a long-lived SSE stream on mount.
    await page.goto(frontendUrl(EVIDENCE_PATH), { waitUntil: "domcontentloaded", timeout: 30_000 });

    // Locale-agnostic: the FE defaults to zh-TW in this dev harness, so the
    // heading text is translated ("證據庫"). Match structurally instead of by
    // literal English copy.
    await expect(page.locator("main h1").first()).toBeVisible({ timeout: 10_000 });
    const headingMs = Date.now() - navStartedAt;

    await primaryApiPromise;
    const primaryApiMs = Date.now() - navStartedAt;

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
    const firstRowMs = Date.now() - navStartedAt;

    // Baseline counts, not gates: reducing shell fanout and de-duplicating
    // jobs reads is MGMT-LOAD-002/003 scope. This spec records the current
    // reality so those tasks have a measured before/after, without failing
    // the gate on a gap this task is not chartered to fix.
    const nonPrimaryBeforeFirstRow = requestLog.filter(
      (entry) => entry.startMs <= firstRowMs && !PRIMARY_API_PATTERN.test(entry.path),
    ).length;

    testInfo.annotations.push({
      type: "route-load-baseline",
      description:
        `heading=${headingMs}ms primaryApi=${primaryApiMs}ms firstRow=${firstRowMs}ms ` +
        `evidenceReads=${counters.evidence} jobsReads=${counters.jobs} ` +
        `nonPrimaryRequestsBeforeFirstRow=${nonPrimaryBeforeFirstRow}`,
    });
    if (counters.evidence !== 1) {
      console.warn(`[MGMT-LOAD-001] primary Evidence read fired ${counters.evidence} times; expected exactly 1.`);
    }
    if (counters.jobs > 1) {
      console.warn(
        `[MGMT-LOAD-001] /bff/jobs fetched ${counters.jobs} times on first route load (duplicate TopBar/JobProgressDrawer reads); tracked by MGMT-LOAD-003.`,
      );
    }
    if (nonPrimaryBeforeFirstRow > 2) {
      console.warn(
        `[MGMT-LOAD-001] non-primary BFF requests before first row (${nonPrimaryBeforeFirstRow}) exceed the target budget of 2; tracked by MGMT-LOAD-002/003.`,
      );
    }
  });
});
