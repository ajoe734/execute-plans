import { expect, test, type Page, type Route } from "@playwright/test";
import { installOidcDevLogin } from "./helpers/auth";
import { mkdirSync } from "node:fs";

const DEFAULT_FRONTEND_BASE_URL = "http://127.0.0.1:5173";
const EVIDENCE_DIR = "./docs/04/pantheon_management_console_mutation_evolution_gap_2026-07-10/evidence";

function frontendUrl(path = "/"): string {
  const base =
    process.env.PANTHEON_FE_BASE_URL ||
    process.env.FRONTEND_BASE_URL ||
    process.env.PLAYWRIGHT_BASE_URL ||
    DEFAULT_FRONTEND_BASE_URL;
  return `${base.replace(/\/$/, "")}${path}`;
}

function corsHeaders(route: Route): Record<string, string> {
  const origin = route.request().headers()["origin"] ?? "*";
  return {
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers":
      "accept,authorization,content-type,idempotency-key,if-match,x-bff-api-version,x-correlation-id,x-locale,x-request-id,x-tenant-id,x-trace-id",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Expose-Headers": "x-bff-api-version,x-correlation-id,x-request-id",
  };
}

async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: "application/json",
    headers: corsHeaders(route),
    status,
  });
}

function envelope(items: unknown[], route: string): Record<string, unknown> {
  return {
    data: { items },
    items,
    meta: {
      route,
      snapshot_at: "2026-07-10T10:00:00Z",
      source: "mgmt-ops-010-fixture",
      status: "ok",
      surfaces: {
        canonical_read: { source: "mgmt-ops-010-fixture", status: "ok" },
      },
    },
    page_info: { page_size: items.length, total: items.length, totalCountExact: true },
  };
}

const MOCK_FLEET_ROWS = [
  {
    id: "persona-formal-mut",
    personaId: "persona-formal-mut",
    personaName: "Formal Persona",
    owner: "operator-formal",
    ooda: "decide",
    autonomy: "high",
    state: "paper_running",
    perfDelta: 0.123,
    lastMutationKind: "formal_mutation",
    mutation_entry_id: "evo-dec-formal",
    mutationEntryId: "evo-dec-formal",
    evolutionEntryId: "evo-dec-formal",
    lastMutationLabel: "2026-07-10",
    lastMutationAt: "2026-07-10T12:00:00Z",
    lastMutation: "2026-07-10T12:00:00Z",
    evolution_href: "/management/evolution-journal?persona=persona-formal-mut&mutation_review=evo-dec-formal",
    evolutionHref: "/management/evolution-journal?persona=persona-formal-mut&mutation_review=evo-dec-formal",
    mutation_confidence: "formal",
    mutationConfidence: "formal",
    mutation_diagnostics: [],
    mutationDiagnostics: [],
    capitalMode: "canary",
    capitalReference: "pool-formal",
    capitalPoolId: "pool-formal",
    capital_pool_id: "pool-formal",
    runtimeId: "runtime-formal",
    runtimeBindingId: "binding-formal",
    runtimeHealth: "live_running",
    leagueRank: 2,
    leagueScore: 85.5,
    data_sources: [
      {
        provider_key: "kraken",
        providerKey: "kraken",
        status: "datasource_smoke_ok"
      }
    ],
    dataSources: [
      {
        provider_key: "kraken",
        providerKey: "kraken",
        status: "datasource_smoke_ok"
      }
    ],
    research_status: {
      stage: "apply",
      artifactId: "art-formal",
      experimentId: "exp-formal",
      experiment_id: "exp-formal",
      canDeploy: true
    },
    researchStatus: {
      stage: "apply",
      artifactId: "art-formal",
      experimentId: "exp-formal",
      experiment_id: "exp-formal",
      canDeploy: true
    },
    review: {
      inboxId: "dummy-inbox-id",
      route: "/management/human-inbox"
    },
    linkRecords: []
  },
  {
    id: "persona-20260528-04688755",
    personaId: "persona-20260528-04688755",
    personaName: "Crypto-Alt-Hunter",
    owner: "operator-fallback",
    ooda: "observe",
    autonomy: "medium",
    state: "paper_running",
    perfDelta: -0.05,
    lastMutationKind: "fleet_summary",
    mutation_entry_id: "nan",
    mutationEntryId: "nan",
    evolutionEntryId: "nan",
    lastMutationLabel: "2026-06-03",
    lastMutationAt: "2026-06-03T08:00:00Z",
    lastMutation: "2026-06-03T08:00:00Z",
    evolution_href: "/management/evolution-journal?persona=persona-20260528-04688755&source=fleet_summary",
    evolutionHref: "/management/evolution-journal?persona=persona-20260528-04688755&source=fleet_summary",
    mutation_confidence: "fallback",
    mutationConfidence: "fallback",
    mutation_diagnostics: [
      "No formal mutation entry id declared for this persona row."
    ],
    mutationDiagnostics: [
      "No formal mutation entry id declared for this persona row."
    ],
    capitalMode: "paper",
    capitalReference: "pool-fallback",
    capitalPoolId: "pool-fallback",
    capital_pool_id: "pool-fallback",
    runtimeHealth: "live_running",
    leagueRank: 5,
    leagueScore: 70.0,
    data_sources: [
      {
        provider_key: "binance",
        providerKey: "binance",
        status: "read_ok"
      }
    ],
    dataSources: [
      {
        provider_key: "binance",
        providerKey: "binance",
        status: "read_ok"
      }
    ],
    research_status: {
      stage: "review",
      artifactId: "art-fallback",
      experimentId: "exp-fallback",
      experiment_id: "exp-fallback",
      canDeploy: false
    },
    researchStatus: {
      stage: "review",
      artifactId: "art-fallback",
      experimentId: "exp-fallback",
      experiment_id: "exp-fallback",
      canDeploy: false
    },
    linkRecords: []
  },
  {
    id: "persona-missing-data",
    personaId: "persona-missing-data",
    personaName: "Missing Data Persona",
    owner: "operator-missing",
    ooda: "none",
    autonomy: "low",
    state: "unavailable",
    perfDelta: 0.0,
    lastMutationKind: "unavailable",
    mutation_entry_id: null,
    mutationEntryId: null,
    lastMutationLabel: null,
    lastMutationAt: null,
    lastMutation: null,
    evolution_href: null,
    evolutionHref: null,
    mutation_confidence: "unavailable",
    mutationConfidence: "unavailable",
    mutation_diagnostics: [
      "No mutation details available."
    ],
    mutationDiagnostics: [
      "No mutation details available."
    ],
    capitalMode: "none",
    capitalReference: null,
    runtimeHealth: null,
    leagueRank: null,
    leagueScore: null,
    data_sources: [],
    dataSources: [],
    research_status: null,
    researchStatus: null,
    linkRecords: []
  }
];

const MOCK_EVOLUTION_ITEMS = [
  {
    id: "evo-dec-formal",
    title: "Formal Mutation Title",
    summary: "Formal mutation details for the persona.",
    status: "approved",
    verdict: "approved",
    action_type: "retrain",
    risk_level: "medium",
    target: {
      type: "Persona",
      id: "persona-formal-mut"
    },
    occurred_at: "2026-07-10T12:00:00Z",
    created_at: "2026-07-10T12:00:00Z"
  }
];

const MOCK_HUMAN_INBOX_ITEMS = [
  {
    id: "readiness_blocker:persona:persona-formal-mut",
    kind: "readiness_blocker",
    title: "Readiness Blocker for Formal Persona",
    summary: "Formal Persona has a pending readiness review.",
    requiredRole: "operator",
    consequenceIfApproved: "Approved",
    consequenceIfRejected: "Rejected",
    consequenceIfIgnored: "Ignored",
    canDecide: true,
    canProceed: true,
    detailHref: "/management/human-inbox/readiness_blocker:persona:persona-formal-mut",
    links: {
      manageHref: "/management/human-inbox/readiness_blocker:persona:persona-formal-mut",
      recommendedActionHref: "/management/human-inbox/readiness_blocker:persona:persona-formal-mut",
      evidenceHref: ""
    }
  }
];

async function installMockFixture(page: Page): Promise<void> {
  await page.route(/^https?:\/\/[^/]+\/(?:bff|health|healthz|readyz).*/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (request.method() === "OPTIONS") {
      await route.fulfill({ headers: corsHeaders(route), status: 204 });
      return;
    }

    if (path === "/bff/events/stream") {
      await route.fulfill({ body: ": connected\n\n", contentType: "text/event-stream", headers: corsHeaders(route), status: 200 });
      return;
    }
    if (path === "/health" || path === "/healthz" || path === "/readyz") {
      await fulfillJson(route, { status: "ok", live: true, ready: true });
      return;
    }
    if (path === "/bff/me") {
      await fulfillJson(route, {
        user: {
          id: "op-ops-010",
          displayName: "F15 Operator",
          email: "operator-f15@pantheon.local",
        },
        tenant: {
          id: "tenant-f15",
          name: "Pantheon F15",
          tz: "Asia/Taipei",
          locale: "zh-TW",
          baseCurrency: "USD",
        },
        roles: ["operator", "reviewer", "approver"],
        capabilities: ["runtime.read", "strategy.create", "deployment.request"],
        env: "playwright",
        featureFlags: { v5LoopOs: true, sentinel: true },
      });
      return;
    }
    if (path === "/bff/management/persona-fleet") {
      await fulfillJson(route, envelope(MOCK_FLEET_ROWS, path));
      return;
    }
    if (path.startsWith("/bff/personas/")) {
      const id = path.substring("/bff/personas/".length);
      const row = MOCK_FLEET_ROWS.find((r) => r.id === id);
      if (row) {
        await fulfillJson(route, { data: { ...row, name: row.personaName } });
        return;
      }
    }
    if (path.startsWith("/bff/research-experiments/")) {
      const id = path.substring("/bff/research-experiments/".length);
      if (id === "exp-formal") {
        await fulfillJson(route, {
          data: {
            id: "exp-formal",
            name: "Formal Experiment",
            framework: "dspy",
            status: "completed",
            state: "completed",
            risk: "medium"
          }
        });
        return;
      }
    }
    if (path === "/bff/management/evolution-journal") {
      await fulfillJson(route, envelope(MOCK_EVOLUTION_ITEMS, path));
      return;
    }
    if (path === "/bff/management/human-inbox") {
      await fulfillJson(route, envelope(MOCK_HUMAN_INBOX_ITEMS, path));
      return;
    }
    if (path === "/bff/management/data-sources") {
      await fulfillJson(route, envelope([], path));
      return;
    }
    if (path === "/bff/management/permissions") {
      await fulfillJson(route, envelope([], path));
      return;
    }
    if (path === "/bff/management/memory-governance") {
      await fulfillJson(route, envelope([], path));
      return;
    }
    if (path === "/bff/management/consult-rules") {
      await fulfillJson(route, envelope([], path));
      return;
    }
    if (path === "/bff/lineage") {
      await fulfillJson(route, { data: { nodes: [], edges: [] } });
      return;
    }
    if (path === "/bff/workflows") {
      await fulfillJson(route, envelope([], path));
      return;
    }
    if (path === "/bff/hooks") {
      await fulfillJson(route, { data: { crons: [], hooks: [] } });
      return;
    }
    if (path === "/bff/knowledge") {
      await fulfillJson(route, envelope([], path));
      return;
    }
    await fulfillJson(route, envelope([], path));
  });
}

async function captureScreenshot(page: Page, name: string): Promise<void> {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  await page.screenshot({ path: `${EVIDENCE_DIR}/${name}.png`, fullPage: true });
}

test.describe("MGMT-OPS-010 Persona Fleet Click-Map Regression", () => {
  test.beforeEach(async ({ page }) => {
    await installMockFixture(page);
    await installOidcDevLogin(page, {
      goto: false,
      roles: ["operator", "reviewer", "approver"],
      tenantId: "pantheon-dev"
    });
  });

  test("runs click-map smoke regression, asserting formal, fallback, and missing mutation links", async ({ page }) => {
    console.log("Starting test...");
    // 1. Visit Persona Fleet page and take baseline screenshot
    console.log("Navigating to Persona Fleet...");
    await page.goto(frontendUrl("/management/persona-fleet"), { waitUntil: "domcontentloaded", timeout: 30_000 });
    console.log("Waiting for Formal Persona to be visible...");
    await expect(page.getByText("Formal Persona")).toBeVisible({ timeout: 15_000 });
    console.log("Capturing baseline screenshot...");
    await captureScreenshot(page, "01-persona-fleet-baseline");

    // 2. Click each row-level detail link and verify correct target pages
    // Link 1: Persona name / detail (Formal Persona)
    console.log("Clicking Formal Persona detail link...");
    await page.getByRole("link", { name: "Formal Persona" }).click();
    console.log("Expecting URL to match persona detail path...");
    await expect(page).toHaveURL(/\/management\/personas\/persona-formal-mut/);
    console.log("Waiting for Persona detail page content to load...");
    await expect(page.getByRole("heading", { name: "Formal Persona", level: 1 })).toBeAttached({ timeout: 15_000 });
    console.log("Capturing screenshot 02...");
    await captureScreenshot(page, "02-target-persona-detail");

    // Go back
    console.log("Navigating back to Persona Fleet...");
    await page.goto(frontendUrl("/management/persona-fleet"), { waitUntil: "domcontentloaded" });

    // Link 2: OODA Badge (OODA maps to Human Inbox because ooda stage is decide)
    console.log("Clicking OODA badge...");
    const formalRow = page.locator("tr").filter({ hasText: "Formal Persona" });
    await formalRow.locator('[aria-label="persona-formal-mut OODA decide stage" i]').click();
    console.log("Expecting URL to match human inbox focus...");
    await expect(page).toHaveURL(/\/management\/human-inbox\?persona=persona-formal-mut/);
    console.log("Expecting focus text to be visible...");
    await expect(page.getByText(/已聚焦 Persona.*persona-formal-mut/)).toBeVisible();
    console.log("Capturing screenshot 03...");
    await captureScreenshot(page, "03-target-ooda-stage");

    console.log("Navigating back to Persona Fleet...");
    await page.goto(frontendUrl("/management/persona-fleet"), { waitUntil: "domcontentloaded" });

    // Link 3: Capital pool
    console.log("Clicking Capital pool link...");
    await formalRow.locator('[aria-label="Open capital for persona-formal-mut" i]').click();
    console.log("Expecting URL to match Governance Decisions capital tab...");
    // MGMT-PERF-IA-001: promotion-allocation?tab=quarterly-capital now
    // redirects to the canonical Governance Decisions capital tab
    // (ROUTE_MIGRATION_MATRIX.md).
    await expect(page).toHaveURL(/\/management\/governance-decisions\?tab=capital/);
    console.log("Waiting for Quarterly Capital page content to load...");
    await expect(page.getByRole("heading", { name: "資金池", level: 1 })).toBeAttached({ timeout: 15_000 });
    console.log("Capturing screenshot 04...");
    await captureScreenshot(page, "04-target-capital-pool");

    console.log("Navigating back to Persona Fleet...");
    await page.goto(frontendUrl("/management/persona-fleet"), { waitUntil: "domcontentloaded" });

    // Link 4: Ranking
    console.log("Clicking Ranking link...");
    await formalRow.locator('[aria-label="persona-formal-mut persona league ranking" i]').click();
    console.log("Expecting URL to match focused Persona League...");
    await expect(page).toHaveURL(/\/management\/persona-league\?persona=persona-formal-mut/);
    console.log("Waiting for Ranking page content to load...");
    await expect(page.getByRole("heading", { name: "Persona 聯賽", level: 1 })).toBeAttached({ timeout: 15_000 });
    console.log("Capturing screenshot 05...");
    await captureScreenshot(page, "05-target-ranking");

    console.log("Navigating back to Persona Fleet...");
    await page.goto(frontendUrl("/management/persona-fleet"), { waitUntil: "domcontentloaded" });

    // Link 5: Data source
    console.log("Clicking Data source link...");
    await formalRow.locator('[aria-label="persona-formal-mut data source kraken" i]').click();
    console.log("Expecting URL to match data sources focus...");
    await expect(page).toHaveURL(/\/management\/data-sources\?persona=persona-formal-mut/);
    console.log("Waiting for Data source page content to load...");
    await expect(page.getByRole("heading", { name: "資料源管理", level: 1 })).toBeAttached({ timeout: 15_000 });
    console.log("Capturing screenshot 06...");
    await captureScreenshot(page, "06-target-data-source");

    console.log("Navigating back to Persona Fleet...");
    await page.goto(frontendUrl("/management/persona-fleet"), { waitUntil: "domcontentloaded" });

    // Link 6: Research project
    console.log("Clicking Research project link...");
    await formalRow.locator('[aria-label="persona-formal-mut research detail" i]').click();
    console.log("Expecting URL to match research detail...");
    await expect(page).toHaveURL(/\/management\/experiments\/exp-formal/);
    console.log("Waiting for Research project page content to load...");
    await expect(page.getByRole("heading", { name: "Formal Experiment", level: 1 })).toBeAttached({ timeout: 15_000 });
    console.log("Capturing screenshot 07...");
    await captureScreenshot(page, "07-target-research-project");

    console.log("Navigating back to Persona Fleet...");
    await page.goto(frontendUrl("/management/persona-fleet"), { waitUntil: "domcontentloaded" });

    // Link 7: Performance
    console.log("Clicking Performance link...");
    await formalRow.locator('[aria-label="persona-formal-mut performance attribution" i]').click();
    console.log("Expecting URL to match performance attribution...");
    await expect(page).toHaveURL(/\/management\/performance-attribution\?dimension=persona/);
    console.log("Waiting for Performance page content to load...");
    await expect(page.getByRole("heading", { name: "績效歸因", level: 1 })).toBeAttached({ timeout: 15_000 });
    console.log("Capturing screenshot 08...");
    await captureScreenshot(page, "08-target-performance");

    console.log("Navigating back to Persona Fleet...");
    await page.goto(frontendUrl("/management/persona-fleet"), { waitUntil: "domcontentloaded" });

    // Link 8: Recent mutation - Formal Path
    console.log("Clicking Recent mutation link...");
    await formalRow.locator('[aria-label="persona-formal-mut mutation history" i]').click();
    console.log("Expecting URL to match mutation history...");
    await expect(page).toHaveURL(/\/management\/evolution-journal\?persona=persona-formal-mut/);
    console.log("Expecting formal mutation details to be visible...");
    await expect(page.getByText("已聚焦 Persona: persona-formal-mut · mutation: evo-dec-formal")).toBeVisible();
    await expect(page.getByText("Formal Mutation Title")).toBeVisible();
    await expect(page.getByText("evo-dec-formal", { exact: true })).toBeVisible();
    console.log("Capturing screenshot 09...");
    await captureScreenshot(page, "09-target-formal-mutation");

    console.log("Navigating back to Persona Fleet...");
    await page.goto(frontendUrl("/management/persona-fleet"), { waitUntil: "domcontentloaded" });

    console.log("Clicking Non-Production tab...");
    await page.getByRole("tab", { name: /非正式資料/ }).click();

    // Link 9: Recent mutation - Fallback Path (Crypto-Alt-Hunter)
    console.log("Clicking Fallback Recent mutation link...");
    const fallbackRow = page.locator("tr").filter({ hasText: "Crypto-Alt-Hunter" });
    await fallbackRow.locator('[aria-label="persona-20260528-04688755 mutation history" i]').click();
    console.log("Expecting URL to match fallback focus...");
    await expect(page).toHaveURL(/\/management\/evolution-journal\?persona=persona-20260528-04688755/);
    
    console.log("Expecting fallback banner and card details...");
    await expect(page.getByText("已聚焦 Persona: persona-20260528-04688755 · fleet summary fallback · 無正式 mutation id")).toBeVisible();
    await expect(page.getByText("Persona Fleet status summary · Crypto-Alt-Hunter")).toBeVisible();
    await expect(page.getByText("persona-fleet-summary:persona-20260528-04688755:2026-06-03T08:00:00Z")).toBeVisible();
    
    console.log("Expecting no Action label...");
    await expect(page.getByText("Action", { exact: true })).toHaveCount(0);
    console.log("Verifying URL query params...");
    const url = page.url();
    expect(url).not.toContain("mutation=nan");
    expect(url).not.toContain("mutation_review=nan");
    console.log("Capturing screenshot 10...");
    await captureScreenshot(page, "10-target-fallback-mutation");

    console.log("Navigating back to Persona Fleet...");
    await page.goto(frontendUrl("/management/persona-fleet"), { waitUntil: "domcontentloaded" });

    console.log("Clicking Non-Production tab...");
    await page.getByRole("tab", { name: /非正式資料/ }).click();

    // Link 10: Missing-Data Path (Missing Data Persona should have no link)
    console.log("Checking Missing-Data row links...");
    const missingRow = page.locator("tr").filter({ hasText: "Missing Data Persona" });
    const mutationCell = missingRow.locator("td").nth(9); // Recent mutation column is 10th (index 9)
    const links = mutationCell.locator("a");
    const count = await links.count();
    console.log(`Found ${count} link(s) in recent mutation cell`);
    for (let i = 0; i < count; i++) {
      const href = await links.nth(i).getAttribute("href");
      const text = await links.nth(i).innerText();
      console.log(`Link ${i}: href="${href}", text="${text}"`);
    }
    await expect(links).toHaveCount(0);
    await expect(mutationCell).toHaveText("無資料");
    console.log("Capturing screenshot 11...");
    await captureScreenshot(page, "11-missing-data-no-link");
    console.log("Test finished successfully!");
  });
});
