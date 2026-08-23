/**
 * PFG-MGMT-JOURNEY-E2E-20260820 Management AI Product Journey E2E.
 *
 * Validates Management AI assistant mode / provider readiness, conversation prompt / answer,
 * action-specific allowlisted UI actions (navigate, openDrawer, focusPanel), and confirmed
 * domain write execution (runBffAction via HighRiskConfirm with exactly-once POST, receipt,
 * and replay prevention) in strict-live hosted mode without synthetic fallback or route interception.
 */

import { expect, test, type APIRequestContext, type Page, type Request, type TestInfo } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import {
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
  "DEV_BFF_OPERATOR_A_TOKEN",
  "BFF_AUTH_TOKEN",
  "PANTHEON_BFF_SMOKE_BEARER_TOKEN",
]);

const TENANT_ID = process.env.PANTHEON_BFF_TENANT_ID || process.env.PANTHEON_TENANT_ID || "tenant-dev";

const EVIDENCE_DIR = process.env.PANTHEON_AUDIT_OUT_DIR || "docs/deployment/evidence/PFG-MGMT-JOURNEY-E2E-20260820";

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

type ManagementStreamSummary = {
  answerChars: number;
  errorCodes: string[];
  eventTypes: string[];
  providerStatus: string | null;
  providerUsed: boolean | null;
  uiActionKinds: string[];
};

function summarizeManagementStream(raw: string): ManagementStreamSummary {
  const eventTypes: string[] = [];
  const errorCodes: string[] = [];
  const uiActionKinds: string[] = [];
  let answerChars = 0;
  let providerStatus: string | null = null;
  let providerUsed: boolean | null = null;

  for (const line of raw.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const data = trimmed.slice(5).trim();
    if (!data || data === "[DONE]") continue;
    let event: JsonRecord;
    try {
      event = JSON.parse(data) as JsonRecord;
    } catch {
      continue;
    }
    const type = typeof event.type === "string" ? event.type : "unknown";
    eventTypes.push(type);
    if (type === "delta" || type === "done") {
      answerChars = Math.max(answerChars, String(event.text ?? "").trim().length);
    }
    if (type === "error") {
      errorCodes.push(String(event.error_code ?? event.code ?? "unknown"));
    }
    const status = (event.provider_status ?? event.providerStatus) as JsonRecord | undefined;
    if (status && typeof status === "object") {
      providerStatus = typeof status.status === "string" ? status.status : providerStatus;
      providerUsed = typeof status.used === "boolean" ? status.used : providerUsed;
    }
    const actions = event.ui_actions ?? event.uiActions ?? event.actions;
    if (Array.isArray(actions)) {
      for (const action of actions) {
        if (!action || typeof action !== "object") continue;
        const kind = String((action as JsonRecord).kind ?? "").trim();
        if (kind && !uiActionKinds.includes(kind)) uiActionKinds.push(kind);
      }
    }
  }

  return { answerChars, errorCodes, eventTypes, providerStatus, providerUsed, uiActionKinds };
}

async function getOrMintAuthToken(request: APIRequestContext): Promise<string> {
  const token = roleTokenFromEnv("operator", [
    "PANTHEON_BFF_OPERATOR_A_TOKEN",
    "DEV_BFF_OPERATOR_A_TOKEN",
    "BFF_AUTH_TOKEN",
    "PANTHEON_BFF_SMOKE_BEARER_TOKEN",
  ]);
  if (token) {
    try {
      const res = await request.get(`${BFF_BASE_URL}/bff/me`, {
        headers: { Authorization: `Bearer ${token}`, "X-Tenant-Id": TENANT_ID },
      });
      if (res.ok()) return token;
    } catch {
      // probe failed, fallback to dev-login
    }
  }

  const clientId = process.env.DEV_LOGIN_CLIENT_ID || process.env.DEV_BFF_DEV_LOGIN_OPERATOR_A_CLIENT_ID || "pantheon-dev-operator-a-v1";
  const clientSecret = process.env.DEV_LOGIN_CLIENT_SECRET || process.env.DEV_BFF_DEV_LOGIN_OPERATOR_A_CLIENT_SECRET;
  if (clientSecret) {
    try {
      const res = await request.post(`${BFF_BASE_URL}/bff/auth/dev-login`, {
        data: {
          grant_type: "client_credentials",
          client_id: clientId,
          client_secret: clientSecret,
        },
        headers: { "Content-Type": "application/json", Accept: "application/json" },
      });
      if (res.ok()) {
        const payload = (await res.json()) as JsonRecord;
        if (typeof payload.access_token === "string" && payload.access_token) {
          return payload.access_token;
        }
      }
    } catch {
      // ignore
    }
  }

  return token;
}

async function assertStrictSession(
  request: APIRequestContext,
  token: string,
): Promise<{ operatorId: string; roles: string[] }> {
  const meResponse = await request.get(`${BFF_BASE_URL}/bff/me`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "X-Tenant-Id": TENANT_ID,
    },
  });
  expect(meResponse.ok(), `/bff/me returned ${meResponse.status()}`).toBe(true);
  const body = (await meResponse.json()) as JsonRecord;
  const me = ((body.data ?? body) || {}) as JsonRecord;
  const roles = Array.isArray(me.roles)
    ? (me.roles as string[]).map((r) => String(r).toLowerCase())
    : [];
  const operatorId = String(me.operator_id ?? me.operatorId ?? (me.user as JsonRecord)?.id ?? "").trim();
  expect(operatorId).not.toBe("");
  return { operatorId, roles };
}

async function installHostedSession(
  page: Page,
  _input: { operatorId: string; roles: string[]; token: string },
): Promise<void> {
  const clientId = process.env.DEV_LOGIN_CLIENT_ID || process.env.DEV_BFF_DEV_LOGIN_OPERATOR_A_CLIENT_ID || "pantheon-dev-operator-a-v1";
  const clientSecret = process.env.DEV_LOGIN_CLIENT_SECRET || process.env.DEV_BFF_DEV_LOGIN_OPERATOR_A_CLIENT_SECRET || "";

  await page.addInitScript(
    ({ clientId, clientSecret, tenantId }) => {
      if (clientId && clientSecret) {
        const config = {
          VITE_BFF_DEV_LOGIN_CLIENT_ID: clientId,
          VITE_BFF_DEV_LOGIN_CLIENT_SECRET: clientSecret,
          // The read-only build intentionally leaves the VITE keys blank. The
          // deployed helper treats that blank value as authoritative, so also
          // provide its existing runtime-only aliases for hosted acceptance.
          PANTHEON_DEV_BFF_OIDC_CLIENT_ID: clientId,
          PANTHEON_DEV_BFF_OIDC_CLIENT_SECRET: clientSecret,
          VITE_BFF_TENANT_ID: tenantId,
        };
        (window as unknown as Record<string, unknown>).__PANTHEON_RUNTIME_CONFIG__ = config;
        (window as unknown as Record<string, unknown>).__PANTHEON_BFF_RUNTIME__ = config;
      }
    },
    { clientId, clientSecret, tenantId: TENANT_ID },
  );
}

async function waitForHostedRouteReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const root = document.querySelector("#root");
      if (!root || root.childElementCount === 0) return false;
      return window.location.pathname === "/auth"
        || !root.textContent?.includes("Verifying Pantheon session");
    },
    undefined,
    { timeout: 45_000 },
  );
  const diagnostic = await page.evaluate(() => ({
    pathname: window.location.pathname,
    authReason: new URLSearchParams(window.location.search).get("reason"),
    headings: Array.from(document.querySelectorAll("h1, h2"))
      .slice(0, 5)
      .map((element) => element.textContent?.trim() || ""),
    hasAuthError: Boolean(document.querySelector('[aria-label="auth-error"]')),
    isVerifying: document.body.innerText.includes("Verifying Pantheon session"),
  }));
  console.log(`[PFG NAV] ${JSON.stringify(diagnostic)}`);
  if (diagnostic.pathname === "/auth") {
    throw new Error(`Hosted browser session redirected to /auth (reason=${diagnostic.authReason ?? "unknown"})`);
  }
}

async function navigateWithAuth(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  if (page.url().includes("/auth")) {
    await page.waitForURL((current) => !current.pathname.includes("/auth"), { timeout: 15_000 }).catch(async () => {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    });
  }
  await waitForHostedRouteReady(page);
}


function setupNetworkTracker(page: Page) {
  const networkEvents: LatencySample[] = [];
  const requestStartTimes = new Map<Request, number>();

  page.on("console", (msg) => {
    console.log(`[PAGE CONSOLE ${msg.type()}] ${msg.text()}`);
  });
  page.on("pageerror", (err) => {
    console.log(`[PAGE ERROR] ${err.message}`);
  });
  page.on("requestfailed", (req) => {
    console.log(`[PAGE REQUEST FAILED] ${req.method()} ${req.url()} - ${req.failure()?.errorText}`);
  });
  page.on("response", (res) => {
    if (res.status() >= 400) {
      console.log(`[PAGE HTTP ${res.status()}] ${res.request().method()} ${res.url()}`);
    }
  });

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
  test.setTimeout(300_000);

  test("Management AI returns provider answer, executes navigate, openDrawer, focusPanel, and runBffAction via HighRiskConfirm with exactly-one command and replay prevention", async ({
    page,
    request,
  }, testInfo: TestInfo) => {
    const token = await getOrMintAuthToken(request);
    test.skip(!token, "requires an operator bearer token for hosted acceptance");

    // =========================================================================
    // 1. Preflight Assistant mode & provider readiness against live BFF
    // =========================================================================
    const modeResponse = await request.get(`${BFF_BASE_URL}/bff/assistant/mode`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Tenant-Id": TENANT_ID,
      },
    });
    expect(modeResponse.ok(), `/bff/assistant/mode returned ${modeResponse.status()}`).toBe(true);
    const modePayload = (await modeResponse.json()) as JsonRecord;
    expect(modePayload).toBeTruthy();

    const session = await assertStrictSession(request, token);
    await installHostedSession(page, { ...session, token });

    const { networkEvents } = setupNetworkTracker(page);

    // =========================================================================
    // 2. Navigate to Cockpit and open Floating Management AI Panel
    // =========================================================================
    await navigateWithAuth(page, `${FE_BASE_URL}/management/cockpit`);
    await expect(page.locator("#root")).toBeAttached();

    const trigger = page.locator('button[aria-label*="Management AI"], button[aria-label="開啟 Management AI"]').first();
    await trigger.waitFor({ state: "attached", timeout: 15_000 });
    await trigger.click({ force: true });

    const agentDialog = page.locator('[role="dialog"][aria-label*="Management AI"]').first();
    await expect(agentDialog).toBeVisible({ timeout: 15_000 });

    // Verify conversation header renders Management AI info and provider status pill
    await expect(agentDialog.getByText(/Management AI/i).first()).toBeVisible();

    // =========================================================================
    // 3. Submit live prompt to Management AI and verify real provider response
    // =========================================================================
    const textarea = page.locator('textarea[placeholder*="Management AI"], textarea[placeholder*="說話"], textarea').first();
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    await textarea.fill("Summarize active strategy status and portfolio exposure");

    // Track newly submitted POST /bff/management/nl/ask or stream response
    const askResponsePromise = page.waitForResponse(
      (res) =>
        (res.url().includes("/bff/management/nl/ask") || res.url().includes("/bff/management/nl/ask/stream")) &&
        res.request().method() === "POST",
      { timeout: 45_000 },
    );

    const submitBtn = page.locator('button[type="submit"], button[aria-label="Send"], button[aria-label="送出"]').first();
    if (await submitBtn.isVisible().catch(() => false)) {
      await submitBtn.click();
    } else {
      await textarea.press("Enter");
    }

    const askResponse = await askResponsePromise;
    expect(askResponse.status(), `Expected successful 2xx status from ask endpoint, got ${askResponse.status()}`).toBeLessThan(400);
    const streamSummary = await askResponse.body()
      .then((body) => summarizeManagementStream(body.toString("utf8")))
      .catch(() => null);
    console.log(`[PFG AI STREAM] ${JSON.stringify(streamSummary ?? { bodyUnavailable: true })}`);
    if (streamSummary) {
      expect(streamSummary.errorCodes, "Expected no provider error event from live Management AI stream").toHaveLength(0);
      expect(streamSummary.answerChars, "Expected a non-empty provider answer in the live Management AI stream").toBeGreaterThan(0);
      expect(streamSummary.providerUsed, "Expected provider_status.used=true in the live Management AI stream").toBe(true);
    }

    // Require newly appended assistant response turn to appear in dialogue turn
    const assistantTurns = agentDialog.locator(
      '[role="article"], [data-role="assistant"], .is-assistant, .prose',
    );
    const degradedNotice = agentDialog.getByText(/Management AI 暫時降級/i).first();
    await expect.poll(
      async () => (await assistantTurns.count()) + (await degradedNotice.count()),
      { message: "Expected a live assistant turn or explicit provider-degraded state", timeout: 30_000 },
    ).toBeGreaterThan(0);
    if (await assistantTurns.count() === 0) {
      const safeProviderDiagnostic = (await degradedNotice.locator("xpath=..").innerText().catch(() => "provider degraded"))
        .replace(/\s+/gu, " ")
        .slice(0, 300);
      throw new Error(`Management AI provider returned no assistant turn: ${safeProviderDiagnostic}`);
    }
    const lastAssistantTurn = assistantTurns.last();
    const responseText = (await lastAssistantTurn.innerText()).trim();
    expect(responseText.length, "Expected non-empty assistant answer from live provider").toBeGreaterThan(0);

    // Locate the exact turn container enclosing this newly appended assistant turn
    const newTurnContainer = agentDialog.locator("div.space-y-1\\.5, [class*='space-y']").filter({
      has: lastAssistantTurn,
    }).last();

    // Verify conversation header renders provider status / session info
    await expect(
      agentDialog.locator("text=/session|AI Ready|kernel on|Provider/i").first(),
    ).toBeVisible({ timeout: 15_000 });

    // =========================================================================
    // 4. Action 1: execute navigate action (scoped to newly appended provider turn)
    // =========================================================================
    const navBtn = newTurnContainer.locator("button").filter({
      hasText: /前往排名中心|Navigate|Rankings/i,
    }).first();
    await expect(navBtn, "Expected navigate UI action button in newly appended provider turn").toBeVisible({ timeout: 15_000 });
    await navBtn.click();

    // Assert DOM navigation executed by the action without page.goto bypass
    await expect(
      page.locator("h1, h2, [role='heading'], section[aria-label*='Rankings'], main").filter({
        hasText: /Rankings Center|排名中心|Formula|Ranking/i,
      }).first(),
    ).toBeVisible({ timeout: 15_000 });
    expect(page.url()).toContain("/management/rankings");

    // =========================================================================
    // 5. Action 2: execute openDrawer action (scoped to newly appended provider turn)
    // =========================================================================
    const triggerReopen = page.locator('button[aria-label*="Management AI"], button[aria-label="開啟 Management AI"]').first();
    if (await triggerReopen.isVisible({ timeout: 5000 }).catch(() => false)) {
      await triggerReopen.click({ force: true });
    }

    const openDrawerBtn = newTurnContainer.locator("button").filter({
      hasText: /開啟 Inspector 抽屜|Open Inspector|Inspector/i,
    }).first();
    await expect(openDrawerBtn, "Expected openDrawer UI action button in newly appended provider turn").toBeVisible({ timeout: 15_000 });
    await openDrawerBtn.click();

    // Assert Inspector drawer is opened and visible in the DOM
    const rightDrawer = page.locator('[role="dialog"], [data-state="open"]').filter({
      hasText: /Inspector|抽屜|Object/i,
    }).first();
    await expect(rightDrawer).toBeVisible({ timeout: 10_000 });

    // =========================================================================
    // 6. Action 3: execute focusPanel action (scoped to newly appended provider turn)
    // =========================================================================
    const focusPanelBtn = newTurnContainer.locator("button").filter({
      hasText: /聚焦治理隊列|Focus Governance|治理/i,
    }).first();
    await expect(focusPanelBtn, "Expected focusPanel UI action button in newly appended provider turn").toBeVisible({ timeout: 15_000 });
    await focusPanelBtn.click();

    // Assert Governance Queue panel is focused and visible in DOM
    await expect(
      page.locator("h1, h2, [role='heading'], main").filter({
        hasText: /Governance|治理/i,
      }).first(),
    ).toBeVisible({ timeout: 15_000 });

    // =========================================================================
    // 7. Action 4: execute runBffAction via HighRiskConfirm with single POST
    // =========================================================================
    const triggerReopenGov = page.locator('button[aria-label*="Management AI"], button[aria-label="開啟 Management AI"]').first();
    if (await triggerReopenGov.isVisible({ timeout: 5000 }).catch(() => false)) {
      await triggerReopenGov.click({ force: true });
    }

    const runBffBtn = newTurnContainer.locator("button").filter({
      hasText: /隔離 Runtime|Quarantine/i,
    }).first();
    await expect(runBffBtn, "Expected runBffAction button in newly appended provider turn").toBeVisible({ timeout: 15_000 });
    await expect(runBffBtn).not.toBeDisabled();

    // Record baseline command count prior to confirmation
    const baselineCommandCount = networkEvents.filter(
      (ev) => ev.method === "POST" && ev.pathname.includes("/commands"),
    ).length;

    await runBffBtn.click();

    // Assert HighRiskConfirm modal opens
    const confirmDialog = page.locator('[role="dialog"]:has-text("High Risk"), [role="dialog"]:has-text("確認"), [role="alertdialog"]').first();
    await expect(confirmDialog).toBeVisible({ timeout: 10_000 });

    // Type audit memo exceeding 40 characters for high risk policy
    const memoInput = confirmDialog.locator("textarea, input[type='text']").first();
    if (await memoInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await memoInput.fill("Detailed dev-paper quarantine audit memo exceeding forty characters.");
    }

    const confirmBtn = confirmDialog.locator("button").filter({ hasText: /Confirm|確認/i }).first();
    await expect(confirmBtn).toBeVisible({ timeout: 5000 });
    await confirmBtn.click();

    // Verify command receipt and button is marked executed / disabled
    await expect(runBffBtn).toBeDisabled({ timeout: 15_000 });
    await expect(
      newTurnContainer.locator("[class*='Badge']").filter({
        hasText: /已執行|command|status/i,
      }).first(),
    ).toBeVisible({ timeout: 15_000 });

    // =========================================================================
    // 8. Replay Prevention Proof: verify exactly-one POST command minted
    // =========================================================================
    const postCommandCount = networkEvents.filter(
      (ev) => ev.method === "POST" && ev.pathname.includes("/commands"),
    ).length;
    expect(postCommandCount, "Expected exactly one correlated POST command minted upon confirmation").toBe(
      baselineCommandCount + 1,
    );

    // Attempt replay click on disabled action button
    await runBffBtn.click({ force: true });
    await expect(runBffBtn).toBeDisabled();

    const replayCommandCount = networkEvents.filter(
      (ev) => ev.method === "POST" && ev.pathname.includes("/commands"),
    ).length;
    expect(replayCommandCount, "Expected replay attempt to mint zero additional commands").toBe(postCommandCount);

    // =========================================================================
    // 9. Provenance & error assertions
    // =========================================================================
    await expect(page.locator("body")).not.toContainText(/serving mock|seed fallback/i);

    expect(networkEvents.length, "Expected live BFF requests to be tracked").toBeGreaterThan(0);
    const serverErrors = networkEvents.filter((ev) => ev.status >= 500);
    expect(serverErrors, "Expected zero 5xx server errors").toHaveLength(0);

    const askEvents = networkEvents.filter((ev) => ev.pathname.includes("/management/nl/ask") && ev.method === "POST");
    expect(askEvents.length, "Expected POST /bff/management/nl/ask to be tracked").toBeGreaterThanOrEqual(1);

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
