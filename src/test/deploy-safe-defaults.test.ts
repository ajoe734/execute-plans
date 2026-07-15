import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const deployScriptPath = resolve(root, "scripts/deploy-dev-vm.sh");
const deployScript = readFileSync(deployScriptPath, "utf8");
const frontendSha = spawnSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf8",
}).stdout.trim();
const localEnvPath = resolve(root, ".env");
const gitignore = readFileSync(resolve(root, ".gitignore"), "utf8");
const integrationWorkflow = readFileSync(
  resolve(root, ".github/workflows/pantheon-integration-gate.yml"),
  "utf8",
);
const deployWorkflow = readFileSync(
  resolve(root, ".github/workflows/pantheon-dev-fe-deploy.yml"),
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
const hostedPersonaInteractionSpec = readFileSync(
  resolve(root, "e2e/persona-interaction-cross-repo-hosted.spec.ts"),
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
      GITHUB_EVENT_NAME: "",
      PANTHEON_DEPLOY_ALLOW_DIRTY: "true",
      VITE_BFF_DEV_BEARER_TOKEN: "",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_deploy_test",
      VITE_SUPABASE_URL: "https://deploy-test.supabase.co",
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
    expect(deployScript).toContain(
      'DEPLOY_PROFILE="${PANTHEON_DEPLOY_PROFILE:-read-only}"',
    );
    expect(deployScript).toContain(
      'REQUESTED_REAL_WRITES="${PANTHEON_DEPLOY_REAL_WRITES:-false}"',
    );
    expect(deployScript).toContain(
      'REQUESTED_ALLOW_DEV_STUB_WRITES="${PANTHEON_DEPLOY_ALLOW_DEV_STUB_WRITES:-false}"',
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
      "bffCommit: process.env.PANTHEON_DEPLOY_BFF_COMMIT",
    );
    expect(deployScript).toContain("bffCommitEvidence: true");
    expect(deployScript).toContain(
      "bffCommitSource: process.env.PANTHEON_DEPLOY_BFF_COMMIT_SOURCE",
    );
    expect(deployScript).not.toContain(
      "27cd46529c29801db02818aafe4df723cc0f8666",
    );
    expect(deployScript).not.toContain("pantheon-dev-browser:viewer");
    expect(
      integrationWorkflow.match(/VITE_BFF_DEV_BEARER_TOKEN=""/gu),
    ).toHaveLength(2);
    expect(deployScript).toContain('VITE_BFF_EMBEDDED_BEARER_TOKEN: "false"');
    expect(deployScript).toContain(
      'deploymentProfile: process.env.PANTHEON_DEPLOY_PROFILE || "read-only"',
    );
    expect(deployWorkflow).toContain(
      "PANTHEON_DEPLOY_PROFILE: ${{ github.event_name == 'workflow_dispatch' && inputs.deployment_profile || 'read-only' }}",
    );
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
    for (const workflow of [
      branchWorkflow,
      deployWorkflow,
      integrationWorkflow,
    ]) {
      expect(workflow).toContain(
        "VITE_SUPABASE_URL: ${{ vars.VITE_SUPABASE_URL }}",
      );
      expect(workflow).toContain(
        "VITE_SUPABASE_PUBLISHABLE_KEY: ${{ vars.VITE_SUPABASE_PUBLISHABLE_KEY }}",
      );
    }
    expect(deployWorkflow).not.toContain(
      "PANTHEON_HOSTED_BROWSER_BEARER_TOKEN",
    );

    const result = rejectedDeploy({
      VITE_SUPABASE_PUBLISHABLE_KEY: "",
      VITE_SUPABASE_URL: "",
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(
      /VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are required/,
    );
  });

  it("requires explicit BFF provenance for manual final-proof deployments", () => {
    expect(deployWorkflow).toContain("bff_commit:");
    expect(deployWorkflow).toContain(
      "github.event_name == 'workflow_dispatch' && inputs.bff_commit || ''",
    );
    expect(deployWorkflow).not.toContain("vars.PANTHEON_BFF_SHA");
    expect(deployScript).toContain(
      'EXPECTED_BFF_COMMIT="${PANTHEON_DEPLOY_EXPECTED_BFF_COMMIT:-}"',
    );
    expect(deployScript).toContain(
      "scripts/release-identity.mjs source-version",
    );
    expect(deployScript).toContain('BFF_COMMIT_SOURCE="bff_version"');
    expect(deployScript).toContain("Pantheon BFF commit mismatch");
    expect(deployScript).toContain('verify_live_bff_identity "before-switch"');
    expect(deployScript).toContain('verify_live_bff_identity "after-switch"');
    expect(deployScript).toContain("rolling back");
    expect(deployScript).toContain("flock -n 9");

    const result = rejectedDeploy({
      GITHUB_EVENT_NAME: "workflow_dispatch",
      PANTHEON_DEPLOY_EXPECTED_BFF_COMMIT: "",
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/requires an exact Pantheon BFF commit SHA/u);

    const abbreviated = rejectedDeploy({
      GITHUB_EVENT_NAME: "workflow_dispatch",
      PANTHEON_DEPLOY_EXPECTED_BFF_COMMIT: "deadbeef",
    });
    expect(abbreviated.status).toBe(2);
    expect(abbreviated.stderr).toMatch(/exact 40-character SHA/u);
  });

  it("keeps every post-deploy acceptance probe read-only", () => {
    expect(deployScript).toContain("scripts/probe-hosted-browser-bff.mjs");
    expect(deployScript).not.toContain("npx playwright test");
    expect(deployScript).not.toContain(
      "scripts/probe-hosted-management-writes.mjs",
    );
    expect(hostedPersonaSpec).toContain('roleTokenFromEnv("viewer"');
    expect(hostedPersonaSpec).toContain('roles: ["viewer"]');
    expect(hostedPersonaSpec).toContain("token: VIEWER_TOKEN");
  });

  it("hard-gates the real hosted Persona write proof without credential skips", () => {
    expect(integrationWorkflow).toContain(
      "npx playwright test e2e/persona-interaction-cross-repo-hosted.spec.ts",
    );
    expect(integrationWorkflow).toContain(
      "node scripts/validate-persona-hosted-proof-env.mjs",
    );
    expect(hostedPersonaInteractionSpec).toContain(
      "expect(denied.status()).toBe(403)",
    );
  });

  it("defines the deployed-host contract as an unauthenticated strict auth boundary", () => {
    expect(hostedBrowserProbe).toContain(
      'const PUBLIC_HEALTH_PATHS = ["/health", "/readyz"]',
    );
    expect(hostedBrowserProbe).toContain("response.status === 401");
    expect(hostedBrowserProbe).toMatch(
      /AUTH_REQUIRED\|authentication required/u,
    );
    expect(hostedBrowserProbe).toContain("noAuthorizationRequests");
    expect(hostedBrowserProbe).toContain("noEmbeddedDevBearer");
    expect(hostedBrowserProbe).not.toContain("const AUTH_TOKEN");
    expect(hostedBrowserProbe).not.toContain("BROWSER_AUTH_TOKEN");
    expect(hostedBrowserProbe).not.toContain("window.sessionStorage.setItem");
    expect(hostedBrowserProbe).toContain('page.on("pageerror"');
    expect(hostedBrowserProbe).toContain("rootRendered");
    expect(hostedBrowserProbe).toContain("pageErrors.length === 0");
    expect(hostedBrowserProbe).toContain(
      "candidate.origin !== BFF_TARGET.origin",
    );
    expect(hostedBrowserProbe).not.toContain("url.startsWith(BFF_BASE)");
    expect(deployScript).toContain(
      'PANTHEON_HOSTED_REQUIRED_BFF_PATHS="${PANTHEON_HOSTED_REQUIRED_BFF_PATHS:-/bff/me}"',
    );
    expect(integrationWorkflow).toContain(
      'PANTHEON_HOSTED_REQUIRED_BFF_PATHS: "/bff/me"',
    );
    expect(deployWorkflow).toContain(
      "PANTHEON_HOSTED_REQUIRED_BFF_PATHS: /bff/me",
    );
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
    expect(result.stderr).toMatch(
      /Direct write-flag overrides are prohibited/u,
    );
  });

  it("admits the atomic Persona proof profile only through an acknowledged exact dev dispatch", () => {
    expect(deployWorkflow).toContain('"persona-interaction-write-proof"');
    expect(deployWorkflow).toContain('"persona-interaction-read-only-restore"');
    expect(deployWorkflow).toContain("proof_window_ack:");
    expect(deployScript).toContain('REAL_WRITES="true"');
    expect(deployScript).toContain('ALLOW_DEV_STUB_WRITES="true"');
    expect(deployScript).toContain('"${SOURCE_REF,,}" != "${SHA,,}"');
    expect(deployScript).toContain(
      "https://pantheon-lupin-dev-fe.35.201.239.38.sslip.io",
    );
    expect(deployScript).toContain(
      "https://pantheon-lupin-dev-bff.35.201.239.38.sslip.io",
    );

    const nonDispatch = rejectedDeploy({
      PANTHEON_DEPLOY_PROFILE: "persona-interaction-write-proof",
      PANTHEON_DEPLOY_PROOF_WINDOW_ACK: "true",
    });
    expect(nonDispatch.status).toBe(2);
    expect(nonDispatch.stderr).toMatch(
      /only for an explicit workflow_dispatch/u,
    );

    const unacknowledged = rejectedDeploy({
      GITHUB_EVENT_NAME: "workflow_dispatch",
      PANTHEON_DEPLOY_PROFILE: "persona-interaction-write-proof",
      PANTHEON_DEPLOY_EXPECTED_BFF_COMMIT: "a".repeat(40),
      PANTHEON_DEPLOY_REF: frontendSha,
    });
    expect(unacknowledged.status).toBe(2);
    expect(unacknowledged.stderr).toMatch(
      /requires explicit proof-window acknowledgement/u,
    );

    const nonExactFrontend = rejectedDeploy({
      GITHUB_EVENT_NAME: "workflow_dispatch",
      PANTHEON_DEPLOY_PROFILE: "persona-interaction-read-only-restore",
      PANTHEON_DEPLOY_EXPECTED_BFF_COMMIT: "a".repeat(40),
      PANTHEON_DEPLOY_REF: "dev",
    });
    expect(nonExactFrontend.status).toBe(2);
    expect(nonExactFrontend.stderr).toMatch(/exact 40-character frontend SHA/u);
  });

  it("bounds the manual proof window with an exact external gate and fail-closed restore", () => {
    expect(deployWorkflow).toContain("actions: write");
    expect(deployWorkflow).toContain("timeout-minutes: 145");
    expect(deployWorkflow).toContain("timeout-minutes: 190");
    expect(deployWorkflow).toContain(
      "gh workflow run pantheon-integration-gate.yml",
    );
    expect(deployWorkflow).toContain('-f fe_base_url="$PANTHEON_DEV_FE_HOST"');
    expect(deployWorkflow).toContain('-f fe_sha="$EXACT_FE_SHA"');
    expect(deployWorkflow).toContain(
      '-f proof_correlation_id="$proof_correlation_id"',
    );
    expect(deployWorkflow).toContain(
      '.displayTitle == "\'"$expected_title"\'"',
    );
    expect(deployWorkflow).toContain('-f bff_sha="$EXACT_BFF_SHA"');
    expect(deployWorkflow).toContain("-f persona_interaction_write_proof=true");
    expect(deployWorkflow).toContain("-f pint_hosted_probe=true");
    expect(deployWorkflow).toContain("gh run watch");
    expect(deployWorkflow).toContain(
      "if: always() && steps.deploy.outcome == 'success' && env.PANTHEON_DEPLOY_PROFILE == 'persona-interaction-write-proof'",
    );
    expect(deployWorkflow).toContain(
      "PANTHEON_DEPLOY_PROFILE: persona-interaction-read-only-restore",
    );
    expect(deployScript).toContain(
      "keeping the fail-closed read-only candidate live and refusing rollback",
    );
  });

  it("binds hosted PINT proof to deployment.json before and after mutation", () => {
    expect(integrationWorkflow).toContain(
      "Verify exact hosted deployment before PINT proof",
    );
    expect(integrationWorkflow).toContain(
      "Verify exact hosted deployment after PINT proof",
    );
    expect(
      integrationWorkflow.match(
        /node scripts\/hosted-deployment-identity\.mjs/gu,
      ),
    ).toHaveLength(2);
    expect(
      integrationWorkflow.match(
        /--deployment-profile persona-interaction-write-proof/gu,
      ),
    ).toHaveLength(2);
    expect(integrationWorkflow).toContain("deployment-before-pint.json");
    expect(integrationWorkflow).toContain("deployment-after-pint.json");
    expect(integrationWorkflow).toContain(
      "PANTHEON_FRONTEND_SHA: ${{ inputs.fe_sha || github.sha }}",
    );
    expect(integrationWorkflow).toContain(
      "format('PINT proof {0}', inputs.proof_correlation_id)",
    );
    expect(integrationWorkflow).toContain(
      "ref: ${{ inputs.fe_sha || github.sha }}",
    );
    expect(integrationWorkflow).toContain(
      '--frontend-sha "$PANTHEON_FRONTEND_SHA"',
    );
    expect(integrationWorkflow).toContain('--bff-sha "$PANTHEON_BFF_SHA"');
    expect(branchWorkflow).toContain(
      "node scripts/test-hosted-deployment-identity.mjs",
    );
    expect(branchWorkflow).toContain("bash scripts/test-deploy-dev-vm.sh");
  });
});
