function normalizeRole(role) {
  return String(role || "").trim().toLowerCase().replaceAll("-", "_");
}

function normalizeToken(token) {
  const value = String(token || "").trim();
  return value.toLowerCase().startsWith("bearer ")
    ? value.slice("bearer ".length).trim()
    : value;
}

function roleTokens() {
  const tokens = {};
  const encoded = process.env.PANTHEON_BFF_RBAC_TOKENS_JSON || "";
  if (encoded.trim()) {
    try {
      const parsed = JSON.parse(encoded);
      for (const [role, token] of Object.entries(parsed)) {
        if (typeof token !== "string") continue;
        const normalized = normalizeToken(token);
        if (normalized) tokens[normalizeRole(role)] = normalized;
      }
    } catch {
      // Invalid matrix input is reported as a missing role below without
      // echoing any credential material.
    }
  }

  const explicit = {
    operator: process.env.PANTHEON_PERSONA_INTERACTION_OPERATOR_TOKEN || process.env.PANTHEON_BFF_OPERATOR_TOKEN,
    viewer: process.env.PANTHEON_PERSONA_INTERACTION_VIEWER_TOKEN || process.env.PANTHEON_BFF_VIEWER_TOKEN,
  };
  for (const [role, token] of Object.entries(explicit)) {
    const normalized = normalizeToken(token);
    if (normalized) tokens[role] = normalized;
  }
  return tokens;
}

const HOSTED_PROOF_MIN_CREDENTIAL_TTL_SECONDS = 1200;

function verifiedJwtIdentity(token, role) {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error(`${role} credential is not a JWT bearer.`);
  }
  let claims;
  try {
    claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    throw new Error(`${role} credential has invalid JWT claims.`);
  }
  const subject = typeof claims?.sub === "string" ? claims.sub.trim() : "";
  const expiresAt = Number(claims?.exp ?? 0);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!subject || !Number.isFinite(expiresAt)) {
    throw new Error(`${role} credential is missing a subject or expiry.`);
  }
  if (expiresAt <= nowSeconds + HOSTED_PROOF_MIN_CREDENTIAL_TTL_SECONDS) {
    throw new Error(
      `${role} credential does not cover the bounded hosted proof window.`,
    );
  }
  return subject;
}

const tokens = roleTokens();
const missing = [];
if (!tokens.operator) missing.push("operator credential");
if (!tokens.viewer) missing.push("viewer credential");
if (!String(process.env.PANTHEON_FE_BASE_URL || "").trim()) missing.push("frontend URL");
if (!String(process.env.PANTHEON_BFF_BASE_URL || "").trim()) missing.push("BFF URL");

if (missing.length > 0) {
  console.error(`Hosted Persona write proof is missing: ${missing.join(", ")}.`);
  process.exit(1);
}

let operatorSubject;
let viewerSubject;
try {
  operatorSubject = verifiedJwtIdentity(tokens.operator, "operator");
  viewerSubject = verifiedJwtIdentity(tokens.viewer, "viewer");
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message
      : "Hosted Persona credentials failed JWT validation.",
  );
  process.exit(1);
}
if (operatorSubject === viewerSubject) {
  console.error("Hosted Persona operator and viewer credentials must bind distinct subjects.");
  process.exit(1);
}

console.log("Hosted Persona write-proof prerequisites are available.");
