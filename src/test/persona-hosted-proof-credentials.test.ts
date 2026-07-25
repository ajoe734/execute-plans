import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const validator = resolve(
  process.cwd(),
  "scripts/validate-persona-hosted-proof-env.mjs",
);

function jwt(subject: string, expiresAt: number): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode({ sub: subject, exp: expiresAt })}.proof-signature`;
}

function validate(operator: string, viewer: string) {
  return spawnSync(process.execPath, [validator], {
    encoding: "utf8",
    env: {
      ...process.env,
      PANTHEON_BFF_RBAC_TOKENS_JSON: "",
      PANTHEON_PERSONA_INTERACTION_OPERATOR_TOKEN: operator,
      PANTHEON_PERSONA_INTERACTION_VIEWER_TOKEN: viewer,
      PANTHEON_FE_BASE_URL: "https://pantheon-lupin-dev-fe.35.201.204.12.sslip.io",
      PANTHEON_BFF_BASE_URL: "https://pantheon-lupin-dev-bff.35.201.204.12.sslip.io",
    },
  });
}

describe("Persona hosted proof credential validation", () => {
  it("accepts distinct JWT subjects with enough lifetime", () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    const result = validate(jwt("operator-proof", expiresAt), jwt("viewer-proof", expiresAt));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("prerequisites are available");
  });

  it("rejects stub credentials without echoing them", () => {
    const operator = "operator-secret-stub";
    const viewer = "viewer-secret-stub";
    const result = validate(operator, viewer);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("not a JWT bearer");
    expect(`${result.stdout}${result.stderr}`).not.toContain(operator);
    expect(`${result.stdout}${result.stderr}`).not.toContain(viewer);
  });

  it("rejects credentials that can expire during the bounded proof", () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 1200;
    const result = validate(jwt("operator-proof", expiresAt), jwt("viewer-proof", expiresAt));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("does not cover the bounded hosted proof window");
  });

  it("rejects one credential reused for operator and viewer", () => {
    const token = jwt("shared-proof", Math.floor(Date.now() / 1000) + 3600);
    const result = validate(token, token);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("must bind distinct subjects");
  });
});
