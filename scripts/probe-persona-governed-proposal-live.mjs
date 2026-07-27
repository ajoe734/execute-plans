#!/usr/bin/env node
/**
 * Task-scoped hosted proof for the PINT-010-R2 governed-proposal boundary.
 *
 * The probe is opt-in because it creates one paper-only proposal in Pantheon
 * dev. It never approves or executes the proposal, and it records no tokens.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const BFF_BASE_URL = (
  process.env.PANTHEON_BFF_BASE_URL ||
  "https://pantheon-lupin-dev-bff.35.201.204.12.sslip.io"
).replace(/\/$/u, "");
const TENANT_ID = process.env.PANTHEON_PINT_TENANT_ID || "pantheon-dev";
const OPERATOR_TOKEN =
  process.env.PANTHEON_PINT_OPERATOR_TOKEN || "pantheon-dev-browser:operator";
const VIEWER_TOKEN =
  process.env.PANTHEON_PINT_VIEWER_TOKEN || "pantheon-dev-browser:viewer";
const EXPECTED_BFF_SHA = (process.env.PANTHEON_EXPECTED_BFF_SHA || "").trim();
const AUDIT_DIR = process.env.PANTHEON_AUDIT_OUT_DIR || ".lovable/audits/current-run";
const DEV_BFF_HOST = "pantheon-lupin-dev-bff.35.201.204.12.sslip.io";

function truthy(value) {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function errorCode(payload) {
  return payload?.error?.code ?? payload?.detail?.error?.code ?? payload?.detail?.code ?? null;
}

function data(payload) {
  return payload?.data ?? payload;
}

async function request(route, { body, headers = {}, method = "GET", token } = {}) {
  const response = await fetch(new URL(route, `${BFF_BASE_URL}/`), {
    method,
    headers: {
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "X-Tenant-Id": TENANT_ID,
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text.slice(0, 300) };
  }
  return {
    etag: response.headers.get("etag"),
    payload,
    status: response.status,
  };
}

function expectStatus(result, expected, label) {
  assert(
    result.status === expected,
    `${label}: expected HTTP ${expected}, got ${result.status}: ${JSON.stringify(result.payload)}`,
  );
}

function expectForbidden(result, label) {
  expectStatus(result, 403, label);
  assert(errorCode(result.payload) === "FORBIDDEN", `${label}: missing Pack-D FORBIDDEN envelope`);
}

function expectAuthRequired(result, label) {
  expectStatus(result, 401, label);
  assert(
    errorCode(result.payload) === "AUTH_REQUIRED",
    `${label}: expected Pack-D AUTH_REQUIRED, got ${JSON.stringify(result.payload)}`,
  );
}

function writeEvidence(result) {
  fs.mkdirSync(AUDIT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/gu, "").replace(/-/gu, "");
  const jsonPath = path.join(AUDIT_DIR, `pint-010-r2-governed-proposal-${stamp}.json`);
  const mdPath = path.join(AUDIT_DIR, `pint-010-r2-governed-proposal-${stamp}.md`);
  fs.writeFileSync(jsonPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  const markdown = [
    "# PINT-010-R2 hosted governed-proposal smoke",
    "",
    `- generated_at: ${result.generatedAt}`,
    `- bff: ${result.bffBaseUrl}`,
    `- bff_commit: ${result.bffCommit}`,
    `- proposal_id: ${result.proposalId}`,
    `- unauthenticated_create_status: ${result.unauthenticatedCreateStatus}`,
    `- unauthenticated_create_code: ${result.unauthenticatedCreateCode}`,
    `- viewer_create_status: ${result.viewerCreateStatus}`,
    `- viewer_modify_status: ${result.viewerModifyStatus}`,
    `- operator_create_status: ${result.operatorCreateStatus}`,
    `- operator_modify_status: ${result.operatorModifyStatus}`,
    `- operator_validate_status: ${result.operatorValidateStatus}`,
    `- final_revision: ${result.finalRevision}`,
    `- revision_history: ${result.revisions.join(", ")}`,
    `- audit_actions: ${result.auditActions.join(", ")}`,
    `- idempotent_replay_revision: ${result.replayRevision}`,
    `- execution_authority: ${result.executionAuthority}`,
    "- tokens_recorded: false",
    "- downstream_execution_attempted: false",
    "",
    "PASS: unauthenticated creation failed with Pack-D 401 AUTH_REQUIRED; viewer writes failed with Pack-D 403; the operator created, modified, and paper-validated a durable proposal; authenticated readback returned exactly three revisions and create/modify/validate audit events; idempotent replay added no revision.",
    "",
  ].join("\n");
  fs.writeFileSync(mdPath, markdown, "utf8");
  return { jsonPath, mdPath };
}

async function main() {
  assert(
    truthy(process.env.PANTHEON_PINT_PROBE_ALLOW_WRITES),
    "Refusing to create a dev proposal without PANTHEON_PINT_PROBE_ALLOW_WRITES=true",
  );
  const bffUrl = new URL(BFF_BASE_URL);
  assert(
    bffUrl.hostname === DEV_BFF_HOST || truthy(process.env.PANTHEON_PINT_ALLOW_NONSTANDARD_DEV_HOST),
    `Refusing task-scoped writes outside the Pantheon dev BFF: ${bffUrl.hostname}`,
  );

  const version = await request("/bff/version");
  expectStatus(version, 200, "BFF version");
  const bffCommit = data(version.payload)?.source_commit_sha ?? data(version.payload)?.commit;
  assert(/^[0-9a-f]{40}$/u.test(String(bffCommit)), `BFF returned an invalid source SHA: ${bffCommit}`);
  if (EXPECTED_BFF_SHA) {
    assert(bffCommit === EXPECTED_BFF_SHA, `BFF SHA mismatch: expected ${EXPECTED_BFF_SHA}, got ${bffCommit}`);
  }

  const viewerMe = await request("/bff/me", { token: VIEWER_TOKEN });
  const operatorMe = await request("/bff/me", { token: OPERATOR_TOKEN });
  expectStatus(viewerMe, 200, "viewer identity");
  expectStatus(operatorMe, 200, "operator identity");
  assert(data(viewerMe.payload)?.roles?.includes("viewer"), "viewer token did not resolve to viewer");
  assert(data(operatorMe.payload)?.roles?.includes("operator"), "operator token did not resolve to operator");

  const probeId = `pint-010-r2-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const createKey = `${probeId}-create`;
  const proposal = {
    proposal_type: "strategy_patch",
    target_kind: "strategy",
    target_id: `strategy-${probeId}`,
    target_version: "pint-010-r2-v1",
    current_value: { liquidity_limit: 3 },
    proposed_value: { liquidity_limit: 2 },
    rationale: "Task-scoped paper-only hosted governance proof",
    evidence_refs: [`evidence:${probeId}`],
    confidence: 0.81,
    expected_benefit: "Reduce paper liquidity exposure before review",
    adverse_scenarios: ["Paper validation rejects the smaller limit"],
    environment_ceiling: "paper",
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    validation_plan: { environment: "paper", execution_attempted: false },
    rollback_trigger: "Paper validation fails",
    rollback_action: "Retain the existing strategy version",
    required_permissions: ["strategy.review"],
    required_reviewers: ["risk"],
    human_gate: true,
    consultation_refs: [`consultation:${probeId}`],
  };

  const unauthenticatedCreate = await request("/bff/agora/proposals", {
    body: proposal,
    headers: { "Idempotency-Key": `${probeId}-unauthenticated-create` },
    method: "POST",
  });
  expectAuthRequired(unauthenticatedCreate, "unauthenticated proposal create");

  const viewerCreate = await request("/bff/agora/proposals", {
    body: proposal,
    headers: { "Idempotency-Key": `${probeId}-viewer-create` },
    method: "POST",
    token: VIEWER_TOKEN,
  });
  expectForbidden(viewerCreate, "viewer proposal create");

  const created = await request("/bff/agora/proposals", {
    body: proposal,
    headers: { "Idempotency-Key": createKey },
    method: "POST",
    token: OPERATOR_TOKEN,
  });
  expectStatus(created, 201, "operator proposal create");
  assert(created.etag, "operator proposal create did not return ETag");
  const proposalId = data(created.payload)?.proposal_id;
  assert(proposalId, "operator proposal create did not return proposal_id");

  const modifyBody = {
    action: "modify",
    reason: "Apply red-team paper liquidity limit",
    proposed_value: { liquidity_limit: 1 },
  };
  const viewerModify = await request(`/bff/agora/proposals/${proposalId}/actions`, {
    body: modifyBody,
    headers: { "If-Match": created.etag },
    method: "POST",
    token: VIEWER_TOKEN,
  });
  expectForbidden(viewerModify, "viewer proposal modify");

  const modified = await request(`/bff/agora/proposals/${proposalId}/actions`, {
    body: modifyBody,
    headers: { "If-Match": created.etag },
    method: "POST",
    token: OPERATOR_TOKEN,
  });
  expectStatus(modified, 200, "operator proposal modify");
  assert(modified.etag, "operator proposal modify did not return ETag");
  assert(data(modified.payload)?.revision === 2, "operator proposal modify did not create revision 2");

  const validated = await request(`/bff/agora/proposals/${proposalId}/actions`, {
    body: {
      action: "validate",
      reason: "Paper checks passed without execution",
      validation_result: {
        status: "passed",
        environment: "paper",
        execution_attempted: false,
      },
    },
    headers: { "If-Match": modified.etag },
    method: "POST",
    token: OPERATOR_TOKEN,
  });
  expectStatus(validated, 200, "operator proposal validate");
  assert(data(validated.payload)?.revision === 3, "operator validation did not create revision 3");

  const readback = await request(`/bff/agora/proposals/${proposalId}`, { token: OPERATOR_TOKEN });
  const revisions = await request(`/bff/agora/proposals/${proposalId}/revisions`, {
    token: OPERATOR_TOKEN,
  });
  expectStatus(readback, 200, "proposal readback");
  expectStatus(revisions, 200, "proposal revision readback");
  const latest = data(readback.payload);
  const history = data(revisions.payload);
  const revisionNumbers = history.map((row) => row.revision);
  const auditActions = latest.audit.map((event) => event.action);
  assert(JSON.stringify(revisionNumbers) === JSON.stringify([1, 2, 3]), `revision history mismatch: ${revisionNumbers}`);
  assert(JSON.stringify(auditActions) === JSON.stringify(["create", "modify", "validate"]), `audit actions mismatch: ${auditActions}`);

  const replay = await request("/bff/agora/proposals", {
    body: proposal,
    headers: { "Idempotency-Key": createKey },
    method: "POST",
    token: OPERATOR_TOKEN,
  });
  expectStatus(replay, 201, "idempotent proposal replay");
  assert(data(replay.payload)?.proposal_id === proposalId, "idempotent replay returned a different proposal");
  assert(data(replay.payload)?.revision === 3, "idempotent replay did not return the latest revision");

  const result = {
    auditActions,
    bffBaseUrl: BFF_BASE_URL,
    bffCommit,
    downstreamExecutionAttempted: false,
    executionAuthority: latest.governed_action_link?.execution_authority ?? "none",
    finalRevision: latest.revision,
    generatedAt: new Date().toISOString(),
    operatorCreateStatus: created.status,
    operatorModifyStatus: modified.status,
    operatorValidateStatus: validated.status,
    proposalId,
    replayRevision: data(replay.payload)?.revision,
    revisions: revisionNumbers,
    tokensRecorded: false,
    unauthenticatedCreateCode: errorCode(unauthenticatedCreate.payload),
    unauthenticatedCreateStatus: unauthenticatedCreate.status,
    viewerCreateStatus: viewerCreate.status,
    viewerModifyStatus: viewerModify.status,
  };
  const evidence = writeEvidence(result);
  console.log(`[pint-governance] PASS proposal=${proposalId} bff=${bffCommit}`);
  console.log(`[pint-governance] Evidence: ${evidence.mdPath}`);
}

main().catch((error) => {
  console.error(`[pint-governance] FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
