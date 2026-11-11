import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(resolve(process.cwd(), ".github/workflows/pantheon-integration-gate.yml"), "utf8");
const gate = workflow.slice(workflow.indexOf("\n  integration-gate:"), workflow.indexOf("\n  authorized-write-proof:"));
const step = (id: string) => {
  const start = gate.indexOf(`        id: ${id}\n`);
  expect(start, id).toBeGreaterThan(-1);
  return gate.slice(start, gate.indexOf("\n      - name:", start));
};

describe("integration-gate trusted read-only auth wiring", () => {
  it("keeps job env credential-free and never exports the token via GITHUB_ENV", () => {
    const jobEnv = gate.slice(0, gate.indexOf("    steps:"));
    expect(jobEnv).not.toMatch(/BFF_AUTH_TOKEN|DEV_LOGIN/);
    expect(step("ro_auth")).not.toContain("GITHUB_ENV");
    expect(step("ro_auth")).toContain("steps.ro_auth_gate.outputs.eligible == 'true'");
  });
  it("gates on exact dev + active parent controller and verifies server /bff/me", () => {
    const g = step("ro_auth_gate");
    for (const needle of ['refs/heads/dev', 'workflow_dispatch', 'heads/dev', 'nonprod-deploy.yml', 'in_progress']) expect(g).toContain(needle);
    expect(step("ro_auth")).toContain("/bff/me");
    expect(step("ro_auth")).toContain("/bff/auth/dev-login");
  });
  it("injects the token only into the read-only probe steps, never write-proof steps", () => {
    for (const id of ["route_load", "mgmt_hosted_accept", "e2e"]) expect(step(id)).toContain("steps.ro_auth.outputs.token");
    expect((gate.match(/steps\.ro_auth\.outputs\.token/g) ?? []).length).toBe(3);
    expect(step("pint_hosted_e2e")).not.toContain("ro_auth");
  });
});
