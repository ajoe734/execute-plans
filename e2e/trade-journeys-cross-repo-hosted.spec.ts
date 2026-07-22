/**
 * TJ-E2E-012 strict hosted browser proof.
 *
 * This file deliberately has no Playwright request interception. It installs
 * a real short-lived strict BFF session in the hosted frontend, observes the
 * browser's requests to the paired BFF, and emits only sanitized evidence.
 */
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test, type APIRequestContext, type Page, type TestInfo } from "@playwright/test";
import { roleTokenFromEnv } from "./helpers/auth";

const FE_BASE = (process.env.PANTHEON_FE_BASE_URL ?? "").replace(/\/+$/, "");
const BFF_BASE = (process.env.PANTHEON_BFF_BASE_URL ?? "").replace(/\/+$/, "");
const EXPECTED_FE_SHA = String(process.env.PANTHEON_FRONTEND_SHA ?? "").trim().toLowerCase();
const EXPECTED_BFF_SHA = String(process.env.PANTHEON_BFF_SHA ?? "").trim().toLowerCase();
// `tenant-dev` belongs to the fixture-only Playwright auth helpers. The strict
// hosted BFF and its short-lived proof JWTs are scoped to `pantheon-dev`.
const TENANT_ID = String(process.env.PANTHEON_TENANT_ID ?? "pantheon-dev").trim();
const PUBLIC_SUPABASE_URL = String(process.env.PANTHEON_PUBLIC_SUPABASE_URL ?? "").trim();
const OPERATOR_TOKEN = roleTokenFromEnv("operator", ["PANTHEON_PERSONA_INTERACTION_OPERATOR_TOKEN"]);
const VIEWER_TOKEN = roleTokenFromEnv("viewer", ["PANTHEON_PERSONA_INTERACTION_VIEWER_TOKEN"]);
const EVIDENCE_DIR = process.env.PANTHEON_AUDIT_OUT_DIR || "/tmp/tj-e2e-012-hosted-browser";
const DEV_FE_HOST = "pantheon-lupin-dev-fe.35.201.204.12.sslip.io";
const DEV_BFF_HOST = "pantheon-lupin-dev-bff.35.201.204.12.sslip.io";
const HOSTED_REQUESTED = Boolean(FE_BASE && BFF_BASE && EXPECTED_FE_SHA && EXPECTED_BFF_SHA);
const PAPER_SCENARIO_IDS = [
  "tj-scenario-1",
  "tj-scenario-2",
  "tj-scenario-3",
  "tj-scenario-4",
  "tj-scenario-5",
  "tj-scenario-6",
  "tj-scenario-7",
  "tj-scenario-8",
  "tj-scenario-9",
  "tj-scenario-11",
  "tj-scenario-12",
] as const;
const LIVE_SENSITIVE_FIELDS = [
  "account_id",
  "capital_account_id",
  "order_id",
  "client_order_id",
  "broker_order_id",
  "quantity",
  "price",
] as const;

type JsonRecord = Record<string, unknown>;
type NetworkRecord = { host: string; method: string; path: string; status: number };

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function data(value: unknown): unknown {
  return record(value).data ?? value;
}

function items(value: unknown): JsonRecord[] {
  const envelope = record(data(value));
  const rows = envelope.items;
  return Array.isArray(rows)
    ? rows.filter((row): row is JsonRecord => Boolean(row) && typeof row === "object" && !Array.isArray(row))
    : [];
}

function bearerClaims(token: string): JsonRecord {
  const parts = token.split(".");
  if (parts.length !== 3) return {};
  try {
    return record(JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")));
  } catch {
    return {};
  }
}

function bffHeaders(token: string): Record<string, string> {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
    "X-Tenant-Id": TENANT_ID,
  };
}

function rolesFromMe(me: JsonRecord): string[] {
  const roles = me.roles;
  return Array.isArray(roles)
    ? roles.filter((role): role is string => typeof role === "string").map((role) => role.toLowerCase())
    : [];
}

function identityId(value: unknown): string {
  const identity = record(value);
  return String(identity.operator_id ?? identity.operatorId ?? identity.id ?? "").trim();
}

async function assertDeploymentPair(request: APIRequestContext): Promise<{
  bffVersion: JsonRecord;
  deployment: JsonRecord;
}> {
  expect(new URL(FE_BASE).hostname).toBe(DEV_FE_HOST);
  expect(new URL(BFF_BASE).hostname).toBe(DEV_BFF_HOST);
  expect(EXPECTED_FE_SHA).toMatch(/^[0-9a-f]{40}$/);
  expect(EXPECTED_BFF_SHA).toMatch(/^[0-9a-f]{40}$/);

  const deploymentResponse = await request.get(`${FE_BASE}/deployment.json?tj_e2e_012=${Date.now()}`);
  expect(deploymentResponse.ok(), `deployment.json returned ${deploymentResponse.status()}`).toBe(true);
  const deployment = record(await deploymentResponse.json());
  const buildMode = record(deployment.buildMode);
  expect(deployment.app).toBe("execute-plans");
  expect(deployment.environment).toBe("pantheon-dev-fe");
  expect(String(deployment.commit ?? "").toLowerCase()).toBe(EXPECTED_FE_SHA);
  expect(deployment.sourceBranch).toBe("dev");
  expect(String(deployment.bffCommit ?? "").toLowerCase()).toBe(EXPECTED_BFF_SHA);
  expect(buildMode.VITE_BFF_MODE).toBe("live");
  expect(buildMode.VITE_BFF_FALLBACK).toBe("strict");
  expect(buildMode.VITE_BFF_EMBEDDED_BEARER_TOKEN).toBe("false");
  expect(deployment.deploymentState).toBe("accepted");

  const versionResponse = await request.get(`${BFF_BASE}/bff/version`);
  expect(versionResponse.ok(), `/bff/version returned ${versionResponse.status()}`).toBe(true);
  const bffVersion = record(await versionResponse.json());
  const posture = record(bffVersion.config_posture);
  expect(String(bffVersion.source_commit_sha ?? "").toLowerCase()).toBe(EXPECTED_BFF_SHA);
  expect(posture.auth_mode).toBe("strict");
  expect(posture.auth_stub).toBe(false);
  return { bffVersion, deployment };
}

async function assertStrictSession(
  request: APIRequestContext,
  token: string,
  expectedRole: "operator" | "viewer",
): Promise<{ operatorId: string; roles: string[] }> {
  const meResponse = await request.get(`${BFF_BASE}/bff/me`, { headers: bffHeaders(token) });
  expect(meResponse.ok(), `/bff/me returned ${meResponse.status()} for ${expectedRole}`).toBe(true);
  const me = record(data(await meResponse.json()));
  const roles = rolesFromMe(me);
  expect(roles).toContain(expectedRole);
  if (expectedRole === "viewer") {
    expect(roles).not.toContain("operator");
    expect(roles).not.toContain("admin");
  }
  const operatorId = String(me.operator_id ?? me.operatorId ?? "").trim();
  expect(operatorId).not.toBe("");
  const boundIds = [me.user, me.current_user, me.currentUser].map(identityId).filter(Boolean);
  expect(boundIds.length).toBeGreaterThan(0);
  expect(boundIds.every((value) => value === operatorId)).toBe(true);
  const session = record(me.session);
  expect(session.authenticated).toBe(true);
  expect(String(session.session_kind ?? session.sessionKind ?? "").toLowerCase()).toBe("bearer");
  const environment = record(me.environment);
  expect(environment.auth_mode).toBe("strict");
  expect(environment.deployment_stage).toBe("dev");
  return { operatorId, roles };
}

async function installHostedSession(
  page: Page,
  input: { operatorId: string; roles: string[]; token: string },
): Promise<void> {
  const supabase = new URL(PUBLIC_SUPABASE_URL);
  expect(supabase.protocol).toBe("https:");
  expect(supabase.hostname.endsWith(".supabase.co")).toBe(true);
  const claims = bearerClaims(input.token);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const expiresAt = Number(claims.exp ?? 0);
  expect(String(claims.sub ?? "")).toBe(input.operatorId);
  expect(expiresAt).toBeGreaterThan(nowSeconds + 240);
  const projectRef = supabase.hostname.split(".")[0];
  const storageKey = `sb-${projectRef}-auth-token`;
  const storedSession = {
    access_token: input.token,
    refresh_token: "hosted-proof-no-refresh",
    expires_in: Math.max(60, expiresAt - nowSeconds),
    expires_at: expiresAt,
    token_type: "bearer",
    user: {
      id: input.operatorId,
      aud: String(claims.aud ?? "authenticated"),
      role: String(claims.role ?? "authenticated"),
      app_metadata: {
        ...record(claims.app_metadata),
        roles: input.roles,
        tenant_id: TENANT_ID,
      },
      user_metadata: record(claims.user_metadata),
      created_at: new Date(nowSeconds * 1000).toISOString(),
    },
  };
  await page.addInitScript(
    ({ key, session }) => {
      try {
        window.sessionStorage.setItem(key, JSON.stringify(session));
      } catch {
        // Retried automatically when the hosted origin is established.
      }
    },
    { key: storageKey, session: storedSession },
  );
}

function observeBffResponses(page: Page): NetworkRecord[] {
  const records: NetworkRecord[] = [];
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (!url.pathname.startsWith("/bff/")) return;
    records.push({
      host: url.hostname,
      method: response.request().method(),
      path: url.pathname,
      status: response.status(),
    });
  });
  return records;
}

function assertReadOnlyBrowserTraffic(records: NetworkRecord[], requiredPaths: string[]): void {
  expect(records.length).toBeGreaterThan(0);
  for (const row of records) {
    expect(row.host, `${row.path} did not reach the paired hosted BFF`).toBe(DEV_BFF_HOST);
    expect(
      ["GET", "OPTIONS"].includes(row.method),
      `hosted browser emitted a BFF mutation at ${row.path}`,
    ).toBe(true);
    expect(row.status, `${row.path} returned ${row.status}`).toBeGreaterThanOrEqual(200);
    expect(row.status, `${row.path} returned ${row.status}`).toBeLessThan(400);
  }
  for (const path of requiredPaths) {
    expect(
      records.some((row) => row.path === path && row.method === "GET"),
      `browser never completed a GET ${path}`,
    ).toBe(true);
  }
}

function evidencePath(testInfo: TestInfo, suffix: string): string {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const project = testInfo.project.name.replace(/[^a-z0-9_.-]+/giu, "-");
  return `${EVIDENCE_DIR}/tj-e2e-012-${project}-${suffix}.json`;
}

async function writeEvidence(testInfo: TestInfo, suffix: string, payload: JsonRecord): Promise<void> {
  const path = evidencePath(testInfo, suffix);
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await testInfo.attach(`tj-e2e-012-${suffix}`, { contentType: "application/json", path });
}

async function openPaperList(page: Page): Promise<{ response: JsonRecord; rows: JsonRecord[] }> {
  const listResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/bff/management/trade-journeys"
      && url.searchParams.get("tenant_id") === TENANT_ID
      && url.searchParams.get("environment") === "paper"
      && response.request().method() === "GET";
  });
  await page.goto(`${FE_BASE}/management/trade-journeys?tenant_id=${encodeURIComponent(TENANT_ID)}&environment=paper`, {
    waitUntil: "domcontentloaded",
  });
  const response = await listResponse;
  expect(response.ok(), `paper journey list returned ${response.status()}`).toBe(true);
  const responseJson = record(await response.json());
  return { response: responseJson, rows: items(responseJson) };
}

test.describe("TJ-E2E-012 hosted Trade Journey browser proof", () => {
  test.skip(!HOSTED_REQUESTED, "requires exact hosted FE/BFF URLs and commit SHAs");

  test("renders the source scenarios, mismatch detail, and axe proof without interception @desktop-full", async ({
    page,
    request,
  }, testInfo) => {
    test.skip(!OPERATOR_TOKEN || !PUBLIC_SUPABASE_URL, "requires an operator token and hosted Supabase URL");
    test.setTimeout(180_000);
    const deployment = await assertDeploymentPair(request);
    const session = await assertStrictSession(request, OPERATOR_TOKEN, "operator");
    await installHostedSession(page, { ...session, token: OPERATOR_TOKEN });
    const network = observeBffResponses(page);
    const paper = await openPaperList(page);
    const rowsById = new Map(paper.rows.map((row) => [String(row.journey_id ?? ""), row]));
    expect([...rowsById.keys()].sort()).toEqual(expect.arrayContaining([...PAPER_SCENARIO_IDS].sort()));
    expect(rowsById.get("tj-scenario-7")?.status).toBe("completed_with_variance");
    await expect(page.getByRole("heading", { name: /Trade Journeys|交易旅程/ })).toBeVisible();
    for (const scenarioId of PAPER_SCENARIO_IDS) {
      await expect(page.getByRole("link", { name: scenarioId, exact: true })).toBeVisible();
    }

    const detailPaths = [
      "/bff/management/trade-journeys/tj-scenario-7",
      "/bff/management/trade-journeys/tj-scenario-7/timeline",
      "/bff/management/trade-journeys/tj-scenario-7/evidence",
    ];
    const detailResponses = detailPaths.map((path) => page.waitForResponse((response) => (
      new URL(response.url()).pathname === path && response.request().method() === "GET"
    )));
    await page.getByRole("link", { name: "tj-scenario-7", exact: true }).click();
    const resolvedDetailResponses = await Promise.all(detailResponses);
    expect(resolvedDetailResponses.every((response) => response.ok())).toBe(true);
    await expect(page.getByRole("heading", { name: "tj-scenario-7" })).toBeVisible();
    await expect(page.locator("body")).toContainText("completed_with_variance");
    await expect(page.locator("body")).toContainText(/mismatch|variance|不符/i);

    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const seriousOrCritical = axe.violations.filter((violation) => (
      violation.impact === "critical" || violation.impact === "serious"
    ));
    expect(seriousOrCritical).toEqual([]);
    assertReadOnlyBrowserTraffic(network, ["/bff/management/trade-journeys", ...detailPaths]);
    await writeEvidence(testInfo, "desktop", {
      axe: { seriousOrCritical: seriousOrCritical.length, totalViolations: axe.violations.length },
      deployment: deployment.deployment,
      expectedBffSha: EXPECTED_BFF_SHA,
      expectedFeSha: EXPECTED_FE_SHA,
      network,
      paperScenarioIds: [...rowsById.keys()].filter((id) => id.startsWith("tj-scenario-")).sort(),
      scenario7Status: rowsById.get("tj-scenario-7")?.status,
      tenantId: TENANT_ID,
    });
  });

  test("viewer receives a non-inferential live row and cannot see capital/order values @desktop-full", async ({
    page,
    request,
  }, testInfo) => {
    test.skip(!VIEWER_TOKEN || !PUBLIC_SUPABASE_URL, "requires a viewer token and hosted Supabase URL");
    test.setTimeout(120_000);
    const deployment = await assertDeploymentPair(request);
    const session = await assertStrictSession(request, VIEWER_TOKEN, "viewer");
    await installHostedSession(page, { ...session, token: VIEWER_TOKEN });
    const network = observeBffResponses(page);
    const listResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === "/bff/management/trade-journeys"
        && url.searchParams.get("environment") === "live"
        && response.request().method() === "GET";
    });
    await page.goto(`${FE_BASE}/management/trade-journeys?tenant_id=${encodeURIComponent(TENANT_ID)}&environment=live`, {
      waitUntil: "domcontentloaded",
    });
    const response = await listResponse;
    expect(response.ok(), `live journey list returned ${response.status()}`).toBe(true);
    const row = items(await response.json()).find((item) => item.journey_id === "tj-scenario-10");
    expect(row, "live scenario 10 must be visible as a masked journey").toBeTruthy();
    expect(row?.live_capital_masked).toBe(true);
    for (const field of LIVE_SENSITIVE_FIELDS) {
      expect(
        [undefined, null, "", "***"].includes(row?.[field] as undefined | null | string),
        `${field} must be absent or masked for a viewer`,
      ).toBe(true);
    }
    await expect(page.getByRole("link", { name: "tj-scenario-10", exact: true })).toBeVisible();
    await expect(page.locator("body")).toContainText("***");
    assertReadOnlyBrowserTraffic(network, ["/bff/management/trade-journeys"]);
    await writeEvidence(testInfo, "viewer-live", {
      deployment: deployment.deployment,
      expectedBffSha: EXPECTED_BFF_SHA,
      expectedFeSha: EXPECTED_FE_SHA,
      maskedFields: [...LIVE_SENSITIVE_FIELDS],
      network,
      scenarioId: "tj-scenario-10",
      tenantId: TENANT_ID,
    });
  });

  test("mobile list and mismatch detail stay usable with direct hosted reads @mobile-basic", async ({
    page,
    request,
  }, testInfo) => {
    test.skip(!OPERATOR_TOKEN || !PUBLIC_SUPABASE_URL, "requires an operator token and hosted Supabase URL");
    test.setTimeout(120_000);
    const deployment = await assertDeploymentPair(request);
    const session = await assertStrictSession(request, OPERATOR_TOKEN, "operator");
    await installHostedSession(page, { ...session, token: OPERATOR_TOKEN });
    const network = observeBffResponses(page);
    const paper = await openPaperList(page);
    expect(paper.rows.some((row) => row.journey_id === "tj-scenario-7")).toBe(true);
    await expect(page.getByRole("heading", { name: /Trade Journeys|交易旅程/ })).toBeVisible();
    const listDimensions = await page.evaluate(() => ({
      bodyWidth: document.body.scrollWidth,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }));
    expect(Number(listDimensions.bodyWidth)).toBeLessThanOrEqual(Number(listDimensions.viewportWidth) + 1);
    expect(Number(listDimensions.documentWidth)).toBeLessThanOrEqual(Number(listDimensions.viewportWidth) + 1);

    const detailResponse = page.waitForResponse((response) => (
      new URL(response.url()).pathname === "/bff/management/trade-journeys/tj-scenario-7"
      && response.request().method() === "GET"
    ));
    await page.getByRole("link", { name: "tj-scenario-7", exact: true }).click();
    expect((await detailResponse).ok()).toBe(true);
    await expect(page.getByRole("heading", { name: "tj-scenario-7" })).toBeVisible();
    await expect(page.locator("body")).toContainText("completed_with_variance");
    const detailDimensions = await page.evaluate(() => ({
      bodyWidth: document.body.scrollWidth,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }));
    expect(Number(detailDimensions.bodyWidth)).toBeLessThanOrEqual(Number(detailDimensions.viewportWidth) + 1);
    expect(Number(detailDimensions.documentWidth)).toBeLessThanOrEqual(Number(detailDimensions.viewportWidth) + 1);
    assertReadOnlyBrowserTraffic(network, [
      "/bff/management/trade-journeys",
      "/bff/management/trade-journeys/tj-scenario-7",
    ]);
    await writeEvidence(testInfo, "mobile", {
      deployment: deployment.deployment,
      detailDimensions,
      expectedBffSha: EXPECTED_BFF_SHA,
      expectedFeSha: EXPECTED_FE_SHA,
      listDimensions,
      network,
      scenarioId: "tj-scenario-7",
      tenantId: TENANT_ID,
    });
  });
});
