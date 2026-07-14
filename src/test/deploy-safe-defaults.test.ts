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
const deployWorkflow = readFileSync(
  resolve(root, ".github/workflows/pantheon-dev-fe-deploy.yml"),
  "utf8",
);
const hostedPersonaSpec = readFileSync(
  resolve(root, "e2e/25-persona-fleet-live-linked-pages.spec.ts"),
  "utf8",
);
const hostedBrowserProbe = readFileSync(
  resolve(root, "scripts/probe-hosted-browser-bff.mjs"),
  "utf8",
);

function rejectedDeploy(extraEnv: Record<string, string>) {
  return spawnSync("bash", [deployScriptPath], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      PANTHEON_DEPLOY_ALLOW_DIRTY: "true",
      VITE_BFF_DEV_BEARER_TOKEN: "",
      ...extraEnv,
    },
  });
}

describe("Pantheon dev frontend deploy safety boundary", () => {
  it("builds with no embedded bearer token and safe write flags", () => {
    expect(deployScript).toContain('DEV_BEARER_TOKEN="${VITE_BFF_DEV_BEARER_TOKEN:-}"');
    expect(deployScript).toContain('VITE_BFF_DEV_BEARER_TOKEN=""');
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
      'VITE_BFF_REAL_WRITES: process.env.PANTHEON_DEPLOY_REAL_WRITES || "false"',
    );
    expect(deployScript).toContain(
      'VITE_BFF_ALLOW_DEV_STUB_WRITES: process.env.PANTHEON_DEPLOY_ALLOW_DEV_STUB_WRITES || "false"',
    );
    expect(deployScript).toContain(
      'bffCommit: process.env.PANTHEON_DEPLOY_BFF_COMMIT || "unknown"',
    );
    expect(deployScript).toContain(
      "bffCommitEvidence: Boolean(process.env.PANTHEON_DEPLOY_BFF_COMMIT)",
    );
    expect(deployScript).not.toContain("27cd46529c29801db02818aafe4df723cc0f8666");
    expect(deployScript).not.toContain("pantheon-dev-browser:viewer");
    expect(integrationWorkflow.match(
      /VITE_BFF_DEV_BEARER_TOKEN: ""/gu,
    )).toHaveLength(2);
  });

  it("requires explicit BFF provenance for manual final-proof deployments", () => {
    expect(deployWorkflow).toContain("bff_commit:");
    expect(deployWorkflow).toContain("inputs.bff_commit || vars.PANTHEON_BFF_SHA || ''");
    expect(deployScript).toContain('BFF_COMMIT="${PANTHEON_DEPLOY_BFF_COMMIT:-}"');

    const result = rejectedDeploy({
      GITHUB_EVENT_NAME: "workflow_dispatch",
      PANTHEON_DEPLOY_BFF_COMMIT: "",
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/requires an exact Pantheon BFF commit SHA/u);
  });

  it("keeps every post-deploy acceptance probe read-only", () => {
    expect(deployScript).toContain("scripts/probe-hosted-browser-bff.mjs");
    expect(deployScript).not.toContain("npx playwright test");
    expect(deployScript).not.toContain("scripts/probe-hosted-management-writes.mjs");
    expect(hostedPersonaSpec).toContain('roleTokenFromEnv("viewer"');
    expect(hostedPersonaSpec).toContain('roles: ["viewer"]');
    expect(hostedPersonaSpec).toContain("token: VIEWER_TOKEN");
  });

  it("defines the deployed-host contract as an unauthenticated strict auth boundary", () => {
    expect(hostedBrowserProbe).toContain('const PUBLIC_HEALTH_PATHS = ["/health", "/readyz"]');
    expect(hostedBrowserProbe).toContain("response.status === 401");
    expect(hostedBrowserProbe).toMatch(/AUTH_REQUIRED\|authentication required/u);
    expect(hostedBrowserProbe).toContain("noAuthorizationRequests");
    expect(hostedBrowserProbe).toContain("noEmbeddedDevBearer");
    expect(hostedBrowserProbe).not.toContain("const AUTH_TOKEN");
    expect(deployScript).toContain(
      'PANTHEON_HOSTED_REQUIRED_BFF_PATHS="${PANTHEON_HOSTED_REQUIRED_BFF_PATHS:-/bff/me}"',
    );
  });

  it("fails closed on a non-canonical token without echoing it", () => {
    const sentinel = "sentinel-privileged-token-must-not-leak";
    const result = rejectedDeploy({ VITE_BFF_DEV_BEARER_TOKEN: sentinel });

    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/any browser bearer token/u);
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
