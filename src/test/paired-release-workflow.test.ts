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
    const authorizedProofStart = integrationWorkflow.indexOf(
      "  authorized-write-proof:",
    );
    const authorization = integrationWorkflow.slice(
      authorizationStart,
      integrationStart,
    );
    const integration = integrationWorkflow.slice(
      integrationStart,
      authorizedProofStart,
    );
    const authorizedProof = integrationWorkflow.slice(authorizedProofStart);

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
    expect(authorization).toContain(
      "Hosted proof must be the initial exact bot-dispatched child run",
    );
    expect(authorization).toContain('childActor !== "github-actions[bot]"');
    expect(authorization).toContain("childTriggeringActor !== childActor");
    expect(authorization).toContain(
      'String(process.env.GITHUB_RUN_ATTEMPT || "") !== "1"',
    );
    expect(authorization).toContain(
      "Hosted proof current child run source is not the exact trusted dev dispatch",
    );
    expect(authorization).toContain(
      "Authenticate one-time exact child proof claim",
    );
    expect(authorization).toContain(
      "String(claim.child?.runId) === process.env.GITHUB_RUN_ID",
    );
    expect(authorization).toContain(
      "String(claim.child?.runAttempt) === process.env.GITHUB_RUN_ATTEMPT",
    );
    expect(authorization).toContain(
      "process.env.GITHUB_TRIGGERING_ACTOR.toLowerCase()",
    );
    expect(authorization).toContain(
      "one-time child proof claim does not authorize this exact run",
    );
    expect(authorization).toContain("pantheon-proof-binding-attempt-");
    expect(authorization).toContain(
      "actions/artifacts/${BINDING_ARTIFACT_ID}/zip",
    );
    expect(integration).not.toContain("needs: proof-authorization");
    expect(integration).toContain("!cancelled()");
    expect(integration).toContain(
      "(inputs.pint_hosted_probe == 'true' || inputs.persona_interaction_write_proof == 'true')",
    );
    expect(authorizedProof).toContain("PANTHEON_BFF_OPERATOR_A_TOKEN");
  });

  it("registers one exact child run so an unallowlisted collaborator cannot replay the parent nonce", () => {
    const dispatch = deployWorkflow.slice(
      deployWorkflow.indexOf(
        "Dispatch exact parent-bound hosted Persona proof",
      ),
      deployWorkflow.indexOf("Wait for hosted proof terminal"),
    );
    expect(dispatch).toContain("proof_run_id");
    expect(dispatch).toContain("pantheon.pint-proof-child-claim.v1");
    expect(dispatch).toContain("runId: process.env.PROOF_RUN_ID");
    expect(dispatch).toContain("runAttempt: process.env.CHILD_RUN_ATTEMPT");
    expect(dispatch).toContain("actor: process.env.CHILD_ACTOR");
    expect(dispatch).toContain(
      "triggeringActor: process.env.CHILD_TRIGGERING_ACTOR",
    );
    expect(dispatch).toContain('child_actor" != "github-actions[bot]"');
    expect(dispatch).toContain("Upload one-time exact child proof claim");
    expect(dispatch.indexOf("proof_run_id")).toBeLessThan(
      dispatch.indexOf("Upload one-time exact child proof claim"),
    );

    const authorization = integrationWorkflow.slice(
      integrationWorkflow.indexOf("  proof-authorization:"),
      integrationWorkflow.indexOf("  integration-gate:"),
    );
    expect(authorization).toContain('childActor !== "github-actions[bot]"');
    expect(authorization).toContain('String(childRun.run_attempt) !== "1"');
    expect(authorization).toContain(
      "String(claim.child?.runId) === process.env.GITHUB_RUN_ID",
    );
  });

  it("rejects a targeted rerun of the previously authorized parent proof coordinator", () => {
    const coordinator = deployWorkflow.slice(
      deployWorkflow.indexOf("  proof-coordinator:"),
      deployWorkflow.indexOf("  proof-restore-confirmation:"),
    );
    expect(deployWorkflow).toContain("RUN_ATTEMPT: ${{ github.run_attempt }}");
    expect(deployWorkflow).toContain(
      "TRIGGERING_ACTOR: ${{ github.triggering_actor }}",
    );
    expect(deployWorkflow).toContain('runAttempt !== "1"');
    expect(deployWorkflow).toContain("triggeringActor !== actor");
    expect(coordinator).toContain("github.run_attempt == 1");
    expect(coordinator).toContain("github.triggering_actor == github.actor");
    expect(coordinator).toContain(
      "Reauthorize one-time parent proof coordinator",
    );
    expect(coordinator).toContain("PANTHEON_DEV_FE_DEPLOY_OPERATORS");
    expect(
      coordinator.indexOf("Reauthorize one-time parent proof coordinator"),
    ).toBeLessThan(
      coordinator.indexOf("Checkout exact trusted proof controller"),
    );
    expect(coordinator).toContain(
      "triggeringActor: process.env.GITHUB_TRIGGERING_ACTOR",
    );
    expect(integrationWorkflow).toContain(
      'String(run.triggering_actor?.login || "").toLowerCase() !== parentActor',
    );
    expect(watchdogWorkflow).toContain(
      'String(run.triggering_actor?.login || "").toLowerCase() !== actor',
    );
  });

  it("keeps ordinary integration secretless and scopes write credentials to the authorized immutable proof", () => {
    const integrationStart = integrationWorkflow.indexOf("  integration-gate:");
    const authorizedStart = integrationWorkflow.indexOf(
      "  authorized-write-proof:",
    );
    const commentStart = integrationWorkflow.indexOf("  pr-comment:");
    const ordinary = integrationWorkflow.slice(
      integrationStart,
      authorizedStart,
    );
    const authorized = integrationWorkflow.slice(authorizedStart, commentStart);

    expect(ordinary).toContain('PANTHEON_PINT_HOSTED_PROBE: "false"');
    expect(ordinary).toContain(
      'PANTHEON_PERSONA_INTERACTION_WRITE_PROOF: "false"',
    );
    expect(ordinary).not.toContain("secrets.");
    expect(authorized).toContain("needs: proof-authorization");
    expect(authorized).toContain(
      "needs.proof-authorization.result == 'success'",
    );
    expect(authorized).toContain("github.run_attempt == 1");
    expect(authorized).toContain("github.actor == 'github-actions[bot]'");
    expect(authorized).toContain(
      "github.triggering_actor == 'github-actions[bot]'",
    );
    expect(authorized).toContain("Checkout exact authorized immutable dev ref");
    expect(authorized).toContain("ref: ${{ inputs.fe_sha }}");
    expect(authorized).toContain(
      "Verify exact write-proof deployment before credentials",
    );
    expect(authorized).toContain(
      "Run governed and Persona proof with proof-only credentials",
    );
    expect(authorized).toContain(
      "Fresh-check active parent and one-time child claim before credentials",
    );
    expect(authorized).toContain(
      "fresh child claim does not authorize this credentialed job attempt",
    );
    expect(
      authorized.match(/authorized parent coordinator is no longer active/gu),
    ).toHaveLength(1);
    expect(authorized).toContain("!cancelled()");
    expect(
      authorized.indexOf("fresh child claim does not authorize"),
    ).toBeLessThan(
      authorized.indexOf(
        "Run governed and Persona proof with proof-only credentials",
      ),
    );
    expect(authorized.slice(0, authorized.indexOf("    steps:"))).not.toContain(
      "secrets.PANTHEON_BFF_",
    );
    expect(
      authorized.match(/secrets\.PANTHEON_BFF_OPERATOR_A_TOKEN/gu),
    ).toHaveLength(2);
    expect(
      authorized.match(/secrets\.PANTHEON_BFF_VIEWER_TOKEN/gu),
    ).toHaveLength(2);
    expect(
      authorized.match(/secrets\.PANTHEON_BFF_RBAC_TOKENS_JSON/gu),
    ).toHaveLength(1);
    expect(integrationWorkflow.match(/secrets\.PANTHEON_BFF_/gu)).toHaveLength(
      5,
    );
    expect(integrationWorkflow).not.toContain(
      "secrets.PANTHEON_BFF_ADMIN_TOKEN",
    );
    expect(integrationWorkflow).not.toContain(
      "secrets.PANTHEON_BFF_APPROVER_TOKEN",
    );
    expect(integrationWorkflow).not.toContain(
      "secrets.PANTHEON_BFF_RISK_OWNER_TOKEN",
    );
    expect(
      authorized.indexOf(
        "Verify exact write-proof deployment before credentials",
      ),
    ).toBeLessThan(authorized.indexOf("secrets.PANTHEON_BFF_OPERATOR_A_TOKEN"));
  });

  it("rejects a collaborator rerun of the credentialed leaf after parent completion", () => {
    const authorization = integrationWorkflow.slice(
      integrationWorkflow.indexOf("  proof-authorization:"),
      integrationWorkflow.indexOf("  integration-gate:"),
    );
    const authorized = integrationWorkflow.slice(
      integrationWorkflow.indexOf("  authorized-write-proof:"),
      integrationWorkflow.indexOf("  pr-comment:"),
    );
    expect(authorization).toContain(
      'String(process.env.GITHUB_RUN_ATTEMPT || "") !== "1"',
    );
    expect(authorization).toContain("childTriggeringActor !== childActor");
    expect(authorized).toContain("github.run_attempt == 1");
    expect(authorized).toContain(
      "github.triggering_actor == 'github-actions[bot]'",
    );
    expect(authorized).toContain(
      "String(claim.child?.runAttempt) === process.env.GITHUB_RUN_ATTEMPT",
    );
    expect(authorized).toContain(
      "String(claim.child?.triggeringActor).toLowerCase() === process.env.GITHUB_TRIGGERING_ACTOR.toLowerCase()",
    );
    expect(authorized).toContain('coordinator?.status!=="in_progress"');
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
      "name: Authenticate exact parent restore authority",
    );
    const authorizeStart = watchdogWorkflow.indexOf("  authorize:");
    const watchStart = watchdogWorkflow.indexOf("  watch:");
    const restoreStart = watchdogWorkflow.indexOf("  restore:");
    const authorize = watchdogWorkflow.slice(authorizeStart, watchStart);
    const watch = watchdogWorkflow.slice(watchStart, restoreStart);
    const restore = watchdogWorkflow.slice(restoreStart);
    expect(authorize).toContain(
      "Download and authenticate source pair before arming",
    );
    expect(authorize).not.toContain(
      "Resolve and watch uniquely correlated hosted proof",
    );
    expect(watch).toContain("needs: authorize");
    expect(deployWorkflow).toContain(
      'authorize?.status==="completed" && authorize?.conclusion==="success"',
    );
    expect(deployWorkflow).toContain('watch?.status==="in_progress"');
    expect(deployWorkflow).toContain(
      'run.status==="in_progress" && !run.conclusion',
    );
    expect(watchdogWorkflow).toContain("needs: authorize");
    expect(watchdogWorkflow).toContain(
      "if: always() && needs.authorize.result == 'success'",
    );
    expect(watchdogWorkflow).not.toContain("needs.watch.outputs.authorized");
    expect(watchdogWorkflow).toContain(
      "Download and authenticate source pair before arming",
    );
    expect(watchdogWorkflow).toContain(
      "Parent proof coordinator ended before an exact child appeared; restoring now.",
    );
    expect(watchdogWorkflow).toContain(
      "Parent proof coordinator ended while the hosted proof was active; restoring now.",
    );
    expect(watchdogWorkflow).toContain("cancel_child_and_wait");
    expect(watchdogWorkflow).toContain('gh run cancel "$proof_run_id"');
    expect(watch).toContain(
      'job.name==="Run authorized one-time Persona write proof"',
    );
    expect(watch).toContain(
      "Exact credentialed hosted proof did not stop within the bounded cancellation deadline.",
    );
    const activeChildWatch = watch.slice(
      watch.indexOf("for _ in $(seq 1 620)"),
    );
    expect(activeChildWatch.match(/cancel_child_and_wait/gu)).toHaveLength(2);
    expect(activeChildWatch.indexOf("cancel_child_and_wait")).toBeLessThan(
      activeChildWatch.indexOf(
        "Parent proof coordinator ended while the hosted proof was active; restoring now.",
      ),
    );
    expect(activeChildWatch.lastIndexOf("cancel_child_and_wait")).toBeLessThan(
      activeChildWatch.indexOf(
        "Hosted proof exceeded the bounded window; restoring independently.",
      ),
    );
    expect(watch).toContain("actions: write");
    expect(restore).toContain("actions: write");
    expect(restore).not.toContain("needs.watch.outputs.proof_run_id");
    expect(restore).toContain(
      "Quiesce parent and terminalize exact credentialed child before restore",
    );
    expect(restore).toContain('gh run cancel "$PARENT_RUN_ID"');
    expect(restore).toContain('expected_title="PINT proof ${CORRELATION_ID}"');
    expect(restore).toContain(
      "restore child claim does not match the exact correlated proof",
    );
    expect(restore).toContain(
      "Restore refused: exact credentialed child is still nonterminal.",
    );
    expect(
      restore.indexOf(
        "Quiesce parent and terminalize exact credentialed child before restore",
      ),
    ).toBeLessThan(restore.indexOf("Checkout exact paired controller"));
    expect(restore.indexOf("Checkout exact paired controller")).toBeLessThan(
      restore.indexOf("Restore exact pair before any mutable successor action"),
    );
    expect(
      watchdogWorkflow.match(/\$\(parent_coordinator_terminal\)/gu),
    ).toHaveLength(2);
    expect(watchdogWorkflow).toContain("pantheon-dev-vm");
    expect(watchdogWorkflow).toContain(
      "PANTHEON_DEPLOY_PROFILE: read-only-restore",
    );
    expect(watchdogWorkflow).toContain('PANTHEON_DEPLOY_REAL_WRITES: "false"');
    expect(watchdogWorkflow).toContain(
      'PANTHEON_DEPLOY_ALLOW_DEV_STUB_WRITES: "false"',
    );
    expect(watchdogWorkflow).toContain(
      "group: pantheon-pint-proof-watchdog-restore",
    );
    expect(watchdogWorkflow).toContain("for attempt in $(seq 1 120)");
    expect(watchdogWorkflow).toContain(
      'PANTHEON_AUDIT_OUT_DIR="${audit_root}/attempt-${attempt}"',
    );
    expect(watchdogWorkflow).toContain(
      'PANTHEON_DEPLOY_RELEASE_INSTANCE="${release_root}-attempt-${attempt}"',
    );
    expect(watchdogWorkflow).toContain(
      "Another dev frontend deployment holds /tmp/pantheon-dev-fe-deploy.lock.",
    );
    expect(watchdogWorkflow).toContain(
      "Timed out acquiring the shared dev frontend mutation lock for restore.",
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
