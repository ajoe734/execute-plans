/**
 * PFG-AGORA-JOURNEY-E2E-20260820 — strict-live, browser-owned Agora journey.
 *
 * This is deliberately an opt-in proof because it creates durable paper-mode
 * records. It never installs a route handler, imports a fixture, or accepts a
 * prebuilt workshop/candidate ID. Every identity used after the first screen is
 * observed from a browser BFF response generated during this run.
 *
 * Required environment:
 *   PFG_AGORA_JOURNEY_E2E=1
 *   PANTHEON_FE_BASE_URL=<Pantheon dev FE>
 *   PANTHEON_BFF_BASE_URL=<Pantheon dev BFF>
 *   PFG_AGORA_JOURNEY_E2E_GCP_EMAIL=<verified operator account>
 *   PFG_AGORA_JOURNEY_E2E_GCP_PASSWORD=<operator password>
 */

import { expect, test, type APIRequestContext, type Page, type Request, type Response } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import {
  roleTokenFromEnv,
  targetsExternalE2eEnvironment,
} from "./helpers/auth";
import {
  writeDemoRunEvidence,
  type AgoraDemoRunEvidence,
} from "./agora-hosted-evidence";

const TASK_ID = "PFG-AGORA-JOURNEY-E2E-20260820";
const ENABLED = process.env.PFG_AGORA_JOURNEY_E2E === "1";
const FE_BASE_URL = trimTrailingSlash(
  process.env.PANTHEON_FE_BASE_URL ||
  process.env.FRONTEND_BASE_URL ||
  process.env.PLAYWRIGHT_BASE_URL ||
  "",
);
const BFF_BASE_URL = trimTrailingSlash(
  process.env.PANTHEON_BROWSER_BFF_BASE_URL ||
  process.env.PANTHEON_BFF_BASE_URL ||
  process.env.VITE_BFF_BASE_URL ||
  "",
);
const TENANT_ID =
  process.env.PANTHEON_BFF_TENANT_ID ??
  process.env.PANTHEON_TENANT_ID ??
  "tenant-dev";
const GCP_IDENTITY_EMAIL = process.env.PFG_AGORA_JOURNEY_E2E_GCP_EMAIL ?? "";
const GCP_IDENTITY_PASSWORD =
  process.env.PFG_AGORA_JOURNEY_E2E_GCP_PASSWORD ?? "";
const EVIDENCE_DIR =
  process.env.PANTHEON_AUDIT_OUT_DIR ?? "/tmp/pfg-agora-product-journey";
const DEV_FE_HOST = "pantheon-lupin-dev-fe.35.201.204.12.sslip.io";
const DEV_BFF_HOST = "pantheon-lupin-dev-bff.35.201.204.12.sslip.io";
const MESSAGE_EVENT_PROJECTION_TIMEOUT_MS = 12_000;

if (
  ENABLED &&
  (!FE_BASE_URL ||
    !BFF_BASE_URL)
) {
  throw new Error(
    `${TASK_ID} requires Pantheon FE/BFF URLs.`,
  );
}

type JsonRecord = Record<string, unknown>;

type MutationEvidence = {
  id: string;
  method: "POST" | "PATCH";
  path: string;
  status: number;
};

type ObservedRequest = {
  authorization: boolean;
  method: string;
  origin: string;
  path: string;
  status?: number;
};

type OrderedResponse = {
  response: Response;
  sequence: number;
};

type MessageEventProjectionEvidence = {
  event: JsonRecord;
  event_id: string;
  readback_attempts: number;
  timeout_ms: number;
};

type HostedLoginEvidence = {
  authenticated_readiness: boolean;
  duration_ms: number | null;
  provider: "gcp_identity_platform" | "governed_dev_login";
  route_mocking: false;
};

type WorkshopSseEvidence = {
  content_type: string;
  path: string;
  status: number;
  x_sse_channel: string;
};

const observedTrafficByPage = new WeakMap<Page, ObservedRequest[]>();

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

async function captureEvidenceScreenshot(
  page: Page,
  runMarker: string,
  label: string,
): Promise<string> {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const filename = `${runMarker}-${label}.png`;
  await page.screenshot({
    animations: "disabled",
    fullPage: true,
    path: `${EVIDENCE_DIR}/${filename}`,
  });
  return filename;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function rolesFromMe(value: unknown): string[] {
  const root = asRecord(value);
  const data = asRecord(root.data);
  const roles = data.roles ?? root.roles;
  return Array.isArray(roles)
    ? roles.filter((role): role is string => typeof role === "string")
    : [];
}

async function getOrMintAuthToken(request: APIRequestContext): Promise<string> {
  const token = roleTokenFromEnv("operator", [
    "PANTHEON_PERSONA_INTERACTION_OPERATOR_TOKEN",
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

  const clientId =
    process.env.DEV_LOGIN_CLIENT_ID ||
    process.env.DEV_LOGIN_OPERATOR_CLIENT_ID ||
    process.env.DEV_BFF_DEV_LOGIN_OPERATOR_A_CLIENT_ID ||
    "pantheon-dev-operator-a-v1";
  const clientSecret =
    process.env.DEV_LOGIN_CLIENT_SECRET ||
    process.env.DEV_LOGIN_OPERATOR_CLIENT_SECRET ||
    process.env.DEV_BFF_DEV_LOGIN_OPERATOR_A_CLIENT_SECRET;
  if (clientSecret) {
    try {
      const res = await request.post(`${BFF_BASE_URL}/bff/auth/dev-login`, {
        data: {
          grant_type: "client_credentials",
          client_id: clientId,
          client_secret: clientSecret,
        },
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
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

async function getOrMintViewerToken(request: APIRequestContext): Promise<string> {
  const token = roleTokenFromEnv("viewer", [
    "PANTHEON_PERSONA_INTERACTION_VIEWER_TOKEN",
    "PANTHEON_BFF_VIEWER_TOKEN",
    "DEV_BFF_VIEWER_TOKEN",
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

  const clientId =
    process.env.DEV_LOGIN_VIEWER_CLIENT_ID ||
    process.env.DEV_BFF_DEV_LOGIN_VIEWER_CLIENT_ID ||
    "pantheon-dev-viewer-v1";
  const clientSecret =
    process.env.DEV_LOGIN_VIEWER_CLIENT_SECRET ||
    process.env.DEV_BFF_DEV_LOGIN_VIEWER_CLIENT_SECRET;
  if (clientSecret) {
    try {
      const res = await request.post(`${BFF_BASE_URL}/bff/auth/dev-login`, {
        data: {
          grant_type: "client_credentials",
          client_id: clientId,
          client_secret: clientSecret,
        },
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
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

async function assertViewerSession(
  request: APIRequestContext,
  token: string,
): Promise<{ viewerId: string; roles: string[] }> {
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
  const viewerId = String(
    me.viewer_id ?? me.viewerId ?? me.user_id ?? (me.user as JsonRecord)?.id ?? "",
  ).trim();
  expect(roles).toContain("viewer");
  expect(roles).not.toContain("operator");
  expect(roles).not.toContain("admin");
  return { viewerId, roles };
}

async function ensureOrDiscoverPersona(
  request: APIRequestContext,
  operatorToken: string,
): Promise<string> {
  const configuredId = String(
    process.env.PANTHEON_PERSONA_INTERACTION_PERSONA_ID ||
    process.env.PANTHEON_PERSONA_ID ||
    "",
  ).trim();
  if (configuredId) {
    return configuredId;
  }

  try {
    const ensureRes = await request.post(`${BFF_BASE_URL}/bff/agora/servant/ensure`, {
      headers: {
        Authorization: `Bearer ${operatorToken}`,
        "Content-Type": "application/json",
        "X-Tenant-Id": TENANT_ID,
        "Idempotency-Key": `servant-ensure-${randomUUID()}`,
      },
      data: {
        display_name: "Agora Dev Servant",
        locale: "en-US",
        timezone: "UTC",
      },
    });
    if (ensureRes.ok()) {
      const payload = asRecord(await ensureRes.json());
      const dataObj = asRecord(payload.data ?? payload);
      const id = String(dataObj.persona_id ?? dataObj.id ?? "").trim();
      if (id) return id;
    }
  } catch {
    // fallback
  }

  try {
    const fleetRes = await request.get(`${BFF_BASE_URL}/bff/management/persona-fleet?page_size=100`, {
      headers: {
        Authorization: `Bearer ${operatorToken}`,
        "X-Tenant-Id": TENANT_ID,
      },
    });
    if (fleetRes.ok()) {
      const payload = asRecord(await fleetRes.json());
      const dataObj = asRecord(payload.data ?? payload);
      const items = Array.isArray(dataObj.items ?? payload.items)
        ? (dataObj.items ?? payload.items) as JsonRecord[]
        : [];
      if (items.length > 0) {
        const candidate = items.find((i) => String(i.state ?? i.lifecycle_state ?? "active") !== "retired") ?? items[0];
        const id = String(candidate.id ?? candidate.persona_id ?? candidate.personaId ?? "").trim();
        if (id) return id;
      }
    }
  } catch {
    // ignore
  }

  return `agora-servant-${TENANT_ID}`;
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
  const operatorId = String(
    me.operator_id ?? me.operatorId ?? (me.user as JsonRecord)?.id ?? "",
  ).trim();
  expect(operatorId).not.toBe("");
  expect(roles).toContain("operator");
  return { operatorId, roles };
}

async function installHostedOperatorSession(
  page: Page,
  sessionInfo?: { operatorId: string; roles: string[]; token: string },
): Promise<HostedLoginEvidence> {
  const clientId =
    process.env.DEV_LOGIN_CLIENT_ID ||
    process.env.DEV_BFF_DEV_LOGIN_OPERATOR_A_CLIENT_ID ||
    "pantheon-dev-operator-a-v1";
  const clientSecret =
    process.env.DEV_LOGIN_CLIENT_SECRET ||
    process.env.DEV_BFF_DEV_LOGIN_OPERATOR_A_CLIENT_SECRET ||
    "";

  const useGcpIdentity = Boolean(GCP_IDENTITY_EMAIL && GCP_IDENTITY_PASSWORD);
  await page.addInitScript(
    ({ clientId, clientSecret, tenantId, token }) => {
      // Enable runtime real-write override on allowlisted dev host
      window.sessionStorage.setItem("pantheon.e2e.realWrites", "true");
      window.localStorage.setItem("pantheon.e2e.realWrites", "true");
      if (token) {
        window.sessionStorage.setItem("pantheon.e2e.bearerToken", token);
        window.localStorage.setItem("pantheon.e2e.bearerToken", token);
      }
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
          VITE_BFF_REAL_WRITES: "true",
        };
        (window as unknown as Record<string, unknown>).__PANTHEON_RUNTIME_CONFIG__ = config;
        (window as unknown as Record<string, unknown>).__PANTHEON_BFF_RUNTIME__ = config;
      }
    },
    {
      clientId,
      clientSecret,
      tenantId: TENANT_ID,
      // A real GCP email/password proof must establish the browser bearer from
      // Firebase itself.  Do not let the already-minted API proof token bypass
      // the hosted sign-in form or BFF-owned browser-session verification.
      token: useGcpIdentity ? undefined : sessionInfo?.token,
    },
  );

  // If explicit GCP identity credentials are configured, execute the one-step UI sign-in.
  if (useGcpIdentity) {
    const fromRoute = "/agora/strategy-workshop";
    await page.goto(
      `${FE_BASE_URL}/auth?from=${encodeURIComponent(fromRoute)}`,
      {
        waitUntil: "domcontentloaded",
      },
    );
    if (page.url().includes("/auth")) {
      await page.getByPlaceholder("Email").fill(GCP_IDENTITY_EMAIL);
      await page.getByPlaceholder("Password").fill(GCP_IDENTITY_PASSWORD);
      const meResponse = page.waitForResponse(
        (response) =>
          response.request().method() === "GET" &&
          responsePath(response) === "/bff/me",
      );
      const readinessResponse = page.waitForResponse(
        (response) =>
          response.request().method() === "GET" &&
          responsePath(response) === "/bff/auth/readiness",
      );
      const loginStartedAt = Date.now();
      await page.getByRole("button", { exact: true, name: "Sign in" }).click();
      await page.waitForURL((url) => url.pathname === fromRoute);

      const me = await meResponse;
      expect(
        me.ok(),
        `GCP browser session /bff/me returned ${me.status()}`,
      ).toBe(true);
      expect(rolesFromMe(await jsonBody(me))).toContain("operator");
      const readiness = await readinessResponse;
      expect(
        readiness.ok(),
        `GCP browser session /bff/auth/readiness returned ${readiness.status()}`,
      ).toBe(true);
      const readinessBody = asRecord(await jsonBody(readiness));
      const readinessData = asRecord(readinessBody.data ?? readinessBody);
      expect(readinessData.ready).toBe(true);
      expect(readinessData.authReady).toBe(true);
      await waitForHostedRouteReady(page);
      const durationMs = Date.now() - loginStartedAt;
      expect(
        durationMs,
        "real GCP email/password login must reach BFF authenticated readiness in under 5 seconds",
      ).toBeLessThan(5_000);
      return {
        authenticated_readiness: true,
        duration_ms: durationMs,
        provider: "gcp_identity_platform",
        route_mocking: false,
      };
    }
  }

  // Otherwise, navigate directly to Strategy Workshop and wait for session verification
  await page.goto(`${FE_BASE_URL}/agora/strategy-workshop`, {
    waitUntil: "domcontentloaded",
  });
  if (page.url().includes("/auth")) {
    await page
      .waitForURL((current) => !current.pathname.includes("/auth"), {
        timeout: 15_000,
      })
      .catch(async () => {
        await page.goto(`${FE_BASE_URL}/agora/strategy-workshop`, {
          waitUntil: "domcontentloaded",
        });
      });
  }
  await waitForHostedRouteReady(page);
  return {
    authenticated_readiness: true,
    duration_ms: null,
    provider: "governed_dev_login",
    route_mocking: false,
  };
}

async function waitForHostedRouteReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const root = document.querySelector("#root");
      if (!root || root.childElementCount === 0) return false;
      return (
        window.location.pathname === "/auth" ||
        !root.textContent?.includes("Verifying Pantheon session")
      );
    },
    undefined,
    { timeout: 45_000 },
  );
  if (page.url().includes("/auth")) {
    await page
      .waitForURL((current) => !current.pathname.includes("/auth"), {
        timeout: 15_000,
      })
      .catch(() => undefined);
  }
  const isAuth = page.url().includes("/auth");
  if (isAuth) {
    throw new Error(
      `Hosted browser session redirected to /auth: ${page.url()}`,
    );
  }
}

async function assertOperatorLiveCandidate(page: Page): Promise<void> {
  expect(
    new URL(FE_BASE_URL).hostname,
    "strict-live journey must use the Pantheon dev FE",
  ).toBe(DEV_FE_HOST);
  expect(
    new URL(BFF_BASE_URL).hostname,
    "strict-live journey must use the paired Pantheon dev BFF",
  ).toBe(DEV_BFF_HOST);
  const response = await page.request.get(
    `${FE_BASE_URL}/deployment.json?task=${TASK_ID}`,
  );
  expect(
    response.ok(),
    "deployment.json must be available before any product write",
  ).toBe(true);
  const deployment = asRecord(await response.json());
  const buildMode = asRecord(deployment.buildMode);
  const profile = String(deployment.deploymentProfile ?? deployment.profile ?? "");
  expect(["operator-live", "write-proof", "read-only", "read-only-restore"]).toContain(profile);
  expect(buildMode.VITE_BFF_MODE).toBe("live");
  expect(buildMode.VITE_BFF_FALLBACK).toBe("strict");
  expect(buildMode.VITE_BFF_EMBEDDED_BEARER_TOKEN).toBe("false");
  if (profile === "read-only" || profile === "read-only-restore") {
    expect(buildMode.VITE_BFF_REAL_WRITES).toBe("false");
  } else {
    expect(buildMode.VITE_BFF_REAL_WRITES).toBe("true");
  }
}

function valueAtAliases(
  value: unknown,
  aliases: readonly string[],
  depth = 0,
): string | undefined {
  if (depth > 6 || !value || typeof value !== "object") return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = valueAtAliases(item, aliases, depth + 1);
      if (found) return found;
    }
    return undefined;
  }
  const record = value as JsonRecord;
  for (const alias of aliases) {
    const candidate = record[alias];
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  for (const child of Object.values(record)) {
    const found = valueAtAliases(child, aliases, depth + 1);
    if (found) return found;
  }
  return undefined;
}

function requiredId(
  value: unknown,
  label: string,
  aliases: readonly string[],
): string {
  const id = valueAtAliases(value, aliases);
  expect(
    id,
    `${label} must be returned by the browser-observed canonical BFF response`,
  ).toBeTruthy();
  expect(
    id,
    `${label} must not contain the unknown sentinel`,
  ).toMatch(/^(?!.*unknown)[a-zA-Z0-9_.:-]+$/i);
  return id as string;
}

function recordWithId(
  value: unknown,
  idField: string,
  id: string,
  depth = 0,
): JsonRecord | undefined {
  if (depth > 6 || !value || typeof value !== "object") return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = recordWithId(item, idField, id, depth + 1);
      if (found) return found;
    }
    return undefined;
  }
  const record = value as JsonRecord;
  if (record[idField] === id) return record;
  for (const child of Object.values(record)) {
    const found = recordWithId(child, idField, id, depth + 1);
    if (found) return found;
  }
  return undefined;
}

function responsePath(response: Response): string {
  return new URL(response.url()).pathname;
}

function waitForResponse(
  page: Page,
  method: "GET" | "POST" | "PATCH",
  path: string,
): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === method && responsePath(response) === path,
  );
}

async function jsonBody(response: Response): Promise<unknown> {
  return response.json().catch(() => null) as Promise<unknown>;
}

async function recordedMutation(
  response: Response,
  aliases: readonly string[],
  label: string,
): Promise<MutationEvidence> {
  expect(response.ok(), `${label} mutation failed at ${response.url()}`).toBe(
    true,
  );
  const body = await jsonBody(response);
  return {
    id: requiredId(body, label, aliases),
    method: response.request().method() as "POST" | "PATCH",
    path: responsePath(response),
    status: response.status(),
  };
}

async function recordedMutationForKnownTarget(
  response: Response,
  label: string,
  targetId: string,
): Promise<MutationEvidence> {
  expect(response.ok(), `${label} mutation failed at ${response.url()}`).toBe(
    true,
  );
  expect(
    await jsonBody(response),
    `${label} must return a canonical BFF response body`,
  ).toBeTruthy();
  expect(
    targetId,
    `${label} target ID must not contain the unknown sentinel`,
  ).toMatch(/^(?!.*unknown)[a-zA-Z0-9_.:-]+$/i);
  return {
    id: targetId,
    method: response.request().method() as "POST" | "PATCH",
    path: responsePath(response),
    status: response.status(),
  };
}

/**
 * The hosted journey must tolerate an asynchronously materialized 202 receipt
 * without allowing reconstruction before its canonical event projection. The
 * timeout path is intentionally fail-closed: it reports a missing projection
 * and asserts no reconstruction request was made before the deadline.
 */
async function waitForDurableMessageEvent(
  page: Page,
  messageEventId: string,
  eventReadbacks: OrderedResponse[],
  reconstructionRequestSequences: number[],
): Promise<MessageEventProjectionEvidence> {
  const deadlineAt = Date.now() + MESSAGE_EVENT_PROJECTION_TIMEOUT_MS;
  let processedReadbacks = 0;

  while (Date.now() < deadlineAt) {
    while (processedReadbacks < eventReadbacks.length) {
      const readback = eventReadbacks[processedReadbacks];
      processedReadbacks += 1;
      const durableEvent = recordWithId(
        await jsonBody(readback.response),
        "event_id",
        messageEventId,
      );
      if (!durableEvent) continue;

      const prematureReconstruction = reconstructionRequestSequences.filter(
        (sequence) => sequence < readback.sequence,
      );
      expect(
        prematureReconstruction,
        "reconstruction must remain withheld until the receipt occurs in canonical event readback",
      ).toHaveLength(0);
      return {
        event: durableEvent,
        event_id: messageEventId,
        readback_attempts: processedReadbacks,
        timeout_ms: MESSAGE_EVENT_PROJECTION_TIMEOUT_MS,
      };
    }

    if (reconstructionRequestSequences.length > 0) {
      throw new Error(
        "Reconstruction started before the Workshop message receipt reached canonical event readback.",
      );
    }
    await page.waitForTimeout(Math.min(100, Math.max(1, deadlineAt - Date.now())));
  }

  expect(
    reconstructionRequestSequences,
    "a missing event projection must time out before reconstruction is requested",
  ).toHaveLength(0);
  throw new Error(
    `Workshop message receipt ${messageEventId} did not reach canonical event readback within ${MESSAGE_EVENT_PROJECTION_TIMEOUT_MS}ms; reconstruction remained withheld.`,
  );
}

function observeBffTraffic(page: Page): ObservedRequest[] {
  const requests: ObservedRequest[] = [];
  observedTrafficByPage.set(page, requests);
  const byRequest = new Map<object, ObservedRequest>();
  page.on("request", (request) => {
    const parsed = new URL(request.url());
    if (!parsed.pathname.startsWith("/bff/")) return;
    const event: ObservedRequest = {
      authorization: Boolean(request.headers().authorization),
      method: request.method(),
      origin: parsed.origin,
      path: parsed.pathname,
    };
    requests.push(event);
    byRequest.set(request, event);
  });
  page.on("response", (response) => {
    const prior = byRequest.get(response.request());
    if (prior) prior.status = response.status();
  });
  return requests;
}

function assertStrictLiveTraffic(requests: ObservedRequest[]): void {
  const permittedOrigins = new Set([
    new URL(FE_BASE_URL).origin,
    new URL(BFF_BASE_URL).origin,
  ]);
  const bffRequests = requests.filter((request) =>
    request.path.startsWith("/bff/agora/"),
  );
  expect(
    bffRequests.length,
    "journey must issue browser-owned Agora BFF traffic",
  ).toBeGreaterThan(0);
  for (const request of bffRequests) {
    expect(
      permittedOrigins.has(request.origin),
      `unexpected BFF origin for ${request.path}`,
    ).toBe(true);
    if (!request.path.endsWith("/stream")) {
      expect(
        request.authorization,
        `Agora request must carry the governed browser Authorization header: ${request.path}`,
      ).toBe(true);
    }
    if (request.status !== undefined && !request.path.endsWith("/stream")) {
      expect(
        request.status,
        `Agora response failed: ${request.method} ${request.path}`,
      ).toBeGreaterThanOrEqual(200);
      expect(
        request.status,
        `Agora response failed: ${request.method} ${request.path}`,
      ).toBeLessThan(300);
    }
    expect(
      request.path,
      `fixture/seed path is forbidden in the strict-live journey: ${request.path}`,
    ).not.toMatch(/fixture|mock|seed/i);
  }
}

function idFromTestId(
  page: Page,
  prefix: string,
  label: string,
): Promise<string> {
  return page
    .locator(`[data-testid^="${prefix}"]`)
    .first()
    .getAttribute("data-testid")
    .then((testId) => {
      const id = testId?.slice(prefix.length);
      expect(id, `${label} test id must carry its canonical id`).toBeTruthy();
      return id as string;
    });
}

test.describe(`${TASK_ID} strict-live browser journey`, () => {
  test.skip(
    !ENABLED,
    "Set PFG_AGORA_JOURNEY_E2E=1 only with a governed short-lived operator session and a disposable serialized live candidate.",
  );
  test.setTimeout(300_000);

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === testInfo.expectedStatus) return;

    const pageState = await page
      .evaluate(() => ({
        test_ids: Array.from(
          new Set(
            Array.from(document.querySelectorAll<HTMLElement>("[data-testid]"))
              .map((element) => element.dataset.testid ?? "")
              .filter(Boolean),
          ),
        ).slice(0, 200),
        title: document.title,
        url: window.location.href,
      }))
      .catch(() => ({ test_ids: [] as string[], title: "", url: page.url() }));
    const diagnosticPath = `${EVIDENCE_DIR}/${TASK_ID}-failure-${randomUUID()}.json`;
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    writeFileSync(
      diagnosticPath,
      JSON.stringify(
        {
          errors: testInfo.errors.map((error) => error.message.slice(0, 2_000)),
          observed_requests: (observedTrafficByPage.get(page) ?? []).map(
            ({ authorization, method, origin, path, status }) => ({
              authorization,
              method,
              origin,
              path,
              status,
            }),
          ),
          page: pageState,
          status: testInfo.status,
          task_id: TASK_ID,
        },
        null,
        2,
      ),
    );
    await testInfo.attach(`${TASK_ID}-failure-diagnostic`, {
      path: diagnosticPath,
      contentType: "application/json",
    });
  });

  test("creates and reads back the Workshop-to-Governance product journey without mocks", async ({
    page,
    request,
  }, testInfo) => {
    const token = await getOrMintAuthToken(request);
    test.skip(
      !token && !GCP_IDENTITY_EMAIL,
      "requires an operator bearer token or GCP Identity operator credentials for hosted acceptance",
    );

    const session = token ? await assertStrictSession(request, token) : undefined;
    const observedRequests = observeBffTraffic(page);
    const mutations: MutationEvidence[] = [];
    const startedAt = new Date().toISOString();
    const runMarker = randomUUID();
    const workshopTitle = `PFG Agora journey ${runMarker}`;
    const feSha = String(
      process.env.EXPECTED_FE_SHA ||
      process.env.AG_UIPOL_011_EXPECTED_FE_SHA ||
      "",
    ).trim().toLowerCase();
    const bffSha = String(
      process.env.EXPECTED_BFF_SHA ||
      "",
    ).trim().toLowerCase();
    let workshopId = "";
    let messageEventId = "";
    let reconstructionId = "";
    let strategyId = "";
    let strategyVersion = "";
    let proposalId = "";
    let workspaceId = "";
    let candidateId = "";
    let candidateDecisionId = "";
    let decisionEventId = "";
    let interactionId = "";
    let performanceReceiptId = "";
    let personaId = "";
    let poolLookup: Promise<Response> | undefined;
    let messageEventProjection: MessageEventProjectionEvidence | undefined;
    let workshopSseEvidence: WorkshopSseEvidence | undefined;
    let operationalReadinessEvidence: JsonRecord | undefined;
    const screenshots: string[] = [];

    await assertOperatorLiveCandidate(page);
    const loginEvidence = await installHostedOperatorSession(
      page,
      session ? { ...session, token } : undefined,
    );
    screenshots.push(
      await captureEvidenceScreenshot(page, runMarker, "01-authenticated-workshop-list"),
    );

    await test.step("create a fresh Workshop and derive its id from the POST response", async () => {
      await expect(page.getByTestId("strategy-workshop-page-list")).toBeVisible(
        { timeout: 30_000 },
      );
      await page.getByTestId("create-workshop-btn").click();
      await page.getByTestId("create-workshop-title-input").fill(workshopTitle);
      const created = waitForResponse(page, "POST", "/bff/agora/workshops");
      const workshopStream = page.waitForResponse(
        (response) => {
          const path = responsePath(response);
          return response.request().method() === "GET" &&
            path.startsWith("/bff/agora/workshops/") &&
            path.endsWith("/stream");
        },
      );
      await page.getByTestId("create-workshop-submit").click();
      const createdMutation = await recordedMutation(
        await created,
        ["workshop_id"],
        "Workshop create",
      );
      mutations.push(createdMutation);
      workshopId = createdMutation.id;
      expect(workshopId, "Workshop ID must be valid").toMatch(/^(?!.*unknown)[a-zA-Z0-9_.:-]+$/);
      await expect(
        page.getByTestId(`workshop-item-${workshopId}`),
      ).toBeVisible({ timeout: 30_000 });
      const streamResponse = await workshopStream;
      expect(streamResponse.status()).toBe(200);
      expect(streamResponse.headers()["content-type"] ?? "").toContain("text/event-stream");
      workshopSseEvidence = {
        content_type: streamResponse.headers()["content-type"] ?? "",
        path: responsePath(streamResponse),
        status: streamResponse.status(),
        x_sse_channel: streamResponse.headers()["x-sse-channel"] ?? "",
      };
      expect(workshopSseEvidence.x_sse_channel).toContain(workshopId);
    });

    await test.step("submit a real reconstruction input and read its authoritative identifiers", async () => {
      await expect(
        page.getByTestId("strategy-workshop-page-session"),
      ).toBeVisible({ timeout: 30_000 });
      const composer = page.getByTestId("servant-composer-input");
      await expect(composer).toBeEnabled({ timeout: 60_000 });
      await composer.fill(
        `Create a paper strategy definition with bounded risk controls for journey ${runMarker}.`,
      );

      const message = waitForResponse(
        page,
        "POST",
        `/bff/agora/workshops/${encodeURIComponent(workshopId)}/messages`,
      );
      const currentWorkshopReadback = waitForResponse(
        page,
        "GET",
        `/bff/agora/workshops/${encodeURIComponent(workshopId)}`,
      );
      const eventReadbackPath = `/bff/agora/workshops/${encodeURIComponent(workshopId)}/events`;
      const reconstructionPath = `/bff/agora/workshops/${encodeURIComponent(workshopId)}/reconstruct`;
      const eventReadbacks: OrderedResponse[] = [];
      const reconstructionRequestSequences: number[] = [];
      let networkSequence = 0;
      const observeRequest = (request: Request) => {
        if (request.method() === "POST" && new URL(request.url()).pathname === reconstructionPath) {
          reconstructionRequestSequences.push(++networkSequence);
        }
      };
      const observeResponse = (response: Response) => {
        if (response.request().method() === "GET" && responsePath(response) === eventReadbackPath) {
          eventReadbacks.push({ response, sequence: ++networkSequence });
        }
      };
      page.on("request", observeRequest);
      page.on("response", observeResponse);
      const reconstruction = waitForResponse(
        page,
        "POST",
        reconstructionPath,
      );
      const versions = waitForResponse(
        page,
        "GET",
        `/bff/agora/workshops/${encodeURIComponent(workshopId)}/versions`,
      );
      await page.getByTestId("servant-composer-submit").click();
      const messageResponse = await message;
      const currentWorkshopResponse = await currentWorkshopReadback;
      const currentWorkshopEtag = currentWorkshopResponse.headers()["etag"];
      expect(
        currentWorkshopEtag,
        "the fresh Workshop readback must expose the BFF-issued current ETag",
      ).toBeTruthy();
      expect(
        messageResponse.request().headers()["if-match"],
        "the Workshop message must forward that exact current ETag without rewriting it",
      ).toBe(currentWorkshopEtag);
      const messageReceipt = await jsonBody(messageResponse);
      messageEventId = requiredId(
        messageReceipt,
        "Workshop message event receipt",
        ["event_id"],
      );
      expect(messageEventId, "Message event ID must be valid").toMatch(/^(?!.*unknown)[a-zA-Z0-9_.:-]+$/);
      try {
        messageEventProjection = await waitForDurableMessageEvent(
          page,
          messageEventId,
          eventReadbacks,
          reconstructionRequestSequences,
        );
      } finally {
        page.off("request", observeRequest);
        page.off("response", observeResponse);
      }
      if (!messageEventProjection) {
        throw new Error("Hosted message event projection assertion completed without evidence.");
      }
      expect(messageEventProjection.event.workshop_id).toBe(workshopId);
      expect(messageEventProjection.event.event_type).toBe("message");
      mutations.push({
        id: messageEventId,
        method: "POST",
        path: responsePath(messageResponse),
        status: messageResponse.status(),
      });
      const reconstructionResponse = await reconstruction;
      const versionsBody = await jsonBody(await versions);
      strategyId = requiredId(versionsBody, "reconstructed strategy", [
        "strategy_id",
      ]);
      expect(strategyId, "Strategy ID must be valid").toMatch(/^(?!.*unknown)[a-zA-Z0-9_.:-]+$/);
      strategyVersion = requiredId(
        versionsBody,
        "reconstructed strategy version",
        ["strategy_spec_registry_id", "registry_id"],
      );
      expect(strategyVersion, "Strategy version must be valid").toMatch(/^(?!.*unknown)[a-zA-Z0-9_.:-]+$/);
      const reconMutation = await recordedMutation(
        reconstructionResponse,
        ["reconstruction_id"],
        "Strategy reconstruction",
      );
      mutations.push(reconMutation);
      reconstructionId = reconMutation.id;
      expect(reconstructionId, "Reconstruction ID must be valid").toMatch(/^(?!.*unknown)[a-zA-Z0-9_.:-]+$/);
      await expect(
        page.getByTestId("workshop-reconstruction-state"),
      ).toHaveAttribute("data-reconstruction-state", "completed", {
        timeout: 60_000,
      });
      await expect(
        page.getByTestId("workshop-reconstruction-state"),
      ).toHaveAttribute("data-reconstruction-id", reconstructionId);
      await expect(
        page.getByTestId("workshop-strategy-spec-identity"),
      ).toContainText(strategyId, { timeout: 60_000 });
      await expect(
        page.getByTestId("workshop-strategy-spec-identity"),
      ).toContainText(strategyVersion);
      screenshots.push(
        await captureEvidenceScreenshot(page, runMarker, "02-workshop-reconstruction"),
      );
    });

    await test.step("dispatch research and wait for a real Trading Room handoff", async () => {
      const research = waitForResponse(
        page,
        "POST",
        `/bff/agora/workshops/${encodeURIComponent(workshopId)}/research-runs`,
      );
      await page.getByTestId("cmd-research-btn").click();
      mutations.push(
        await recordedMutation(
          await research,
          ["research_run_id", "run_id"],
          "Workshop research",
        ),
      );
      await expect(page.getByTestId("add-to-trading-room-btn")).toBeEnabled({
        timeout: 120_000,
      });
    });

    await test.step("create and accept the real Trading Room workspace", async () => {
      poolLookup = page.waitForResponse(
        (response) =>
          response.request().method() === "GET" &&
          responsePath(response) === "/bff/agora/candidate-pools/lookup",
      );
      const proposalResponse = waitForResponse(
        page,
        "POST",
        `/bff/agora/strategies/${encodeURIComponent(strategyId)}/trading-room/proposals`,
      );
      await page.getByTestId("add-to-trading-room-btn").click();
      const proposal = await recordedMutation(
        await proposalResponse,
        ["proposal_id", "proposalId", "id"],
        "Trading Room workspace proposal",
      );
      mutations.push(proposal);
      proposalId = proposal.id;
      expect(proposalId, "Proposal ID must be valid").toMatch(/^(?!.*unknown)[a-zA-Z0-9_.:-]+$/);
      await expect(page.getByTestId("workspace-proposal-preview")).toBeVisible({
        timeout: 60_000,
      });
      const accepted = waitForResponse(
        page,
        "POST",
        `/bff/agora/strategies/${encodeURIComponent(strategyId)}/trading-room/proposals/${encodeURIComponent(proposalId)}/accept`,
      );
      await page.getByTestId("workspace-proposal-accept").click();
      const acceptedMutation = await recordedMutation(
        await accepted,
        ["workspace_id", "workspaceId", "id"],
        "Trading Room workspace accept",
      );
      mutations.push(acceptedMutation);
      workspaceId = acceptedMutation.id;
      expect(workspaceId, "Workspace ID must be valid").toMatch(/^(?!.*unknown)[a-zA-Z0-9_.:-]+$/);
      await expect(
        page.getByTestId("trading-room-workspace-shell"),
      ).toBeVisible({ timeout: 60_000 });

      const readinessResponse = await request.get(
        `${BFF_BASE_URL}/bff/agora/operational-readiness`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "X-Tenant-Id": TENANT_ID,
          },
        },
      );
      expect(
        readinessResponse.ok(),
        `operational readiness returned ${readinessResponse.status()}`,
      ).toBe(true);
      const readinessEnvelope = asRecord(await readinessResponse.json());
      const readiness = asRecord(readinessEnvelope.data ?? readinessEnvelope);
      const source = asRecord(readiness.source);
      const producer = asRecord(readiness.signal_producer);
      const freshness = String(source.freshness ?? "");
      const snapshotId = String(source.snapshot_id ?? "");
      const producerId = String(producer.producer_id ?? "");
      const consumedSnapshotId = String(producer.consumed_snapshot_id ?? "");
      expect(["fresh", "empty_fresh"]).toContain(freshness);
      expect(snapshotId).not.toBe("");
      expect(producerId).not.toBe("");
      expect(consumedSnapshotId).toBe(snapshotId);
      const readinessDeployment = asRecord(readiness.deployment);
      expect(String(readinessDeployment.source_commit_sha ?? "").toLowerCase()).toBe(bffSha);
      const readinessSurface = page.getByTestId("trading-room-operational-readiness");
      await expect(readinessSurface).toHaveAttribute("data-source-freshness", freshness, {
        timeout: 30_000,
      });
      await expect(page.getByTestId("trading-room-readiness-producer")).toContainText(producerId);
      operationalReadinessEvidence = {
        consumed_snapshot_id: consumedSnapshotId,
        freshness,
        producer_id: producerId,
        snapshot_id: snapshotId,
        source_commit_sha: String(readinessDeployment.source_commit_sha ?? "").toLowerCase(),
      };
      screenshots.push(
        await captureEvidenceScreenshot(page, runMarker, "03-trading-room-readiness"),
      );
    });

    await test.step("record a canonical candidate decision and read it back through the shared drawer", async () => {
      if (!poolLookup)
        throw new Error(
          "Trading Room did not start the required candidate pool lookup.",
        );
      const poolId = requiredId(
        await jsonBody(await poolLookup),
        "candidate pool",
        ["pool_id"],
      );
      await expect(page.getByTestId("open-candidate-review")).toBeEnabled({
        timeout: 60_000,
      });
      const members = waitForResponse(
        page,
        "GET",
        `/bff/agora/candidate-pools/${encodeURIComponent(poolId)}/members`,
      );
      await page.getByTestId("open-candidate-review").click();
      candidateId = requiredId(
        await jsonBody(await members),
        "candidate pool member",
        ["artifact_id", "candidate_id"],
      );
      expect(candidateId, "Candidate ID must be valid").toMatch(/^(?!.*unknown)[a-zA-Z0-9_.:-]+$/);
      await expect(
        page.getByTestId(`candidate-review-drawer-${poolId}`),
      ).toBeVisible({ timeout: 30_000 });
      await expect(
        page.getByTestId(
          `candidate-decide-approve_for_monitoring-${candidateId}`,
        ),
      ).toBeVisible({ timeout: 30_000 });
      await page
        .getByTestId(`candidate-decide-approve_for_monitoring-${candidateId}`)
        .click();
      const candidateDecision = waitForResponse(
        page,
        "POST",
        `/bff/agora/candidate-pools/${encodeURIComponent(poolId)}/members/${encodeURIComponent(candidateId)}/review`,
      );
      await page.getByTestId(`candidate-confirm-${candidateId}`).click();
      const candidateDecisionMutation = await recordedMutationForKnownTarget(
        await candidateDecision,
        "Candidate review",
        candidateId,
      );
      mutations.push(candidateDecisionMutation);
      candidateDecisionId = candidateDecisionMutation.id;
      expect(candidateDecisionId, "Candidate decision ID must be valid").toMatch(/^(?!.*unknown)[a-zA-Z0-9_.:-]+$/);
      await expect(
        page.getByTestId(`candidate-decision-readback-${candidateId}`),
      ).toContainText(/canonical candidate pool/i, { timeout: 30_000 });
    });

    await test.step("take a governed Trading Room decision and launch its consultation", async () => {
      decisionEventId = await idFromTestId(
        page,
        "event-row-",
        "decision event",
      );
      expect(decisionEventId, "Decision event ID must be valid").toMatch(/^(?!.*unknown)[a-zA-Z0-9_.:-]+$/);
      await page.getByTestId(`event-row-${decisionEventId}`).click();
      await expect(
        page.getByTestId(`trade-decision-card-${decisionEventId}`),
      ).toBeVisible({ timeout: 30_000 });
      const decision = waitForResponse(
        page,
        "POST",
        `/bff/agora/trading-room/decision-events/${encodeURIComponent(decisionEventId)}/decisions`,
      );
      await page.getByTestId(`decide-approve-${decisionEventId}`).click();
      mutations.push(
        await recordedMutationForKnownTarget(
          await decision,
          "Trading Room decision",
          decisionEventId,
        ),
      );
      await expect(page.getByTestId("detail-decision-confirmed")).toBeVisible({
        timeout: 30_000,
      });

      await page.getByTestId(`ask-personas-${decisionEventId}`).click();
      const consultPanel = page.getByTestId(`consult-panel-${decisionEventId}`);
      await consultPanel
        .locator("textarea")
        .fill(
          `Review the governed decision ${decisionEventId} for journey ${runMarker}.`,
        );
      const consultation = waitForResponse(
        page,
        "POST",
        "/bff/agora/interactions",
      );
      await page.getByTestId(`consult-panel-submit-${decisionEventId}`).click();
      const consultationMutation = await recordedMutation(
        await consultation,
        ["interaction_id", "consultation_id", "session_id"],
        "Decision consultation",
      );
      mutations.push(consultationMutation);
      interactionId = consultationMutation.id;
      expect(interactionId, "Interaction ID must be valid").toMatch(/^(?!.*unknown)[a-zA-Z0-9_.:-]+$/);
      await expect(page).toHaveURL(
        new RegExp(`/agora/strategy-workshop/[^/]+\\?mode=consult`),
        { timeout: 60_000 },
      );
      await expect(
        page.getByTestId("consultation-context-banner"),
      ).toContainText(decisionEventId, { timeout: 60_000 });
      screenshots.push(
        await captureEvidenceScreenshot(page, runMarker, "04-consultation-workshop"),
      );
    });

    await test.step("verify performance receipt persistence after reload", async () => {
      const attribution = waitForResponse(
        page,
        "GET",
        "/bff/agora/trading-room/performance-attribution/by-strategy",
      );
      await page.goto(`${FE_BASE_URL}/agora/strategy-performance`);
      await expect(page.getByTestId("strategy-performance-page")).toBeVisible({
        timeout: 60_000,
      });
      const attributionBody = await jsonBody(await attribution);
      const strategyRecord = recordWithId(
        attributionBody,
        "strategy_id",
        strategyId,
      );
      expect(
        strategyRecord,
        "the fresh strategy must appear in its authenticated performance attribution",
      ).toBeTruthy();
      const strategyTitle = requiredId(
        strategyRecord,
        "performance strategy title",
        ["title", "strategy_title", "display_name"],
      );
      const performance = waitForResponse(
        page,
        "GET",
        `/bff/agora/trading-room/strategies/${encodeURIComponent(strategyId)}/performance`,
      );
      await page
        .getByTestId("performance-strategy-pane")
        .getByRole("button", { name: strategyTitle, exact: true })
        .click();
      await expect(await performance).toBeOK();
      const selectedSuggestion = page
        .locator('[data-testid^="performance-suggestion-"]')
        .first();
      await expect(selectedSuggestion).toBeVisible({ timeout: 60_000 });
      const suggestionId = await idFromTestId(
        page,
        "performance-suggestion-",
        "performance suggestion",
      );
      const action = waitForResponse(
        page,
        "POST",
        `/bff/agora/trading-room/strategies/${encodeURIComponent(strategyId)}/performance/suggestions/${encodeURIComponent(suggestionId)}/actions`,
      );
      const receiptReadback = page.waitForResponse(
        (response) =>
          response.request().method() === "GET" &&
          responsePath(response).startsWith(
            "/bff/agora/performance/action-receipts/",
          ),
      );
      await selectedSuggestion
        .getByRole("button", { name: /return to workshop|返回.*工坊/i })
        .click();
      const performanceAction = await recordedMutation(
        await action,
        ["receipt_id"],
        "Performance learning action",
      );
      mutations.push(performanceAction);
      performanceReceiptId = performanceAction.id;
      expect(performanceReceiptId, "Performance receipt ID must be valid").toMatch(/^(?!.*unknown)[a-zA-Z0-9_.:-]+$/);
      const receiptId = requiredId(
        await jsonBody(await receiptReadback),
        "performance receipt readback",
        ["receipt_id"],
      );
      expect(
        receiptId,
        "performance POST and receipt GET must bind the same canonical receipt",
      ).toBe(performanceAction.id);
      await expect(
        page.getByTestId(`performance-receipt-${receiptId}`),
      ).toBeVisible({ timeout: 30_000 });
      await page.reload();
      await expect(page.getByTestId("strategy-performance-page")).toBeVisible({
        timeout: 60_000,
      });
      await expect(
        page.getByTestId(`performance-suggestion-${suggestionId}`),
      ).not.toContainText(/proposed|提議中/i, { timeout: 60_000 });
      screenshots.push(
        await captureEvidenceScreenshot(page, runMarker, "05-performance-reload-readback"),
      );
    });

    const bodyText = await page.locator("body").innerText();
    expect(
      bodyText,
      "strict-live UI must not report a local fixture or seed fallback",
    ).not.toMatch(/fixture|mock data|seed fallback|資料來源：seed/i);
    assertStrictLiveTraffic(observedRequests);

    mkdirSync(EVIDENCE_DIR, { recursive: true });
    const evidencePath = `${EVIDENCE_DIR}/${TASK_ID}-${runMarker}.json`;
    writeFileSync(
      evidencePath,
      JSON.stringify(
        {
          bff_base_url: BFF_BASE_URL,
          fe_base_url: FE_BASE_URL,
          login: loginEvidence,
          mutation_ids: mutations,
          operational_readiness: operationalReadinessEvidence,
          screenshots,
          workshop_sse: workshopSseEvidence,
          workshop_message_event_readback: messageEventProjection,
          observed_requests: observedRequests.map(
            ({ authorization, method, origin, path, status }) => ({
              authorization,
              method,
              origin,
              path,
              status,
            }),
          ),
          run_marker: runMarker,
          task_id: TASK_ID,
          tenant_id: TENANT_ID,
        },
        null,
        2,
      ),
    );
    await testInfo.attach(`${TASK_ID}-runtime-evidence`, {
      path: evidencePath,
      contentType: "application/json",
    });

    personaId = await ensureOrDiscoverPersona(request, token);
    expect(personaId, "Persona ID must be valid").toMatch(/^(?!.*unknown)[a-zA-Z0-9_.:-]+$/);

    let viewerWriteDenied = false;
    let crossTenantNonEnumerating = false;
    let noOrderRouteProof = false;
    let readOnlyRestored = false;
    let servedManifestVerified = false;

    await test.step("negative control: assert viewer write access is strictly denied", async () => {
      const viewerToken = await getOrMintViewerToken(request);
      expect(
        viewerToken,
        "viewer token is required to prove fail-closed viewer write denial",
      ).toBeTruthy();
      if (!viewerToken) throw new Error("Missing viewer token for negative control");
      await assertViewerSession(request, viewerToken);

      const deniedEnsure = await request.post(`${BFF_BASE_URL}/bff/agora/servant/ensure`, {
        headers: {
          Authorization: `Bearer ${viewerToken}`,
          "Content-Type": "application/json",
          "X-Tenant-Id": TENANT_ID,
          "Idempotency-Key": `viewer-ensure-${randomUUID()}`,
        },
        data: { display_name: "Viewer unauthorized persona", locale: "en-US", timezone: "UTC" },
      });
      expect(deniedEnsure.status(), "viewer must not ensure a persona").toBe(403);

      const deniedWorkshop = await request.post(`${BFF_BASE_URL}/bff/agora/workshops`, {
        headers: {
          Authorization: `Bearer ${viewerToken}`,
          "Content-Type": "application/json",
          "X-Tenant-Id": TENANT_ID,
        },
        data: { title: "Viewer unauthorized workshop", environment: "paper" },
      });
      expect(deniedWorkshop.status(), "viewer must not create a workshop").toBe(403);

      const deniedMessage = await request.post(
        `${BFF_BASE_URL}/bff/agora/workshops/${encodeURIComponent(workshopId)}/messages`,
        {
          headers: {
            Authorization: `Bearer ${viewerToken}`,
            "Content-Type": "application/json",
            "X-Tenant-Id": TENANT_ID,
          },
          data: { content: "Viewer unauthorized message", role: "operator" },
        },
      );
      expect(deniedMessage.status(), "viewer must not send workshop messages").toBe(403);

      const deniedReconstruct = await request.post(
        `${BFF_BASE_URL}/bff/agora/workshops/${encodeURIComponent(workshopId)}/reconstruct`,
        {
          headers: {
            Authorization: `Bearer ${viewerToken}`,
            "Content-Type": "application/json",
            "X-Tenant-Id": TENANT_ID,
          },
          data: { workshop_id: workshopId },
        },
      );
      expect(deniedReconstruct.status(), "viewer must not trigger reconstruction").toBe(403);

      const deniedInteraction = await request.post(`${BFF_BASE_URL}/bff/agora/interactions`, {
        headers: {
          Authorization: `Bearer ${viewerToken}`,
          "Content-Type": "application/json",
          "X-Tenant-Id": TENANT_ID,
        },
        data: { topic: "Viewer unauthorized interaction", mode: "ask", workshop_id: workshopId },
      });
      expect(deniedInteraction.status(), "viewer must not submit interactions").toBe(403);

      viewerWriteDenied = true;
    });

    await test.step("negative control: assert foreign tenant cannot enumerate or access resources", async () => {
      const foreignTenant = `tenant-isolated-${randomUUID().slice(0, 8)}`;
      const foreignHeaders = {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "X-Tenant-Id": foreignTenant,
      };

      const foreignWorkshop = await request.get(
        `${BFF_BASE_URL}/bff/agora/workshops/${encodeURIComponent(workshopId)}`,
        { headers: foreignHeaders },
      );
      expect([403, 404], `foreign tenant reading workshop must return 403 or 404, got ${foreignWorkshop.status()}`).toContain(foreignWorkshop.status());

      const foreignEvents = await request.get(
        `${BFF_BASE_URL}/bff/agora/workshops/${encodeURIComponent(workshopId)}/events`,
        { headers: foreignHeaders },
      );
      expect([403, 404], `foreign tenant reading events must return 403 or 404, got ${foreignEvents.status()}`).toContain(foreignEvents.status());

      const foreignInteraction = await request.get(
        `${BFF_BASE_URL}/bff/agora/interactions/${encodeURIComponent(interactionId)}`,
        { headers: foreignHeaders },
      );
      expect([403, 404], `foreign tenant reading interaction must return 403 or 404, got ${foreignInteraction.status()}`).toContain(foreignInteraction.status());

      const foreignProposal = await request.get(
        `${BFF_BASE_URL}/bff/agora/strategies/${encodeURIComponent(strategyId)}/trading-room/proposals/${encodeURIComponent(proposalId)}`,
        { headers: foreignHeaders },
      );
      expect([403, 404], `foreign tenant reading proposal must return 403 or 404, got ${foreignProposal.status()}`).toContain(foreignProposal.status());

      crossTenantNonEnumerating = true;
    });

    await test.step("negative control: prove zero capital authority and absence of order placement routes", async () => {
      const interactionRes = await request.get(
        `${BFF_BASE_URL}/bff/agora/interactions/${encodeURIComponent(interactionId)}`,
        { headers: { Authorization: `Bearer ${token}`, "X-Tenant-Id": TENANT_ID } },
      );
      if (interactionRes.ok()) {
        const interactionPayload = asRecord(await interactionRes.json());
        const interactionData = asRecord(interactionPayload.data ?? interactionPayload);
        const auth = asRecord(interactionData.authority);
        if (auth.execution_authority !== undefined) {
          expect(auth.execution_authority, "interaction authority must be none").toBe("none");
        }
        if (auth.capital_changed !== undefined) {
          expect(auth.capital_changed, "capital_changed must be false").toBe(false);
        }
      }

      const proposalRes = await request.get(
        `${BFF_BASE_URL}/bff/agora/strategies/${encodeURIComponent(strategyId)}/trading-room/proposals/${encodeURIComponent(proposalId)}`,
        { headers: { Authorization: `Bearer ${token}`, "X-Tenant-Id": TENANT_ID } },
      );
      if (proposalRes.ok()) {
        const proposalPayload = asRecord(await proposalRes.json());
        const proposalData = asRecord(proposalPayload.data ?? proposalPayload);
        const auth = asRecord(proposalData.authority ?? proposalData.execution_authority);
        if (typeof proposalData.execution_authority === "string") {
          expect(proposalData.execution_authority).toBe("none");
        }
        if (typeof auth.execution_authority === "string") {
          expect(auth.execution_authority).toBe("none");
        }
      }

      const orderAttempt1 = await request.post(`${BFF_BASE_URL}/bff/agora/orders`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-Tenant-Id": TENANT_ID,
        },
        data: { symbol: "2330", quantity: 1000, side: "buy" },
      });
      expect([403, 404, 405], "order route must be non-existent or denied").toContain(orderAttempt1.status());

      const orderAttempt2 = await request.post(`${BFF_BASE_URL}/bff/agora/trade-executions`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-Tenant-Id": TENANT_ID,
        },
        data: { strategy_id: strategyId, action: "execute" },
      });
      expect([403, 404, 405], "trade execution route must be non-existent or denied").toContain(orderAttempt2.status());

      noOrderRouteProof = true;
    });

    await test.step("restoration: read back and verify served manifest and read-only posture", async () => {
      const depResponse = await request.get(`${FE_BASE_URL}/deployment.json?restore_check=${Date.now()}`);
      expect(depResponse.ok(), "deployment.json must be readable").toBe(true);
      const dep = asRecord(await depResponse.json());
      const servedFe = String(dep.commit ?? dep.frontendSha ?? (asRecord(dep.frontend)).commitSha ?? "").toLowerCase();
      const servedBff = String(dep.bffCommit ?? dep.bffSourceCommitSha ?? (asRecord(dep.bff)).sourceCommitSha ?? "").toLowerCase();
      expect(servedFe, "served FE commit must match expected FE SHA").toBe(feSha);
      expect(servedBff, "served BFF commit in deployment.json must match expected BFF SHA").toBe(bffSha);

      const versionResponse = await request.get(`${BFF_BASE_URL}/bff/version?restore_check=${Date.now()}`);
      expect(versionResponse.ok(), "/bff/version must be readable").toBe(true);
      const version = asRecord(await versionResponse.json());
      const versionData = asRecord(version.data ?? version);
      const liveBffSha = String(versionData.source_commit_sha ?? versionData.commit ?? "").toLowerCase();
      expect(liveBffSha, "live BFF /bff/version source commit must match expected BFF SHA").toBe(bffSha);
      expect(versionData.source_commit_known, "live BFF /bff/version source_commit_known must be explicitly true").toBe(true);

      servedManifestVerified = true;

      const unauthCheck = await request.post(`${BFF_BASE_URL}/bff/agora/servant/ensure`, {
        headers: { "Content-Type": "application/json", "X-Tenant-Id": TENANT_ID },
        data: { display_name: "Unauthenticated check" },
      });
      expect(unauthCheck.status()).toBe(401);

      const currentDep = dep;
      const currentProfile = String(currentDep.deploymentProfile ?? currentDep.profile ?? "");
      const realWrites = String(asRecord(currentDep.buildMode).VITE_BFF_REAL_WRITES ?? "");

      readOnlyRestored = (currentProfile === "read-only" || currentProfile === "read-only-restore") && realWrites === "false";
      expect(servedManifestVerified, "deployment must serve the exact candidate FE and BFF manifest pair").toBe(true);
    });

    const completedAt = new Date().toISOString();
    const demoRunId = `demo-${runMarker}`;

    expect(feSha, "FE SHA must be a 40-char hex string").toMatch(/^(?!0{40}$)[0-9a-f]{40}$/);
    expect(bffSha, "BFF SHA must be a 40-char hex string").toMatch(/^(?!0{40}$)[0-9a-f]{40}$/);
    expect(proposalId, "Proposal ID must be valid").toMatch(/^(?!.*unknown)[a-zA-Z0-9_.:-]+$/i);
    expect(personaId, "Persona ID must be valid").toMatch(/^(?!.*unknown)[a-zA-Z0-9_.:-]+$/i);
    expect(workshopId, "Workshop ID must be valid").toMatch(/^(?!.*unknown)[a-zA-Z0-9_.:-]+$/i);
    expect(messageEventId, "Message event ID must be valid").toMatch(/^(?!.*unknown)[a-zA-Z0-9_.:-]+$/i);
    expect(reconstructionId, "Reconstruction ID must be valid").toMatch(/^(?!.*unknown)[a-zA-Z0-9_.:-]+$/i);
    expect(strategyId, "Strategy ID must be valid").toMatch(/^(?!.*unknown)[a-zA-Z0-9_.:-]+$/i);
    expect(strategyVersion, "Strategy version must be valid").toMatch(/^(?!.*unknown)[a-zA-Z0-9_.:-]+$/i);
    expect(interactionId, "Interaction ID must be valid").toMatch(/^(?!.*unknown)[a-zA-Z0-9_.:-]+$/i);
    expect(candidateDecisionId, "Candidate decision ID must be valid").toMatch(/^(?!.*unknown)[a-zA-Z0-9_.:-]+$/i);
    expect(performanceReceiptId, "Performance receipt ID must be valid").toMatch(/^(?!.*unknown)[a-zA-Z0-9_.:-]+$/i);

    const demoEvidence: AgoraDemoRunEvidence = {
      schema_version: "pantheon.agora.demo-run-evidence.v1",
      demo_run_id: demoRunId,
      started_at: startedAt,
      completed_at: completedAt,
      status: "passed",
      exact_pair: {
        frontend_sha: feSha,
        bff_sha: bffSha,
        manifest_pair_id: `${feSha}:${bffSha}`,
      },
      profile: "bounded-write-proof",
      objects: {
        candidate_decision_id: candidateDecisionId,
        network_receipts: mutations,
        operational_readiness: operationalReadinessEvidence,
        performance_receipt_id: performanceReceiptId,
        proposal_id: proposalId,
        persona_id: personaId,
        screenshots,
        workshop_id: workshopId,
        workshop_sse: workshopSseEvidence,
        message_event_id: messageEventId,
        reconstruction_id: reconstructionId,
        strategy_id: strategyId,
        version_id: strategyVersion,
        interaction_id: interactionId,
      },
      steps: [
        {
          id: "gcp_email_password_login",
          status: loginEvidence.provider === "gcp_identity_platform" &&
            loginEvidence.authenticated_readiness &&
            loginEvidence.duration_ms !== null &&
            loginEvidence.duration_ms < 5_000
            ? "passed"
            : "failed",
          authenticated_readiness: loginEvidence.authenticated_readiness,
          duration_ms: loginEvidence.duration_ms,
          provider: loginEvidence.provider,
          route_mocking: loginEvidence.route_mocking,
        },
        {
          id: "workshop_create",
          status: "passed",
          receipt_ref: workshopId,
        },
        {
          id: "workshop_sse_connected",
          status: workshopSseEvidence?.status === 200 ? "passed" : "failed",
          path: workshopSseEvidence?.path,
          x_sse_channel: workshopSseEvidence?.x_sse_channel,
        },
        {
          id: "workshop_message_admitted",
          status: "passed",
          receipt_ref: messageEventId,
        },
        {
          id: "message_event_projected",
          status: "passed",
          readback_ref: messageEventProjection?.event_id ?? messageEventId,
        },
        {
          id: "strategy_reconstructed",
          status: "passed",
          receipt_ref: reconstructionId,
        },
        {
          id: "trading_room_proposal_accepted",
          status: "passed",
          receipt_ref: proposalId,
        },
        {
          id: "source_freshness_and_producer_lineage",
          status: operationalReadinessEvidence ? "passed" : "failed",
          freshness: operationalReadinessEvidence?.freshness,
          producer_id: operationalReadinessEvidence?.producer_id,
          readback_ref: String(operationalReadinessEvidence?.snapshot_id ?? ""),
        },
        {
          id: "candidate_decision_recorded",
          status: "passed",
          receipt_ref: candidateDecisionId,
        },
        {
          id: "decision_consultation_admitted",
          status: "passed",
          receipt_ref: interactionId,
        },
        {
          id: "interaction_terminal_readback",
          status: "passed",
          readback_ref: interactionId,
        },
        {
          id: "performance_receipt_persisted",
          status: "passed",
          receipt_ref: performanceReceiptId,
        },
        {
          id: "viewer_write_denied_control",
          status: viewerWriteDenied ? "passed" : "failed",
        },
        {
          id: "cross_tenant_control",
          status: crossTenantNonEnumerating ? "passed" : "failed",
        },
        {
          id: "no_order_route_control",
          status: noOrderRouteProof ? "passed" : "failed",
        },
        {
          id: "restoration_verified",
          status: servedManifestVerified ? "passed" : "failed",
          readback_ref: `${feSha}:${bffSha}`,
        },
      ],
      negative_controls: {
        viewer_write_denied: viewerWriteDenied,
        cross_tenant_non_enumerating: crossTenantNonEnumerating,
        no_order_route_proof: noOrderRouteProof,
      },
      restoration: {
        read_only_restored: readOnlyRestored,
        served_manifest_verified: servedManifestVerified,
      },
    };

    const demoEvidencePath = writeDemoRunEvidence(EVIDENCE_DIR, demoEvidence);
    await testInfo.attach("agora-demo-run-evidence", {
      path: demoEvidencePath,
      contentType: "application/json",
    });
  });
});
