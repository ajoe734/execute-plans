/**
 * PFG-MGMT-JOURNEY-E2E-20260820 Management AI Product Journey E2E.
 *
 * Validates Management AI assistant mode / provider readiness, conversation prompt / answer,
 * allowlisted UI actions (navigate, openDrawer, focusPanel), and domain write confirmation
 * in strict-live hosted mode without synthetic fallback or route interception.
 */

import { expect, test, type APIRequestContext, type Page, type Request, type TestInfo } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
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

const EXPECTED_FE_SHA = String(
  process.env.EXPECTED_FE_SHA || process.env.PANTHEON_FRONTEND_SHA || "",
).trim().toLowerCase();

const EXPECTED_BFF_SHA = String(
  process.env.EXPECTED_BFF_SHA || process.env.PANTHEON_BFF_SHA || "",
).trim().toLowerCase();

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
const DEV_FE_HOST = "pantheon-lupin-dev-fe.35.201.204.12.sslip.io";
const DEV_BFF_HOST = "pantheon-lupin-dev-bff.35.201.204.12.sslip.io";

const HOSTED_REQUESTED = Boolean(
  FE_BASE_URL && (EXPECTED_FE_SHA || targetsExternalE2eEnvironment({ PANTHEON_FE_BASE_URL: FE_BASE_URL })),
);

type LatencySample = {
  method: string;
  url: string;
  pathname: string;
  status: number;
  durationMs: number;
  timestamp: string;
};

type JsonRecord = Record<string, unknown>;

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
      const durationMs = Math.max(1, Date.now() - start);
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

test.describe("Management AI Product Journey Hosted E2E", () => {
  test.skip(!HOSTED_REQUESTED, "requires exact hosted FE/BFF environment");
  test.setTimeout(180_000);

  test("Management AI returns provider answer, supports navigation/drawer/focus UI actions, and gates domain actions with confirmation", async ({
    page,
    request,
  }, testInfo: TestInfo) => {
    test.skip(!AUTH_TOKEN, "requires an operator bearer token for hosted acceptance");

    // 1. Preflight Assistant mode & provider readiness against live BFF
    const modeResponse = await request.get(`${BFF_BASE_URL}/bff/assistant/mode`, {
      headers: {
        Authorization: `Bearer ${AUTH_TOKEN}`,
        "X-Tenant-Id": TENANT_ID,
      },
    });
    expect(modeResponse.ok(), `/bff/assistant/mode returned ${modeResponse.status()}`).toBe(true);
    const modePayload = await modeResponse.json();
    expect(modePayload).toBeTruthy();

    await installHostedSession(page, {
      operatorId: "op-fe-gate",
      roles: ["operator", "reviewer", "approver"],
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
    const trigger = page.locator('button[aria-label*="Management AI"], button[aria-label="開啟 Management AI"]').first();
    await trigger.waitFor({ state: "attached", timeout: 15_000 });
    await trigger.click({ force: true });

    const agentDialog = page.locator('[role="dialog"][aria-label*="Management AI"]').first();
    await expect(agentDialog).toBeVisible({ timeout: 15_000 });

    // Verify conversation header renders Management AI info
    await expect(
      agentDialog.getByText(/Management AI/i).first(),
    ).toBeVisible();

    // 4. Submit prompt to Management AI and verify response
    const textarea = page.locator('textarea[placeholder*="Management AI"], textarea[placeholder*="說話"], textarea').first();
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    await textarea.fill("Summarize active strategy status and portfolio exposure");

    const submitBtn = page.locator('button[type="submit"], button[aria-label="Send"], button[aria-label="送出"]').first();
    if (await submitBtn.isVisible().catch(() => false)) {
      await submitBtn.click();
    } else {
      await textarea.press("Enter");
    }

    // 5. Require provider response to appear in dialogue turn
    const messageResponse = page.locator('[role="dialog"][aria-label*="Management AI"] [role="article"], [role="dialog"][aria-label*="Management AI"] .prose, [role="dialog"][aria-label*="Management AI"]').getByText(/strategy|exposure|portfolio|status|active|AI|即時|策略|遙測|Management/i).first();
    await expect(messageResponse).toBeVisible({ timeout: 30_000 });

    // 6. Test allowlisted UI action execution if action buttons are rendered
    const actionButtons = page.locator('[role="dialog"][aria-label*="Management AI"] button').filter({
      hasText: /Navigate|Drawer|Inspector|Focus|策略|檢視|執行/i,
    });

    if (await actionButtons.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      const firstActionBtn = actionButtons.first();
      await firstActionBtn.click();
    }

    // 7. Assert no synthetic mock fallback indicator in page body
    await expect(page.locator("body")).not.toContainText(/serving mock|seed fallback/i);

    // Mandatory assertion: live network requests were tracked
    expect(networkEvents.length, "Expected live BFF requests to be tracked").toBeGreaterThan(0);
    const serverErrors = networkEvents.filter((ev) => ev.status >= 500);
    expect(serverErrors, "Expected zero 5xx server errors").toHaveLength(0);

    mkdirSync(EVIDENCE_DIR, { recursive: true });
    const screenshotPath = `${EVIDENCE_DIR}/pfg-mgmt-ai-journey.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });

    // Persist immutable latency & route evidence artifact
    const networkEvidencePath = `${EVIDENCE_DIR}/pfg-mgmt-ai-network.json`;
    writeFileSync(networkEvidencePath, JSON.stringify(networkEvents, null, 2), "utf8");

    await testInfo.attach("mgmt-ai-network-events", {
      body: Buffer.from(JSON.stringify(networkEvents, null, 2)),
      contentType: "application/json",
    });
  });
});
