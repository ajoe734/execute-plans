import { expect, test, type Page, type Route } from "@playwright/test";
import {
  installContainedLoopbackAuth,
  installContainedLoopbackAuthAuthority,
  targetsExternalE2eEnvironment,
} from "./helpers/auth";

test.use({
  launchOptions: {
    ignoreDefaultArgs: ["--hide-scrollbars"],
  },
});

const DEFAULT_FRONTEND_BASE_URL = "http://127.0.0.1:5173";

export const APPROVAL_68_CHAR_ID =
  "apv-07db6c62179bfb41bcb790001c955022535fe863aa003a8458e1eea8d62c7574";
export const PENDING_68_CHAR_ID =
  "apv-pending-179bfb41bcb790001c955022535fe863aa003a8458e1eea8d62c7574";

const REAL_HOSTED_DECISION_ROW = {
  id: APPROVAL_68_CHAR_ID,
  decision_id: APPROVAL_68_CHAR_ID,
  version: 2,
  actor_id: "pantheon-dev-admin-test",
  decision: "approved",
  outcome: "approved",
  status: "decided",
  state: "decided",
  decision_state: "decided",
  decision_type: "registry_entry",
  rationale: "approval",
  target_id: "hosted-all12-h12-claude-20261027-4923-execution-artifact",
  target_type: "registry_entry",
  target_version: "1.0.0",
  tenant_id: "tenant-dev",
  actor_role: "governance_reviewer",
  conditions: [],
  created_at: "2026-11-01T14:50:02Z",
  submitted_at: "2026-11-01T14:50:02Z",
  submitted_by: "pantheon-dev-admin-test",
  owner_user_id: "pantheon-dev-admin-test",
  decided_at: "2026-11-01T14:50:02Z",
  expires_at: "2026-11-08T14:50:02Z",
  persona_id: "persona-strat-hosted-all12-h12-claude-20261027-4923-src-106b4057d07a",
  capital_pool_id: "hosted-all12-h12-claude-20261027-4923-pool",
  revoked_at: null,
  risk_level: "low",
  evidence_refs: [],
  allowedActions: [],
  authority_status: "authoritative",
  decision_context: {
    governance_chain: {
      target_id: "hosted-all12-h12-claude-20261027-4923-execution-artifact",
      target_version: "1.0.0",
    },
  },
};

const PENDING_APPROVAL_ROW = {
  id: PENDING_68_CHAR_ID,
  approval_id: PENDING_68_CHAR_ID,
  decision_id: PENDING_68_CHAR_ID,
  version: 1,
  outcome: null,
  status: "pending",
  state: "pending",
  decision_state: "proposed",
  target_type: "registry_entry",
  target_id: "pending-all12-h12-claude-20261106-execution-artifact",
  target_version: "1.0.0",
  owner_user_id: "pantheon-dev-admin-test",
  risk_level: "medium",
  created_at: "2026-11-06T00:00:00Z",
};

function frontendUrl(path = "/"): string {
  const base =
    process.env.PANTHEON_FE_BASE_URL ||
    process.env.FRONTEND_BASE_URL ||
    process.env.PLAYWRIGHT_BASE_URL ||
    DEFAULT_FRONTEND_BASE_URL;
  return `${base.replace(/\/$/, "")}${path}`;
}

function corsHeaders(route: Route): Record<string, string> {
  const origin = route.request().headers()["origin"] || "*";
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers": [
      "accept",
      "authorization",
      "content-type",
      "idempotency-key",
      "if-match",
      "x-bff-api-version",
      "x-correlation-id",
      "x-locale",
      "x-request-id",
      "x-tenant-id",
      "x-trace-id",
    ].join(","),
    "access-control-expose-headers": [
      "x-bff-api-version",
      "x-correlation-id",
      "x-request-id",
    ].join(","),
    vary: "Origin",
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

function listEnvelope(items: unknown[] = []): Record<string, unknown> {
  return {
    items,
    cursor: {},
    pageSize: items.length,
    totalCountExact: true,
    estimatedTotal: items.length,
    meta: {
      snapshot_at: "2026-11-06T01:00:00Z",
      source: "fe-approval-badge-layout-fixture",
      status: "ok",
      surfaces: {
        canonical_read: { source: "service_client", status: "ok" },
      },
    },
  };
}

async function installApprovalsLayoutRoutes(page: Page): Promise<Set<string>> {
  const calls = new Set<string>();

  await installContainedLoopbackAuth(page);
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (request.method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: corsHeaders(route),
      });
      return;
    }

    if (path === "/health" || path === "/healthz" || path === "/readyz") {
      calls.add(path);
      await fulfillJson(route, {
        status: "ok",
        live: true,
        ready: true,
        service: "fe-approval-badge-layout-fixture",
        checked_at: "2026-11-06T01:00:00Z",
      });
      return;
    }

    if (path === "/bff/events/stream") {
      calls.add(path);
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        headers: {
          ...corsHeaders(route),
          "cache-control": "no-cache",
        },
        body: ": connected\n\n",
      });
      return;
    }

    if (path === "/bff/management/shell-summary") {
      calls.add(path);
      await fulfillJson(route, {
        data: {
          counts: { approvals: 1, alerts: 0, jobs: 0 },
          session: { authenticated: true },
          transport: { status: "live" },
        },
        meta: {
          snapshot_at: "2026-11-06T01:00:00Z",
          source: "bff_composed",
          status: "ok",
          surfaces: {
            approvals: { source: "service_client", status: "ok" },
            alerts: { source: "service_client", status: "ok" },
            jobs: { source: "service_client", status: "ok" },
          },
        },
      });
      return;
    }

    if (path === "/bff/approvals") {
      calls.add(path);
      await fulfillJson(route, listEnvelope([PENDING_APPROVAL_ROW]));
      return;
    }

    if (path === "/api/v1/approval-decisions") {
      calls.add(path);
      await fulfillJson(route, {
        data: [REAL_HOSTED_DECISION_ROW],
        meta: {
          route: "GET /api/v1/approval-decisions",
          snapshot_at: "2026-11-06T01:00:00Z",
          source: "service_client",
          status: "ok",
          total: 1,
        },
      });
      return;
    }

    if (path === "/bff/alerts" || path === "/bff/jobs" || path === "/bff/search") {
      calls.add(path);
      await fulfillJson(route, listEnvelope([]));
      return;
    }

    if (path.startsWith("/bff/") || path.startsWith("/api/")) {
      calls.add(path);
      await fulfillJson(route, listEnvelope([]));
      return;
    }

    await route.continue();
  });

  await installContainedLoopbackAuthAuthority(page);
  return calls;
}

test.describe("FE-APPROVAL-BADGE-LAYOUT-20261106 Approvals badge and drawer id layout", () => {
  test.setTimeout(120_000);
  test.skip(
    targetsExternalE2eEnvironment(),
    "route-mocked layout regression runs on loopback; hosted environment uses live coordinator verification",
  );

  test("keeps table and drawer status badges <= 24px high and wraps 68-char approval id inside sheet at 1440 and 1280 with visible scrollbars", async ({
    browser,
  }) => {
    expect(APPROVAL_68_CHAR_ID).toHaveLength(68);
    expect(PENDING_68_CHAR_ID).toHaveLength(68);

    const realScrollbarBrowser = await browser.browserType().launch({
      ignoreDefaultArgs: ["--hide-scrollbars"],
    });

    try {
      const measurementsByViewport: Record<string, unknown> = {};

      for (const width of [1440, 1280] as const) {
        const context = await realScrollbarBrowser.newContext({
          viewport: { width, height: 900 },
        });
        const page = await context.newPage();
        const calls = await installApprovalsLayoutRoutes(page);

        await page.goto(frontendUrl("/management/approvals"), {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        });

        await expect
          .poll(() => calls.has("/bff/approvals"), {
            message: "Approvals page must request GET /bff/approvals on initial load",
            timeout: 15_000,
          })
          .toBe(true);

        const allFilterButton = page.getByRole("button", { name: /^(全部|All)$/ });
        await expect(allFilterButton).toBeVisible({ timeout: 15_000 });
        await allFilterButton.click();

        await expect
          .poll(() => calls.has("/api/v1/approval-decisions"), {
            message: "Approvals page must request GET /api/v1/approval-decisions when all filter is selected",
            timeout: 15_000,
          })
          .toBe(true);

        const row = page
          .locator("tbody tr")
          .filter({ hasText: REAL_HOSTED_DECISION_ROW.target_id })
          .first();
        await expect(row).toBeVisible({ timeout: 15_000 });

        const tableRiskBadge = row.locator("td").nth(3).locator("div").first();
        const tableStatusBadge = row.locator("td").nth(4).locator("div").first();
        await expect(tableStatusBadge).toBeVisible();
        await expect(tableRiskBadge).toBeVisible();

        const tableStatusBox = await tableStatusBadge.boundingBox();
        const tableRiskBox = await tableRiskBadge.boundingBox();
        expect(tableStatusBox).not.toBeNull();
        expect(tableRiskBox).not.toBeNull();
        expect(tableStatusBox!.height).toBeGreaterThan(0);
        expect(tableStatusBox!.height).toBeLessThanOrEqual(24);
        expect(tableRiskBox!.height).toBeGreaterThan(0);
        expect(tableRiskBox!.height).toBeLessThanOrEqual(24);

        const docBeforeDrawer = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          innerWidth: window.innerWidth,
        }));
        expect(docBeforeDrawer.scrollWidth).toBeLessThanOrEqual(docBeforeDrawer.clientWidth);

        await row.click();

        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible({ timeout: 15_000 });
        await page.evaluate(() => {
          document.getAnimations().forEach((anim) => anim.finish());
        });
        await expect
          .poll(
            async () => {
              const box = await dialog.boundingBox();
              return box ? Math.round(box.x + box.width) : 0;
            },
            { timeout: 5_000 },
          )
          .toBe(width);

        const idSpan = dialog.getByText(APPROVAL_68_CHAR_ID, { exact: true });
        await expect(idSpan).toBeVisible();
        await expect(idSpan).toHaveText(APPROVAL_68_CHAR_ID);

        const headerBadgeRow = idSpan.locator("..");
        const drawerRiskBadge = headerBadgeRow.locator("> div").nth(0);
        const drawerStatusBadge = headerBadgeRow.locator("> div").nth(1);
        const closeButton = dialog.locator("> button").first();
        await expect(closeButton).toBeVisible();

        const dialogBox = await dialog.boundingBox();
        const idBox = await idSpan.boundingBox();
        const drawerStatusBox = await drawerStatusBadge.boundingBox();
        const drawerRiskBox = await drawerRiskBadge.boundingBox();
        const closeButtonBox = await closeButton.boundingBox();

        expect(dialogBox).not.toBeNull();
        expect(idBox).not.toBeNull();
        expect(drawerStatusBox).not.toBeNull();
        expect(drawerRiskBox).not.toBeNull();
        expect(closeButtonBox).not.toBeNull();

        const layoutMetrics = await page.evaluate((expectedId) => {
          const round2 = (n: number) => Number(n.toFixed(2));
          const toRect = (r: DOMRect) => ({
            x: round2(r.x),
            y: round2(r.y),
            width: round2(r.width),
            height: round2(r.height),
            top: round2(r.top),
            right: round2(r.right),
            bottom: round2(r.bottom),
            left: round2(r.left),
          });
          const rectsIntersect = (
            a: { left: number; right: number; top: number; bottom: number },
            b: { left: number; right: number; top: number; bottom: number },
          ) =>
            a.left < b.right &&
            a.right > b.left &&
            a.top < b.bottom &&
            a.bottom > b.top;

          const measureLines = (el: HTMLElement) => {
            const range = document.createRange();
            range.selectNodeContents(el);
            const rects = Array.from(range.getClientRects()).filter(
              (r) => r.width > 0 && r.height > 0,
            );
            const distinctTops = new Set(rects.map((r) => Math.round(r.top)));
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            return {
              text: el.textContent ?? "",
              width: Number(rect.width.toFixed(2)),
              height: Number(rect.height.toFixed(2)),
              left: Number(rect.left.toFixed(2)),
              right: Number(rect.right.toFixed(2)),
              whiteSpace: style.whiteSpace,
              wordBreak: style.wordBreak,
              minWidth: style.minWidth,
              lineCount: Math.max(1, distinctTops.size),
            };
          };

          const tr = document.querySelector<HTMLTableRowElement>("tbody tr")!;
          const tds = tr.querySelectorAll<HTMLTableCellElement>("td");
          const tableRiskEl = tds[3]!.querySelector<HTMLElement>("div")!;
          const tableStatusEl = tds[4]!.querySelector<HTMLElement>("div")!;

          const sheetEl = document.querySelector<HTMLElement>('[role="dialog"]')!;
          const sheetRect = sheetEl.getBoundingClientRect();
          const closeBtnEl = Array.from(sheetEl.children).find(
            (el): el is HTMLButtonElement => el.tagName === "BUTTON",
          )!;
          const closeBtnRect = toRect(closeBtnEl.getBoundingClientRect());
          const idEl = Array.from(sheetEl.querySelectorAll<HTMLElement>("span")).find(
            (el) => el.textContent === expectedId,
          )!;
          const headerRow = idEl.parentElement!;
          const headerRowStyle = window.getComputedStyle(headerRow);
          const badgeDivs = headerRow.querySelectorAll<HTMLElement>(":scope > div");
          const drawerRiskEl = badgeDivs[0]!;
          const drawerStatusEl = badgeDivs[1]!;

          const idRange = document.createRange();
          idRange.selectNodeContents(idEl);
          const idLineRects = Array.from(idRange.getClientRects())
            .filter((r) => r.width > 0 && r.height > 0)
            .map((r, lineIndex) => {
              const lineRect = toRect(r);
              const intersects = rectsIntersect(lineRect, closeBtnRect);
              const intersectionWidthPx = intersects
                ? round2(
                    Math.max(0, Math.min(lineRect.right, closeBtnRect.right) - Math.max(lineRect.left, closeBtnRect.left)),
                  )
                : 0;
              const intersectionHeightPx = intersects
                ? round2(
                    Math.max(0, Math.min(lineRect.bottom, closeBtnRect.bottom) - Math.max(lineRect.top, closeBtnRect.top)),
                  )
                : 0;
              return {
                lineIndex,
                ...lineRect,
                horizontalClearanceToCloseButtonPx: round2(closeBtnRect.left - lineRect.right),
                intersectionWidthPx,
                intersectionHeightPx,
                intersectsCloseButton: intersects,
              };
            });

          return {
            viewport: {
              innerWidth: window.innerWidth,
              innerHeight: window.innerHeight,
              documentScrollWidth: document.documentElement.scrollWidth,
              documentClientWidth: document.documentElement.clientWidth,
              bodyScrollWidth: document.body.scrollWidth,
              bodyClientWidth: document.body.clientWidth,
            },
            tableRiskBadge: measureLines(tableRiskEl),
            tableStatusBadge: measureLines(tableStatusEl),
            sheet: {
              left: Number(sheetRect.left.toFixed(2)),
              right: Number(sheetRect.right.toFixed(2)),
              width: Number(sheetRect.width.toFixed(2)),
            },
            headerBadgeRow: {
              paddingRight: headerRowStyle.paddingRight,
            },
            closeButton: closeBtnRect,
            drawerRiskBadge: measureLines(drawerRiskEl),
            drawerStatusBadge: measureLines(drawerStatusEl),
            drawerIdSpan: measureLines(idEl),
            drawerIdLines: idLineRects,
          };
        }, APPROVAL_68_CHAR_ID);

        expect(drawerStatusBox!.height).toBeGreaterThan(0);
        expect(drawerStatusBox!.height).toBeLessThanOrEqual(24);
        expect(drawerRiskBox!.height).toBeGreaterThan(0);
        expect(drawerRiskBox!.height).toBeLessThanOrEqual(24);

        const idRightEdge = Number((idBox!.x + idBox!.width).toFixed(2));
        const sheetRightEdge = Number((dialogBox!.x + dialogBox!.width).toFixed(2));
        expect(idRightEdge).toBeLessThanOrEqual(sheetRightEdge);
        expect(layoutMetrics.drawerIdSpan.right).toBeLessThanOrEqual(layoutMetrics.sheet.right);
        expect(layoutMetrics.drawerIdSpan.text).toBe(APPROVAL_68_CHAR_ID);
        expect(layoutMetrics.drawerIdSpan.text).toHaveLength(68);
        expect(layoutMetrics.tableStatusBadge.lineCount).toBe(1);
        expect(layoutMetrics.drawerStatusBadge.lineCount).toBe(1);
        expect(layoutMetrics.viewport.documentScrollWidth).toBeLessThanOrEqual(
          layoutMetrics.viewport.documentClientWidth,
        );

        expect(layoutMetrics.closeButton.width).toBeGreaterThan(0);
        expect(layoutMetrics.closeButton.height).toBeGreaterThan(0);
        expect(layoutMetrics.drawerIdLines.length).toBeGreaterThanOrEqual(2);
        for (const line of layoutMetrics.drawerIdLines) {
          expect(line.intersectsCloseButton).toBe(false);
          expect(line.intersectionWidthPx).toBe(0);
          expect(line.intersectionHeightPx).toBe(0);
          expect(line.right).toBeLessThanOrEqual(layoutMetrics.closeButton.left);
        }

        measurementsByViewport[String(width)] = {
          boundingBoxes: {
            tableRiskBadge: tableRiskBox,
            tableStatusBadge: tableStatusBox,
            drawerRiskBadge: drawerRiskBox,
            drawerStatusBadge: drawerStatusBox,
            drawerIdSpan: idBox,
            closeButton: closeButtonBox,
            sheetDialog: dialogBox,
            idRightEdge,
            sheetRightEdge,
            rightClearancePx: Number((sheetRightEdge - idRightEdge).toFixed(2)),
          },
          computed: layoutMetrics,
        };

        await context.close();
      }

      console.log(
        "FE-APPROVAL-BADGE-LAYOUT-20261106 measurements:",
        JSON.stringify(measurementsByViewport),
      );
    } finally {
      await realScrollbarBrowser.close();
    }
  });
});
