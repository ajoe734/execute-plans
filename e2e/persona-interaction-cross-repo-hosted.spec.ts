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
import { installOidcDevLogin, roleTokenFromEnv } from "./helpers/auth";

const FE_BASE = (process.env.PANTHEON_FE_BASE_URL ?? "").replace(/\/$/, "");
const BFF_BASE = (process.env.PANTHEON_BFF_BASE_URL ?? "").replace(/\/$/, "");
const TENANT_ID = process.env.PANTHEON_TENANT_ID ?? "pantheon-dev";
const OPERATOR_TOKEN = roleTokenFromEnv("operator", ["PANTHEON_PERSONA_INTERACTION_OPERATOR_TOKEN"]);
const VIEWER_TOKEN = roleTokenFromEnv("viewer", ["PANTHEON_PERSONA_INTERACTION_VIEWER_TOKEN"]);
const WRITE_PROOF = process.env.PANTHEON_PERSONA_INTERACTION_WRITE_PROOF === "1";
const ENSURED_PERSONA_ID = String(process.env.PANTHEON_PERSONA_INTERACTION_PERSONA_ID ?? "").trim();
const EXPECTED_BFF_SHA = String(process.env.PANTHEON_BFF_SHA ?? "").trim().toLowerCase();
const DEV_BFF_HOST = "pantheon-lupin-dev-bff.35.201.239.38.sslip.io";

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

function stubTokenActor(token: string): string {
  return token.replace(/^Bearer\s+/i, "").trim().split(":", 1)[0]?.trim() ?? "";
}

async function assertOperatorSession(request: APIRequestContext, token: string): Promise<{
  operatorId: string;
  roles: string[];
}> {
  const meResponse = await request.get(`${BFF_BASE}/bff/me`, { headers: headers(token) });
  expect(meResponse.ok(), `/bff/me returned ${meResponse.status()}`).toBe(true);
  const me = record(data(await meResponse.json()));
  const roles = rolesFromMe(me);
  expect(roles).toContain("operator");
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
  if (["bearer", "cookie"].includes(sessionKind)) return { operatorId, roles };

  // Stub auth is accepted only for the exact, release-bound Pantheon dev posture.
  // Never print or attach the token: only compare its normalized actor segment.
  expect(sessionKind).toBe("stub");
  expect(new URL(BFF_BASE).hostname).toBe(DEV_BFF_HOST);
  expect(EXPECTED_BFF_SHA).toMatch(/^[0-9a-f]{40}$/);
  expect(stubTokenActor(token)).toBe(operatorId);
  expect(String(session.id ?? "")).toBe(`bff-session-${operatorId}`);
  const meEnvironment = record(me.environment);
  expect(meEnvironment.name).toBe("dev");
  expect(meEnvironment.deployment_stage).toBe("dev");
  expect(meEnvironment.auth_mode).toBe("stub");

  const versionResponse = await request.get(`${BFF_BASE}/bff/version`, { headers: headers(token) });
  expect(versionResponse.ok(), `/bff/version returned ${versionResponse.status()}`).toBe(true);
  const version = record(data(await versionResponse.json()));
  expect(String(version.source_commit_sha ?? "").toLowerCase()).toBe(EXPECTED_BFF_SHA);
  expect(version.environment).toBe("dev");
  const posture = record(version.config_posture);
  expect(posture.auth_stub).toBe(true);
  expect(posture.auth_mode).toBe("permissive");
  return { operatorId, roles };
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

async function readProposal(request: APIRequestContext, token: string, proposalId: string) {
  const response = await request.get(`${BFF_BASE}/bff/agora/proposals/${encodeURIComponent(proposalId)}`, {
    headers: headers(token),
  });
  expect(response.ok(), `Proposal readback returned ${response.status()}`).toBe(true);
  return {
    etag: response.headers().etag ?? "",
    proposal: record(data(await response.json())),
  };
}

async function actOnProposal(
  request: APIRequestContext,
  token: string,
  proposalId: string,
  etag: string,
  action: JsonRecord,
) {
  const response = await request.post(`${BFF_BASE}/bff/agora/proposals/${encodeURIComponent(proposalId)}/actions`, {
    headers: headers(token, { "If-Match": etag }),
    data: action,
  });
  expect(response.ok(), `Proposal ${String(action.action)} returned ${response.status()}: ${await response.text()}`).toBe(true);
  return {
    etag: response.headers().etag ?? "",
    proposal: record(data(await response.json())),
  };
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

  test("operator resolves, checks eligibility, submits no-authority interaction, reads it back, and returns", async ({ page, request }) => {
    test.skip(!WRITE_PROOF || !OPERATOR_TOKEN, "requires explicit write-proof opt-in and operator token");
    test.setTimeout(180_000);
    const { roles: operatorRoles } = await assertOperatorSession(request, OPERATOR_TOKEN);
    const persona = await discoverEligiblePersona(request, OPERATOR_TOKEN);
    await installOidcDevLogin(page, {
      goto: false,
      pageBaseUrl: FE_BASE,
      roles: operatorRoles,
      tenantId: TENANT_ID,
      token: OPERATOR_TOKEN,
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
    const talkButton = page.getByRole("button", { name: "Talk to" });
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
    const submitResponse = page.waitForResponse((response) =>
      new URL(response.url()).pathname === "/bff/agora/interactions"
      && response.request().method() === "POST",
    );
    await page.getByTestId("servant-composer-submit").click();
    const submittedHttp = await submitResponse;
    expect(submittedHttp.ok(), await submittedHttp.text()).toBe(true);
    const submitted = record(data(await submittedHttp.json()));
    const submittedRequest = record(submittedHttp.request().postDataJSON());
    expect(submittedRequest.participant_persona_ids).toEqual([ENSURED_PERSONA_ID]);
    expect(submitted.participants).toEqual([ENSURED_PERSONA_ID]);
    expect(submitted.execution_authority).toBe("none");
    expect(String(submitted.no_capital_authority_proof ?? "")).not.toBe("");
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

  test("operator proposes a governed strategy measure, reads canonical state, and cannot self-approve", async ({ page, request }) => {
    test.skip(!WRITE_PROOF || !OPERATOR_TOKEN, "requires explicit write-proof opt-in and operator token");
    test.setTimeout(240_000);
    const { operatorId, roles: operatorRoles } = await assertOperatorSession(request, OPERATOR_TOKEN);
    const target = await prepareImmutableStrategyWorkshop(request, OPERATOR_TOKEN, operatorId);

    await installOidcDevLogin(page, {
      goto: false,
      pageBaseUrl: FE_BASE,
      roles: operatorRoles,
      tenantId: TENANT_ID,
      token: OPERATOR_TOKEN,
    });
    await page.addInitScript(() => window.sessionStorage.setItem("pantheon.e2e.realWrites", "true"));
    await page.goto(`${FE_BASE}/agora/strategy-workshop/${encodeURIComponent(target.workshopId)}`);
    await expect(page.getByTestId("servant-composer")).toBeVisible({ timeout: 30_000 });

    const proposeEligibility = page.waitForResponse((response) => {
      if (new URL(response.url()).pathname !== "/bff/agora/interactions/participants:eligible") return false;
      if (response.request().method() !== "POST") return false;
      try { return record(response.request().postDataJSON()).mode === "propose_action"; } catch { return false; }
    });
    await revealWorkshopComposerOptions(page);
    await page.getByTestId("mode-selector").click();
    await page.getByRole("option", { name: /Propose \(Candidate Measure\)/i }).click();
    const proposeEligibilityHttp = await proposeEligibility;
    expect(proposeEligibilityHttp.ok()).toBe(true);
    const proposeEligibilityBody = record(data(await proposeEligibilityHttp.json()));
    const proposedParticipants = items({ data: { items: proposeEligibilityBody.included } });
    expect(proposedParticipants.length).toBeGreaterThanOrEqual(1);
    expect(proposedParticipants.some((row) => row.persona_id === ENSURED_PERSONA_ID)).toBe(true);
    await expect(page.getByTestId("eligibility-explanation")).toContainText(
      /(?:up to )?[1-9]\d* canonical eligible selected/i,
    );

    const topic = `Hosted governed candidate ${randomUUID()}`;
    await page.getByTestId("servant-composer-input").fill(topic);
    const submitResponse = page.waitForResponse((response) =>
      new URL(response.url()).pathname === "/bff/agora/interactions"
      && response.request().method() === "POST",
    );
    await expect(page.getByTestId("servant-composer-submit")).toBeEnabled({ timeout: 30_000 });
    await page.getByTestId("servant-composer-submit").click();
    const submittedHttp = await submitResponse;
    expect(submittedHttp.ok(), await submittedHttp.text()).toBe(true);
    const submitted = record(data(await submittedHttp.json()));
    const submittedRequest = record(submittedHttp.request().postDataJSON());
    expect(Array.isArray(submittedRequest.participant_persona_ids)).toBe(true);
    expect(submittedRequest.participant_persona_ids).toContain(ENSURED_PERSONA_ID);
    expect(submitted.participants).toContain(ENSURED_PERSONA_ID);
    expect(submitted.execution_authority).toBe("none");
    expect(record(submitted.proposal).execution_authority).toBe("none");
    const proposalId = String(submitted.proposal_id ?? "");
    expect(proposalId).not.toBe("");

    await expect.poll(async () => {
      const cardsResponse = await request.get(`${BFF_BASE}/bff/agora/workshops/${encodeURIComponent(target.workshopId)}/cards`, {
        headers: headers(OPERATOR_TOKEN),
      });
      if (!cardsResponse.ok()) return false;
      return items(await cardsResponse.json()).some((card) =>
        card.card_type === "governed_proposal" && JSON.stringify(card.payload ?? {}).includes(proposalId));
    }, { timeout: 60_000 }).toBe(true);

    let canonical = await readProposal(request, OPERATOR_TOKEN, proposalId);
    expect(canonical.etag).not.toBe("");
    expect(canonical.proposal.execution_authority).toBe("none");
    expect(canonical.proposal.target_kind).toBe("strategy");
    expect(canonical.proposal.target_id).toBe(target.strategyId);
    expect(canonical.proposal.target_version).toBe(target.strategyVersion);
    expect(canonical.proposal.proposer).toBe(operatorId);
    expect(canonical.proposal.approval_decision_refs_authority).toBe("canonical_read_store");

    await page.reload();
    const proposalCard = page.getByTestId(`governed-proposal-${proposalId}`);
    await expect(proposalCard).toBeVisible({ timeout: 60_000 });
    const modify = proposalCard.getByRole("button", { name: "Modify" });
    if (await modify.isEnabled()) {
      await modify.click();
      await proposalCard.getByLabel("Proposed value").fill(JSON.stringify({
        ...record(canonical.proposal.proposed_value),
        hosted_proof_note: topic,
      }));
      const modifiedResponse = page.waitForResponse((response) => {
        if (!new URL(response.url()).pathname.endsWith(`/bff/agora/proposals/${proposalId}/actions`)) return false;
        try { return record(response.request().postDataJSON()).action === "modify"; } catch { return false; }
      });
      await proposalCard.getByRole("button", { name: "Save new revision" }).click();
      const response = await modifiedResponse;
      expect(response.ok(), await response.text()).toBe(true);
      canonical = { etag: response.headers().etag ?? "", proposal: record(data(await response.json())) };
    } else {
      test.info().annotations.push({
        type: "governed-proposal-api-ui-split",
        description: `Modify UI unavailable: ${await modify.getAttribute("title") ?? "no disabled reason"}`,
      });
      canonical = await actOnProposal(request, OPERATOR_TOKEN, proposalId, canonical.etag, {
        action: "modify",
        reason: "Hosted no-authority proposal revision proof",
        proposed_value: { ...record(canonical.proposal.proposed_value), hosted_proof_note: topic },
      });
    }
    expect(canonical.proposal.state).toBe("draft");
    expect(canonical.proposal.execution_authority).toBe("none");

    test.info().annotations.push({
      type: "governed-proposal-api-ui-split",
      description: "Validate uses the governed API because the card accepts only an authoritative validation artifact and does not synthesize one in the browser.",
    });
    canonical = await actOnProposal(request, OPERATOR_TOKEN, proposalId, canonical.etag, {
      action: "validate",
      reason: "Hosted bounded validation proof; no execution authority",
      validation_result: { valid: true, status: "passed", errors: [], warnings: [] },
    });
    expect(canonical.proposal.state).toBe("validated");
    expect(canonical.proposal.execution_authority).toBe("none");

    canonical = await readProposal(request, OPERATOR_TOKEN, proposalId);
    expect(canonical.proposal.state).toBe("validated");
    expect(canonical.proposal.execution_authority).toBe("none");
    expect(canonical.proposal.proposer).toBe(operatorId);
    expect(Array.isArray(canonical.proposal.available_approval_decision_refs)).toBe(true);
    expect(record(canonical.proposal.approval_decision_readiness).ready === true
      || typeof record(canonical.proposal.approval_decision_readiness).reason === "string").toBe(true);

    await page.reload();
    const canonicalCard = page.getByTestId(`governed-proposal-${proposalId}`);
    await expect(canonicalCard).toContainText(/revision/i, { timeout: 60_000 });
    const approve = canonicalCard.getByRole("button", { name: "approve" });
    await expect(approve).toBeDisabled();
    await expect(canonicalCard.getByTestId("proposal-approval-disabled-reason")).toContainText(
      /self-approval|authoritative|required|reviewer/i,
    );
  });

  test("viewer sees a disabled reason and cannot produce an interaction POST", async ({ page, request }) => {
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
    await installOidcDevLogin(page, {
      goto: false,
      pageBaseUrl: FE_BASE,
      roles: viewerRoles,
      tenantId: TENANT_ID,
      token: VIEWER_TOKEN,
    });
    await openPersonaDetail(page, persona);
    await expect(page.getByRole("button", { name: "Talk to" })).toBeDisabled();
    await expect(page.getByTestId("persona-interaction-disabled-reason")).toContainText(/requires|disabled|eligible/i);
    expect(browserInteractionPosts).toEqual([]);

    const denied = await request.post(`${BFF_BASE}/bff/agora/interactions/context:resolve`, {
      headers: headers(VIEWER_TOKEN, { "Idempotency-Key": `viewer-denied-${randomUUID()}` }),
      data: { context_refs: [{ type: "persona", id: persona.id }], environment: "paper" },
    });
    expect(denied.status()).toBe(403);
    expect(browserInteractionPosts).toEqual([]);
  });
});
