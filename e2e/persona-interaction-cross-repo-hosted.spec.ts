/**
 * Cross-repository Persona interaction proof.
 *
 * Positive writes run only when the operator explicitly opts in with
 * PANTHEON_PERSONA_INTERACTION_WRITE_PROOF=1 and supplies an operator token.
 * The viewer denial proof is safe to run independently and must never produce
 * an interaction POST from the browser.
 */
import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { roleTokenFromEnv } from "./helpers/auth";

const FE_BASE = (process.env.PANTHEON_FE_BASE_URL ?? "").replace(/\/$/, "");
const BFF_BASE = (process.env.PANTHEON_BFF_BASE_URL ?? "").replace(/\/$/, "");
const TENANT_ID = process.env.PANTHEON_TENANT_ID ?? "pantheon-dev";
const OPERATOR_TOKEN = roleTokenFromEnv("operator", ["PANTHEON_PERSONA_INTERACTION_OPERATOR_TOKEN"]);
const VIEWER_TOKEN = roleTokenFromEnv("viewer", ["PANTHEON_PERSONA_INTERACTION_VIEWER_TOKEN"]);
const WRITE_PROOF = process.env.PANTHEON_PERSONA_INTERACTION_WRITE_PROOF === "1";
const ENSURED_PERSONA_ID = String(process.env.PANTHEON_PERSONA_INTERACTION_PERSONA_ID ?? "").trim();
const EXPECTED_BFF_SHA = String(process.env.PANTHEON_BFF_SHA ?? "").trim().toLowerCase();
const PUBLIC_SUPABASE_URL = String(process.env.PANTHEON_PUBLIC_SUPABASE_URL ?? "").trim();
const DEV_BFF_HOST = "pantheon-lupin-dev-bff.35.201.239.38.sslip.io";
const DEV_FE_HOST = "pantheon-lupin-dev-fe.35.201.239.38.sslip.io";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function data(value: unknown): unknown {
  return record(value).data ?? value;
}

function items(value: unknown): JsonRecord[] {
  const payload = data(value);
  if (Array.isArray(payload)) return payload.filter((item): item is JsonRecord => !!item && typeof item === "object");
  const envelope = record(payload);
  const rows = envelope.items ?? envelope.events ?? envelope.results;
  return Array.isArray(rows) ? rows.filter((item): item is JsonRecord => !!item && typeof item === "object") : [];
}

function headers(token: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "X-Request-Id": `persona-interaction-${randomUUID()}`,
    "X-Tenant-Id": TENANT_ID,
    ...extra,
  };
}

function rolesFromMe(me: JsonRecord): string[] {
  return Array.isArray(me.roles)
    ? me.roles.filter((role): role is string => typeof role === "string").map((role) => role.toLowerCase())
    : [];
}

function identityId(value: unknown): string {
  const identity = record(value);
  return String(identity.operator_id ?? identity.operatorId ?? identity.id ?? "").trim();
}

async function assertOperatorSession(request: APIRequestContext, token: string): Promise<{
  operatorId: string;
  roles: string[];
  sessionKind: "bearer";
}> {
  const meResponse = await request.get(`${BFF_BASE}/bff/me`, { headers: headers(token) });
  expect(meResponse.ok(), `/bff/me returned ${meResponse.status()}`).toBe(true);
  const me = record(data(await meResponse.json()));
  const roles = rolesFromMe(me);
  expect(roles).toContain("operator");
  return assertHostedBearerSession(request, token, me, roles);
}

async function assertHostedBearerSession(
  request: APIRequestContext,
  token: string,
  me: JsonRecord,
  roles = rolesFromMe(me),
): Promise<{
  operatorId: string;
  roles: string[];
  sessionKind: "bearer";
}> {
  const operatorId = String(me.operator_id ?? me.operatorId ?? "").trim();
  expect(operatorId).not.toBe("");
  const boundIdentities = [me.user, me.current_user, me.currentUser]
    .map(identityId)
    .filter(Boolean);
  expect(boundIdentities.length, "/bff/me must expose an identity bound to the operator").toBeGreaterThan(0);
  expect(boundIdentities.every((identity) => identity === operatorId)).toBe(true);
  const session = record(me.session);
  expect(session.authenticated).toBe(true);
  const sessionKind = String(session.session_kind ?? session.sessionKind ?? me.session_kind ?? me.sessionKind).toLowerCase();
  expect(sessionKind).toBe("bearer");
  expect(new URL(BFF_BASE).hostname).toBe(DEV_BFF_HOST);
  expect(EXPECTED_BFF_SHA).toMatch(/^[0-9a-f]{40}$/);
  const meEnvironment = record(me.environment);
  expect(meEnvironment.name).toBe("dev");
  expect(meEnvironment.deployment_stage).toBe("dev");
  expect(meEnvironment.auth_mode).toBe("strict");

  const versionResponse = await request.get(`${BFF_BASE}/bff/version`, { headers: headers(token) });
  expect(versionResponse.ok(), `/bff/version returned ${versionResponse.status()}`).toBe(true);
  const version = record(data(await versionResponse.json()));
  expect(String(version.source_commit_sha ?? "").toLowerCase()).toBe(EXPECTED_BFF_SHA);
  expect(version.environment).toBe("dev");
  const posture = record(version.config_posture);
  expect(posture.auth_stub).toBe(false);
  expect(posture.auth_mode).toBe("strict");

  const readinessResponse = await request.get(`${BFF_BASE}/bff/auth/readiness`, { headers: headers(token) });
  expect(readinessResponse.ok(), `/bff/auth/readiness returned ${readinessResponse.status()}`).toBe(true);
  const readiness = record(data(await readinessResponse.json()));
  const auth = record(readiness.auth);
  expect(auth.strict).toBe(true);
  expect(auth.stub).toBe(false);
  expect(String(auth.sessionKind ?? auth.session_kind ?? "")).toBe("bearer");
  expect(String(readiness.sourceCommitSha ?? readiness.source_commit_sha ?? "").toLowerCase()).toBe(EXPECTED_BFF_SHA);
  return { operatorId, roles, sessionKind: "bearer" };
}

function hostedBearerClaims(token: string): JsonRecord {
  const parts = token.split(".");
  if (parts.length !== 3) return {};
  try {
    return record(JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")));
  } catch {
    return {};
  }
}

async function installVerifiedHostedProofSession(
  page: Page,
  input: {
    operatorId: string;
    roles: string[];
    sessionKind: "bearer";
    token: string;
    minimumTtlSeconds: number;
  },
): Promise<void> {
  expect(WRITE_PROOF, "hosted session bootstrap is proof-only").toBe(true);
  expect(new URL(FE_BASE).hostname).toBe(DEV_FE_HOST);
  expect(new URL(BFF_BASE).hostname).toBe(DEV_BFF_HOST);
  expect(EXPECTED_BFF_SHA).toMatch(/^[0-9a-f]{40}$/);
  const supabase = new URL(PUBLIC_SUPABASE_URL);
  expect(supabase.protocol).toBe("https:");
  expect(supabase.hostname.endsWith(".supabase.co")).toBe(true);

  const nowSeconds = Math.floor(Date.now() / 1000);
  const claims = hostedBearerClaims(input.token);
  expect(input.sessionKind).toBe("bearer");
  expect(String(claims.sub ?? "")).toBe(input.operatorId);
  expect(input.minimumTtlSeconds).toBeGreaterThanOrEqual(240);
  expect(Number(claims.exp ?? 0)).toBeGreaterThan(nowSeconds + input.minimumTtlSeconds);

  const expiresAt = Number(claims.exp);
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
      email: typeof claims.email === "string" ? claims.email : undefined,
      app_metadata: record(claims.app_metadata),
      user_metadata: record(claims.user_metadata),
      created_at: new Date(nowSeconds * 1000).toISOString(),
    },
  };
  await page.addInitScript(
    ({ key, session }) => {
      try {
        window.sessionStorage.setItem(key, JSON.stringify(session));
      } catch {
        // The init script is retried for the hosted origin during navigation.
      }
    },
    { key: storageKey, session: storedSession },
  );
}

function personaId(row: JsonRecord): string {
  return String(row.id ?? row.persona_id ?? row.personaId ?? "").trim();
}

function sanitizedExcludedReasonCounts(rows: JsonRecord[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const reasons = Array.isArray(row.reasons) ? row.reasons : [];
    for (const reason of reasons) {
      const code = String(reason).toLowerCase().replace(/[^a-z0-9_.:-]+/gu, "_").slice(0, 80) || "unspecified";
      counts[code] = (counts[code] ?? 0) + 1;
    }
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

async function discoverEligiblePersona(
  request: APIRequestContext,
  token: string,
): Promise<{ id: string; name: string }> {
  expect(ENSURED_PERSONA_ID, "authorized proof preflight must export the ensured Persona ID").not.toBe("");
  const resolveResponse = await request.post(`${BFF_BASE}/bff/agora/interactions/context:resolve`, {
    headers: headers(token, { "Idempotency-Key": `persona-eligibility-${randomUUID()}` }),
    data: {
      context_refs: [{ type: "persona", id: ENSURED_PERSONA_ID }],
      environment: "paper",
    },
  });
  expect(resolveResponse.ok(), `Persona eligibility context returned ${resolveResponse.status()}`).toBe(true);
  const workshopId = String(record(data(await resolveResponse.json())).workshop_id ?? "").trim();
  expect(workshopId).not.toBe("");

  const eligibilityResponse = await request.post(`${BFF_BASE}/bff/agora/interactions/participants:eligible`, {
    headers: headers(token),
    data: {
      workshop_id: workshopId,
      mode: "ask",
      environment: "paper",
      required_capability: "persona_opinion",
    },
  });
  expect(eligibilityResponse.ok(), `Authoritative Persona eligibility returned ${eligibilityResponse.status()}`).toBe(true);
  const eligibility = record(data(await eligibilityResponse.json()));
  const included = items({ data: { items: eligibility.included } });
  const excluded = items({ data: { items: eligibility.excluded } });
  const selected = included.find((row) => String(row.persona_id ?? "").trim() === ENSURED_PERSONA_ID);
  if (!selected) {
    throw new Error(`No ensured Persona is included by authoritative eligibility; excluded_reason_counts=${JSON.stringify(sanitizedExcludedReasonCounts(excluded))}`);
  }
  return matchEnsuredPersonaFromFleet(request, token);
}

async function matchEnsuredPersonaFromFleet(
  request: APIRequestContext,
  token: string,
): Promise<{ id: string; name: string }> {
  expect(ENSURED_PERSONA_ID, "authorized proof preflight must export the ensured Persona ID").not.toBe("");
  const response = await request.get(`${BFF_BASE}/bff/management/persona-fleet?page_size=100`, {
    headers: headers(token),
  });
  expect(response.ok(), `Persona Fleet match returned ${response.status()}`).toBe(true);
  const rows = items(await response.json());
  const row = rows.find((candidate) => personaId(candidate) === ENSURED_PERSONA_ID);
  expect(row, "Persona Fleet must expose the exact user-private Persona ensured by proof preflight").toBeTruthy();
  const state = String(row?.lifecycle_state ?? row?.state ?? "active").toLowerCase();
  expect(["retired", "archived", "suspended"]).not.toContain(state);
  return {
    id: ENSURED_PERSONA_ID,
    name: String(row?.name ?? row?.display_name ?? row?.persona_name ?? row?.personaName ?? ENSURED_PERSONA_ID),
  };
}

async function prepareImmutableStrategyWorkshop(request: APIRequestContext, token: string, operatorId: string): Promise<{
  strategyId: string;
  strategyVersion: string;
  workshopId: string;
}> {
  const strategiesResponse = await request.get(`${BFF_BASE}/bff/strategies?limit=100`, { headers: headers(token) });
  expect(strategiesResponse.ok(), `Strategy discovery returned ${strategiesResponse.status()}`).toBe(true);
  const strategies = items(await strategiesResponse.json())
    .map((candidate) => String(candidate.id ?? candidate.strategy_id ?? "").trim())
    .filter(Boolean)
    .sort();
  expect(strategies.length, "Hosted BFF must expose a real stable Strategy identity").toBeGreaterThan(0);

  let target: { strategyId: string; strategyVersion: string } | null = null;
  for (const strategyId of strategies) {
    const specsResponse = await request.get(`${BFF_BASE}/bff/strategies/${encodeURIComponent(strategyId)}/specs`, {
      headers: headers(token),
    });
    if (!specsResponse.ok()) continue;
    const strategyVersion = items(await specsResponse.json())
      .map((candidate) => String(candidate.spec_version_id ?? candidate.strategy_spec_registry_id ?? candidate.id ?? "").trim())
      .filter(Boolean)
      .sort()[0];
    if (strategyVersion && strategyVersion !== strategyId) {
      target = { strategyId, strategyVersion };
      break;
    }
  }
  expect(target, "No real Strategy exposes an immutable Registry version through /bff/strategies/{id}/specs").toBeTruthy();
  if (!target) throw new Error("unreachable: strategy/version assertion failed");

  const resolveResponse = await request.post(`${BFF_BASE}/bff/agora/interactions/context:resolve`, {
    headers: headers(token, { "Idempotency-Key": `persona-strategy-workshop-${randomUUID()}` }),
    data: {
      environment: "paper",
      context_refs: [{ type: "strategy", id: target.strategyId, version_id: target.strategyVersion }],
    },
  });
  expect(resolveResponse.ok(), `Strategy Workshop resolution returned ${resolveResponse.status()}: ${await resolveResponse.text()}`).toBe(true);
  const resolved = record(data(await resolveResponse.json()));
  const workshopId = String(resolved.workshop_id ?? "").trim();
  expect(workshopId).not.toBe("");

  const workshopResponse = await request.get(`${BFF_BASE}/bff/agora/workshops/${encodeURIComponent(workshopId)}`, {
    headers: headers(token),
  });
  expect(workshopResponse.ok(), `Resolved Workshop readback returned ${workshopResponse.status()}`).toBe(true);
  const workshop = record(data(await workshopResponse.json()));
  expect(workshop.status).toBe("open");
  expect(String(workshop.operator_id ?? workshop.operatorId ?? workshop.user_id ?? "")).toBe(operatorId);
  expect(workshop.strategy_id).toBe(target.strategyId);
  expect(workshop.active_strategy_spec_registry_id).toBe(target.strategyVersion);
  return { ...target, workshopId };
}

async function openPersonaDetail(page: Page, persona: { id: string; name: string }): Promise<void> {
  await page.goto(`${FE_BASE}/management/personas/${encodeURIComponent(persona.id)}`);
  await expect(page.getByRole("heading", { level: 1, name: persona.name })).toBeAttached({ timeout: 30_000 });
}

async function revealWorkshopComposerOptions(page: Page): Promise<void> {
  const modeSelector = page.getByTestId("mode-selector");
  if (await modeSelector.isVisible()) return;

  const optionsToggle = page.getByTestId("workshop-composer-options-toggle");
  await expect(optionsToggle).toBeVisible();
  await optionsToggle.click();
  await expect(modeSelector).toBeVisible();
}

test.describe("Persona Detail → canonical Workshop cross-repo proof", () => {
  test.skip(!FE_BASE || !BFF_BASE, "requires hosted Pantheon FE and BFF URLs");

  test("operator resolves, checks eligibility, submits no-authority interaction, reads it back, and returns @desktop-full", async ({ page, request }) => {
    test.skip(!WRITE_PROOF || !OPERATOR_TOKEN, "requires explicit write-proof opt-in and operator token");
    test.setTimeout(180_000);
    const operatorSession = await assertOperatorSession(request, OPERATOR_TOKEN);
    const persona = await discoverEligiblePersona(request, OPERATOR_TOKEN);
    await installVerifiedHostedProofSession(page, {
      ...operatorSession,
      token: OPERATOR_TOKEN,
      minimumTtlSeconds: 300,
    });
    await page.addInitScript(() => {
      // runtimeEnv accepts this only on the allowlisted Pantheon dev host.
      window.sessionStorage.setItem("pantheon.e2e.realWrites", "true");
    });
    await openPersonaDetail(page, persona);

    const resolveResponse = page.waitForResponse((response) =>
      new URL(response.url()).pathname === "/bff/agora/interactions/context:resolve"
      && response.request().method() === "POST",
    );
    const eligibilityResponse = page.waitForResponse((response) =>
      new URL(response.url()).pathname === "/bff/agora/interactions/participants:eligible"
      && response.request().method() === "POST",
    );
    const talkButton = page.getByRole("button", { name: /^Talk with / });
    await expect(talkButton).toBeEnabled();
    await talkButton.click();

    const resolvedHttp = await resolveResponse;
    const eligibleHttp = await eligibilityResponse;
    expect(resolvedHttp.ok(), await resolvedHttp.text()).toBe(true);
    expect(eligibleHttp.ok(), await eligibleHttp.text()).toBe(true);
    const resolved = record(data(await resolvedHttp.json()));
    const eligibility = record(data(await eligibleHttp.json()));
    const workshopId = String(resolved.workshop_id ?? "");
    expect(workshopId).not.toBe("");
    expect(items({ data: { items: eligibility.included } }).some((row) => row.persona_id === persona.id)).toBe(true);
    await expect(page).toHaveURL(new RegExp(`/agora/strategy-workshop/${encodeURIComponent(workshopId)}`));

    const topic = `Hosted Persona reflection ${randomUUID()}`;
    await page.getByTestId("servant-composer-input").fill(topic);
    await expect(page.getByTestId("workshop-session-loading")).toBeHidden({ timeout: 30_000 });
    const submitButton = page.getByTestId("servant-composer-submit");
    await expect(submitButton).toBeEnabled({ timeout: 30_000 });
    const submitResponse = page.waitForResponse((response) =>
      new URL(response.url()).pathname === "/bff/agora/interactions"
      && response.request().method() === "POST",
    );
    await submitButton.click();
    const submittedHttp = await submitResponse;
    expect(submittedHttp.ok(), await submittedHttp.text()).toBe(true);
    const submitted = record(data(await submittedHttp.json()));
    const submittedRequest = record(submittedHttp.request().postDataJSON());
    const requestedParticipants = Array.isArray(submittedRequest.participants)
      ? submittedRequest.participants.map(record)
      : [];
    const persistedParticipants = Array.isArray(submitted.participants)
      ? submitted.participants.map(record)
      : [];
    expect(requestedParticipants.map((participant) => participant.persona_id)).toEqual([ENSURED_PERSONA_ID]);
    expect(persistedParticipants.map((participant) => participant.persona_id)).toEqual([ENSURED_PERSONA_ID]);
    expect(record(submitted.authority).execution_authority).toBe("none");
    expect(record(submitted.authority).capital_changed).toBe(false);
    const interactionId = String(submitted.interaction_id ?? "");
    expect(interactionId).not.toBe("");

    await expect.poll(async () => {
      const response = await request.get(`${BFF_BASE}/bff/agora/workshops/${encodeURIComponent(workshopId)}/events`, {
        headers: headers(OPERATOR_TOKEN),
      });
      if (!response.ok()) return false;
      return JSON.stringify(await response.json()).includes(interactionId);
    }, { timeout: 60_000 }).toBe(true);

    const returnLink = page.getByTestId("workshop-return-link");
    await expect(returnLink).toHaveAttribute("href", `/management/personas/${persona.id}`);
    await returnLink.click();
    await expect(page).toHaveURL(new RegExp(`/management/personas/${encodeURIComponent(persona.id)}$`));
  });

  test("daily Persona measure supports durable modify, defer, accept-for-review, validation, reject, and reload @desktop-full", async ({ page, request }) => {
    test.skip(!WRITE_PROOF || !OPERATOR_TOKEN, "requires explicit write-proof opt-in and operator token");
    test.setTimeout(360_000);
    const operatorSession = await assertOperatorSession(request, OPERATOR_TOKEN);
    const { operatorId } = operatorSession;
    await discoverEligiblePersona(request, OPERATOR_TOKEN);
    const target = await prepareImmutableStrategyWorkshop(request, OPERATOR_TOKEN, operatorId);
    await installVerifiedHostedProofSession(page, {
      ...operatorSession,
      token: OPERATOR_TOKEN,
      minimumTtlSeconds: 480,
    });
    await page.addInitScript(() => window.sessionStorage.setItem("pantheon.e2e.realWrites", "true"));
    await page.goto(`${FE_BASE}/agora/strategy-workshop/${encodeURIComponent(target.workshopId)}`);
    await expect(page.getByTestId("servant-composer")).toBeVisible({ timeout: 30_000 });

    await revealWorkshopComposerOptions(page);
    await page.getByTestId("mode-selector").click();
    await page.getByRole("option", { name: /Propose \(Candidate Measure\)/i }).click();
    await page.getByTestId("servant-composer-input").fill(
      "Recommend one bounded paper-only risk_limit_recommendation. Use validator pantheon_candidate_validation_v1 with supported checks source_binding, target_version, authority_boundary, and rollback_plan. Include fresh canonical evidence and a reversible rollback.",
    );
    const submitResponse = page.waitForResponse((response) =>
      new URL(response.url()).pathname === "/bff/agora/interactions"
      && response.request().method() === "POST",
    );
    await page.getByTestId("servant-composer-submit").click();
    const submittedHttp = await submitResponse;
    expect(submittedHttp.ok(), await submittedHttp.text()).toBe(true);
    const interactionId = String(record(data(await submittedHttp.json())).interaction_id ?? "");
    expect(interactionId).not.toBe("");

    let measureId = "";
    let measureSha = "";
    await expect.poll(async () => {
      const response = await request.get(`${BFF_BASE}/bff/agora/interactions/${encodeURIComponent(interactionId)}`, {
        headers: headers(OPERATOR_TOKEN),
      });
      if (!response.ok()) return false;
      const interaction = record(data(await response.json()));
      const opinions = Array.isArray(interaction.opinions) ? interaction.opinions.map(record) : [];
      const measures = opinions.flatMap((opinion) =>
        Array.isArray(opinion.recommended_measures) ? opinion.recommended_measures.map(record) : [],
      );
      const measure = measures.find((item) => /^[a-f0-9]{64}$/.test(String(item.measure_sha256 ?? "")));
      measureId = String(measure?.measure_id ?? "");
      measureSha = String(measure?.measure_sha256 ?? "");
      return Boolean(measureId && measureSha);
    }, { timeout: 120_000 }).toBe(true);

    await page.reload();
    const measureCard = page.getByTestId(`recommended-measure-${measureId}`);
    await expect(measureCard).toContainText(measureSha, { timeout: 60_000 });
    const createResponse = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith(`/recommended-measures/${encodeURIComponent(measureId)}/candidates`)
      && response.request().method() === "POST",
    );
    await measureCard.getByRole("button", { name: "Create governed candidate" }).click();
    const createdHttp = await createResponse;
    expect(createdHttp.ok(), await createdHttp.text()).toBe(true);
    let detail = record(data(await createdHttp.json()));
    let candidate = record(detail.candidate);
    const proposalId = String(candidate.proposal_id ?? "");
    expect(proposalId).not.toBe("");
    expect(candidate.measure_sha256).toBe(measureSha);
    expect(candidate.execution_authority).toBe("none");
    expect(String(detail.etag ?? "")).toMatch(/^"[a-f0-9]{64}"$/);
    expect(createdHttp.headers().etag).toBe(detail.etag);
    const candidateCard = page.getByTestId(`candidate-${proposalId}`);
    await expect(candidateCard).toBeVisible();

    const decide = async (action: "modify" | "defer" | "accept_for_review" | "reject", button: string, proposed?: JsonRecord) => {
      await candidateCard.getByLabel(new RegExp(`Decision reason for ${proposalId}`)).fill(`Hosted ${action} proof`);
      if (proposed) {
        await candidateCard.getByLabel(new RegExp(`Proposed value \\(JSON\\) for ${proposalId}`)).fill(JSON.stringify(proposed));
      }
      const responsePromise = page.waitForResponse((response) => {
        if (new URL(response.url()).pathname !== `/bff/agora/proposals/${proposalId}/candidate-decisions`) return false;
        if (response.request().method() !== "POST") return false;
        return record(response.request().postDataJSON()).action === action;
      });
      await candidateCard.getByRole("button", { name: button, exact: true }).click();
      const response = await responsePromise;
      expect(response.ok(), await response.text()).toBe(true);
      const requestBody = record(response.request().postDataJSON());
      expect(requestBody.validation_result).toBeUndefined();
      expect(response.request().headers()["if-match"]).toBe(detail.etag);
      detail = record(data(await response.json()));
      candidate = record(detail.candidate);
      expect(candidate.execution_authority).toBe("none");
      expect(String(detail.etag ?? "")).toMatch(/^"[a-f0-9]{64}"$/);
    };

    await decide("modify", "Modify", { ...record(candidate.proposed_value), hosted_bounded_risk: 0.015 });
    await decide("defer", "Defer");
    await decide("accept_for_review", "Accept for review");
    expect(candidate.state).toBe("review_requested");
    expect(record(detail.readiness).execution_authority).toBe("none");
    expect(items({ data: { items: detail.formal_approval_receipts } })).toHaveLength(0);

    const validationResponse = page.waitForResponse((response) =>
      new URL(response.url()).pathname === `/bff/agora/proposals/${proposalId}/validations`
      && response.request().method() === "POST",
    );
    await candidateCard.getByRole("button", { name: "Run authoritative validation" }).click();
    const validatedHttp = await validationResponse;
    expect(validatedHttp.ok(), await validatedHttp.text()).toBe(true);
    detail = record(data(await validatedHttp.json()));
    const validationReceipts = Array.isArray(detail.validation_receipts) ? detail.validation_receipts.map(record) : [];
    expect(validationReceipts.length).toBeGreaterThan(0);
    expect(validationReceipts.at(-1)?.authority).toBe("canonical_validation_service");

    const readinessHttp = await request.get(`${BFF_BASE}/bff/agora/proposals/${proposalId}/review-readiness`, {
      headers: headers(OPERATOR_TOKEN),
    });
    expect(readinessHttp.ok(), await readinessHttp.text()).toBe(true);
    const readiness = record(data(await readinessHttp.json()));
    expect(readiness.execution_authority).toBe("none");
    expect(String(readiness.etag ?? "")).toMatch(/^"[a-f0-9]{64}"$/);

    await decide("reject", "Reject");
    expect(candidate.state).toBe("rejected");
    await page.reload();
    const reloaded = page.getByTestId(`candidate-${proposalId}`);
    await expect(reloaded).toContainText("rejected", { timeout: 60_000 });
    await expect(reloaded.getByTestId(`candidate-history-${proposalId}`)).toContainText("4 operator decision(s)");
    await expect(reloaded).toContainText("formal approval: none");
  });

  test("viewer sees a disabled reason and cannot produce an interaction POST @desktop-full", async ({ page, request }) => {
    test.skip(!VIEWER_TOKEN, "requires an explicit or RBAC-matrix viewer token");
    test.setTimeout(120_000);
    const unauthenticated = await request.get(`${BFF_BASE}/bff/me`, {
      headers: { Accept: "application/json", "X-Request-Id": `persona-unauth-${randomUUID()}` },
    });
    expect(unauthenticated.status()).toBe(401);

    const viewerMeResponse = await request.get(`${BFF_BASE}/bff/me`, { headers: headers(VIEWER_TOKEN) });
    expect(viewerMeResponse.ok(), `viewer /bff/me returned ${viewerMeResponse.status()}`).toBe(true);
    const viewerMe = record(data(await viewerMeResponse.json()));
    const viewerRoles = rolesFromMe(viewerMe);
    expect(viewerRoles).toContain("viewer");
    expect(viewerRoles).not.toContain("operator");
    expect(viewerRoles).not.toContain("admin");
    const viewerSession = await assertHostedBearerSession(request, VIEWER_TOKEN, viewerMe, viewerRoles);
    const deniedEnsure = await request.post(`${BFF_BASE}/bff/agora/servant/ensure`, {
      headers: headers(VIEWER_TOKEN, { "Idempotency-Key": randomUUID() }),
      data: { display_name: "Viewer must not ensure a Persona", locale: "en-US", timezone: "UTC" },
    });
    expect(deniedEnsure.status()).toBe(403);
    const persona = await matchEnsuredPersonaFromFleet(request, VIEWER_TOKEN);
    const browserInteractionPosts: string[] = [];
    page.on("request", (browserRequest) => {
      const path = new URL(browserRequest.url()).pathname;
      if (browserRequest.method() === "POST" && path.startsWith("/bff/agora/interactions")) {
        browserInteractionPosts.push(path);
      }
    });
    await installVerifiedHostedProofSession(page, {
      ...viewerSession,
      token: VIEWER_TOKEN,
      minimumTtlSeconds: 240,
    });
    await openPersonaDetail(page, persona);
    await expect(page.getByRole("button", { name: /^Talk with / })).toBeDisabled();
    await expect(page.getByTestId("persona-interaction-disabled-reason")).toContainText(/requires|disabled|eligible/i);
    expect(browserInteractionPosts).toEqual([]);

    const denied = await request.post(`${BFF_BASE}/bff/agora/interactions/context:resolve`, {
      headers: headers(VIEWER_TOKEN, { "Idempotency-Key": `viewer-denied-${randomUUID()}` }),
      data: { context_refs: [{ type: "persona", id: persona.id }], environment: "paper" },
    });
    expect(denied.status()).toBe(403);
    expect(browserInteractionPosts).toEqual([]);
  });

  test("mobile Persona detail remains usable without producing writes @mobile-basic", async ({ page, request }) => {
    test.skip(!OPERATOR_TOKEN, "requires an operator token for hosted readback");
    test.setTimeout(120_000);
    const operatorSession = await assertOperatorSession(request, OPERATOR_TOKEN);
    const persona = await matchEnsuredPersonaFromFleet(request, OPERATOR_TOKEN);
    const browserInteractionPosts: string[] = [];
    page.on("request", (browserRequest) => {
      const path = new URL(browserRequest.url()).pathname;
      if (browserRequest.method() === "POST" && path.startsWith("/bff/agora/interactions")) {
        browserInteractionPosts.push(path);
      }
    });
    await installVerifiedHostedProofSession(page, {
      ...operatorSession,
      token: OPERATOR_TOKEN,
      minimumTtlSeconds: 240,
    });
    await openPersonaDetail(page, persona);
    await expect(page.getByRole("button", { name: /^Talk with / })).toBeVisible();
    await expect(page.getByRole("tab", { name: /trade journal/i })).toBeVisible();
    expect(browserInteractionPosts).toEqual([]);
  });
});
