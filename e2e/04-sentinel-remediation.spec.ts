/**
 * FE-INT-GATE-B04 / F05 - Sentinel investigation workspace.
 *
 * Sentinel findings are abnormality investigation records. The page may
 * summarize evidence, blast radius, and recommended governance handoff, but it
 * must not execute remediation or mutate finding status from the drawer.
 *
 * Runtime env for the app under test:
 *   VITE_BFF_MODE=live
 *   VITE_BFF_REAL_WRITES=true
 *   VITE_BFF_BASE_URL may be left blank so relative /bff requests hit page.route.
 */

import { expect, test, type Page, type Route } from "@playwright/test";
import {
  installContainedLoopbackAuth,
  installContainedLoopbackAuthAuthority,
  LOCAL_FIXTURE_AUTH_TOKEN,
  targetsExternalE2eEnvironment,
} from "./helpers/auth";

const DEFAULT_FRONTEND_BASE_URL = "http://127.0.0.1:5173";
const CONFIGURED_FRONTEND_BASE_URL =
  process.env.FRONTEND_BASE_URL ||
  process.env.PANTHEON_FE_BASE_URL ||
  process.env.PLAYWRIGHT_BASE_URL ||
  DEFAULT_FRONTEND_BASE_URL;
const EXTERNAL_FIXTURE_TARGET = targetsExternalE2eEnvironment({
  PANTHEON_FE_BASE_URL: CONFIGURED_FRONTEND_BASE_URL,
});
const FIXTURE_FRONTEND_BASE_URL = EXTERNAL_FIXTURE_TARGET
  ? DEFAULT_FRONTEND_BASE_URL
  : CONFIGURED_FRONTEND_BASE_URL;
const SENTINEL_PATH = "/management/sentinel";
const SENTINEL_FINDING_ID = "finding-b04-confirm-token";
const TARGET_PERSONA_ID = "persona-b04-risk";
const EMERGENCY_ACTION_KIND = "pause_persona_routing";
const ADVISORY_ACTION_KIND = "open_incident";
const CRASH_TEXT =
  /application error|cannot read properties|undefined is not|uncaught|traceback|typeerror|referenceerror/i;
const OLD_SUCCESS_TEXT = /Remediation executed|處置已執行|Command receipt|queued|accepted/i;
const OLD_EXECUTION_TEXT = /Confirm high-risk action|高風險動作確認|requires_confirm_token/i;

type JsonRecord = Record<string, unknown>;

type RouteCalls = {
  findingGets: number;
  mutationPosts: string[];
  requestBodies: JsonRecord[];
};

function frontendUrl(path = "/"): string {
  return `${FIXTURE_FRONTEND_BASE_URL.replace(/\/$/, "")}${path}`;
}

function nowIso(): string {
  return "2026-05-13T13:40:00Z";
}

const sentinelFinding = {
  id: SENTINEL_FINDING_ID,
  finding_id: SENTINEL_FINDING_ID,
  title: "B04 Sentinel Confirm Token Finding",
  summary: "Critical Sentinel remediation must be investigated before governance action.",
  status: "open",
  severity: "critical",
  confidence: 0.93,
  source: "runtime",
  detected_at: "2026-05-13T13:20:00Z",
  updated_at: nowIso(),
  persona_ids: [TARGET_PERSONA_ID],
  strategy_ids: ["strategy-b04-alpha"],
  deployment_ids: ["deployment-b04-live"],
  evidence_refs: [
    { kind: "incident", id: "incident-b04-confirm-token" },
    {
      kind: "metric",
      id: "drawdown-breach-b04",
      snapshot: {
        label: "paper_drawdown_delta",
        value: "-8.7%",
        ts: "2026-05-13T13:18:00Z",
      },
    },
    { kind: "runtime", id: "runtime-risk-router-b04" },
  ],
  recommended_action_ids: [
    ADVISORY_ACTION_KIND,
    "route_to_backup_runtime",
    EMERGENCY_ACTION_KIND,
  ],
};

function corsHeaders(route: Route): Record<string, string> {
  const origin = route.request().headers().origin ?? "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers":
      "accept,authorization,content-type,idempotency-key,x-bff-api-version,x-correlation-id,x-confirm-token,x-idempotency-key,x-locale,x-request-id",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "X-Correlation-Id": "corr-fe-int-gate-b04",
    "X-Request-Id": "req-fe-int-gate-b04",
  };
}

async function fulfillJson(
  route: Route,
  body: unknown,
  status = 200,
): Promise<void> {
  await route.fulfill({
    status,
    contentType: "application/json",
    headers: corsHeaders(route),
    body: JSON.stringify(body),
  });
}

function safeJson(text: string): JsonRecord {
  if (!text.trim()) {
    return {};
  }
  try {
    const value = JSON.parse(text) as unknown;
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as JsonRecord)
      : {};
  } catch {
    return {};
  }
}

function isSentinelMutationOrRemediationPost(path: string, bodyText: string): boolean {
  if (/\/bff\/v5\/sentinel\/findings\/[^/]+\/status\/?$/.test(path)) {
    return true;
  }
  if (/\/(?:remediate|execute)\/?$/.test(path)) {
    return true;
  }
  return (
    bodyText.includes(EMERGENCY_ACTION_KIND) ||
    bodyText.includes(ADVISORY_ACTION_KIND) ||
    bodyText.includes("route_to_backup_runtime")
  );
}

async function installB04Routes(page: Page): Promise<RouteCalls> {
  await installContainedLoopbackAuth(page);
  const calls: RouteCalls = {
    findingGets: 0,
    mutationPosts: [],
    requestBodies: [],
  };

  page.on("request", (request) => {
    const url = new URL(request.url());
    if (request.method() === "GET" && url.pathname.startsWith("/bff/v5/sentinel/findings")) {
      calls.findingGets += 1;
    }
  });

  await page.addInitScript((token) => {
    window.localStorage.setItem("pantheon_operator_token", token);
    window.localStorage.setItem("pantheon.bff.bearerToken", token);
    window.sessionStorage.setItem("pantheon.integration.realWrites", "true");
    window.sessionStorage.setItem("pantheon.integration.fallback", "strict");
  }, LOCAL_FIXTURE_AUTH_TOKEN);

  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders(route) });
      return;
    }

    if (request.method() === "GET" && path === "/bff/events/stream") {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        headers: {
          ...corsHeaders(route),
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
        body: ": fe-int-gate-b04\n\n",
      });
      return;
    }

    if (request.method() === "POST") {
      const bodyText = request.postData() ?? "";
      const bodyJson = safeJson(bodyText);
      calls.requestBodies.push(bodyJson);
      if (isSentinelMutationOrRemediationPost(path, bodyText)) {
        calls.mutationPosts.push(path);
        await fulfillJson(
          route,
          {
            error: {
              code: "UNEXPECTED_SENTINEL_MUTATION",
              message: "Sentinel investigation drawer must not execute remediation.",
            },
          },
          409,
        );
        return;
      }
    }

    if (path === "/bff/me") {
      await fulfillJson(route, {
        data: {
          session: {
            authenticated: true,
            session_kind: "stub",
            auth_mode: "stub",
            fresh: true,
            mfa_verified: true,
            checked_at: nowIso(),
          },
        },
      });
      return;
    }

    if (path === "/health" || path === "/healthz" || path === "/bff/health") {
      await fulfillJson(route, {
        status: "ok",
        service: "execute-plans-fe-int-gate-b04",
        checked_at: nowIso(),
      });
      return;
    }

    if (request.method() === "GET" && path.startsWith("/bff/v5/sentinel/findings")) {
      await fulfillJson(route, {
        items: [sentinelFinding],
        count: 1,
        generated_at: nowIso(),
        meta: {
          snapshot_at: nowIso(),
          surfaces: {
            sentinel_findings: { status: "ok", source: "fe-int-gate-b04" },
          },
        },
      });
      return;
    }

    if (request.method() === "GET" && path.startsWith("/bff/")) {
      await fulfillJson(route, {
        items: [],
        data: [],
        count: 0,
        meta: {
          snapshot_at: nowIso(),
          contract: "FE-INT-GATE-B04-neutral-read-stub",
        },
      });
      return;
    }

    await route.continue();
  });

  await installContainedLoopbackAuthAuthority(page);
  return calls;
}

async function bodyText(page: Page): Promise<string> {
  return (await page.locator("body").textContent({ timeout: 10_000 })) ?? "";
}

async function expectSentinelShellReady(page: Page, calls: RouteCalls): Promise<void> {
  await page.goto(frontendUrl(SENTINEL_PATH), { waitUntil: "commit" });
  await expect
    .poll(() => calls.findingGets, {
      message: "Sentinel page should request the live B04 findings fixture",
      timeout: 30_000,
    })
    .toBeGreaterThan(0);
  await expect
    .poll(async () => await bodyText(page), {
      message: "Sentinel page should render the B04 Sentinel fixture",
      timeout: 30_000,
    })
    .toMatch(/B04 Sentinel Confirm Token Finding/i);
  expect(await bodyText(page)).not.toMatch(CRASH_TEXT);
}

async function openB04FindingDrawer(page: Page) {
  await page.getByText("B04 Sentinel Confirm Token Finding").first().click();
  const drawer = page
    .getByRole("dialog")
    .filter({ hasText: /B04 Sentinel Confirm Token Finding/ })
    .first();
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText(/Open incident|Pause persona routing/i);
  return drawer;
}

async function expectNoMutation(calls: RouteCalls): Promise<void> {
  await expect
    .poll(() => calls.mutationPosts.length, {
      message: "Sentinel investigation view must not issue mutation/remediation POSTs",
      timeout: 1_000,
    })
    .toBe(0);
}

test.describe("F05 Sentinel investigation workspace", () => {
  test.skip(
    EXTERNAL_FIXTURE_TARGET,
    "F05 is a fully intercepted local fixture and never installs fixture auth on an external origin.",
  );
  test("renders evidence, blast radius, and advisory recommendations without executable remediation", async ({
    page,
  }) => {
    const calls = await installB04Routes(page);
    await expectSentinelShellReady(page, calls);
    const drawer = await openB04FindingDrawer(page);

    await expect(drawer).toContainText(/Investigation summary|調查摘要/i);
    await expect(drawer).toContainText(/Severity rationale|嚴重度理由/i);
    await expect(drawer).toContainText(/Where to resolve this|要去哪裡處理/i);
    await expect(drawer).toContainText(/Blast radius|影響範圍/i);
    await expect(drawer).toContainText(/Evidence packet|證據包/i);
    await expect(drawer).toContainText(/Recommended next steps|建議下一步/i);
    await expect(drawer).toContainText(/Governance handling|治理處理/i);
    await expect(drawer).toContainText(/incident-b04-confirm-token/i);
    await expect(drawer).toContainText(/drawdown-breach-b04/i);
    await expect(drawer).toContainText(/persona:persona-b04-risk/i);
    await expect(drawer).toContainText(/strategy:strategy-b04-alpha/i);
    await expect(drawer).toContainText(/Open incident/i);
    await expect(drawer).toContainText(/Route to backup runtime/i);
    await expect(drawer).toContainText(/Pause persona routing/i);
    await expect(drawer.getByRole("button", { name: /Run|執行/i })).toHaveCount(0);
    await expect(page.getByText(OLD_EXECUTION_TEXT)).toHaveCount(0);

    expect(await bodyText(page)).not.toMatch(OLD_SUCCESS_TEXT);
    await expectNoMutation(calls);
  });

  test("routes operators to governance surfaces instead of mutating findings locally", async ({
    page,
  }) => {
    const calls = await installB04Routes(page);
    await expectSentinelShellReady(page, calls);
    const drawer = await openB04FindingDrawer(page);

    const interventionLink = drawer.getByRole("link", {
      name: /Open intervention queue|開啟介入佇列/i,
    });
    await expect(interventionLink).toHaveAttribute("href", "/management/interventions");

    const resolutionInterventionLink = drawer.getByRole("link", {
      name: /Review intervention|檢視介入項目/i,
    });
    await expect(resolutionInterventionLink).toHaveAttribute(
      "href",
      `/management/interventions?finding=${SENTINEL_FINDING_ID}`,
    );

    const evidenceLink = drawer.getByRole("link", { name: /Inspect evidence|檢查證據/i });
    await expect(evidenceLink).toHaveAttribute(
      "href",
      "/management/evidence?ref_id=incident-b04-confirm-token",
    );

    const incidentLink = drawer.getByRole("link", { name: /Open incident|開啟 incident/i });
    await expect(incidentLink).toHaveAttribute(
      "href",
      "/management/incidents/incident-b04-confirm-token",
    );

    const personaTargetLink = drawer.getByRole("link", { name: /persona:persona-b04-risk/i });
    await expect(personaTargetLink).toHaveAttribute(
      "href",
      `/management/persona-fleet?persona=${TARGET_PERSONA_ID}`,
    );

    const personaFleetLink = drawer.getByRole("link", {
      name: /Open persona fleet|開啟 Persona 艦隊/i,
    });
    await expect(personaFleetLink).toHaveAttribute(
      "href",
      `/management/persona-fleet?persona=${TARGET_PERSONA_ID}`,
    );

    await expect(drawer.getByRole("button", { name: /Acknowledge|Dismiss|Run|確認接收|駁回|執行/i })).toHaveCount(0);
    await expectNoMutation(calls);
  });
});
