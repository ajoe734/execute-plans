/**
 * PPL-ALLOC-009 exact-pair hosted acceptance.
 *
 * The proof uses only strict dev-login identities and the governed paper
 * allocation authority. Tokens and client secrets remain in memory. The
 * persisted evidence contains linked resource/request identities, browser
 * network metadata, console results, and accessibility summaries only.
 */
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
  type Browser,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { bindPplAlloc009RecommendationSnapshot } from "./helpers/pplAlloc009Recommendation";

const FE_BASE = String(process.env.PPL_ALLOC_009_FE_BASE_URL ?? "").replace(/\/+$/u, "");
const BFF_BASE = String(process.env.PPL_ALLOC_009_BFF_BASE_URL ?? "").replace(/\/+$/u, "");
const EXPECTED_FE_SHA = String(process.env.PPL_ALLOC_009_EXPECTED_FE_SHA ?? "").trim().toLowerCase();
const EXPECTED_BFF_SHA = String(process.env.PPL_ALLOC_009_EXPECTED_BFF_SHA ?? "").trim().toLowerCase();
const PUBLIC_SUPABASE_URL = String(process.env.PPL_ALLOC_009_PUBLIC_SUPABASE_URL ?? "").trim();
const TENANT_ID = String(process.env.PPL_ALLOC_009_TENANT_ID ?? "tenant-dev").trim();
const QUARTER = String(process.env.PPL_ALLOC_009_QUARTER ?? "2026-Q3").trim();
const OPERATOR_CLIENT_ID = String(process.env.PPL_ALLOC_009_OPERATOR_CLIENT_ID ?? "").trim();
const OPERATOR_CLIENT_SECRET = String(process.env.PPL_ALLOC_009_OPERATOR_CLIENT_SECRET ?? "");
const APPROVER_CLIENT_ID = String(process.env.PPL_ALLOC_009_APPROVER_CLIENT_ID ?? "").trim();
const APPROVER_CLIENT_SECRET = String(process.env.PPL_ALLOC_009_APPROVER_CLIENT_SECRET ?? "");
const RUN_KEY = String(process.env.PPL_ALLOC_009_RUN_KEY ?? "local").replace(/[^A-Za-z0-9._-]+/gu, "-");
const EVIDENCE_DIR = String(
  process.env.PPL_ALLOC_009_EVIDENCE_DIR ?? "/tmp/ppl-alloc-009-hosted-acceptance",
);
const HOSTED_REQUESTED = Boolean(FE_BASE && BFF_BASE && EXPECTED_FE_SHA && EXPECTED_BFF_SHA);
const DEV_FE_HOST = "pantheon-lupin-dev-fe.35.201.204.12.sslip.io";
const DEV_BFF_HOST = "pantheon-lupin-dev-bff.35.201.204.12.sslip.io";

type JsonRecord = Record<string, unknown>;
type RequestEvidence = {
  correlationId: string | null;
  label: string;
  method: string;
  path: string;
  requestId: string | null;
  status: number;
  traceId: string | null;
};
type NetworkEvidence = {
  correlationId: string | null;
  host: string;
  method: string;
  path: string;
  requestId: string | null;
  status: number;
};
type StrictIdentity = {
  identityClass: string;
  mfaVerified: boolean;
  operatorId: string;
  roles: string[];
  token: string;
};

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function rows(value: unknown): JsonRecord[] {
  const root = record(value);
  const envelope = record(root.data);
  const candidates = Array.isArray(envelope.items)
    ? envelope.items
    : Array.isArray(root.items)
      ? root.items
      : Array.isArray(root.data)
        ? root.data
        : [];
  return candidates.filter(
    (item): item is JsonRecord => Boolean(item) && typeof item === "object" && !Array.isArray(item),
  );
}

function responseData(value: unknown): JsonRecord {
  const root = record(value);
  return record(root.data);
}

function requiredString(value: unknown, label: string): string {
  const resolved = String(value ?? "").trim();
  expect(resolved, `${label} must be present`).not.toBe("");
  return resolved;
}

function safeSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/gu, "-").slice(0, 96);
}

function idempotency(label: string): string {
  return `ppl-alloc-009-${safeSegment(RUN_KEY)}-${safeSegment(label)}`;
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

function authHeaders(token: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
    "X-Tenant-Id": TENANT_ID,
    ...extra,
  };
}

async function parseJson(response: APIResponse): Promise<JsonRecord> {
  const text = await response.text();
  if (!text) return {};
  try {
    return record(JSON.parse(text));
  } catch {
    throw new Error(`${new URL(response.url()).pathname} returned non-JSON`);
  }
}

async function requestEvidence(
  response: APIResponse,
  label: string,
  method = "GET",
): Promise<RequestEvidence> {
  const headers = response.headers();
  return {
    correlationId: headers["x-correlation-id"] ?? null,
    label,
    method,
    path: new URL(response.url()).pathname,
    requestId: headers["x-request-id"] ?? null,
    status: response.status(),
    traceId: headers["x-trace-id"] ?? null,
  };
}

function safeFailure(payload: JsonRecord): string {
  const error = record(payload.error);
  const detail = record(error.details);
  return JSON.stringify({
    code: error.code ?? payload.code ?? null,
    message: error.message ?? payload.message ?? null,
    precondition: detail.precondition_failed ?? detail.reason ?? null,
  });
}

async function expectStatus(
  response: APIResponse,
  expected: number | number[],
  label: string,
): Promise<JsonRecord> {
  const payload = await parseJson(response);
  const statuses = Array.isArray(expected) ? expected : [expected];
  expect(
    statuses,
    `${label} returned HTTP ${response.status()}: ${safeFailure(payload)}`,
  ).toContain(response.status());
  return payload;
}

async function devLogin(
  request: APIRequestContext,
  input: {
    clientId: string;
    clientSecret: string;
    expectedIdentity: "operator_a" | "approver";
  },
  calls: RequestEvidence[],
): Promise<StrictIdentity> {
  const response = await request.post(`${BFF_BASE}/bff/auth/dev-login`, {
    data: {
      client_id: input.clientId,
      client_secret: input.clientSecret,
      grant_type: "client_credentials",
    },
    headers: { Accept: "application/json" },
  });
  calls.push(await requestEvidence(response, `auth-${input.expectedIdentity}`, "POST"));
  const payload = await expectStatus(response, 200, `dev-login ${input.expectedIdentity}`);
  const meta = record(payload.meta);
  expect(meta.identity).toBe(input.expectedIdentity);
  const token = requiredString(payload.access_token, `${input.expectedIdentity} access token`);

  const meResponse = await request.get(`${BFF_BASE}/bff/me`, {
    headers: authHeaders(token),
  });
  calls.push(await requestEvidence(meResponse, `me-${input.expectedIdentity}`));
  const mePayload = await expectStatus(meResponse, 200, `/bff/me ${input.expectedIdentity}`);
  const me = responseData(mePayload);
  const roles = Array.isArray(me.roles)
    ? me.roles.filter((role): role is string => typeof role === "string").map((role) => role.toLowerCase())
    : [];
  const session = record(me.session);
  const operatorId = requiredString(
    me.operator_id ?? me.operatorId ?? record(me.user).id,
    `${input.expectedIdentity} operator id`,
  );
  const claims = bearerClaims(token);
  expect(String(claims.sub ?? "")).toBe(operatorId);
  expect(session.authenticated).not.toBe(false);
  expect(record(me.environment).auth_mode).toBe("strict");
  if (input.expectedIdentity === "operator_a") expect(roles).toContain("operator");
  if (input.expectedIdentity === "approver") expect(roles).toContain("approver");

  return {
    identityClass: input.expectedIdentity,
    mfaVerified: Boolean(
      session.mfa_verified
      ?? session.mfaVerified
      ?? claims.mfa_verified
      ?? claims.mfaVerified,
    ),
    operatorId,
    roles,
    token,
  };
}

async function assertExactPair(
  request: APIRequestContext,
  calls: RequestEvidence[],
): Promise<{ deployment: JsonRecord; version: JsonRecord }> {
  expect(new URL(FE_BASE).hostname).toBe(DEV_FE_HOST);
  expect(new URL(BFF_BASE).hostname).toBe(DEV_BFF_HOST);
  expect(EXPECTED_FE_SHA).toMatch(/^[0-9a-f]{40}$/u);
  expect(EXPECTED_BFF_SHA).toMatch(/^[0-9a-f]{40}$/u);

  const deploymentResponse = await request.get(
    `${FE_BASE}/deployment.json?ppl_alloc_009=${encodeURIComponent(RUN_KEY)}`,
  );
  calls.push(await requestEvidence(deploymentResponse, "deployment-manifest"));
  const deployment = await expectStatus(deploymentResponse, 200, "deployment manifest");
  const buildMode = record(deployment.buildMode);
  expect(String(deployment.commit ?? "").toLowerCase()).toBe(EXPECTED_FE_SHA);
  expect(String(deployment.bffCommit ?? "").toLowerCase()).toBe(EXPECTED_BFF_SHA);
  expect(deployment.deploymentState).toBe("accepted");
  expect(buildMode.VITE_BFF_MODE).toBe("live");
  expect(buildMode.VITE_BFF_FALLBACK).toBe("strict");
  expect(String(buildMode.VITE_BFF_REAL_WRITES ?? "false")).toBe("false");
  expect(String(buildMode.VITE_BFF_ALLOW_DEV_STUB_WRITES ?? "false")).toBe("false");
  expect(String(buildMode.VITE_BFF_EMBEDDED_BEARER_TOKEN ?? "false")).toBe("false");

  const versionResponse = await request.get(`${BFF_BASE}/bff/version`);
  calls.push(await requestEvidence(versionResponse, "bff-version"));
  const version = await expectStatus(versionResponse, 200, "BFF version");
  const posture = record(version.config_posture);
  expect(String(version.source_commit_sha ?? "").toLowerCase()).toBe(EXPECTED_BFF_SHA);
  expect(posture.auth_mode).toBe("strict");
  expect(posture.auth_stub).toBe(false);
  expect(posture.mfa_required).toBe(true);
  return { deployment, version };
}

async function installHostedSession(page: Page, identity: StrictIdentity): Promise<void> {
  const supabase = new URL(PUBLIC_SUPABASE_URL);
  expect(supabase.protocol).toBe("https:");
  expect(supabase.hostname.endsWith(".supabase.co")).toBe(true);
  const claims = bearerClaims(identity.token);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const expiresAt = Number(claims.exp ?? 0);
  expect(expiresAt).toBeGreaterThan(nowSeconds + 120);
  const storageKey = `sb-${supabase.hostname.split(".")[0]}-auth-token`;
  const session = {
    access_token: identity.token,
    expires_at: expiresAt,
    expires_in: Math.max(60, expiresAt - nowSeconds),
    refresh_token: "ppl-alloc-009-no-refresh",
    token_type: "bearer",
    user: {
      app_metadata: {
        ...record(claims.app_metadata),
        roles: identity.roles,
        tenant_id: TENANT_ID,
      },
      aud: String(claims.aud ?? "authenticated"),
      created_at: new Date(nowSeconds * 1000).toISOString(),
      id: identity.operatorId,
      role: String(claims.role ?? "authenticated"),
      user_metadata: record(claims.user_metadata),
    },
  };
  await page.addInitScript(
    ({ key, storedSession }) => {
      window.sessionStorage.setItem(key, JSON.stringify(storedSession));
    },
    { key: storageKey, storedSession: session },
  );
}

function observeBrowser(page: Page): {
  consoleErrors: string[];
  network: NetworkEvidence[];
} {
  const consoleErrors: string[] = [];
  const network: NetworkEvidence[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("response", async (response) => {
    const url = new URL(response.url());
    if (!url.pathname.startsWith("/bff/")) return;
    const headers = await response.allHeaders();
    network.push({
      correlationId: headers["x-correlation-id"] ?? null,
      host: url.hostname,
      method: response.request().method(),
      path: url.pathname,
      requestId: headers["x-request-id"] ?? null,
      status: response.status(),
    });
  });
  return { consoleErrors, network };
}

async function runBrowserProof(
  browser: Browser,
  identity: StrictIdentity,
  input: {
    personaId: string;
    personaName: string;
    poolId: string;
    rebalanceId: string;
    viewport: { height: number; width: number };
    viewportName: "desktop" | "mobile-393";
  },
): Promise<JsonRecord> {
  const context = await browser.newContext({ viewport: input.viewport });
  const page = await context.newPage();
  const observed = observeBrowser(page);
  await installHostedSession(page, identity);
  const routes = [
    `/management/rankings?tab=quarterly&persona=${encodeURIComponent(input.personaId)}&quarter=${encodeURIComponent(QUARTER)}`,
    `/management/governance-decisions?tab=recommendations&persona=${encodeURIComponent(input.personaId)}`,
    `/management/governance-decisions?tab=capital&capital_id=${encodeURIComponent(input.poolId)}&rebalance_id=${encodeURIComponent(input.rebalanceId)}`,
  ];
  for (const route of routes) {
    await page.goto(`${FE_BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("tablist").first()).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1_500);
  }

  await page.goto(`${FE_BASE}${routes[0]}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await expect(page.locator("body")).toContainText(input.personaName, { timeout: 30_000 });
  const dimensions = await page.evaluate(() => ({
    bodyWidth: document.body.scrollWidth,
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(Number(dimensions.bodyWidth)).toBeLessThanOrEqual(Number(dimensions.viewportWidth) + 1);
  expect(Number(dimensions.documentWidth)).toBeLessThanOrEqual(Number(dimensions.viewportWidth) + 1);
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const seriousOrCritical = axe.violations.filter(
    (violation) => violation.impact === "serious" || violation.impact === "critical",
  );
  expect(seriousOrCritical).toEqual([]);
  expect(observed.consoleErrors).toEqual([]);
  expect(observed.network.length).toBeGreaterThan(0);
  for (const request of observed.network) {
    expect(request.host).toBe(DEV_BFF_HOST);
    expect(request.status, `${request.method} ${request.path}`).toBeLessThan(400);
  }
  expect(
    observed.network.some((request) => request.path === "/bff/management/quarterly-ranking"),
  ).toBe(true);
  await context.close();
  return {
    accessibility: {
      seriousOrCritical: seriousOrCritical.length,
      totalViolations: axe.violations.length,
    },
    consoleErrors: observed.consoleErrors,
    dimensions,
    network: observed.network,
    routes,
    viewport: input.viewport,
    viewportName: input.viewportName,
  };
}

async function writeEvidence(testInfo: TestInfo, evidence: JsonRecord): Promise<void> {
  writeEvidenceFile(evidence);
  const path = `${EVIDENCE_DIR}/ppl-alloc-009-hosted-evidence.json`;
  await testInfo.attach("ppl-alloc-009-hosted-evidence", {
    contentType: "application/json",
    path,
  });
}

function writeEvidenceFile(evidence: JsonRecord): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = `${EVIDENCE_DIR}/ppl-alloc-009-hosted-evidence.json`;
  writeFileSync(path, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
}

async function waitForPaperRunning(
  request: APIRequestContext,
  operator: StrictIdentity,
  personaId: string,
  calls: RequestEvidence[],
): Promise<{ detail: JsonRecord; reconcile: JsonRecord }> {
  const deadline = Date.now() + 240_000;
  let latestDetail: JsonRecord = {};
  let latestReconcile: JsonRecord = {};
  while (Date.now() < deadline) {
    const reconcileResponse = await request.post(
      `${BFF_BASE}/bff/personas/${encodeURIComponent(personaId)}/provisioning/reconcile`,
      { headers: authHeaders(operator.token) },
    );
    calls.push(await requestEvidence(reconcileResponse, "persona-provisioning-reconcile", "POST"));
    latestReconcile = await expectStatus(reconcileResponse, 200, "persona provisioning reconcile");
    const detailResponse = await request.get(
      `${BFF_BASE}/bff/personas/${encodeURIComponent(personaId)}`,
      { headers: authHeaders(operator.token) },
    );
    calls.push(await requestEvidence(detailResponse, "persona-detail"));
    latestDetail = await expectStatus(detailResponse, 200, "persona detail");
    const state = String(responseData(latestDetail).state ?? responseData(latestDetail).lifecycleStatus ?? "");
    if (state === "paper_running") return { detail: latestDetail, reconcile: latestReconcile };
    if (state === "provisioning_failed") {
      throw new Error("Persona provisioning reached provisioning_failed");
    }
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
  throw new Error(
    `Persona did not reach paper_running; last=${String(responseData(latestDetail).state ?? "unknown")}`,
  );
}

async function waitForRanking(
  request: APIRequestContext,
  operator: StrictIdentity,
  personaId: string,
  calls: RequestEvidence[],
): Promise<{ payload: JsonRecord; row: JsonRecord; snapshotId: string }> {
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    const query = new URLSearchParams({
      page_size: "200",
      persona: personaId,
      quarter: QUARTER,
    });
    const response = await request.get(
      `${BFF_BASE}/bff/management/quarterly-ranking?${query}`,
      { headers: authHeaders(operator.token) },
    );
    calls.push(await requestEvidence(response, "quarterly-ranking"));
    const payload = await expectStatus(response, 200, "quarterly ranking");
    const row = rows(payload).find((item) => String(item.persona_id ?? "") === personaId);
    if (
      row
      && row.eligible === true
      && String(row.stage ?? "") === "paper_running"
      && String(row.session_id ?? "")
      && String(row.session_authority ?? "") === "runtime_manager.paper_fleet_monitoring"
    ) {
      return {
        payload,
        row,
        snapshotId: requiredString(responseData(payload).ranking_snapshot_id, "ranking snapshot id"),
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error("Persona did not become eligible in the canonical quarterly paper ranking");
}

test.describe("PPL-ALLOC-009 hosted paper allocation acceptance", () => {
  test.skip(!HOSTED_REQUESTED, "requires exact hosted FE/BFF URLs and commit SHAs");

  test("correlates governed B1 and proves the same identity on desktop and 393px mobile", async ({
    browser,
    request,
  }, testInfo) => {
    test.setTimeout(1_200_000);
    writeEvidenceFile({
      acceptance: {
        B1: "in_progress",
        B3: "not_started",
        realLiveCapitalAuthority: "disabled",
      },
      capturedAt: new Date().toISOString(),
      deployment: {
        bffCommit: EXPECTED_BFF_SHA,
        frontendCommit: EXPECTED_FE_SHA,
      },
      result: "in_progress",
      runKey: RUN_KEY,
      safety: {
        canaryEnabled: false,
        liveEnabled: false,
        realWritesEnabled: false,
      },
    });
    expect(PUBLIC_SUPABASE_URL).not.toBe("");
    expect(OPERATOR_CLIENT_ID).not.toBe("");
    expect(OPERATOR_CLIENT_SECRET).not.toBe("");
    expect(APPROVER_CLIENT_ID).not.toBe("");
    expect(APPROVER_CLIENT_SECRET).not.toBe("");

    const calls: RequestEvidence[] = [];
    const pair = await assertExactPair(request, calls);
    const operator = await devLogin(request, {
      clientId: OPERATOR_CLIENT_ID,
      clientSecret: OPERATOR_CLIENT_SECRET,
      expectedIdentity: "operator_a",
    }, calls);
    const approver = await devLogin(request, {
      clientId: APPROVER_CLIENT_ID,
      clientSecret: APPROVER_CLIENT_SECRET,
      expectedIdentity: "approver",
    }, calls);
    expect(operator.operatorId).not.toBe(approver.operatorId);
    expect(operator.mfaVerified).toBe(true);
    expect(approver.mfaVerified).toBe(true);

    const personaName = `PPL ALLOC 009 ${safeSegment(RUN_KEY)}`;
    const createResponse = await request.post(
      `${BFF_BASE}/bff/management/personas/create-paper-bundle`,
      {
        data: {
          archetype: "mean_reversion",
          mandate: "Governed paper-only allocation acceptance; no broker or live capital authority.",
          market: "US",
          name: personaName,
          risk: "low",
          strategy_family: "mean_reversion",
        },
        headers: authHeaders(operator.token, {
          "Idempotency-Key": idempotency("persona-create"),
        }),
      },
    );
    calls.push(await requestEvidence(createResponse, "persona-create-paper-bundle", "POST"));
    const createPayload = await expectStatus(createResponse, 201, "create paper Persona bundle");
    const createData = responseData(createPayload);
    const createMeta = record(createPayload.meta);
    const personaId = requiredString(createData.id ?? createData.persona_id, "Persona id");
    const paperLedgerId = requiredString(
      createData.paperLedgerId ?? createMeta.paper_ledger_id,
      "paper ledger id",
    );
    const personaCapitalBindingId = requiredString(
      createMeta.persona_capital_binding_id,
      "Persona paper capital binding id",
    );
    expect(createMeta.live_capital_side_effects).toBe(false);

    const provisioned = await waitForPaperRunning(request, operator, personaId, calls);
    const persona = responseData(provisioned.detail);
    const reconcileMeta = record(provisioned.reconcile.meta);
    const authoritativeReadback = record(reconcileMeta.authoritative_readback);
    const runtimeBinding = record(authoritativeReadback.runtime_binding);
    const paperWorker = record(authoritativeReadback.paper_worker);
    const runtimeBindingId = requiredString(
      persona.runtimeBindingId ?? runtimeBinding.runtime_binding_id,
      "runtime binding id",
    );
    const runtimeId = requiredString(persona.runtimeId ?? runtimeBinding.runtime_id, "runtime id");
    const paperSessionId = requiredString(paperWorker.session_id, "paper monitoring session id");
    expect(persona.state).toBe("paper_running");
    expect(persona.paperLedgerId).toBe(paperLedgerId);

    const eligibilityProofResponse = await request.post(
      (
        `${BFF_BASE}/bff/management/personas/${encodeURIComponent(personaId)}`
        + "/ppl-alloc-009-paper-eligibility-proof"
      ),
      {
        data: {
          benchmark_version: "ppl-alloc-009-paper-positive-control-v1",
          run_key: RUN_KEY,
          task_id: "PPL-ALLOC-009",
        },
        headers: authHeaders(operator.token, {
          "Idempotency-Key": idempotency("paper-eligibility-proof"),
        }),
      },
    );
    calls.push(await requestEvidence(
      eligibilityProofResponse,
      "paper-eligibility-proof",
      "POST",
    ));
    const eligibilityProofPayload = await expectStatus(
      eligibilityProofResponse,
      202,
      "governed paper eligibility proof",
    );
    const eligibilityProof = responseData(eligibilityProofPayload);
    const eligibilitySafety = record(eligibilityProof.safety);
    const eligibilityRanking = record(eligibilityProof.ranking);
    expect(eligibilityProof.persona_id).toBe(personaId);
    expect(eligibilityProof.runtime_id).toBe(runtimeId);
    expect(eligibilityProof.runtime_binding_id).toBe(runtimeBindingId);
    expect(eligibilityProof.persona_capital_binding_id).toBe(personaCapitalBindingId);
    expect(eligibilityProof.paper_ledger_id).toBe(paperLedgerId);
    expect(eligibilityProof.paper_session_id).toBe(paperSessionId);
    expect(eligibilitySafety.paper_only).toBe(true);
    expect(eligibilitySafety.real_capital_side_effects).toBe(false);
    expect(eligibilitySafety.real_order_side_effects).toBe(false);
    expect(eligibilitySafety.canary_execution_enabled).toBe(false);
    expect(eligibilitySafety.live_execution_enabled).toBe(false);
    expect(eligibilityRanking.eligible).toBe(true);
    expect(eligibilityRanking.recommendation_action_ids).toContain(
      "promote_to_canary_candidate",
    );

    const ranking = await waitForRanking(request, operator, personaId, calls);
    const priorRankingRow = ranking.row;
    expect(priorRankingRow.paper_ledger_id).toBe(paperLedgerId);
    expect(priorRankingRow.runtime_ids).toContain(runtimeId);
    expect(priorRankingRow.binding_ids).toContain(personaCapitalBindingId);
    expect(priorRankingRow.session_id).toBe(paperSessionId);
    const recommendationQuery = new URLSearchParams({
      page_size: "200",
      personaId,
      quarter: QUARTER,
    });
    const recommendationResponse = await request.get(
      `${BFF_BASE}/bff/management/quarterly-ranking/recommendations?${recommendationQuery}`,
      { headers: authHeaders(operator.token) },
    );
    calls.push(await requestEvidence(recommendationResponse, "promotion-recommendation"));
    const recommendationPayload = await expectStatus(
      recommendationResponse,
      200,
      "promotion recommendation",
    );
    const personaRecommendations = rows(recommendationPayload).filter(
      (item) => String(item.persona_id ?? "") === personaId,
    );
    const recommendation = personaRecommendations.find(
      (item) => String(item.action_id ?? "") === "promote_to_canary_candidate",
    );
    expect(recommendation).toBeTruthy();
    const recommendationBinding = bindPplAlloc009RecommendationSnapshot(
      recommendation ?? {},
      ranking.snapshotId,
    );
    const recommendationSnapshotId = recommendationBinding.recommendationSnapshotId;
    const recommendationRow = recommendationBinding.rankingRow;
    expect(recommendationRow.paper_ledger_id).toBe(paperLedgerId);
    expect(recommendationRow.runtime_ids).toContain(runtimeId);
    expect(recommendationRow.binding_ids).toContain(personaCapitalBindingId);
    expect(recommendationRow.capital_scope).toBe("paper_ledger");
    expect(recommendationRow.allocation_policy_input).toBeTruthy();
    expect(recommendationRow.metrics).toBeTruthy();
    expect(recommendationRow.components).toBeTruthy();
    writeEvidenceFile({
      acceptance: {
        B1: recommendation ? "promotion_recommendation_ready" : "failed_promotion_eligibility",
        B3: "not_started",
        realLiveCapitalAuthority: "disabled",
      },
      capturedAt: new Date().toISOString(),
      chain: {
        paperLedgerId,
        personaCapitalBindingId,
        personaId,
        rankingSnapshotId: recommendationSnapshotId,
        runtimeBindingId,
        runtimeId,
      },
      deployment: {
        bffCommit: EXPECTED_BFF_SHA,
        frontendCommit: EXPECTED_FE_SHA,
      },
      eligibilityProof: {
        benchmarkVersion: eligibilityProof.benchmark_version,
        eventId: eligibilityProof.event_id,
        ownerReceipt: eligibilityProof.owner_receipt,
        scenarioDigest: eligibilityProof.scenario_digest,
        traceId: eligibilityProof.trace_id,
      },
      ranking: {
        actionIds: personaRecommendations.map((item) => item.action_id),
        components: recommendationRow.components,
        eligible: recommendationRow.eligible,
        priorRankingSnapshotId: recommendationBinding.priorRankingSnapshotId,
        rank: recommendationRow.rank,
        recommendationSnapshotId,
        score: recommendationRow.score,
        snapshotChangedSincePriorRanking:
          recommendationBinding.snapshotChangedSincePriorRanking,
        telemetryResolution: recommendationRow.telemetry_resolution,
      },
      provisioning: {
        paperSessionId,
        rankingSnapshotId: ranking.snapshotId,
      },
      requestResponseEvidence: calls,
      result: recommendation ? "in_progress" : "failed",
      runKey: RUN_KEY,
      safety: {
        canaryEnabled: false,
        liveEnabled: false,
        realWritesEnabled: false,
      },
    });
    const promotionReviewId = requiredString(
      recommendation?.recommendation_id ?? recommendation?.review_id,
      "promotion review id",
    );

    const submitResponse = await request.post(
      `${BFF_BASE}/bff/management/quarterly-ranking/recommendations/${encodeURIComponent(promotionReviewId)}/submit`,
      {
        data: {
          quarter: QUARTER,
          ranking_snapshot_id: recommendationSnapshotId,
        },
        headers: authHeaders(operator.token, {
          "Idempotency-Key": idempotency("promotion-submit"),
        }),
      },
    );
    calls.push(await requestEvidence(submitResponse, "promotion-submit", "POST"));
    const submitPayload = await expectStatus(submitResponse, 202, "promotion submit");
    expect(record(submitPayload.meta).live_capital_mutation).not.toBe(true);

    const decisionResponse = await request.post(
      `${BFF_BASE}/bff/management/promotion-reviews/${encodeURIComponent(promotionReviewId)}/decisions`,
      {
        data: {
          decision: "approve",
          quarter: QUARTER,
          rationale: "Approve governed paper-only simulation; real and live capital remain disabled.",
        },
        headers: authHeaders(approver.token, {
          "Idempotency-Key": idempotency("promotion-decision"),
        }),
      },
    );
    calls.push(await requestEvidence(decisionResponse, "promotion-human-decision", "POST"));
    const decisionPayload = await expectStatus(decisionResponse, 202, "promotion decision");
    expect(record(decisionPayload.meta).live_capital_mutation).not.toBe(true);

    const evaluationResponse = await request.post(
      `${BFF_BASE}/bff/management/allocation-policy/evaluate`,
      {
        data: {
          authority_mode: "governed_paper_simulation",
          promotion_review_id: promotionReviewId,
          ranking_snapshot_id: recommendationSnapshotId,
          rows: [recommendationRow],
        },
        headers: authHeaders(operator.token),
      },
    );
    calls.push(await requestEvidence(evaluationResponse, "paper-allocation-evaluate", "POST"));
    const evaluationPayload = await expectStatus(
      evaluationResponse,
      200,
      "paper allocation evaluation",
    );
    const evaluation = responseData(evaluationPayload);
    const evaluationId = requiredString(
      evaluation.allocation_evaluation_id,
      "allocation evaluation id",
    );
    const allocationLines = Array.isArray(evaluation.lines)
      ? evaluation.lines.filter(
        (line): line is JsonRecord => Boolean(line) && typeof line === "object" && !Array.isArray(line),
      )
      : [];
    expect(allocationLines).toHaveLength(1);
    const allocationLine = allocationLines[0];
    const poolId = requiredString(allocationLine.capital_pool_id, "internal paper pool id");
    const capitalBindingId = requiredString(allocationLine.binding_id, "paper capital binding id");
    expect(capitalBindingId).toBe(personaCapitalBindingId);
    expect(allocationLine.paper_ledger_id).toBe(paperLedgerId);
    expect(allocationLine.live_capital_side_effects).toBe(false);
    expect(allocationLine.target_weight).toBe(1);

    const proposalResponse = await request.post(`${BFF_BASE}/bff/rebalances`, {
      data: {
        allocation_evaluation_id: evaluationId,
        allocation_policy_version: evaluation.allocation_policy_version,
        audit_refs: [
          `promotion_review:${promotionReviewId}`,
          `ranking_snapshot:${recommendationSnapshotId}`,
        ],
        capital_pool_id: poolId,
        constraints: {
          canary_execution_enabled: false,
          live_capital_enabled: false,
          paper_only: true,
        },
        lines: allocationLines,
        ranking_snapshot_id: recommendationSnapshotId,
        reason: "PPL-ALLOC-009 governed paper allocation",
        rollback_target: {
          current_weight: allocationLine.current_weight,
          paper_ledger_id: paperLedgerId,
        },
        simulation: {
          authority_mode: "governed_paper_simulation",
          status: "passed",
        },
      },
      headers: authHeaders(operator.token, {
        "Idempotency-Key": idempotency("rebalance-proposal"),
      }),
    });
    calls.push(await requestEvidence(proposalResponse, "rebalance-proposal", "POST"));
    const proposalPayload = await expectStatus(proposalResponse, 202, "rebalance proposal");
    const rebalanceId = requiredString(
      proposalPayload.rebalance_id ?? responseData(proposalPayload).rebalance_id,
      "rebalance id",
    );

    const approvalDecisionId = `approval-${safeSegment(RUN_KEY)}`;
    const approvalResponse = await request.post(
      `${BFF_BASE}/bff/rebalances/${encodeURIComponent(rebalanceId)}/approve`,
      {
        data: {
          approval_decision_id: approvalDecisionId,
          memo: "Approve paper-only allocation apply.",
        },
        headers: authHeaders(approver.token, {
          "Idempotency-Key": idempotency("rebalance-approval"),
        }),
      },
    );
    calls.push(await requestEvidence(approvalResponse, "rebalance-approval", "POST"));
    const approvalPayload = await expectStatus(approvalResponse, 201, "rebalance approval");
    const canonicalApprovalId = requiredString(
      responseData(approvalPayload).approval_decision_id ?? approvalDecisionId,
      "approval decision id",
    );

    const confirmTokenId = `ct-${safeSegment(RUN_KEY)}`;
    const confirmResponse = await request.post(`${BFF_BASE}/bff/confirm-tokens`, {
      data: {
        command: "ApprovedApply",
        operator_id: operator.operatorId,
        reason: "Confirm governed paper allocation.",
        target: { id: rebalanceId, type: "Rebalance" },
        tokenId: confirmTokenId,
      },
      headers: authHeaders(operator.token, {
        "Idempotency-Key": idempotency("apply-confirm"),
      }),
    });
    calls.push(await requestEvidence(confirmResponse, "apply-confirm-token", "POST"));
    await expectStatus(confirmResponse, 201, "apply confirm token");

    const applyResponse = await request.post(
      `${BFF_BASE}/bff/rebalances/${encodeURIComponent(rebalanceId)}/apply`,
      {
        data: { approval_decision_id: canonicalApprovalId },
        headers: authHeaders(operator.token, {
          "Idempotency-Key": idempotency("rebalance-apply"),
          "X-Confirm-Token": confirmTokenId,
        }),
      },
    );
    calls.push(await requestEvidence(applyResponse, "rebalance-apply", "POST"));
    const applyPayload = await expectStatus(applyResponse, 202, "rebalance apply");
    const commandId = requiredString(responseData(applyPayload).command_id, "apply command id");

    let receipt: JsonRecord = {};
    const receiptDeadline = Date.now() + 60_000;
    while (Date.now() < receiptDeadline) {
      const receiptResponse = await request.get(
        `${BFF_BASE}/api/v1/operator/commands/${encodeURIComponent(commandId)}`,
        { headers: authHeaders(operator.token) },
      );
      calls.push(await requestEvidence(receiptResponse, "apply-command-receipt"));
      receipt = await expectStatus(receiptResponse, 200, "apply command receipt");
      if (String(receipt.status ?? "") === "executed") break;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    expect(receipt.status).toBe("executed");
    const applyResult = record(receipt.result);
    expect(applyResult.authoritative_capital_readback).toBe(true);
    expect(applyResult.live_capital_side_effects).toBe(false);
    const applyReadback = Array.isArray(applyResult.allocation_readback)
      ? applyResult.allocation_readback.map(record)
      : [];
    expect(applyReadback).toHaveLength(1);
    expect(applyReadback[0].binding_id).toBe(capitalBindingId);
    expect(applyReadback[0].current_weight).toBe(1);

    const capitalResponse = await request.get(
      `${BFF_BASE}/bff/capital-pools/${encodeURIComponent(poolId)}`,
      { headers: authHeaders(operator.token) },
    );
    calls.push(await requestEvidence(capitalResponse, "authoritative-capital-readback"));
    const capitalPayload = await expectStatus(capitalResponse, 200, "Capital readback");
    const capital = responseData(capitalPayload);
    expect(capital.authoritative_capital_readback).toBe(true);
    const allocations = Array.isArray(capital.allocations)
      ? capital.allocations.map(record)
      : [];
    const allocation = allocations.find(
      (item) => String(item.persona_id ?? "") === personaId
        && String(item.binding_id ?? "") === capitalBindingId,
    );
    expect(allocation).toBeTruthy();
    expect(allocation?.current_weight).toBe(1);
    expect(allocation?.capital_scope).toBe("paper_ledger");
    expect(allocation?.capital_sleeve_id ?? null).toBeNull();

    const desktop = await runBrowserProof(browser, operator, {
      personaId,
      personaName,
      poolId,
      rebalanceId,
      viewport: { height: 900, width: 1440 },
      viewportName: "desktop",
    });
    const mobile = await runBrowserProof(browser, operator, {
      personaId,
      personaName,
      poolId,
      rebalanceId,
      viewport: { height: 852, width: 393 },
      viewportName: "mobile-393",
    });

    await writeEvidence(testInfo, {
      acceptance: {
        B1: "passed_governed_paper_only_chain",
        B3: "passed_exact_pair_desktop_and_393px_mobile",
        realLiveCapitalAuthority: "disabled",
      },
      browsers: { desktop, mobile },
      capturedAt: new Date().toISOString(),
      chain: {
        allocationEvaluationId: evaluationId,
        approvalDecisionId: canonicalApprovalId,
        applyCommandId: commandId,
        capitalBindingId,
        paperLedgerId,
        provisioningPaperSessionId: paperSessionId,
        personaId,
        promotionReviewId,
        rankingSnapshotId: recommendationSnapshotId,
        rebalanceId,
        runtimeBindingId,
        runtimeId,
      },
      deployment: {
        bffCommit: EXPECTED_BFF_SHA,
        deploymentState: pair.deployment.deploymentState,
        frontendCommit: EXPECTED_FE_SHA,
        pairId: pair.deployment.pairId ?? null,
        safeBuildMode: pair.deployment.buildMode,
      },
      eligibilityProof: {
        benchmarkVersion: eligibilityProof.benchmark_version,
        eventId: eligibilityProof.event_id,
        metrics: eligibilityProof.metrics,
        ownerReceipt: eligibilityProof.owner_receipt,
        scenarioDigest: eligibilityProof.scenario_digest,
        traceId: eligibilityProof.trace_id,
      },
      identities: {
        approver: {
          identityClass: approver.identityClass,
          mfaVerified: approver.mfaVerified,
          operatorId: approver.operatorId,
          roles: approver.roles,
        },
        applyOperator: {
          identityClass: operator.identityClass,
          mfaVerified: operator.mfaVerified,
          operatorId: operator.operatorId,
          roles: operator.roles,
        },
        distinctApprovalAndApply: approver.operatorId !== operator.operatorId,
      },
      requestResponseEvidence: calls,
      result: "passed",
      safety: {
        authoritativeCapitalReadback: capital.authoritative_capital_readback,
        canaryExecutionEnabled: false,
        liveCapitalSideEffects: false,
        paperOnly: true,
        realWritesEnabled: false,
      },
      schemaVersion: "pantheon.ppl-alloc-009.hosted-acceptance.v1",
      taskId: "PPL-ALLOC-009",
      tenantId: TENANT_ID,
    });
  });
});
