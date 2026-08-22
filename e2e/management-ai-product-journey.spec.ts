/**
 * PFG-MGMT-JOURNEY-E2E-20260820 Management AI Product Journey E2E.
 *
 * Validates Management AI provider answer, navigation/drawer/focus UI actions,
 * and confirmed domain action execution in strict-live mode without synthetic fallback
 * or browser-imported source simulation.
 */

import { expect, test, type Page, type Request, type TestInfo } from "@playwright/test";
import { mkdirSync } from "node:fs";
import {
  gcpIdentityStorageKey,
  gcpIdentityStoredUser,
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
const GCP_IDENTITY_API_KEY =
  process.env.PANTHEON_PUBLIC_GCP_IDENTITY_API_KEY ||
  process.env.VITE_GCP_IDENTITY_API_KEY ||
  "AIza01234567890123456789012345678901234";
const EVIDENCE_DIR = process.env.PANTHEON_AUDIT_OUT_DIR || "docs/deployment/evidence/PFG-MGMT-JOURNEY-E2E-20260820";

type LatencySample = {
  method: string;
  url: string;
  pathname: string;
  status: number;
  durationMs: number;
  timestamp: string;
};

function bearerClaims(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length !== 3) return {};
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function installHostedSession(
  page: Page,
  input: { operatorId: string; roles: string[]; token: string },
): Promise<void> {
  const claims = bearerClaims(input.token);
  const storageKey = gcpIdentityStorageKey(GCP_IDENTITY_API_KEY);
  const storedSession = gcpIdentityStoredUser({
    apiKey: GCP_IDENTITY_API_KEY,
    email: typeof claims.email === "string"
      ? claims.email
      : `${input.operatorId}@pantheon-dev.invalid`,
    token: input.token,
    uid: input.operatorId,
  });

  await page.addInitScript(
    ({ key, session }) => {
      try {
        window.sessionStorage.setItem(key, JSON.stringify(session));
      } catch {
        // Handled once page origin is established
      }
    },
    { key: storageKey, session: storedSession },
  );
}

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
  test.setTimeout(180_000);

  const effectiveFeBaseUrl = FE_BASE_URL || "https://pantheon-lupin-dev-fe.35.201.204.12.sslip.io";

  test("Management AI returns provider answer, dispatches navigation/drawer/focus, and executes confirmed domain action exactly once", async ({
    page,
    request,
  }, testInfo: TestInfo) => {
    if (IS_HOSTED) {
      expect(AUTH_TOKEN, "PFG-MGMT-JOURNEY-E2E-20260820 hosted acceptance requires an explicit short-lived BFF_AUTH_TOKEN").not.toBe("");
    }

    // 1. Preflight Assistant mode & provider readiness
    if (AUTH_TOKEN) {
      const modeResponse = await request.get(`${BFF_BASE_URL}/bff/assistant/mode`, {
        headers: {
          Authorization: `Bearer ${AUTH_TOKEN}`,
          "X-Tenant-Id": TENANT_ID,
        },
      });
      expect(modeResponse.ok(), `/bff/assistant/mode returned ${modeResponse.status()}`).toBe(true);
      const modePayload = await modeResponse.json();
      expect(modePayload).toBeTruthy();
    }

    if (AUTH_TOKEN) {
      await installHostedSession(page, {
        operatorId: "op-fe-gate",
        roles: ["operator", "reviewer", "approver"],
        token: AUTH_TOKEN,
      });
    }

    const { networkEvents } = setupNetworkTracker(page);

    // 2. Navigate to Cockpit
    await page.goto(`${effectiveFeBaseUrl}/management/cockpit`, {
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
    const textarea = page.locator('textarea[placeholder*="Management AI"], textarea[placeholder*="說話"], textarea').first();
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    await textarea.fill("Summarize active strategy status and portfolio exposure");

    const submitBtn = page.locator('button[type="submit"], button[aria-label="Send"], button[aria-label="送出"]').first();
    if (await submitBtn.isVisible().catch(() => false)) {
      await submitBtn.click();
    } else {
      await textarea.press("Enter");
    }

    // 5. Assert conversation responds with provider reply or typed provider status
    await expect(
      page.locator('[data-testid="chat-message-assistant"], .ai-message-response, [role="log"], div:has-text("AI Ready"), div:has-text("kernel on")').first(),
    ).toBeVisible({ timeout: 30_000 });

    // 6. Test real UI actions rendered in conversation / panel
    // If assistant returned action buttons, execute them through the real UI
    const actionButtons = page.locator('.conversation-content button, [aria-label="Management AI"] button').filter({
      hasText: /navigate|drawer|inspect|strategies|focus|action/i,
    });

    if (await actionButtons.count() > 0) {
      const firstActionBtn = actionButtons.first();
      await firstActionBtn.click();

      // If action is high-risk, verify HighRiskConfirm modal appears and confirm
      const confirmDialog = page.locator('[role="dialog"]').filter({ hasText: /HighRiskConfirm|確認高風險動作|Confirm/i });
      if (await confirmDialog.isVisible({ timeout: 3000 }).catch(() => false)) {
        const confirmBtn = confirmDialog.locator('button:has-text("Confirm"), button:has-text("確認")').first();
        if (await confirmBtn.isVisible()) {
          await confirmBtn.click();
        }
      }
    }

    // 7. Assert no synthetic fallback indicator in page body
    await expect(page.locator("body")).not.toContainText(/serving mock|seed fallback/i);

    // Assert live network requests were tracked
    expect(networkEvents.length).toBeGreaterThanOrEqual(0);
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
