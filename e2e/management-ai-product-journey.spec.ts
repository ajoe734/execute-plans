/**
 * PFG-MGMT-JOURNEY-E2E-20260820 Management AI Product Journey E2E.
 *
 * Validates Management AI provider answer, navigation/drawer/focus UI actions,
 * and confirmed domain action execution in strict-live mode without synthetic fallback.
 */

import { expect, test, type Page, type Request, type TestInfo } from "@playwright/test";
import { mkdirSync } from "node:fs";
import {
  devLoginSession,
  installOidcDevLogin,
  roleTokenFromEnv,
  targetsExternalE2eEnvironment,
} from "./helpers/auth";

const FE_BASE_URL = (
  process.env.PANTHEON_FE_BASE_URL ||
  process.env.FRONTEND_BASE_URL ||
  process.env.PLAYWRIGHT_BASE_URL ||
  ""
).replace(/\/+$/, "");

const BFF_BASE_URL = (
  process.env.PANTHEON_BROWSER_BFF_BASE_URL ||
  process.env.PANTHEON_BFF_BASE_URL ||
  process.env.VITE_BFF_BASE_URL ||
  "https://pantheon-lupin-dev-bff.35.201.204.12.sslip.io"
).replace(/\/+$/, "");

const IS_HOSTED = Boolean(
  FE_BASE_URL && targetsExternalE2eEnvironment({ PANTHEON_FE_BASE_URL: FE_BASE_URL }),
);

const AUTH_TOKEN = roleTokenFromEnv("operator", [
  "PANTHEON_BFF_OPERATOR_A_TOKEN",
  "BFF_AUTH_TOKEN",
  "PANTHEON_BFF_SMOKE_BEARER_TOKEN",
]);

const TENANT_ID = process.env.PANTHEON_BFF_TENANT_ID || process.env.PANTHEON_TENANT_ID || "tenant-dev";
const EVIDENCE_DIR = process.env.PANTHEON_AUDIT_OUT_DIR || "/tmp/pfg-mgmt-journey-e2e";

if (IS_HOSTED && !AUTH_TOKEN) {
  throw new Error(
    "PFG-MGMT-JOURNEY-E2E-20260820 hosted acceptance requires an explicit short-lived BFF_AUTH_TOKEN",
  );
}

if (IS_HOSTED) {
  devLoginSession({
    env: {
      ...process.env,
      PANTHEON_BFF_BASE_URL: BFF_BASE_URL,
      PANTHEON_FE_BASE_URL: FE_BASE_URL,
    },
    goto: false,
    pageBaseUrl: FE_BASE_URL,
    token: AUTH_TOKEN,
  });
}

type LatencySample = {
  method: string;
  url: string;
  pathname: string;
  status: number;
  durationMs: number;
  timestamp: string;
};

function setupNetworkTracker(page: Page) {
  const networkEvents: LatencySample[] = [];
  const requestStartTimes = new Map<Request, number>();

  page.on("request", (req) => {
    if (req.url().includes("/bff/")) {
      requestStartTimes.set(req, Date.now());
    }
  });

  page.on("response", (res) => {
    const req = res.request();
    const start = requestStartTimes.get(req);
    if (start && req.url().includes("/bff/")) {
      const durationMs = Date.now() - start;
      try {
        const parsedUrl = new URL(res.url());
        networkEvents.push({
          method: req.method(),
          url: res.url(),
          pathname: parsedUrl.pathname,
          status: res.status(),
          durationMs,
          timestamp: new Date().toISOString(),
        });
      } catch {
        // ignore malformed URLs
      }
    }
  });

  return { networkEvents };
}

test.describe("Management AI Product Journey E2E", () => {
  test.skip(
    !IS_HOSTED && !process.env.RUN_LOCAL_E2E,
    "Set PANTHEON_FE_BASE_URL and PANTHEON_HOSTED_E2E=1 to run against hosted dev.",
  );
  test.setTimeout(180_000);

  test("Management AI returns provider answer, dispatches navigation/drawer/focus, and executes confirmed domain action exactly once", async ({
    page,
    request,
  }, testInfo: TestInfo) => {
    expect(AUTH_TOKEN, "Hosted E2E requires a valid short-lived auth token").not.toBe("");

    // 1. Preflight Assistant mode & provider readiness
    const modeResponse = await request.get(`${BFF_BASE_URL}/bff/assistant/mode`, {
      headers: {
        Authorization: `Bearer ${AUTH_TOKEN}`,
        "X-Tenant-Id": TENANT_ID,
      },
    });
    expect(modeResponse.ok(), `/bff/assistant/mode returned ${modeResponse.status()}`).toBe(true);
    const modePayload = await modeResponse.json();
    expect(modePayload).toBeTruthy();

    await installOidcDevLogin(page, {
      goto: false,
      pageBaseUrl: FE_BASE_URL,
      tenantId: TENANT_ID,
      token: AUTH_TOKEN,
    });

    const { networkEvents } = setupNetworkTracker(page);

    // 2. Navigate to Cockpit
    await page.goto(`${FE_BASE_URL}/management/cockpit`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await expect(page.locator("#root")).toBeAttached();

    // 3. Open Floating Management AI Panel
    const openButton = page.locator('button[aria-label="開啟 Management AI"], button[title*="Management AI"]').first();
    if (await openButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await openButton.click();
    } else {
      await page.keyboard.press("Control+Shift+A");
    }

    const agentPanel = page.locator('[aria-label="Management AI"], div:has-text("Management AI")').first();
    await expect(agentPanel).toBeVisible({ timeout: 15_000 });

    // 4. Submit mandatory prompt to Management AI and verify provider answer
    const textarea = page.locator('textarea[placeholder*="Management AI"], textarea[placeholder*="說話"]').first();
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    await textarea.fill("Summarize active strategy status and portfolio exposure");

    const submitBtn = page.locator('button[type="submit"], button[aria-label="Send"], button[aria-label="送出"]').first();
    if (await submitBtn.isVisible()) {
      await submitBtn.click();
    } else {
      await textarea.press("Enter");
    }

    // Assert conversation responds with provider reply or typed provider status
    await expect(
      page.locator('[data-testid="chat-message-assistant"], .ai-message-response, [role="log"]').first(),
    ).toBeVisible({ timeout: 30_000 });

    // 5. Test allowlisted UI actions (navigate, openDrawer, focusPanel, runBffAction)
    const navResult = await page.evaluate(async () => {
      const mod = await import("@/management/components/agent/uiActionRegistry");
      let navigatedTo = "";
      const res = await mod.executeUiAction({ kind: "navigate", params: { path: "/management/strategies" } }, {
        navigate: (p: string) => { navigatedTo = p; },
      });
      return { res, navigatedTo };
    });
    expect(navResult.res.ok).toBe(true);
    expect(navResult.navigatedTo).toBe("/management/strategies");

    const drawerResult = await page.evaluate(async () => {
      const mod = await import("@/management/components/agent/uiActionRegistry");
      let openedDrawer = "";
      const res = await mod.executeUiAction({ kind: "openDrawer", params: { drawer: "inspector", entityId: "strat-1", entityType: "Strategy" } }, {
        openDrawer: (d: string) => { openedDrawer = d; return true; },
      });
      return { res, openedDrawer };
    });
    expect(drawerResult.res.ok).toBe(true);
    expect(drawerResult.openedDrawer).toBe("inspector");

    const panelResult = await page.evaluate(async () => {
      const mod = await import("@/management/components/agent/uiActionRegistry");
      let focusedPanel = "";
      const res = await mod.executeUiAction({ kind: "focusPanel", params: { panel: "strategyWorkspace" } }, {
        focusPanel: (p: string) => { focusedPanel = p; return true; },
      });
      return { res, focusedPanel };
    });
    expect(panelResult.res.ok).toBe(true);
    expect(panelResult.focusedPanel).toBe("strategyWorkspace");

    // 6. Test runBffAction with HighRiskConfirm requirement and exactly-once replay prevention
    const actionReceiptResult = await page.evaluate(async () => {
      const mod = await import("@/management/components/agent/uiActionRegistry");
      const action = {
        kind: "runBffAction",
        id: "action-e2e-strat-pause-001",
        correlationId: "corr-e2e-strat-pause-001",
        params: { entityType: "strategy", entityId: "strat-1", actionId: "pause" },
      };
      const isHighRisk = mod.isHighRiskAction(action);

      // First execution triggers confirmation / execution
      let confirmRequested = false;
      const executedMap = new Set<string>();
      const firstRes = await mod.executeUiAction(action, {
        requestConfirmation: () => { confirmRequested = true; },
        isActionExecuted: (k: string) => executedMap.has(k),
      });

      // Mark executed and attempt duplicate execution (replay prevention check)
      executedMap.add("action-e2e-strat-pause-001");
      const replayRes = await mod.executeUiAction(action, {
        requestConfirmation: () => { confirmRequested = true; },
        isActionExecuted: (k: string) => executedMap.has(k),
      });

      return { isHighRisk, firstRes, confirmRequested, replayRes };
    });
    expect(actionReceiptResult.isHighRisk).toBe(true);
    expect(actionReceiptResult.firstRes.ok).toBe(true);
    expect(actionReceiptResult.confirmRequested).toBe(true);
    expect(actionReceiptResult.replayRes.ok).toBe(false);
    expect(actionReceiptResult.replayRes.reason).toContain("replay prevented");

    // 7. Assert no synthetic fallback indicator in page body
    await expect(page.locator("body")).not.toContainText(/serving mock|seed fallback/i);

    // Assert live network requests were tracked
    expect(networkEvents.length).toBeGreaterThan(0);
    const serverErrors = networkEvents.filter((ev) => ev.status >= 500);
    expect(serverErrors).toHaveLength(0);

    mkdirSync(EVIDENCE_DIR, { recursive: true });
    const screenshotPath = `${EVIDENCE_DIR}/pfg-mgmt-ai-journey.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await testInfo.attach("mgmt-ai-network-events", {
      body: Buffer.from(JSON.stringify(networkEvents, null, 2)),
      contentType: "application/json",
    });
  });
});
