/**
 * FE-INT-GATE-B01 / F01 - startup session contract.
 *
 * Coverage:
 *   1. /bff/me returns the frontend MeResponse shape.
 *   2. Strict live mode does not show a serving-mock / seed fallback banner.
 *   3. Browser-native EventSource reaches the BFF SSE stream and opens.
 *   4. A mocked /bff/me 401 is treated as an auth error, not as permission to
 *      fall back to mock current-user data.
 *
 * Env:
 *   PANTHEON_FE_BASE_URL, FRONTEND_BASE_URL, or PLAYWRIGHT_BASE_URL
 *     default: http://127.0.0.1:5173
 *   PANTHEON_BFF_BASE_URL, BFF_BASE_URL, or VITE_BFF_BASE_URL
 *     default: https://pantheon-lupin-staging-bff.104.155.223.192.sslip.io
 *   PANTHEON_BROWSER_BFF_BASE_URL
 *     optional browser-observed BFF base, usually the frontend origin when
 *     the repo dev server proxies /bff to the upstream BFF.
 *   PANTHEON_SSE_BROWSER_BFF_BASE_URL
 *     optional browser-observed SSE BFF base. Defaults to the direct BFF URL so
 *     this probe is not coupled to dev-server event-stream buffering.
 *   BFF_AUTH_TOKEN
 *     optional; when omitted the dev stub token is used.
 *   VITE_BFF_FALLBACK or BFF_FALLBACK
 *     default: strict
 */

import { expect, test } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";

const DEFAULT_FRONTEND_BASE_URL = "http://127.0.0.1:5173";
const DEFAULT_BFF_BASE_URL =
  "https://pantheon-lupin-staging-bff.104.155.223.192.sslip.io";
const DEFAULT_DEV_AUTH_TOKEN = "op-fe-gate:operator,reviewer:mfa";
const STARTUP_ME_FOLLOW_UP = "FE-INT-GATE-FOLLOWUP-ME-STARTUP";
const DEFAULT_SSE_OPEN_TIMEOUT_MS = 30_000;

const SERVING_MOCK_BANNER =
  /serving[-\s]?mock|mock data|seed fallback(?! blocked)|資料來源：seed/i;

type JsonRecord = Record<string, unknown>;

function frontendUrl(path = "/"): string {
  return urlFromBase(frontendBaseUrl(), path);
}

function frontendBaseUrl(): string {
  return (
    process.env.PANTHEON_FE_BASE_URL ||
    process.env.FRONTEND_BASE_URL ||
    process.env.PLAYWRIGHT_BASE_URL ||
    DEFAULT_FRONTEND_BASE_URL
  );
}

function urlFromBase(base: string, path = "/"): string {
  return `${base.replace(/\/$/, "")}${path}`;
}

function sseOriginUrl(path = "/"): string {
  const base =
    process.env.PANTHEON_SSE_ORIGIN_URL ||
    frontendBaseUrl();
  return urlFromBase(base, path);
}

function bffUrl(path: string): string {
  return `${bffBaseUrl().replace(/\/$/, "")}${path}`;
}

function browserBffUrl(path: string): string {
  const base = process.env.PANTHEON_BROWSER_BFF_BASE_URL || bffBaseUrl();
  return `${base.replace(/\/$/, "")}${path}`;
}

function browserSseBffUrl(path: string): string {
  const base = process.env.PANTHEON_SSE_BROWSER_BFF_BASE_URL || bffBaseUrl() || process.env.PANTHEON_BROWSER_BFF_BASE_URL || "";
  return `${base.replace(/\/$/, "")}${path}`;
}

function bffBaseUrl(): string {
  const base =
    process.env.PANTHEON_BFF_BASE_URL ||
    process.env.BFF_BASE_URL ||
    process.env.VITE_BFF_BASE_URL ||
    DEFAULT_BFF_BASE_URL;
  return base;
}

function authHeader(): string {
  const token = process.env.BFF_AUTH_TOKEN || process.env.PANTHEON_BFF_SMOKE_BEARER_TOKEN || DEFAULT_DEV_AUTH_TOKEN;
  return token.startsWith("Bearer ") ? token : `Bearer ${token}`;
}

function strictFallbackMode(): string {
  return process.env.VITE_BFF_FALLBACK || process.env.BFF_FALLBACK || "strict";
}

function sseOpenTimeoutMs(): number {
  const value = Number(process.env.PANTHEON_SSE_OPEN_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_SSE_OPEN_TIMEOUT_MS;
}

async function installRuntimeFallbackOverride(
  page: Page,
  fallback: "auto" | "strict",
) {
  await page.addInitScript((value) => {
    const runtimeConfig = { VITE_BFF_FALLBACK: value, fallback: value };
    Object.assign(window as unknown as Record<string, unknown>, {
      __PANTHEON_BFF_RUNTIME__: runtimeConfig,
      __PANTHEON_RUNTIME_CONFIG__: runtimeConfig,
    });

    try {
      window.sessionStorage.setItem("pantheon.integration.fallback", value);
      window.sessionStorage.setItem("pantheon.e2e.fallback", value);
    } catch {
      // Storage can be unavailable; runtime globals still cover bootstrap.
    }
  }, fallback);
}

async function openSseProbeDocument(page: Page): Promise<void> {
  const probeUrl = sseOriginUrl("/__pantheon-sse-probe");
  await page.route("**/__pantheon-sse-probe", async (route) => {
    await route.fulfill({
      body: "<!doctype html><meta charset=\"utf-8\"><title>Pantheon SSE probe</title>",
      contentType: "text/html",
      status: 200,
    });
  });
  await page.goto(probeUrl, { waitUntil: "domcontentloaded" });
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function recordAt(value: unknown, label: string): JsonRecord {
  expect(isRecord(value), `${label} must be an object`).toBe(true);
  return value as JsonRecord;
}

function stringAt(value: unknown, label: string): string {
  expect(typeof value, `${label} must be a string`).toBe("string");
  expect(String(value).trim(), `${label} must not be blank`).not.toBe("");
  return String(value);
}

function booleanAt(value: unknown, label: string): boolean {
  expect(typeof value, `${label} must be a boolean`).toBe("boolean");
  return Boolean(value);
}

function stringArrayAt(value: unknown, label: string): string[] {
  expect(Array.isArray(value), `${label} must be an array`).toBe(true);
  const items = value as unknown[];
  expect(items.length, `${label} must be non-empty`).toBeGreaterThan(0);
  for (const item of items) {
    expect(typeof item, `${label} items must be strings`).toBe("string");
    expect(String(item).trim(), `${label} items must not be blank`).not.toBe("");
  }
  return items.map(String);
}

async function bodyText(page: import("@playwright/test").Page): Promise<string> {
  return page.locator("body").innerText({ timeout: 10_000 });
}

async function requestMeWithTransientRetry(
  request: APIRequestContext,
  url: string,
  headers: Record<string, string>,
): Promise<{ status: number; body: string }> {
  let last = { status: 0, body: "" };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await request.get(url, { headers, timeout: 10_000 });
    last = { status: response.status(), body: await response.text() };
    if (![502, 503, 504].includes(last.status)) return last;
    await new Promise((resolve) => setTimeout(resolve, 750 * (attempt + 1)));
  }
  return last;
}

test.describe("F01 startup session", () => {
  test("asserts MeResponse tenant/env/user/capabilities shape", async ({
    request,
  }) => {
    const tenantId = process.env.BFF_TENANT_ID || process.env.PANTHEON_TENANT_ID;
    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: authHeader(),
      "X-Locale": "zh-TW",
    };
    if (tenantId) {
      headers["X-Tenant-Id"] = tenantId;
    }

    const response = await requestMeWithTransientRetry(request, bffUrl("/bff/me"), headers);

    expect(response.status, response.body).toBe(200);
    const payload = recordAt(JSON.parse(response.body), "MeResponse");
    const data = recordAt(payload.data, "MeResponse.data");
    const meta = recordAt(payload.meta, "MeResponse.meta");

    expect(meta.route).toBe("GET /bff/me");
    expect(meta.contract).toBe("BFF-LUV-GAP-009");

    const tenant = recordAt(data.tenant, "MeResponse.data.tenant");
    stringAt(tenant.id, "tenant.id");
    stringAt(tenant.default_id, "tenant.default_id");
    stringArrayAt(tenant.allowed_ids, "tenant.allowed_ids");
    expect(["tenant", "global"]).toContain(tenant.scope);
    expect(data.tenant_id).toBe(tenant.id);

    const environment = recordAt(
      data.environment,
      "MeResponse.data.environment",
    );
    stringAt(environment.name, "environment.name");
    stringAt(environment.deployment_stage, "environment.deployment_stage");
    stringAt(environment.auth_mode, "environment.auth_mode");
    stringAt(environment.timezone, "environment.timezone");
    booleanAt(environment.strict_auth, "environment.strict_auth");

    const user = recordAt(data.user, "MeResponse.data.user");
    stringAt(user.id, "user.id");
    stringAt(user.operator_id, "user.operator_id");
    stringAt(user.display_name, "user.display_name");
    const roles = stringArrayAt(user.roles, "user.roles");
    const userCapabilities = stringArrayAt(
      user.capabilities,
      "user.capabilities",
    );
    booleanAt(user.mfa_verified, "user.mfa_verified");

    expect(recordAt(data.currentUser, "data.currentUser")).toEqual(user);
    expect(recordAt(data.current_user, "data.current_user")).toEqual(user);
    expect(stringArrayAt(data.roles, "data.roles")).toEqual(roles);
    expect(stringArrayAt(data.capabilities, "data.capabilities")).toEqual(
      userCapabilities,
    );
    expect(userCapabilities).toContain("runtime.read");

    const session = recordAt(data.session, "MeResponse.data.session");
    stringAt(session.id, "session.id");
    stringAt(session.auth_mode, "session.auth_mode");
    stringAt(session.checked_at, "session.checked_at");
    booleanAt(session.authenticated, "session.authenticated");
    booleanAt(session.fresh, "session.fresh");
    booleanAt(session.mfa_verified, "session.mfa_verified");
    if (session.session_kind !== undefined) {
      expect(["cookie", "bearer", "stub"]).toContain(session.session_kind);
    } else {
      expect(stringAt(session.state, "session.state")).toBe("active");
    }

    const featureFlags = recordAt(
      data.feature_flags,
      "MeResponse.data.feature_flags",
    );
    expect(featureFlags.sessionAuthMe).toBe(true);
  });

  test("strict startup does not show a serving-mock banner", async ({
    page,
  }) => {
    expect(strictFallbackMode()).toBe("strict");
    await installRuntimeFallbackOverride(page, "strict");

    await page.goto(frontendUrl("/"), { waitUntil: "domcontentloaded" });

    await expect
      .poll(async () => await bodyText(page), {
        message: "frontend body should render without serving mock banner",
        timeout: 15_000,
      })
      .not.toMatch(SERVING_MOCK_BANNER);
  });

  test("opens the browser-native SSE EventSource stream", async ({ page }) => {
    const streamUrl = browserSseBffUrl("/bff/events/stream?channel=system");
    const openTimeoutMs = sseOpenTimeoutMs();

    await openSseProbeDocument(page);

    const opened = await page.evaluate(
      ({ url, timeoutMs }) =>
        new Promise<{
          readyState: number;
          openState: number;
          firstMessageType?: string;
        }>(
          (resolve, reject) => {
            const eventSource = new EventSource(url);
            const timeout = window.setTimeout(() => {
              const state = eventSource.readyState;
              eventSource.close();
              reject(new Error(`EventSource did not open; readyState=${state}`));
            }, timeoutMs);

            eventSource.onopen = () => {
              window.clearTimeout(timeout);
              const state = eventSource.readyState;
              eventSource.close();
              resolve({ readyState: state, openState: EventSource.OPEN });
            };

            eventSource.onmessage = (event) => {
              window.clearTimeout(timeout);
              const state = eventSource.readyState;
              eventSource.close();
              try {
                const payload = JSON.parse(event.data);
                resolve({
                  readyState: state,
                  openState: EventSource.OPEN,
                  firstMessageType:
                    typeof payload.type === "string" ? payload.type : undefined,
                });
              } catch {
                resolve({ readyState: state, openState: EventSource.OPEN });
              }
            };

            eventSource.onerror = () => {
              if (eventSource.readyState === EventSource.CLOSED) {
                window.clearTimeout(timeout);
                reject(new Error("EventSource closed before opening"));
              }
            };
          },
        ),
      { url: streamUrl, timeoutMs: openTimeoutMs },
    );

    expect(opened.readyState).toBe(opened.openState);
    if (opened.firstMessageType) {
      expect(opened.firstMessageType).toMatch(/^system\./);
    }
  });

  test("does not fall back to mock current-user data when /bff/me returns 401", async ({
    page,
  }) => {
    expect(strictFallbackMode()).toBe("strict");
    await installRuntimeFallbackOverride(page, "strict");

    let interceptedMeRequests = 0;
    const bffRequests: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (url.includes("/bff/")) {
        bffRequests.push(url);
      }
    });
    await page.route("**/bff/me**", async (route) => {
      interceptedMeRequests += 1;
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({
          detail: {
            error: {
              code: "AUTH_REQUIRED",
              message: "FE-INT-GATE-B01 injected /bff/me 401",
              details: {
                precondition_failed: "auth_session",
              },
            },
          },
        }),
      });
    });

    const firstBffRequest = page
      .waitForRequest((request) => request.url().includes("/bff/"), {
        timeout: 10_000,
      })
      .catch(() => null);

    await page.goto(frontendUrl("/"), { waitUntil: "domcontentloaded" });
    await firstBffRequest;
    await page.waitForTimeout(2_000);

    const text = await bodyText(page);
    await test.info().attach("startup-bff-network", {
      body: JSON.stringify({ interceptedMeRequests, bffRequests }, null, 2),
      contentType: "application/json",
    });

    expect(
      interceptedMeRequests,
      `${STARTUP_ME_FOLLOW_UP} fixed: startup must request /bff/me at least once before showing user UI`,
    ).toBeGreaterThan(0);
    expect(text).toMatch(/\bAuth\b|AUTH_REQUIRED|Sign in required|STRICT TYPED ERROR/i);
    expect(text).not.toMatch(SERVING_MOCK_BANNER);
    expect(text).not.toMatch(/op-fe-gate|portfolio_manager|mock operator/i);
  });
});
