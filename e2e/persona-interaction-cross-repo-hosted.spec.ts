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

async function discoverPersona(request: APIRequestContext, token: string): Promise<{ id: string; name: string }> {
  const response = await request.get(`${BFF_BASE}/bff/management/persona-fleet?page_size=100`, {
    headers: headers(token),
  });
  expect(response.ok(), `Persona Fleet discovery returned ${response.status()}`).toBe(true);
  const rows = items(await response.json());
  const row = rows.find((candidate) => {
    const id = String(candidate.id ?? candidate.persona_id ?? candidate.personaId ?? "").trim();
    const state = String(candidate.lifecycle_state ?? candidate.state ?? "active").toLowerCase();
    return Boolean(id) && !["retired", "archived", "suspended"].includes(state);
  });
  expect(row, "hosted BFF must expose an active Persona for the interaction proof").toBeTruthy();
  const id = String(row?.id ?? row?.persona_id ?? row?.personaId);
  return { id, name: String(row?.name ?? row?.persona_name ?? row?.personaName ?? id) };
}

async function discoverImmutableStrategyWorkshop(request: APIRequestContext, token: string): Promise<{
  strategyId: string;
  strategyVersion: string;
  workshopId: string;
}> {
  const response = await request.get(`${BFF_BASE}/bff/agora/workshops?limit=100`, { headers: headers(token) });
  expect(response.ok(), `Workshop discovery returned ${response.status()}`).toBe(true);
  const candidates = items(await response.json())
    .filter((candidate) => String(candidate.status ?? "open") === "open")
    .map((candidate) => ({
      strategyId: String(candidate.active_strategy_spec_registry_id ?? "").trim(),
      strategyVersion: String(candidate.selected_version_id ?? "").trim(),
      workshopId: String(candidate.workshop_id ?? "").trim(),
    }))
    .filter((candidate) => candidate.strategyId && candidate.strategyVersion && candidate.workshopId)
    .sort((left, right) => left.workshopId.localeCompare(right.workshopId));
  expect(candidates[0], "No operator-owned open Workshop exposes both canonical strategy registry and immutable selected-version pointers.").toBeTruthy();
  return candidates[0];
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

test.describe("Persona Detail → canonical Workshop cross-repo proof", () => {
  test.skip(!FE_BASE || !BFF_BASE, "requires hosted Pantheon FE and BFF URLs");

  test("operator resolves, checks eligibility, submits no-authority interaction, reads it back, and returns", async ({ page, request }) => {
    test.skip(!WRITE_PROOF || !OPERATOR_TOKEN, "requires explicit write-proof opt-in and operator token");
    test.setTimeout(180_000);
    const meResponse = await request.get(`${BFF_BASE}/bff/me`, { headers: headers(OPERATOR_TOKEN) });
    expect(meResponse.ok(), `/bff/me returned ${meResponse.status()}`).toBe(true);
    const me = record(data(await meResponse.json()));
    const operatorRoles = rolesFromMe(me);
    expect(operatorRoles).toContain("operator");
    const session = record(me.session);
    expect(session.authenticated).not.toBe(false);
    expect(["bearer", "cookie"]).toContain(String(session.session_kind ?? session.sessionKind).toLowerCase());
    const persona = await discoverPersona(request, OPERATOR_TOKEN);
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
    const meResponse = await request.get(`${BFF_BASE}/bff/me`, { headers: headers(OPERATOR_TOKEN) });
    expect(meResponse.ok(), `operator /bff/me returned ${meResponse.status()}`).toBe(true);
    const operatorMe = record(data(await meResponse.json()));
    const operatorRoles = rolesFromMe(operatorMe);
    expect(operatorRoles).toContain("operator");
    const operatorId = String(operatorMe.operator_id ?? operatorMe.operatorId ?? "");
    expect(operatorId).not.toBe("");
    const target = await discoverImmutableStrategyWorkshop(request, OPERATOR_TOKEN);

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
    await page.getByTestId("mode-selector").click();
    await page.getByRole("option", { name: /Propose \(Candidate Measure\)/i }).click();
    expect((await proposeEligibility).ok()).toBe(true);

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
    const persona = await discoverPersona(request, VIEWER_TOKEN);
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
    expect([401, 403]).toContain(denied.status());
    expect(browserInteractionPosts).toEqual([]);
  });
});
