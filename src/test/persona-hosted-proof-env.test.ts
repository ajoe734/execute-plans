import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const script = resolve(process.cwd(), "scripts/validate-persona-hosted-proof-env.mjs");

function hostedProofJwt(subject: string) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: subject, exp: expiresAt })}.test-signature`;
}

function validate(extraEnv: Record<string, string>) {
  return spawnSync("node", [script], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      PANTHEON_PERSONA_INTERACTION_OPERATOR_TOKEN: "",
      PANTHEON_PERSONA_INTERACTION_VIEWER_TOKEN: "",
      PANTHEON_BFF_OPERATOR_TOKEN: "",
      PANTHEON_BFF_VIEWER_TOKEN: "",
      PANTHEON_BFF_RBAC_TOKENS_JSON: "",
      PANTHEON_FE_BASE_URL: "https://frontend.example.test",
      PANTHEON_BFF_BASE_URL: "https://bff.example.test",
      ...extraEnv,
    },
  });
}

describe("hosted Persona proof prerequisites", () => {
  it("accepts an explicit operator and a viewer from the RBAC matrix", () => {
    const result = validate({
      PANTHEON_PERSONA_INTERACTION_OPERATOR_TOKEN: hostedProofJwt("operator-a"),
      PANTHEON_BFF_RBAC_TOKENS_JSON: JSON.stringify({ viewer: hostedProofJwt("viewer-a") }),
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("prerequisites are available");
  });

  it("normalizes role names and Bearer token values", () => {
    const result = validate({
      PANTHEON_BFF_RBAC_TOKENS_JSON: JSON.stringify({
        Operator: `Bearer ${hostedProofJwt("operator-b")}`,
        viewer: `Bearer ${hostedProofJwt("viewer-b")}`,
      }),
    });

    expect(result.status).toBe(0);
  });

  it("fails closed without a viewer and never prints credentials", () => {
    const result = validate({
      PANTHEON_PERSONA_INTERACTION_OPERATOR_TOKEN: "operator-must-not-leak",
      PANTHEON_BFF_RBAC_TOKENS_JSON: JSON.stringify({ admin: "admin-must-not-leak" }),
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("viewer credential");
    expect(`${result.stdout}${result.stderr}`).not.toContain("must-not-leak");
  });

  it("rejects non-string RBAC tokens exactly like the browser helper", () => {
    const result = validate({
      PANTHEON_PERSONA_INTERACTION_OPERATOR_TOKEN: "operator-secret",
      PANTHEON_BFF_RBAC_TOKENS_JSON: JSON.stringify({ viewer: { token: "viewer-must-not-leak" } }),
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("viewer credential");
    expect(`${result.stdout}${result.stderr}`).not.toContain("viewer-must-not-leak");
  });

  it("fails closed without both hosted URLs", () => {
    const result = validate({
      PANTHEON_PERSONA_INTERACTION_OPERATOR_TOKEN: "operator-secret",
      PANTHEON_PERSONA_INTERACTION_VIEWER_TOKEN: "viewer-secret",
      PANTHEON_FE_BASE_URL: "",
      PANTHEON_BFF_BASE_URL: "",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("frontend URL, BFF URL");
  });
});
