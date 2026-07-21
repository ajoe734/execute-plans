#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const bffBase = String(process.env.PANTHEON_BFF_BASE_URL ?? "").replace(
  /\/+$/,
  "",
);
const expectedBffSha = String(process.env.PANTHEON_EXPECTED_BFF_SHA ?? "")
  .trim()
  .toLowerCase();
const operatorToken = String(
  process.env.PANTHEON_PERSONA_INTERACTION_OPERATOR_TOKEN ?? "",
).trim();
const tenantId = String(
  process.env.PANTHEON_TENANT_ID ?? "tenant-dev",
).trim();
const correlationId = String(
  process.env.PANTHEON_PROOF_CORRELATION_ID ?? "",
).trim();
const githubEnv = String(process.env.GITHUB_ENV ?? "").trim();
const auditDir = String(
  process.env.PANTHEON_AUDIT_OUT_DIR ??
    ".lovable/audits/authorized-write-proof",
).trim();

if (
  !bffBase ||
  !operatorToken ||
  !tenantId ||
  !correlationId ||
  !githubEnv ||
  !/^[0-9a-f]{40}$/u.test(expectedBffSha)
) {
  throw new Error(
    "Servant proof preflight requires BFF URL, operator credential, tenant, correlation, and GITHUB_ENV.",
  );
}

function stableUuid(value) {
  const bytes = Buffer.from(
    createHash("sha256").update(value).digest().subarray(0, 16),
  );
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function data(value) {
  return record(value).data ?? value;
}

function proofHeaders(requestId, extra = {}) {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${operatorToken}`,
    "X-Request-Id": requestId,
    "X-Tenant-Id": tenantId,
    ...extra,
  };
}

function safeDiagnosticValue(value) {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(normalized)
    ? normalized
    : undefined;
}

function safeErrorDiagnostics(responseStatus, parsed) {
  const payload = record(parsed);
  const detail = record(payload.detail);
  const error = record(
    payload.error ??
      detail.error ??
      (Object.keys(detail).length > 0 ? detail : payload),
  );
  const details = record(error.details);
  const errorCode =
    safeDiagnosticValue(error.error_code) ?? safeDiagnosticValue(error.code);
  const preconditionFailed = safeDiagnosticValue(
    details.precondition_failed,
  );
  return {
    http_status: responseStatus,
    ...(errorCode ? { error_code: errorCode } : {}),
    ...(preconditionFailed
      ? { precondition_failed: preconditionFailed }
      : {}),
  };
}

async function responseJson(response, label) {
  const text = await response.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = {};
  }
  if (!response.ok) {
    const diagnostics = safeErrorDiagnostics(response.status, parsed);
    throw new Error(`${label} failed: ${JSON.stringify(diagnostics)}.`);
  }
  return parsed;
}

const devBffHost = "pantheon-lupin-dev-bff.35.201.204.12.sslip.io";
const bffUrl = new URL(bffBase);
if (bffUrl.protocol !== "https:" || bffUrl.hostname !== devBffHost) {
  throw new Error(
    "Servant proof preflight is restricted to the exact Pantheon dev BFF host.",
  );
}

const versionRequestId = randomUUID();
const versionResponse = await fetch(`${bffBase}/bff/version`, {
  headers: proofHeaders(versionRequestId),
});
const version = record(
  data(await responseJson(versionResponse, "BFF version preflight")),
);
const posture = record(version.config_posture);
if (
  String(version.source_commit_sha ?? "").toLowerCase() !== expectedBffSha ||
  version.environment !== "dev" ||
  posture.auth_stub !== false ||
  posture.auth_mode !== "strict"
) {
  throw new Error(
    "Servant proof preflight rejected the BFF identity or write-proof auth posture.",
  );
}

const meRequestId = randomUUID();
const meResponse = await fetch(`${bffBase}/bff/me`, {
  headers: proofHeaders(meRequestId),
});
const me = record(
  data(await responseJson(meResponse, "Operator identity preflight")),
);
const roles = Array.isArray(me.roles)
  ? me.roles.map((role) => String(role).trim().toLowerCase())
  : [];
const operatorId = String(me.operator_id ?? me.operatorId ?? "").trim();
const session = record(me.session);
const sessionKind = String(
  session.session_kind ?? session.sessionKind ?? me.session_kind ?? me.sessionKind ?? "",
).trim().toLowerCase();
const boundIdentityIds = [me.user, me.current_user, me.currentUser]
  .map(record)
  .map((identity) =>
    String(
      identity.operator_id ?? identity.operatorId ?? identity.id ?? "",
    ).trim(),
  )
  .filter(Boolean);
if (
  !operatorId ||
  !roles.includes("operator") ||
  session.authenticated !== true ||
  sessionKind !== "bearer" ||
  boundIdentityIds.length === 0 ||
  boundIdentityIds.some((identityId) => identityId !== operatorId)
) {
  throw new Error(
    "Servant proof preflight requires an authenticated operator session.",
  );
}

const readinessRequestId = randomUUID();
const readinessResponse = await fetch(`${bffBase}/bff/auth/readiness`, {
  headers: proofHeaders(readinessRequestId),
});
const readiness = record(
  data(await responseJson(readinessResponse, "Operator readiness preflight")),
);
const readinessAuth = record(readiness.auth);
const readinessIdentity = record(readiness.identity);
if (
  String(readiness.sourceCommitSha ?? readiness.source_commit_sha ?? "").toLowerCase() !== expectedBffSha ||
  readiness.authReady !== true ||
  readinessAuth.strict !== true ||
  readinessAuth.stub !== false ||
  String(readinessAuth.sessionKind ?? readinessAuth.session_kind ?? "").toLowerCase() !== "bearer" ||
  readinessAuth.operatorRoleReady !== true ||
  readinessAuth.interactionCapabilityReady !== true ||
  String(readinessIdentity.operatorId ?? readinessIdentity.operator_id ?? "").trim() !== operatorId
) {
  throw new Error(
    "Servant proof preflight rejected strict operator readiness for the exact BFF release.",
  );
}

const idempotencyKey = stableUuid(
  `pantheon-persona-hosted-proof:v1:${tenantId}:${operatorId}`,
);
const requestId = randomUUID();
const response = await fetch(`${bffBase}/bff/agora/servant/ensure`, {
  method: "POST",
  headers: proofHeaders(requestId, {
    "Content-Type": "application/json",
    "Idempotency-Key": idempotencyKey,
  }),
  body: JSON.stringify({
    display_name: "Pantheon Hosted Proof Servant",
    locale: "en-US",
    timezone: "UTC",
  }),
});

const parsed = await responseJson(response, "Servant proof preflight");

const profile = record(record(parsed).data ?? parsed);
const policy = record(profile.policy);
const personaId = String(profile.persona_id ?? "").trim();
if (!personaId || /[\r\n]/u.test(personaId)) {
  throw new Error(
    "Servant proof preflight returned an invalid Persona identity.",
  );
}
const contractChecks = [
  profile.persona_class === "agora_servant",
  profile.owner_scope === "user_private",
  profile.memory_scope === "private_user",
  policy.execution_authority === "none",
  policy.persona_registry_backed === true,
];
if (contractChecks.some((check) => !check)) {
  throw new Error(
    "Servant proof preflight returned a profile outside the user-private, no-authority contract.",
  );
}

await mkdir(auditDir, { recursive: true });
await writeFile(
  path.join(auditDir, "persona-servant-preflight.json"),
  `${JSON.stringify(
    {
      schemaVersion: "pantheon.persona-hosted-proof-servant.v1",
      requestId,
      versionRequestId,
      meRequestId,
      readinessRequestId,
      correlationId,
      expectedBffSha,
      idempotencyKey,
      tenantId,
      personaId,
      sessionKind,
      authReady: readiness.authReady,
      personaClass: profile.persona_class,
      ownerScope: profile.owner_scope,
      memoryScope: profile.memory_scope,
      executionAuthority: policy.execution_authority,
      registryBacked: policy.persona_registry_backed,
    },
    null,
    2,
  )}\n`,
  "utf8",
);
await appendFile(
  githubEnv,
  `PANTHEON_PERSONA_INTERACTION_PERSONA_ID=${personaId}\n`,
  "utf8",
);
process.stdout.write(
  "Ensured the stable user-private Persona for the authorized hosted proof.\n",
);
