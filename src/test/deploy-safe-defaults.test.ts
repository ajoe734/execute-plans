import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const deployScriptPath = resolve(root, "scripts/deploy-dev-vm.sh");
const deployScript = readFileSync(deployScriptPath, "utf8");
const localEnvPath = resolve(root, ".env");
const gitignore = readFileSync(resolve(root, ".gitignore"), "utf8");
const hostedProbeScript = readFileSync(
  resolve(root, "scripts/probe-hosted-browser-bff.mjs"),
  "utf8",
);
const deployWorkflow = readFileSync(
  resolve(root, ".github/workflows/pantheon-dev-fe-deploy.yml"),
  "utf8",
);
const integrationWorkflow = readFileSync(
  resolve(root, ".github/workflows/pantheon-integration-gate.yml"),
  "utf8",
);
const branchWorkflow = readFileSync(
  resolve(root, ".github/workflows/branch-ci.yml"),
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
  it("builds without a browser bearer token and with safe write flags", () => {
    expect(deployScript).toContain(
      'DEV_BEARER_TOKEN="${VITE_BFF_DEV_BEARER_TOKEN:-}"',
    );
    expect(deployScript).toContain('if [[ -n "${DEV_BEARER_TOKEN}" ]]');
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
    expect(deployScript).not.toMatch(/pantheon-dev-browser:viewer/u);
    expect(deployScript).not.toMatch(/VITE_BFF_REAL_WRITES=true/u);
    expect(deployScript).not.toMatch(/VITE_BFF_ALLOW_DEV_STUB_WRITES=true/u);
    expect(deployScript).toContain(
      'VITE_BFF_REAL_WRITES: process.env.PANTHEON_DEPLOY_REAL_WRITES || "false"',
    );
    expect(deployScript).toContain(
      'VITE_BFF_ALLOW_DEV_STUB_WRITES: process.env.PANTHEON_DEPLOY_ALLOW_DEV_STUB_WRITES || "false"',
    );
    expect(deployScript).toContain(
      'bffCommit: process.env.PANTHEON_DEPLOY_BFF_COMMIT',
    );
    expect(deployScript).toContain('VITE_BFF_EMBEDDED_BEARER_TOKEN: "false"');
    expect(integrationWorkflow).not.toMatch(/pantheon-dev-browser:viewer/gu);
    expect(existsSync(localEnvPath)).toBe(false);
    expect(gitignore).toMatch(/^\.env\*$/mu);
    expect(gitignore).toMatch(/^!\.env\*\.example$/mu);
  });

  it("injects public Supabase config explicitly and fails closed when it is missing", () => {
    expect(deployScript).toContain('SUPABASE_URL="${VITE_SUPABASE_URL:-}"');
    expect(deployScript).toContain(
      'SUPABASE_PUBLISHABLE_KEY="${VITE_SUPABASE_PUBLISHABLE_KEY:-}"',
    );
    expect(deployScript).toContain(
      'VITE_SUPABASE_PUBLISHABLE_KEY="${SUPABASE_PUBLISHABLE_KEY}"',
    );
    for (const workflow of [branchWorkflow, deployWorkflow, integrationWorkflow]) {
      expect(workflow).toContain(
        'VITE_SUPABASE_URL: ${{ vars.VITE_SUPABASE_URL }}',
      );
      expect(workflow).toContain(
        'VITE_SUPABASE_PUBLISHABLE_KEY: ${{ vars.VITE_SUPABASE_PUBLISHABLE_KEY }}',
      );
    }

    const result = rejectedDeploy({
      VITE_SUPABASE_PUBLISHABLE_KEY: "",
      VITE_SUPABASE_URL: "",
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(
      /VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are required/,
    );
  });

  it("keeps every post-deploy acceptance probe read-only", () => {
    expect(deployScript).toContain("scripts/probe-hosted-browser-bff.mjs");
    expect(deployScript).not.toContain("npx playwright test");
    expect(deployScript).not.toContain("scripts/probe-hosted-management-writes.mjs");
    expect(deployScript).toContain(
      'PANTHEON_HOSTED_REQUIRED_BFF_PATHS:-/health',
    );
    expect(deployWorkflow).toContain(
      "PANTHEON_HOSTED_REQUIRED_BFF_PATHS: /health",
    );
    expect(integrationWorkflow).toContain(
      'PANTHEON_HOSTED_REQUIRED_BFF_PATHS: "/health"',
    );
    expect(hostedProbeScript).not.toContain("PANTHEON_HOSTED_ACCEPT_AUTH_CHALLENGE");
    expect(hostedProbeScript).toContain('page.on("pageerror"');
    expect(hostedProbeScript).toContain("rootRendered");
    expect(hostedProbeScript).toContain("pageErrors.length === 0");
    expect(hostedPersonaSpec).toContain(
      'const PUBLIC_VIEWER_TOKEN = "pantheon-dev-browser:viewer"',
    );
    expect(hostedPersonaSpec).toContain('roles: ["viewer"]');
    expect(hostedPersonaSpec).toContain("token: PUBLIC_VIEWER_TOKEN");
  });

  it("fails closed on any build-time token without echoing it", () => {
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
