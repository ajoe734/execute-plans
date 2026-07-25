import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Route } from "@playwright/test";
import { installOidcDevLogin } from "./helpers/auth";
import { installQuietEventSource } from "./helpers/sse";

const asOf = "2026-07-22T20:05:00Z";

async function json(route: Route, body: unknown, headers: Record<string, string> = {}) {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    headers,
    body: JSON.stringify(body),
  });
}

function candidate(poolId: string) {
  const artifactId = "artifact-browser-aapl";
  return {
    artifact_id: artifactId,
    strategy_ref: "strategy-browser-aapl",
    title: "AAPL",
    lifecycle_state: "candidate",
    producing_persona_id: "persona-browser-quant",
    run_ref: "research-run-browser-aapl",
    created_at: "2026-07-22T20:00:00Z",
    effective_score: 91.5,
    as_of: asOf,
    fields: {
      rationale: {
        availability: "available",
        value: {
          kind: "operator_review_rationale",
          decision: "needs_more_research",
          rationale: "Browser fixture rationale belongs only to artifact-browser-aapl.",
          reviewed_by: "candidate-truth-operator",
          reviewed_at: asOf,
        },
        provenance: {
          source_type: "candidate_review",
          source_ref: `candidate-review:${poolId}:${artifactId}:review-browser-001`,
          as_of: asOf,
        },
      },
      concerns: { availability: "unavailable", reason: "not_recorded" },
      next_event: { availability: "unavailable", reason: "no_governed_source" },
      evidence: {
        availability: "available",
        value: {
          kind: "score_evidence_refs",
          items: [{
            component_id: "browser-flow",
            label: "Browser flow evidence",
            evidence_refs: [`evidence://${artifactId}/flow-browser-001`],
            summary: null,
            summary_redacted: true,
            redaction_reason: "list_response",
          }],
          total_refs: 1,
        },
        provenance: {
          source_type: "candidate_score_result",
          source_ref: `candidate-score:${poolId}:${artifactId}:2026-07-22T20:04:00Z`,
          as_of: "2026-07-22T20:04:00Z",
        },
      },
      details: {
        availability: "available",
        value: {
          kind: "candidate_identity",
          title: "AAPL",
          strategy_ref: "strategy-browser-aapl",
          run_ref: "research-run-browser-aapl",
          producing_persona_id: "persona-browser-quant",
          lifecycle_state: "candidate",
          created_at: "2026-07-22T20:00:00Z",
        },
        provenance: {
          source_type: "candidate_pool_member",
          source_ref: `candidate-pool-member:${poolId}:${artifactId}`,
          as_of: "2026-07-22T20:00:00Z",
        },
      },
    },
    score_semantics: {
      effective_score: {
        kind: "recipe_weighted_score",
        availability: "available",
        is_confidence_score: false,
        scale_min: 0,
        scale_max: 100,
        recipe_id: "candidate-scoring-v1",
        recipe_version: 1,
        source_ref: `candidate-score:${poolId}:${artifactId}:2026-07-22T20:04:00Z`,
        as_of: "2026-07-22T20:04:00Z",
      },
      sharpe_summary: {
        kind: "sharpe_ratio",
        availability: "unavailable",
        is_confidence_score: false,
        reason: "not_recorded",
      },
    },
  };
}

async function installFixture(page: Page) {
  await page.route((url) => url.pathname.startsWith("/bff/"), async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/bff/me") {
      return json(route, {
        data: {
          user: {
            id: "candidate-truth-operator",
            displayName: "Candidate Truth Operator",
            email: "candidate-truth@pantheon.local",
          },
          tenant: { id: "tenant-a", name: "Candidate Truth", tz: "UTC", locale: "en-US", baseCurrency: "USD" },
          roles: ["operator", "viewer"],
          capabilities: ["agora.read"],
          env: "dev",
          featureFlags: {},
          serverTime: asOf,
          sessionExpiresAt: "2026-07-23T20:05:00Z",
          permissionsVersion: "candidate-truth-v1",
        },
      });
    }
    if (url.pathname === "/bff/agora/trading-room") {
      return json(route, {
        data: {
          spec_version: "1.0",
          user_scope_ref: "candidate-truth-scope",
          strategies: [{
            strategy_id: "strategy-browser-aapl",
            strategy_spec_registry_id: "registry-browser-aapl",
            title: "Browser Candidate Strategy",
            readiness_state: "conditional",
            monitoring_state: "monitoring",
            pending_event_counts: { entry: 0, add: 0, reduce: 0, exit: 0, review: 0 },
            dashboard_recipe_id: "recipe-browser-aapl",
          }],
          queue_summary: { entry: 0, add: 0, reduce: 0, exit: 0, review: 0 },
          risk_summary: { state: "normal" },
          snapshot_at: asOf,
          data_cutoff: "2026-07-22T20:04:00Z",
        },
      });
    }
    if (url.pathname === "/bff/agora/trading-room/decision-events") {
      return json(route, { data: { items: [] }, page_info: { total: 0, page_size: 0 } }, { ETag: '"events-empty-v1"' });
    }
    const memberMatch = url.pathname.match(/^\/bff\/agora\/candidate-pools\/([^/]+)\/members$/);
    if (memberMatch) {
      const poolId = decodeURIComponent(memberMatch[1]);
      return json(route, {
        items: [candidate(poolId)],
        page_info: {
          next_page_token: null,
          page_size: 1,
          has_more: false,
          total: 1,
          order_by: "created_at,artifact_id",
        },
        meta: {
          snapshot_at: asOf,
          read_state: "formal",
          freshness: {
            pool_snapshot_at: "2026-07-22T20:00:00Z",
            data_cutoff: "2026-07-22T20:04:00Z",
            last_score_run_at: "2026-07-22T20:04:00Z",
          },
        },
      }, { ETag: '"candidate-browser-v1"' });
    }
    return json(route, { items: [] });
  });
  await installOidcDevLogin(page, {
    goto: false,
    roles: ["operator", "viewer"],
    tenantId: "tenant-a",
  });
  await installQuietEventSource(page);
}

test("renders same-identity live candidate truth on desktop and 393px mobile", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await installFixture(page);
  await page.goto("/agora/trading-room");
  await expect(page.getByTestId("trading-room-page")).toBeVisible();

  await expect(page.getByTestId("candidate-data-source")).toContainText("Live dataset");
  await expect(page.getByTestId("sample-data-warning")).toHaveCount(0);
  await expect(page.getByText(/Minor distribution from minor retail desks/i)).toHaveCount(0);

  if ((page.viewportSize()?.width ?? 1280) <= 393) {
    const mobileCard = page.getByTestId("candidate-mobile-card-AAPL");
    await expect(mobileCard).toBeVisible();
    await expect(mobileCard).toHaveAttribute("data-candidate-source", "live");
    await page.getByTestId("review-mobile-btn-AAPL").click();
  } else {
    const desktopRow = page.getByTestId("candidate-row-AAPL");
    await expect(desktopRow).toBeVisible();
    await expect(desktopRow).toHaveAttribute("data-candidate-source", "live");
    await desktopRow.click();
  }

  const drawer = page.getByTestId("candidate-review-drawer");
  await expect(drawer).toBeVisible();
  await expect(page.getByTestId("drawer-candidate-reason")).toHaveText(
    "Browser fixture rationale belongs only to artifact-browser-aapl.",
  );
  await expect(page.getByTestId("drawer-candidate-reason-provenance")).toContainText(
    "artifact-browser-aapl",
  );
  await expect(page.getByTestId("drawer-candidate-concerns")).toContainText("Unavailable");
  await expect(page.getByTestId("drawer-candidate-event")).toContainText("Unavailable");
  await expect(page.getByTestId("drawer-candidate-freshness")).toContainText(asOf);

  const overflow = await page.evaluate(() => ({
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewport);

  const accessibility = await new AxeBuilder({ page })
    .include('[data-testid="candidate-review-drawer"]')
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(
    accessibility.violations.filter((violation) =>
      violation.impact === "critical" || violation.impact === "serious"),
  ).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
