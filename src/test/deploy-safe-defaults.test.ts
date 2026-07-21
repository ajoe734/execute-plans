import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const deployScriptPath = resolve(root, "scripts/deploy-dev-vm.sh");
const deployScript = readFileSync(deployScriptPath, "utf8");
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
const releaseCandidate = readFileSync(
  resolve(root, "scripts/release-candidate.mjs"),
  "utf8",
);
const atomicManifest = readFileSync(
  resolve(root, "scripts/atomic-release-manifest.py"),
  "utf8",
);
const browserAuthRuntime = [
  readFileSync(resolve(root, "src/config/publicBuildAuth.ts"), "utf8"),
  readFileSync(resolve(root, "src/lib/bff-v1/headers.ts"), "utf8"),
].join("\n");

function rejectedDeploy(extraEnv: Record<string, string>) {
  return spawnSync("bash", [deployScriptPath], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      GITHUB_EVENT_NAME: "",
      PANTHEON_DEPLOY_ALLOW_DIRTY: "true",
      VITE_BFF_DEV_BEARER_TOKEN: "",
      ...extraEnv,
    },
  });
}

describe("Pantheon dev frontend deploy safety boundary", () => {
  it("creates only strict, read-only, credential-free release candidates", () => {
    expect(integrationWorkflow).toContain("VITE_BFF_MODE: live");
    expect(integrationWorkflow).toContain("VITE_BFF_FALLBACK: strict");
    expect(integrationWorkflow).toContain('VITE_BFF_REAL_WRITES: "false"');
    expect(integrationWorkflow).toContain(
      'VITE_BFF_ALLOW_DEV_STUB_WRITES: "false"',
    );
    expect(integrationWorkflow).toContain('VITE_BFF_DEV_BEARER_TOKEN: ""');
    expect(integrationWorkflow).toContain(
      "node scripts/release-candidate.mjs prepare",
    );
    expect(deployScript).toContain(
      'REAL_WRITES="${PANTHEON_DEPLOY_REAL_WRITES:-false}"',
    );
    expect(deployScript).toContain(
      'ALLOW_DEV_STUB_WRITES="${PANTHEON_DEPLOY_ALLOW_DEV_STUB_WRITES:-false}"',
    );
    expect(deployScript).toContain(
      'if [[ -n "${VITE_BFF_DEV_BEARER_TOKEN:-}" ]]',
    );
    expect(deployScript).toContain("VITE_*CLIENT_SECRET*");
    expect(deployScript).toContain("VITE_*PRIVATE_KEY*");
    expect(deployScript).toContain("VITE_*SERVICE_ROLE*");
    expect(deployScript).not.toMatch(/pantheon-dev-browser:operator/u);
    expect(deployScript).not.toMatch(/pantheon-dev-browser:viewer/u);
    expect(deployScript).not.toMatch(/VITE_BFF_REAL_WRITES=true/u);
    expect(deployScript).not.toMatch(/VITE_BFF_ALLOW_DEV_STUB_WRITES=true/u);
    expect(releaseCandidate).toContain(
      'VITE_BFF_EMBEDDED_BEARER_TOKEN: "false"',
    );
    expect(releaseCandidate).toContain("collectEnvironmentSecretSentinels");
    expect(releaseCandidate).toContain("CREDENTIAL_PATTERNS");
    expect(integrationWorkflow).not.toMatch(/pantheon-dev-browser:viewer/gu);
    expect(browserAuthRuntime).not.toMatch(/pantheon-dev-browser:viewer/gu);
    expect(browserAuthRuntime).not.toContain(
      "import.meta.env.VITE_BFF_DEV_BEARER_TOKEN",
    );
    expect(existsSync(localEnvPath)).toBe(false);
    expect(gitignore).toMatch(/^\.env\*$/mu);
    expect(gitignore).toMatch(/^!\.env\*\.example$/mu);
  });

  it("injects public Supabase config only while building a gated candidate", () => {
    for (const workflow of [branchWorkflow, integrationWorkflow]) {
      expect(workflow).toContain(
        "VITE_SUPABASE_URL: ${{ vars.VITE_SUPABASE_URL }}",
      );
      expect(workflow).toContain(
        "VITE_SUPABASE_PUBLISHABLE_KEY: ${{ vars.VITE_SUPABASE_PUBLISHABLE_KEY }}",
      );
      expect(workflow.match(/VITE_SUPABASE_URL:/gu)).toHaveLength(1);
      expect(workflow.match(/VITE_SUPABASE_PUBLISHABLE_KEY:/gu)).toHaveLength(
        1,
      );
    }
    expect(deployWorkflow).not.toContain("VITE_SUPABASE_URL");
    expect(deployWorkflow).not.toContain("VITE_SUPABASE_PUBLISHABLE_KEY");
    expect(deployScript).not.toContain("VITE_SUPABASE_URL");
    expect(deployScript).not.toContain("VITE_SUPABASE_PUBLISHABLE_KEY");
    expect(deployWorkflow).not.toContain(
      "PANTHEON_HOSTED_BROWSER_BEARER_TOKEN",
    );
  });

  it("runs release-gate Playwright evidence against the exact candidate", () => {
    const start = integrationWorkflow.indexOf(
      "- name: Release-gate Playwright evidence against exact candidate",
    );
    const end = integrationWorkflow.indexOf(
      "- name: Frontend browser BFF probe",
    );
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const fixtureBlock = integrationWorkflow.slice(start, end);

    expect(fixtureBlock).toContain("if: steps.pr_preview.outcome == 'success'");
    expect(fixtureBlock).toContain('PANTHEON_FE_BASE_URL: "http://127.0.0.1:4173"');
    expect(fixtureBlock).toContain('PANTHEON_SSE_ORIGIN_URL: "http://127.0.0.1:4173"');
    expect(fixtureBlock).toContain('PLAYWRIGHT_JSON_OUTPUT_FILE="$PANTHEON_AUDIT_OUT_DIR/playwright-results.json"');
    expect(fixtureBlock).not.toContain("npm run dev --");
    expect(fixtureBlock).not.toContain("VITE_SUPABASE_URL:");
    expect(fixtureBlock).not.toContain("VITE_SUPABASE_PUBLISHABLE_KEY:");
    expect(fixtureBlock).toContain("VITE_BFF_FALLBACK: strict");
    expect(fixtureBlock).toContain("BFF_FALLBACK: strict");
    for (const credential of [
      "BFF_AUTH_TOKEN",
      "VITE_BFF_DEV_BEARER_TOKEN",
    ]) {
      expect(fixtureBlock).not.toContain(`${credential}: $` + "{{");
    }
    for (const spec of [
      "01-startup-session",
      "02-control-room",
      "03-execution-loop",
      "04-sentinel-remediation",
      "04b-optimization-loop",
      "05-interventions",
      "06-entity-registry",
      "07-high-risk-confirm",
      "08-create-intent",
      "08-sse-reconnect",
      "09-strict-vs-hybrid",
      "10-rollback-saga",
      "11-handoff-sla",
      "12-approvals",
      "13-agora",
      "16-audit-correlation",
      "17-a11y-v5",
      "18-perf",
    ]) {
      expect(fixtureBlock).toMatch(
        new RegExp(`e2e/${spec}\\.spec\\.ts`, "u"),
      );
    }
    expect(integrationWorkflow).toContain(
      '"fixture_e2e": { "outcome": "${{ steps.fixture_e2e.outcome }}"',
    );
  });

  it("publishes accepted manifests with a durable atomic replace", () => {
    expect(deployScript).toContain("publish_manifest_atomically");
    expect(deployScript).toContain("atomic-release-manifest.py");
    expect(deployScript).not.toMatch(
      /sudo install[^\n]+deployment\.json[^\n]+\/deployment\.json/u,
    );
    expect(atomicManifest).toContain("os.O_EXCL");
    expect(atomicManifest).toContain('getattr(os, "O_NOFOLLOW", 0)');
    expect(atomicManifest).toContain("os.replace(");
    expect(atomicManifest).toContain("os.fsync(release_fd)");
    expect(atomicManifest).toContain("os.fsync(store_fd)");
  });

  it("deploys only the immutable artifact from one exact successful dev gate", () => {
    expect(deployWorkflow).toContain("workflow_run:");
    expect(deployWorkflow).toContain("Pantheon FE-BFF Integration Gate");
    expect(deployWorkflow).toContain("github.rest.actions.getWorkflowRun");
    expect(deployWorkflow).toContain(
      'runPath === ".github/workflows/pantheon-integration-gate.yml"',
    );
    expect(deployWorkflow).toContain('run.event === "push"');
    expect(deployWorkflow).toContain('run.head_branch === "dev"');
    expect(deployWorkflow).toContain('run.conclusion === "success"');
    expect(deployWorkflow).toContain(
      "github.rest.actions.listWorkflowRunArtifacts",
    );
    expect(deployWorkflow).toContain(
      "`pantheon-fe-release-candidate-attempt-${run.run_attempt}`",
    );
    expect(deployWorkflow).toContain("artifact.name === artifactName");
    expect(integrationWorkflow).toContain(
      "name: pantheon-fe-release-candidate-attempt-${{ github.run_attempt }}",
    );
    expect(integrationWorkflow).toContain(
      "name: pantheon-integration-evidence-attempt-${{ github.run_attempt }}",
    );
    expect(deployWorkflow).toContain(
      "name: pantheon-dev-fe-deploy-evidence-attempt-${{ github.run_attempt }}",
    );
    expect(`${integrationWorkflow}\n${deployWorkflow}`).not.toContain(
      "overwrite: true",
    );
    expect(deployWorkflow).toContain("actions/artifacts/${ARTIFACT_ID}/zip");
    expect(deployWorkflow).toContain(
      'actual_archive_digest="sha256:$(sha256sum',
    );
    expect(deployWorkflow).toContain(
      "artifact archive contains a non-regular entry",
    );
    expect(deployScript).toContain("node scripts/release-candidate.mjs verify");
    expect(deployScript).toContain('--expected-frontend-sha "${SHA}"');
    expect(deployScript).toContain('--expected-gate-run-id "${GATE_RUN_ID}"');
    expect(deployScript).toContain('BFF_COMMIT="$(node -e');
    expect(deployScript).toContain("payload.source_commit_known !== true");
    expect(integrationWorkflow).toContain(
      "Upload deployable immutable candidate",
    );
    expect(integrationWorkflow).toContain(
      "steps.aggregate.outcome == 'success'",
    );
  });

  it("pre-probes, atomically switches, and conditionally restores and re-probes", () => {
    expect(deployScript).toContain("flock -n 9");
    expect(deployScript).toContain("candidate.order_at_switch");
    expect(deployScript).toContain("candidate pre-switch browser/auth probe");
    expect(deployScript).toContain(
      'run_release_probe candidate_pre_switch "${RELEASE_DIR}"',
    );
    expect(deployScript).toContain(
      'NEXT_LINK="${DEPLOY_ROOT}.next-${RELEASE_INSTANCE}"',
    );
    expect(deployScript).toContain(
      'SYMLINK_CAS_HELPER="${ROOT_DIR}/scripts/atomic-symlink-cas.py"',
    );
    expect(deployScript).toContain(
      'sudo python3 "${SYMLINK_CAS_HELPER}" exchange',
    );
    expect(deployScript).toContain(
      'sudo python3 "${SYMLINK_CAS_HELPER}" install-if-absent',
    );
    expect(deployScript).toContain(
      "post-switch manifest, BFF, and browser/auth probe",
    );
    expect(deployScript).toContain("rollback_release");
    expect(deployScript).toContain('run_release_probe rollback ""');
    expect(deployScript).toContain("rollback.reprobe");
    expect(deployScript).toContain("Same-SHA artifact replacement rejected");
    expect(deployScript).toContain("exact live candidate no-op revalidation");
    expect(deployWorkflow).not.toContain("skip_probe:");
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
    expect(hostedBrowserProbe).toContain("target.origin !== base.origin");
    expect(hostedBrowserProbe).toContain(
      "applicationRootRendered: rootRendered",
    );
    expect(hostedBrowserProbe).toContain(
      "pageErrorsAbsent: pageErrors.length === 0",
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

  it("does not let emergency dispatch bypass probes or leak a generic Vite credential", () => {
    expect(deployWorkflow).toContain("emergency_override:");
    expect(deployWorkflow).toContain("rollback_drill:");
    expect(deployWorkflow).toContain("override_reason:");
    expect(deployWorkflow).toContain("PANTHEON_DEV_FE_DEPLOY_OPERATORS");
    expect(deployWorkflow).toContain("require an authorized deploy operator");
    expect(deployWorkflow).toContain(
      "integrity, auth, and rollback probes still run",
    );
    expect(deployScript).toContain(
      "Candidate, auth, post-switch, and rollback probes cannot be skipped",
    );

    const skipped = rejectedDeploy({ PANTHEON_DEPLOY_SKIP_PROBE: "true" });
    expect(skipped.status).toBe(2);
    expect(skipped.stderr).toMatch(/cannot be skipped/u);

    const sentinel = "service-role-sentinel-must-not-leak";
    const credential = rejectedDeploy({ VITE_SERVICE_ROLE_TOKEN: sentinel });
    expect(credential.status).toBe(2);
    expect(credential.stderr).toMatch(/non-public Vite credential variable/u);
    expect(`${credential.stdout}${credential.stderr}`).not.toContain(sentinel);
  });

  it("seals, verifies, and durably retains every run-attempt audit file", () => {
    expect(deployWorkflow).toContain(
      '"schemaVersion": "pantheon.dev-fe.workflow-audit-seal.v1"',
    );
    expect(deployWorkflow).toContain("workflow audit checksum mismatch");
    expect(deployWorkflow).toContain(
      "/var/lib/pantheon-dev-fe-deploy-evidence",
    );
    expect(deployWorkflow).toContain("PANTHEON_AUDIT_RUN_ROOT");
    expect(deployWorkflow).toContain('audit_dir="${audit_root}/controller"');
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
