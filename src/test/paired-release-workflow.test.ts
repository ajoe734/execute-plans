import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const integrationWorkflow = readFileSync(
  resolve(root, ".github/workflows/pantheon-integration-gate.yml"),
  "utf8",
);
const deployWorkflow = readFileSync(
  resolve(root, ".github/workflows/pantheon-dev-fe-deploy.yml"),
  "utf8",
);
const watchdogWorkflow = readFileSync(
  resolve(root, ".github/workflows/pantheon-proof-watchdog.yml"),
  "utf8",
);

describe("paired Pantheon release workflow", () => {
  it("builds one authenticated pair while normal gates consume read-only", () => {
    expect(integrationWorkflow).toContain("Build read-only release profile");
    expect(integrationWorkflow).toContain(
      "Build bounded write-proof release profile",
    );
    expect(integrationWorkflow).toContain(
      "node scripts/release-candidate.mjs prepare-pair",
    );
    expect(integrationWorkflow).toContain("--read-only-dist-dir dist");
    expect(integrationWorkflow).toContain(
      "--write-proof-dist-dir dist-write-proof",
    );
    expect(integrationWorkflow).toContain("--output-dir .release-candidate");
    expect(integrationWorkflow).toContain("release-candidate.mjs verify-pair");
    expect(integrationWorkflow).toContain(
      "node scripts/serve-release-candidate.mjs .release-candidate/dist",
    );
    expect(integrationWorkflow).toContain(
      "name: pantheon-fe-release-candidate-attempt-${{ github.run_attempt }}",
    );
    expect(integrationWorkflow).toContain("github.event_name == 'push' &&");
    expect(integrationWorkflow).toContain("github.ref == 'refs/heads/dev' &&");
  });

  it("keeps normal deploys read-only and isolates actions write to the gated proof coordinator", () => {
    const deployJobStart = deployWorkflow.indexOf("  deploy:");
    const proofJobStart = deployWorkflow.indexOf("  proof-coordinator:");
    const normalDeploy = deployWorkflow.slice(deployJobStart, proofJobStart);
    const proofCoordinator = deployWorkflow.slice(proofJobStart);

    expect(deployWorkflow.slice(0, deployJobStart)).toContain("actions: read");
    expect(normalDeploy).toContain("actions: read");
    expect(normalDeploy).not.toContain("actions: write");
    expect(normalDeploy).toContain("Deploy verified read-only candidate");
    expect(normalDeploy).toContain("PANTHEON_DEPLOY_PROFILE: read-only");
    expect(normalDeploy).toContain('PANTHEON_DEPLOY_REAL_WRITES: "false"');
    expect(normalDeploy).toContain(
      'PANTHEON_DEPLOY_ALLOW_DEV_STUB_WRITES: "false"',
    );
    expect(deployWorkflow.match(/actions: write/gu)).toHaveLength(1);
    expect(proofCoordinator).toContain("actions: write");
    expect(proofCoordinator).toContain(
      "needs.deploy.outputs.deployment_profile == 'write-proof'",
    );
    expect(normalDeploy).toContain(
      "write-proof requires an authorized deploy operator",
    );
    expect(proofCoordinator).toContain("PANTHEON_DEPLOY_PROFILE: write-proof");
    expect(proofCoordinator).toContain('PANTHEON_DEPLOY_REAL_WRITES: "true"');
    expect(proofCoordinator).toContain(
      'PANTHEON_DEPLOY_ALLOW_DEV_STUB_WRITES: "true"',
    );
  });

  it("rejects direct write-proof dispatch before the secret-bearing integration job", () => {
    const authorizationStart = integrationWorkflow.indexOf(
      "  proof-authorization:",
    );
    const integrationStart = integrationWorkflow.indexOf("  integration-gate:");
    const authorization = integrationWorkflow.slice(
      authorizationStart,
      integrationStart,
    );
    const integration = integrationWorkflow.slice(integrationStart);

    expect(authorization).toContain("PANTHEON_DEV_FE_DEPLOY_OPERATORS");
    expect(authorization).toContain(
      'path !== ".github/workflows/pantheon-dev-fe-deploy.yml"',
    );
    expect(authorization).toContain('run.event !== "workflow_dispatch"');
    expect(authorization).toContain('run.status !== "in_progress"');
    expect(authorization).toContain(
      "parentRunText === String(process.env.GITHUB_RUN_ID",
    );
    expect(authorization).toContain(
      "parent binding is malformed or unauthorized",
    );
    expect(authorization).toContain(
      "parent proof nonce/correlation binding mismatch",
    );
    expect(authorization).toContain("pantheon-proof-binding-attempt-");
    expect(authorization).toContain(
      "actions/artifacts/${BINDING_ARTIFACT_ID}/zip",
    );
    expect(integration).toContain("needs: proof-authorization");
    expect(integration).toContain(
      "needs.proof-authorization.result == 'success'",
    );
    expect(integration.indexOf("needs: proof-authorization")).toBeLessThan(
      integration.indexOf("PANTHEON_BFF_OPERATOR_A_TOKEN"),
    );
  });

  it("arms an independent watchdog before enabling writes and restores the same pair", () => {
    const watchdogDispatch = deployWorkflow.indexOf(
      "Dispatch independent read-only restore watchdog",
    );
    const writeActivation = deployWorkflow.indexOf(
      "Activate bounded write-proof profile after watchdog is durable",
    );
    const watchdogArmed = deployWorkflow.indexOf(
      "Require independently armed watchdog before writes",
    );
    const proofDispatch = deployWorkflow.indexOf(
      "Dispatch exact parent-bound hosted Persona proof",
    );
    expect(watchdogDispatch).toBeGreaterThan(-1);
    expect(watchdogDispatch).toBeLessThan(watchdogArmed);
    expect(watchdogArmed).toBeLessThan(writeActivation);
    expect(writeActivation).toBeLessThan(proofDispatch);
    expect(deployWorkflow).toContain(
      "gh workflow run pantheon-proof-watchdog.yml",
    );
    expect(deployWorkflow).toContain("parent_binding_artifact_id");
    expect(deployWorkflow).toContain("parent_proof_nonce");
    expect(deployWorkflow).toContain(
      "Independent restore watchdog failed before arming; refusing write activation.",
    );
    expect(deployWorkflow).toContain("proof-restore-confirmation:");

    expect(watchdogWorkflow).toContain("runs-on: ubuntu-latest");
    expect(watchdogWorkflow).toContain("timeout-minutes: 190");
    expect(watchdogWorkflow).toContain(
      "Download and authenticate source pair before arming",
    );
    expect(watchdogWorkflow).toContain(
      "Parent proof coordinator ended before an exact child appeared; restoring now.",
    );
    expect(watchdogWorkflow).toContain(
      "if: always() && needs.watch.outputs.authorized == 'true'",
    );
    expect(watchdogWorkflow).toContain("pantheon-dev-vm");
    expect(watchdogWorkflow).toContain(
      "PANTHEON_DEPLOY_PROFILE: read-only-restore",
    );
    expect(watchdogWorkflow).toContain('PANTHEON_DEPLOY_REAL_WRITES: "false"');
    expect(watchdogWorkflow).toContain(
      'PANTHEON_DEPLOY_ALLOW_DEV_STUB_WRITES: "false"',
    );
    expect(watchdogWorkflow).toContain(
      "PANTHEON_DEPLOY_EXPECTED_PAIR_ID: ${{ inputs.expected_pair_id }}",
    );
    expect(watchdogWorkflow).toContain(
      "PANTHEON_DEPLOY_GATE_RUN_ID: ${{ inputs.source_gate_run_id }}",
    );
    expect(watchdogWorkflow).toContain(
      "PANTHEON_DEPLOY_GITHUB_ARTIFACT_DIGEST: ${{ inputs.source_artifact_digest }}",
    );
  });

  it("binds hosted proof and manifests to the exact source pair", () => {
    expect(integrationWorkflow).toContain(
      'runPath !== ".github/workflows/pantheon-integration-gate.yml"',
    );
    expect(integrationWorkflow).toContain('run.event !== "push"');
    expect(integrationWorkflow).toContain('run.head_branch !== "dev"');
    expect(integrationWorkflow).toContain(
      "Download and authenticate exact source candidate pair",
    );
    expect(integrationWorkflow).toContain(
      '--expected-pair-id "$EXPECTED_PAIR_ID"',
    );
    expect(integrationWorkflow).toContain(
      "Verify exact paired hosted deployment before PINT proof",
    );
    expect(integrationWorkflow).toContain(
      "Verify exact paired hosted deployment after all PINT proof steps",
    );
    expect(integrationWorkflow).toContain("pint-proof-correlation.json");
    expect(integrationWorkflow).toContain(
      "manifest.pair?.readOnlyArtifactDigestSha256",
    );
    expect(integrationWorkflow).toContain(
      "manifest.pair?.writeProofArtifactDigestSha256",
    );
  });

  it("isolates PR comment mutation from push and manual integration permissions", () => {
    const integrationStart = integrationWorkflow.indexOf("  integration-gate:");
    const commentStart = integrationWorkflow.indexOf("  pr-comment:");
    const integration = integrationWorkflow.slice(
      integrationStart,
      commentStart,
    );
    const comment = integrationWorkflow.slice(commentStart);

    expect(
      integrationWorkflow.slice(0, integrationWorkflow.indexOf("jobs:")),
    ).not.toContain("issues: write");
    expect(integration).toContain("actions: read");
    expect(integration).not.toContain("issues: write");
    expect(integration).not.toContain("pull-requests: write");
    expect(comment).toContain("github.event_name == 'pull_request'");
    expect(comment).toContain("issues: write");
    expect(comment).toContain("pull-requests: write");
    expect(comment).toContain("actions/download-artifact@v4");
  });
});
