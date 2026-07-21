import { expect, test } from "@playwright/test";
import {
  LOCAL_FIXTURE_AUTH_TOKEN,
  installOidcDevLogin,
  targetsExternalE2eEnvironment,
} from "./helpers/auth";

const PERSONA_ID = "per_quant";

const mockPersona = {
  id: PERSONA_ID,
  name: "Quantitative Trader",
  archetype: "Quant",
  owner: "alice",
  updatedAt: new Date().toISOString(),
  state: "deployed",
  risk: "low",
  successRate: 0.85,
  routedStrategies: 2,
};

const mockEpisodes = [
  {
    trade_episode_id: "ep-complete-paper-long",
    persona_id: PERSONA_ID,
    environment: "paper",
    strategy_id: "strategy-winner-branch",
    artifact_id: "model-v11",
    instrument_id: "2330.TW",
    side: "long",
    status: "reflected",
    opened_at: new Date(Date.now() - 3600 * 1000 * 48).toISOString(),
    closed_at: new Date(Date.now() - 3600 * 1000 * 24).toISOString(),
    requested_qty: 10000,
    filled_qty: 10000,
    vwap: 950.0,
    fees: 150.0,
    slippage: 20.0,
    realized_pnl: 150000.0,
    unrealized_pnl: 0.0,
    thesis: "TSMC Q3 earnings anticipation, strong demand for 3nm wafer fabrication.",
    coverage: {
      execution: { state: "complete", missing_refs: [], as_of: new Date().toISOString(), source_system: "runtime" },
    },
    timeline: [
      { event_id: "evt-1", event_type: "proposed", occurred_at: new Date(Date.now() - 3600 * 1000 * 48).toISOString(), details: { message: "proposed long" } },
      { event_id: "evt-2", event_type: "closed", occurred_at: new Date(Date.now() - 3600 * 1000 * 24).toISOString(), details: { message: "closed long" } },
    ]
  },
  {
    trade_episode_id: "ep-missing-refs",
    persona_id: PERSONA_ID,
    environment: "paper",
    strategy_id: "strategy-winner-branch",
    instrument_id: "2454.TW",
    side: "long",
    status: "open",
    opened_at: new Date(Date.now() - 3600 * 1000 * 12).toISOString(),
    requested_qty: 5000,
    filled_qty: 2000,
    vwap: 1380.0,
    realized_pnl: 0.0,
    unrealized_pnl: 12000.0,
    coverage: {
      rationale: { state: "partial", missing_refs: ["rationale_thesis_ref"], as_of: new Date().toISOString(), source_system: "decision" },
    },
  },
  {
    trade_episode_id: "ep-force-closed",
    persona_id: PERSONA_ID,
    environment: "paper",
    strategy_id: "strategy-winner-branch",
    instrument_id: "2317.TW",
    side: "short",
    status: "force_closed",
    opened_at: new Date(Date.now() - 3600 * 1000 * 72).toISOString(),
    closed_at: new Date(Date.now() - 3600 * 1000 * 60).toISOString(),
    requested_qty: 30000,
    filled_qty: 30000,
    vwap: 210.0,
    fees: 400.0,
    slippage: 80.0,
    realized_pnl: -240000.0,
    unrealized_pnl: 0.0,
    exit_actor: "risk_manager",
    exit_reason: "Drawdown limit reached",
    coverage: {
      execution: { state: "complete", missing_refs: [], as_of: new Date().toISOString(), source_system: "runtime" },
    },
  },
  {
    trade_episode_id: "ep-failed-reflection",
    persona_id: PERSONA_ID,
    environment: "paper",
    strategy_id: "strategy-winner-branch",
    instrument_id: "2603.TW",
    side: "long",
    status: "reflection_failed",
    opened_at: new Date(Date.now() - 3600 * 1000 * 96).toISOString(),
    closed_at: new Date(Date.now() - 3600 * 1000 * 84).toISOString(),
    requested_qty: 8000,
    filled_qty: 8000,
    vwap: 190.0,
    realized_pnl: -8000.0,
    coverage: {
      reflection: { state: "degraded", missing_refs: ["reflection_api_failed"], as_of: new Date().toISOString(), source_system: "persona" },
    },
  }
];

const mockReflections = [
  {
    reflection_id: "ref-complete-paper-long",
    trade_episode_id: "ep-complete-paper-long",
    persona_id: PERSONA_ID,
    reflection_version: 1,
    trigger: "episode_closed",
    attribution: "Process and market driven earnings catalyst correctly analyzed",
    mistakes: [],
    expected_vs_actual: {
      thesis: "Strong earnings expectation (Actual: stock rallied 3.2%)",
    },
    lesson_candidates: [
      {
        id: "les-complete-paper-long-1",
        scope: "routing_rules",
        proposed_change: "Increase priority of hardware-focused alpha models during quarterly earnings weeks",
        confidence: 0.88,
      }
    ],
    model: "claude-3-5-sonnet",
    review_state: "proposed",
  }
];

const mockPatterns = [
  {
    pattern_id: "pat-earnings-overconfidence",
    persona_id: PERSONA_ID,
    environment: "paper",
    name: "Earnings catalyst sizing drift",
    description: "Trend showing larger position sizes during earnings announcements",
    sample_size: 14,
    confidence: 0.82,
    mistake_taxonomy: "sizing_drift",
    recommendation: "Hard limit size to 5% during earnings weeks",
  }
];

test.describe("Persona Trade Journal E2E Flows", () => {
  test.skip(
    targetsExternalE2eEnvironment(),
    "route-mocked fixture coverage is loopback-only; hosted candidates use live acceptance specs",
  );

  test.beforeEach(async ({ page }) => {
    await installOidcDevLogin(page, {
      goto: false,
      token: LOCAL_FIXTURE_AUTH_TOKEN,
    });

    // Route standard persona queries
    await page.route(`**/bff/personas/${PERSONA_ID}`, async (route) => {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: mockPersona }) });
    });
    await page.route("**/bff/strategies**", async (route) => {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: [] }) });
    });
    await page.route("**/bff/audit**", async (route) => {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: [] }) });
    });
    await page.route("**/bff/personas", async (route) => {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: [mockPersona] }) });
    });

    // Route Trade Journal API queries
    await page.route(`**/bff/personas/${PERSONA_ID}/trade-journal**`, async (route) => {
      const url = new URL(route.request().url());
      const cursor = Number(url.searchParams.get("cursor") || "0");
      const status = url.searchParams.get("status");
      let filtered = mockEpisodes;
      if (status) {
        filtered = filtered.filter(x => x.status === status);
      }
      // Check if detail request
      const matchDetail = route.request().url().match(/\/trade-journal\/([a-zA-Z0-9-]+)/);
      if (matchDetail) {
        const id = matchDetail[1];
        const row = mockEpisodes.find(x => x.trade_episode_id === id);
        if (row) {
          await route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: row, meta: { source: "telemetry" } }) });
          return;
        }
      }
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          data: filtered,
          page_info: { next_cursor: null, has_more: false },
          meta: { coverage_state: "complete", count: filtered.length }
        })
      });
    });

    await page.route(`**/bff/personas/${PERSONA_ID}/trade-reflections**`, async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          data: mockReflections,
          page_info: { next_cursor: null },
          meta: { source: "reflections" }
        })
      });
    });

    await page.route(`**/bff/personas/${PERSONA_ID}/trade-patterns**`, async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          data: mockPatterns,
          meta: { source: "patterns", coverage_state: "complete" }
        })
      });
    });
  });

  test("proves navigation, timelines, failed reflection retry and candidate lesson decision", async ({ page }) => {
    // Navigate to Persona Detail
    await page.goto(`/management/personas/${PERSONA_ID}`);
    await page.waitForSelector("button:has-text('Trade Journal')");
    
    // Click on Trade Journal Tab
    await page.click("button:has-text('Trade Journal')");
    
    // Verify Environment tag & deep links
    await expect(page.getByText(/Live BFF Mode|Mock Mode/)).toBeVisible();
    await expect(page.locator("a:has-text('Attribution')")).toBeVisible();
    
    // Verify Episodes table contents
    await expect(page.getByText("2330.TW")).toBeVisible();
    await expect(page.getByText("2454.TW")).toBeVisible();
    await expect(page.getByText("2317.TW")).toBeVisible();
    
    // Click TSMC Long episode to open details drawer
    await page.click("tr:has-text('ep-complete-paper-long')");
    await expect(page.getByText(/TSMC.*earnings/i)).toBeVisible();
    await expect(page.getByText("VWAP Price")).toBeVisible();
    await expect(page.getByText("proposed").first()).toBeVisible(); // timeline check
    
    // Close detail drawer via Close X button
    await page.locator("button:has(svg.lucide-x)").first().click();
    await page.waitForTimeout(600);

    // Click Reflection Failed episode
    await page.click("tr:has-text('ep-failed-reflection')");
    await expect(page.getByText("Retry Reflection")).toBeVisible();
    
    // Trigger Retry Reflection governed command
    await page.route(`**/bff/personas/${PERSONA_ID}/trade-journal/ep-failed-reflection/reflection:retry`, async (route) => {
      expect(route.request().method()).toBe("POST");
      const body = JSON.parse(route.request().postData() || "{}");
      expect(body.reason).toBe("linage settles");
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          data: { status: "accepted", commandId: "cmd-retry-test-1" },
          meta: { audit: { record_ref: "audit-1" } }
        })
      });
    });

    await page.click("button:has-text('Retry Reflection')");
    await page.fill("textarea", "linage settles");
    await page.click("button:has-text('Submit Command')");
    await expect(page.getByText("Reflection retry command accepted")).toBeVisible();

    // Close detail drawer via Close X button
    await page.locator("button:has(svg.lucide-x)").first().click();
    await page.waitForTimeout(600);

    // Go to Reflections Tab
    await page.click("button:has-text('Reflections')");
    await expect(page.getByText("Attribution Analysis:").first()).toBeVisible();
    await expect(page.getByText("Proposed Lesson Candidates:").first()).toBeVisible();
    
    // Click Endorse on lesson candidate
    await page.route(`**/bff/personas/${PERSONA_ID}/trade-lessons/les-complete-paper-long-1:decide`, async (route) => {
      expect(route.request().method()).toBe("POST");
      const body = JSON.parse(route.request().postData() || "{}");
      expect(body.decision).toBe("endorsed");
      expect(body.reason).toBe("sizing homogenous rules");
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          data: { status: "accepted", commandId: "cmd-decide-test-1" },
          meta: { audit: { record_ref: "audit-2" } }
        })
      });
    });
    await page.locator("button:has-text('Endorse')").first().click();
    await page.fill("textarea", "sizing homogenous rules");
    await page.click("button:has-text('Submit Command')");
    await expect(page.getByText("Lesson candidate was endorsed")).toBeVisible();

    // Go to Patterns Tab
    await page.click("button:has-text('Patterns')");
    await expect(page.getByText("Earnings catalyst sizing drift")).toBeVisible();
    await expect(page.getByText("14 episodes")).toBeVisible();
  });
});
