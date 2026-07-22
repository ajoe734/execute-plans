import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const deployScriptPath = resolve(root, "scripts/deploy-dev-vm.sh");
const deployScript = readFileSync(deployScriptPath, "utf8");
const integrationWorkflow = readFileSync(
  resolve(root, ".github/workflows/pantheon-integration-gate.yml"),
  "utf8",
);
const hostedPersonaSpec = readFileSync(
  resolve(root, "e2e/25-persona-fleet-live-linked-pages.spec.ts"),
  "utf8",
);

function rejectedDeploy(extraEnv: Record<string, string>) {
  return spawnSync("bash", [deployScriptPath], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      PANTHEON_DEPLOY_ALLOW_DIRTY: "true",
      ...extraEnv,
    },
  });
}

describe("Pantheon dev frontend deploy safety boundary", () => {
  it("builds only with the canonical public viewer and safe write flags", () => {
    expect(deployScript).toContain(
      'CANONICAL_PUBLIC_VIEWER_TOKEN="pantheon-dev-browser:viewer"',
    );
    expect(deployScript).toContain(
      'DEV_BEARER_TOKEN="${VITE_BFF_DEV_BEARER_TOKEN:-${CANONICAL_PUBLIC_VIEWER_TOKEN}}"',
    );
    expect(deployScript).toContain('REAL_WRITES="${PANTHEON_DEPLOY_REAL_WRITES:-false}"');
    expect(deployScript).toContain(
      'ALLOW_DEV_STUB_WRITES="${PANTHEON_DEPLOY_ALLOW_DEV_STUB_WRITES:-false}"',
    );
    expect(deployScript).toContain('VITE_BFF_REAL_WRITES="${REAL_WRITES}"');
    expect(deployScript).toContain(
      'VITE_BFF_ALLOW_DEV_STUB_WRITES="${ALLOW_DEV_STUB_WRITES}"',
    );
    expect(deployScript).not.toMatch(/pantheon-dev-browser:operator/u);
    expect(deployScript).not.toMatch(/VITE_BFF_REAL_WRITES=true/u);
    expect(deployScript).not.toMatch(/VITE_BFF_ALLOW_DEV_STUB_WRITES=true/u);
    expect(deployScript).toContain(
      'VITE_BFF_REAL_WRITES: process.env.PANTHEON_DEPLOY_REAL_WRITES',
    );
    expect(deployScript).toContain(
      'VITE_BFF_ALLOW_DEV_STUB_WRITES: process.env.PANTHEON_DEPLOY_ALLOW_DEV_STUB_WRITES',
    );
    expect(integrationWorkflow.match(
      /VITE_BFF_DEV_BEARER_TOKEN: pantheon-dev-browser:viewer/gu,
    )).toHaveLength(2);
  });

  it("keeps every post-deploy acceptance probe read-only", () => {
    expect(deployScript).toContain("scripts/probe-hosted-browser-bff.mjs");
    expect(deployScript).toContain("e2e/25-persona-fleet-live-linked-pages.spec.ts");
    expect(deployScript).not.toContain("scripts/probe-hosted-management-writes.mjs");
    expect(hostedPersonaSpec).toContain(
      'const PUBLIC_VIEWER_TOKEN = "pantheon-dev-browser:viewer"',
    );
    expect(hostedPersonaSpec).toContain('roles: ["viewer"]');
    expect(hostedPersonaSpec).toContain("token: PUBLIC_VIEWER_TOKEN");
  });

  it("fails closed on a non-canonical token without echoing it", () => {
    const sentinel = "sentinel-privileged-token-must-not-leak";
    const result = rejectedDeploy({ VITE_BFF_DEV_BEARER_TOKEN: sentinel });

    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/non-canonical browser bearer token/u);
    expect(`${result.stdout}${result.stderr}`).not.toContain(sentinel);
  });

  it.each([
    { PANTHEON_DEPLOY_REAL_WRITES: "true" },
    { PANTHEON_DEPLOY_ALLOW_DEV_STUB_WRITES: "true" },
  ])("fails closed when a runner attempts to enable writes: %j", (extraEnv) => {
    const result = rejectedDeploy(extraEnv);

    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/deployment is read-only/u);
  });
});
