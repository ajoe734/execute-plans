/**
 * MGMT-LOAD-004 - route-level lazy splitting smoke tests.
 *
 * Coverage:
 *   1. Direct /management/evidence navigation loads the Evidence route chunk
 *      without fetching unrelated management cluster modules.
 *   2. Redirect aliases still canonicalize under the lazy management graph.
 *   3. Failed lazy chunk fetch renders the route chunk error boundary instead
 *      of a blank page.
 */

import { expect, test, type Page, type Route } from "@playwright/test";

const DEFAULT_FRONTEND_BASE_URL = "http://127.0.0.1:5173";
const SNAPSHOT_AT = "2026-07-01T10:00:00Z";
const EXPECT_SOURCE_ROUTE_MODULES = process.env.PANTHEON_ROUTE_SPLIT_SOURCE_MODULES === "1";

function frontendUrl(path = "/"): string {
  const base =
    process.env.FRONTEND_BASE_URL ||
    process.env.PLAYWRIGHT_BASE_URL ||
    process.env.PANTHEON_FE_BASE_URL ||
    DEFAULT_FRONTEND_BASE_URL;
  return `${base.replace(/\/$/, "")}${path}`;
}

function exactPath(path: string): (url: URL) => boolean {
  return (url) => url.pathname === path;
}

function corsHeaders(route: Route): Record<string, string> {
  return {
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers":
      "authorization,content-type,idempotency-key,x-correlation-id,x-locale,x-request-id,x-tenant-id",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Origin": route.request().headers().origin ?? "*",
  };
}

async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  if (route.request().method() === "OPTIONS") {
    await route.fulfill({ status: 204, headers: corsHeaders(route) });
    return;
  }
  await route.fulfill({
    status,
    contentType: "application/json",
    headers: corsHeaders(route),
    body: JSON.stringify(body),
  });
}

function listEnvelope(surface: string, items: unknown[] = []) {
  return {
    items,
    cursor: {},
    pageSize: items.length,
    estimatedTotal: items.length,
    totalCountExact: true,
    meta: {
      snapshot_at: SNAPSHOT_AT,
      surfaces: {
        [surface]: { status: "ok", source: "live" },
      },
    },
  };
}

function meResponse() {
  return {
    user: {
      id: "operator-route-split",
      displayName: "Route Split Operator",
      email: "route-split@pantheon.local",
    },
    tenant: {
      id: "tenant-route-split",
      name: "Pantheon Route Split",
      tz: "UTC",
      locale: "en-US",
      baseCurrency: "USD",
    },
    roles: ["operator", "reviewer"],
    capabilities: ["runtime.read", "evidence.read"],
    env: "dev",
    featureFlags: { v5LoopOs: true, sentinel: true },
    serverTime: SNAPSHOT_AT,
    sessionExpiresAt: "2026-07-01T18:00:00Z",
    permissionsVersion: "route-split",
    counters: {
      pendingInterventionsCount: 0,
      unreadAuditCount: 0,
      openFindingsCount: 0,
    },
  };
}

function evidenceOverview() {
  return {
    items: [
      {
        ref_id: "evref-mgmt-load-004",
        title: "MGMT-LOAD-004 evidence packet",
        source_type: "task_artifact",
        link_type: "supporting_evidence",
        captured_at: SNAPSHOT_AT,
        credibility: {
          tier: "primary",
          verified: true,
          last_verified_at: SNAPSHOT_AT,
          verification_method: "route-split-smoke",
        },
        linked_object_summary: {
          entity_type: "task",
          entity_ref: "MGMT-LOAD-004",
          display_label: "Management route code splitting",
        },
        resolved_link: {
          availability: "internal",
          route_href: "/management/evidence/evref-mgmt-load-004",
          display_label: "Open packet",
        },
        management_href: "/management/evidence/evref-mgmt-load-004",
      },
    ],
    summary: {
      total_evidence: 1,
      returned_evidence: 1,
      visible_evidence: 1,
      redacted_evidence: 0,
      verified_evidence: 1,
    },
    meta: {
      snapshot_at: SNAPSHOT_AT,
      surfaces: {
        management_evidence: { status: "ok", source: "live" },
      },
    },
  };
}

// FE-EVIDENCE-CITED-20261125: /management/evidence now lists what decisions
// cite (GET /bff/management/evidence?scope=cited); the ingested envelope above
// stays the answer for scope=ingested. Shape: BFF-EVIDENCE-CITED-LIST-20261125.
function citedEvidence() {
  const sources = Object.fromEntries(
    ["meeting_proposals", "meeting_positions", "governance_approvals", "evolution_proposals", "research_demands", "research_tickets", "persona_cycles"].map(
      (key) => [key, { status: "ok", reason: null, read_count: 1, truncated: false, failed_count: 0, citation_count: key === "meeting_positions" ? 1 : 0, withheld_count: 0, calls: 1, response_bytes: 900 }],
    ),
  );
  return {
    data: {
      id: "management-evidence-cited",
      scope: "cited",
      items: [
        {
          id: "evref-mgmt-load-004",
          ref_id: "evref-mgmt-load-004",
          ref_kind: "evidence_item",
          source_owner: "source_ingest",
          label: "MGMT-LOAD-004 evidence packet",
          name_missing: false,
          label_parts: {},
          source_class: "evidence",
          resolved_link: { route_href: "/management/evidence/evref-mgmt-load-004", evidence_ref_id: "evref-mgmt-load-004" },
          route_href: "/management/evidence/evref-mgmt-load-004",
          cited_as: ["evref-mgmt-load-004"],
          cited_by: [
            {
              entity_type: "meeting_position",
              entity_ref: "mtg-6edaff7d0ff76275",
              label: "Route split review",
              parts: { meeting_id: "mtg-6edaff7d0ff76275", round: 1, position: "A", persona_id: "persona-ee7112a829d38b9135ac" },
              route_href: "/management/meetings/mtg-6edaff7d0ff76275",
              time: SNAPSHOT_AT,
              source: "meeting_positions",
            },
          ],
          citation_count: 1,
          last_cited_at: SNAPSHOT_AT,
          redacted: false,
        },
      ],
      summary: { scope: "cited", complete: true, incomplete: false, reference_total: 1, returned: 1, references_truncated: false, max_references: 500, redacted_count: 0 },
      sources,
    },
    page_info: { next_page_token: null, total: 1, page_size: 20 },
    meta: { snapshot_at: SNAPSHOT_AT, surfaces: { cited_evidence: { status: "ok", source: "bff_composed_owner_reads" }, cited_evidence_sources: sources } },
  };
}

async function installRuntimeHarness(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      window.sessionStorage.setItem("pantheon.integration.fallback", "strict");
      window.sessionStorage.setItem("pantheon.e2e.fallback", "strict");
    } catch {
      // Ignore storage access errors in restricted contexts.
    }

    class RouteSplitEventSource extends EventTarget {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSED = 2;
      readonly url: string;
      readonly withCredentials: boolean;
      readyState = RouteSplitEventSource.OPEN;
      onopen: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;

      constructor(url: string | URL, init?: EventSourceInit) {
        super();
        this.url = String(url);
        this.withCredentials = Boolean(init?.withCredentials);
        queueMicrotask(() => {
          const event = new Event("open");
          this.dispatchEvent(event);
          this.onopen?.(event);
        });
      }

      close() {
        this.readyState = RouteSplitEventSource.CLOSED;
      }
    }

    Object.assign(window, { EventSource: RouteSplitEventSource });
  });
}

async function installStableShellRoutes(page: Page): Promise<void> {
  const stableRoutes: Array<[string, unknown]> = [
    ["/health", { status: "ok", service: "route-split-smoke" }],
    ["/bff/me", meResponse()],
    ["/bff/approvals", listEnvelope("approvals")],
    ["/bff/alerts", listEnvelope("alerts")],
    ["/bff/jobs", listEnvelope("jobs")],
    ["/bff/search", []],
    ["/bff/management/evidence", evidenceOverview()],
  ];

  for (const [path, body] of stableRoutes) {
    await page.route(exactPath(path), (route) => {
      if (path === "/bff/management/evidence" && new URL(route.request().url()).searchParams.get("scope") === "cited") {
        return fulfillJson(route, citedEvidence());
      }
      return fulfillJson(route, body);
    });
  }
}

test.beforeEach(async ({ page }) => {
  await installRuntimeHarness(page);
  await installStableShellRoutes(page);
});

test("direct Evidence navigation loads only the Evidence route cluster", async ({ page }) => {
  const routeModuleRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/src/routes/")) {
      routeModuleRequests.push(url.pathname);
    }
  });

  await page.goto(frontendUrl("/management/evidence"), { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: /Evidence Explorer|證據庫/i })).toBeVisible();
  await expect(page.getByText("MGMT-LOAD-004 evidence packet")).toBeVisible();

  test.skip(
    !EXPECT_SOURCE_ROUTE_MODULES && routeModuleRequests.length === 0,
    "Hosted/prod builds serve hashed chunks instead of Vite /src route modules.",
  );
  expect(routeModuleRequests).toContain("/src/routes/management/evidence.tsx");
  expect(routeModuleRequests).not.toContain("/src/routes/management/registry.tsx");
  expect(routeModuleRequests).not.toContain("/src/routes/management/v5.tsx");
  expect(routeModuleRequests).not.toContain("/src/routes/agora.tsx");
});

test("management redirect aliases survive lazy route splitting", async ({ page }) => {
  await page.goto(frontendUrl("/management/deployment/deploy-004?view=summary#focus"), { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/management\/deployments\/deploy-004\?view=summary#focus$/);

  await page.goto(frontendUrl("/management/openclaw-llm-auth"), { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/management\/llm-provider-auth$/);

  await page.goto(frontendUrl("/management/control-room"), { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/management\/cockpit$/);
});

test("lazy route chunk fetch failure renders a route error state", async ({ page }) => {
  test.skip(
    !EXPECT_SOURCE_ROUTE_MODULES,
    "This route chunk failure probe targets Vite source modules, not hosted hashed chunks.",
  );
  await page.route(/\/src\/routes\/management\/evidence\.tsx(?:\?|$)/, (route) => route.abort("failed"));

  await page.goto(frontendUrl("/management/evidence"), { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("alert")).toContainText(/Evidence explorer route chunk|Failed to fetch dynamically imported module/i);
});
