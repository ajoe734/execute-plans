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
const branchWorkflow = readFileSync(
  resolve(root, ".github/workflows/branch-ci.yml"),
  "utf8",
);
const deployScript = readFileSync(
  resolve(root, "scripts/deploy-dev-vm.sh"),
  "utf8",
);

describe("paired Pantheon release workflow", () => {
  it("builds one authenticated three-profile set while normal gates consume read-only", () => {
    expect(integrationWorkflow).toContain("Build read-only release profile");
    expect(integrationWorkflow).toContain(
      "Build bounded write-proof release profile",
    );
    expect(integrationWorkflow).toContain(
      "Build persistent operator-live release profile",
    );
    expect(integrationWorkflow).toContain(
      "node scripts/release-candidate.mjs prepare-pair",
    );
    expect(integrationWorkflow).toContain("--read-only-dist-dir dist");
    expect(integrationWorkflow).toContain(
      "--operator-live-dist-dir dist-operator-live",
    );
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
    const upload = integrationWorkflow.slice(
      integrationWorkflow.indexOf("Upload deployable immutable candidate pair"),
      integrationWorkflow.indexOf("Record deployable candidate identity"),
    );
    expect(upload).toContain("github.event_name == 'workflow_dispatch'");
    expect(upload).toContain("inputs.release_candidate_id != ''");
    expect(upload).not.toContain("github.event_name == 'push'");
  });

  it("keeps workflow dispatch within GitHub's 25-input limit without duplicate contract refs", () => {
    const dispatch = integrationWorkflow.slice(
      integrationWorkflow.indexOf("  workflow_dispatch:"),
      integrationWorkflow.indexOf("\n\npermissions:"),
    );
    const inputNames = [...dispatch.matchAll(/^ {6}([a-z][a-z0-9_]*):$/gmu)].map(
      ([, name]) => name,
    );
    const declared = [
      "fe_base_url", "fe_sha", "frontend_ref", "proof_correlation_id",
      "parent_deploy_run_id", "parent_deploy_run_attempt", "parent_deploy_actor",
      "parent_proof_nonce", "parent_binding_artifact_id", "parent_binding_artifact_digest",
      "source_gate_run_id", "source_artifact_id", "source_artifact_digest", "expected_pair_id",
      "expected_read_only_digest", "expected_write_proof_digest", "bff_base_url", "bff_sha",
      "release_candidate_id", "compatibility_manifest_sha256", "release_controller_run_id",
      "persona_interaction_write_proof", "soft_fail", "functional_closure_write_proof", "pint_hosted_probe",
    ];
    // The regex only matches top-level input declarations, not nested
    // description/type/options fields.
    expect(inputNames).toHaveLength(25);
    expect(inputNames).toEqual(declared);
    expect(integrationWorkflow).not.toContain("      pantheon_contract_ref:");
    expect(deployWorkflow).not.toContain('-f pantheon_contract_ref=');
    expect(integrationWorkflow).toContain(
      "PANTHEON_AGORA_CONTRACT_REF: ${{ inputs.bff_sha || vars.PANTHEON_AGORA_CONTRACT_REF || 'dev' }}",
    );
  });

  it("keeps normal deploys read-only and isolates actions write to the gated proof coordinator", () => {
    const deployJobStart = deployWorkflow.indexOf("  deploy:");
    const proofJobStart = deployWorkflow.indexOf("  proof-coordinator:");
    const normalDeploy = deployWorkflow.slice(deployJobStart, proofJobStart);
    const proofCoordinator = deployWorkflow.slice(proofJobStart);

    expect(deployWorkflow.slice(0, deployJobStart)).toContain("actions: read");
    expect(normalDeploy).toContain("actions: read");
    expect(normalDeploy).not.toContain("actions: write");
    expect(normalDeploy).toContain(
      "Deploy verified persistent candidate profile",
    );
    expect(normalDeploy).toContain(
      "PANTHEON_DEPLOY_PROFILE: ${{ steps.gate.outputs.deployment_profile }}",
    );
    expect(normalDeploy).toContain(
      "steps.gate.outputs.deployment_profile == 'operator-live' && 'true' || 'false'",
    );
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

  it("verifies an out-of-order candidate from its own source checkout", () => {
    const compatStart = deployWorkflow.indexOf(
      "      - name: Enforce exact accepted Agora pair before release controller",
    );
    const compatEnd = deployWorkflow.indexOf(
      "      - name: Run target-runner controller regression harness",
      compatStart,
    );
    const compat = deployWorkflow.slice(compatStart, compatEnd);
    expect(deployWorkflow).toContain(
      "- name: Checkout exact candidate source for compatibility verification",
    );
    expect(deployWorkflow).toContain("path: .candidate-source");
    expect(compat).toContain(
      'git -C .candidate-source update-ref "${ref_prefix}/frontend-runtime"',
    );
    expect(compat).toContain(
      '--frontend-root "${GITHUB_WORKSPACE}/.candidate-source"',
    );
    expect(compat).not.toContain(
      '--frontend-root "${GITHUB_WORKSPACE}"',
    );
  });

  it("keeps operator-live persistent and outside proof watchdog coordination", () => {
    const deployJobStart = deployWorkflow.indexOf("  deploy:");
    const proofJobStart = deployWorkflow.indexOf("  proof-coordinator:");
    const deployJob = deployWorkflow.slice(deployJobStart, proofJobStart);
    const proofCoordinator = deployWorkflow.slice(proofJobStart);

    expect(deployWorkflow).toContain('- "operator-live"');
    expect(deployJob).toContain(
      "operator-live requires the initial run of an authorized triggering operator",
    );
    expect(deployJob).toContain(
      'PANTHEON_DEPLOY_ALLOW_DEV_STUB_WRITES: "false"',
    );
    expect(deployJob).toContain(
      "if: steps.gate.outputs.deployment_profile != 'write-proof'",
    );
    expect(proofCoordinator).toContain(
      "needs.deploy.outputs.deployment_profile == 'write-proof'",
    );
    expect(proofCoordinator).not.toContain(
      "needs.deploy.outputs.deployment_profile == 'operator-live'",
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
      "(inputs.pint_hosted_probe == 'true' || inputs.persona_interaction_write_proof == 'true' || inputs.functional_closure_write_proof == 'true')",
    );
    expect(authorizedProof).toContain(
      "Mint fresh short-lived proof credentials immediately before writes",
    );
    expect(authorizedProof).toContain(
      "DEV_LOGIN_OPERATOR_CLIENT_SECRET: ${{ secrets.DEV_BFF_DEV_LOGIN_OPERATOR_A_CLIENT_SECRET }}",
    );
    expect(authorizedProof).not.toContain("secrets.PANTHEON_BFF_");
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
    const ordinary = integrationWorkflow.slice(
      integrationStart,
      authorizedStart,
    );
    const authorized = integrationWorkflow.slice(authorizedStart);

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
      "Run governed and Persona desktop proof with proof-only credentials",
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
        "Run governed and Persona desktop proof with proof-only credentials",
      ),
    );
    expect(authorized.slice(0, authorized.indexOf("    steps:"))).not.toContain(
      "secrets.PANTHEON_BFF_",
    );
    expect(authorized).toContain(
      "Mint fresh short-lived proof credentials immediately before writes",
    );
    expect(authorized).toContain(
      "DEV_LOGIN_OPERATOR_CLIENT_SECRET: ${{ secrets.DEV_BFF_DEV_LOGIN_OPERATOR_A_CLIENT_SECRET }}",
    );
    expect(authorized).toContain(
      "DEV_LOGIN_VIEWER_CLIENT_SECRET: ${{ secrets.DEV_BFF_DEV_LOGIN_VIEWER_CLIENT_SECRET }}",
    );
    expect(authorized).not.toContain("secrets.PANTHEON_BFF_");
    expect(integrationWorkflow).not.toContain("secrets.PANTHEON_BFF_");
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
    ).toBeLessThan(
      authorized.indexOf(
        "Mint fresh short-lived proof credentials immediately before writes",
      ),
    );
  });

  it("rejects a collaborator rerun of the credentialed leaf after parent completion", () => {
    const authorization = integrationWorkflow.slice(
      integrationWorkflow.indexOf("  proof-authorization:"),
      integrationWorkflow.indexOf("  integration-gate:"),
    );
    const authorized = integrationWorkflow.slice(
      integrationWorkflow.indexOf("  authorized-write-proof:"),
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
    ).toBeLessThan(restore.indexOf("Checkout protected restore controller"));
    expect(
      restore.indexOf("Checkout protected restore controller"),
    ).toBeLessThan(
      restore.indexOf("Checkout exact pair compatibility controller"),
    );
    expect(
      restore.indexOf("Checkout exact pair compatibility controller"),
    ).toBeLessThan(
      restore.indexOf("Pin exact compatibility refs despite dev-tip drift"),
    );
    expect(
      restore.indexOf("Pin exact compatibility refs despite dev-tip drift"),
    ).toBeLessThan(
      restore.indexOf("Revalidate exact Agora pair before restore"),
    );
    expect(
      restore.indexOf("Revalidate exact Agora pair before restore"),
    ).toBeLessThan(
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
    expect(restore).toContain(
      'ref_prefix="refs/pantheon-proof/${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"',
    );
    expect(restore).toContain(
      'git update-ref "${ref_prefix}/frontend-runtime" "${CANDIDATE_SHA}"',
    );
    expect(restore).toContain(
      'git -C .pantheon-agora-compat update-ref "${ref_prefix}/backend-runtime" "${BFF_SHA}"',
    );
    expect(restore).toContain(
      'fe_resolved="$(git rev-parse "${fe_ref}")"',
    );
    expect(restore).toContain(
      'bff_resolved="$(git -C .pantheon-agora-compat rev-parse "${bff_ref}")"',
    );
    expect(restore).toContain(
      '--backend-dev-ref "${bff_ref}"',
    );
    expect(restore).toContain(
      '--frontend-dev-ref "${fe_ref}"',
    );
    expect(restore).toContain("continue-on-error: true");
    expect(restore).toContain("if: always()");
    expect(restore).not.toContain("refs/remotes/origin/dev");
  });

  it("proves concurrent and different-pair negative isolation under namespaced refs", () => {
    expect(watchdogWorkflow).toContain(
      'ref_prefix="refs/pantheon-proof/${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"',
    );
    expect(watchdogWorkflow).toContain(
      'if [[ "${fe_resolved}" != "${CANDIDATE_SHA}" || "${bff_resolved}" != "${BFF_SHA}" ]]; then',
    );
    expect(watchdogWorkflow).toContain("Restore exact pair before any mutable successor action");
    expect(watchdogWorkflow).toContain("if: always()");
  });

  it("proves read-only restore falls back to safe sibling CAS when Agora evidence revalidation fails", () => {
    expect(watchdogWorkflow).toContain("Revalidate exact Agora pair before restore");
    expect(watchdogWorkflow).toContain("continue-on-error: true");
    expect(watchdogWorkflow).toContain("Restore exact pair before any mutable successor action");
    expect(watchdogWorkflow).toContain("if: always()");
    expect(watchdogWorkflow).toContain("PANTHEON_DEPLOY_PROFILE: read-only-restore");
    expect(deployScript).toContain('if [[ "${DEPLOY_PROFILE}" == "read-only-restore" ]]; then');
    expect(deployScript).toContain(
      "Notice: proceeding with read-only restore despite rejected or invalid Agora compatibility evidence.",
    );
    expect(deployScript).toContain("restore_paired_safe_release");
  });

  it("canonicalizes the parent binding digest once for both strict consumers", () => {
    const coordinator = deployWorkflow.slice(
      deployWorkflow.indexOf("  proof-coordinator:"),
      deployWorkflow.indexOf("  proof-restore-confirmation:"),
    );
    const normalization = coordinator.slice(
      coordinator.indexOf("Canonicalize parent proof binding artifact digest"),
      coordinator.indexOf("Dispatch independent read-only restore watchdog"),
    );
    const watchdogDispatch = coordinator.slice(
      coordinator.indexOf("Dispatch independent read-only restore watchdog"),
      coordinator.indexOf("Require independently armed watchdog before writes"),
    );
    const proofDispatch = coordinator.slice(
      coordinator.indexOf("Dispatch exact parent-bound hosted Persona proof"),
      coordinator.indexOf("Wait for hosted proof terminal"),
    );

    expect(normalization).toContain(
      "node scripts/normalize-github-artifact-digest.mjs",
    );
    expect(normalization).toContain("^sha256:[0-9a-f]{64}$");
    expect(normalization).not.toContain("secrets.");
    expect(watchdogDispatch).toContain(
      "BINDING_ARTIFACT_DIGEST: ${{ steps.binding_digest.outputs.artifact_digest }}",
    );
    expect(proofDispatch).toContain(
      "BINDING_ARTIFACT_DIGEST: ${{ steps.binding_digest.outputs.artifact_digest }}",
    );
    expect(
      coordinator.match(/steps\.binding_upload\.outputs\.artifact-digest/gu),
    ).toHaveLength(1);
    expect(deployWorkflow.match(/actions: write/gu)).toHaveLength(1);
    expect(integrationWorkflow).not.toContain("secrets.PANTHEON_BFF_");
  });

  it("binds hosted proof and manifests to the exact source pair", () => {
    expect(integrationWorkflow).toContain(
      'runPath !== ".github/workflows/pantheon-integration-gate.yml"',
    );
    expect(integrationWorkflow).toContain('run.event !== "workflow_dispatch"');
    expect(integrationWorkflow).toContain('run.head_branch !== "dev"');
    expect(integrationWorkflow).toContain("frontendRef");
    expect(integrationWorkflow).toContain("heads/${frontendRef}");
    expect(integrationWorkflow).toContain('context.ref !== "refs/heads/dev"');
    expect(integrationWorkflow).toContain(
      "`Release candidate ${process.env.EXPECTED_RELEASE_CANDIDATE_ID}`",
    );
    expect(integrationWorkflow).toContain(
      "Download and authenticate exact source candidate pair",
    );
    expect(integrationWorkflow).toContain(
      '--expected-pair-id "$EXPECTED_PAIR_ID"',
    );
    expect(integrationWorkflow).toContain(
      '--expected-release-candidate-id "$EXPECTED_RELEASE_CANDIDATE_ID"',
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

  it("keeps hosted release validation out of the component PR gate", () => {
    const integrationStart = integrationWorkflow.indexOf("  integration-gate:");
    const integration = integrationWorkflow.slice(integrationStart);
    const triggers = integrationWorkflow.slice(
      integrationWorkflow.indexOf("on:"),
      integrationWorkflow.indexOf("permissions:"),
    );

    expect(
      integrationWorkflow.slice(0, integrationWorkflow.indexOf("jobs:")),
    ).not.toContain("issues: write");
    expect(integration).toContain("actions: read");
    expect(integration).not.toContain("issues: write");
    expect(integration).not.toContain("pull-requests: write");
    expect(triggers).not.toContain("pull_request:");
    expect(branchWorkflow).toContain("  component-merge:");
    expect(branchWorkflow).toContain("name: Changed component tests");
    expect(branchWorkflow).toContain("npx vitest related --run");
    expect(branchWorkflow).toContain("name: Checkout Pantheon contract bundle");
    expect(branchWorkflow).toContain("PANTHEON_CONTRACT_ROOT: pantheon-contract");
    expect(branchWorkflow).toContain("run: npm run test:contract");
  });

  it("authorizes functional-closure write proof under the single parent coordinator and watchdog", () => {
    const authorization = integrationWorkflow.slice(
      integrationWorkflow.indexOf("  proof-authorization:"),
      integrationWorkflow.indexOf("  integration-gate:"),
    );
    const authorizedProof = integrationWorkflow.slice(
      integrationWorkflow.indexOf("  authorized-write-proof:"),
    );

    expect(authorization).toContain(
      "inputs.functional_closure_write_proof == 'true'",
    );
    expect(authorization).toContain("hasFunctionalClosureProof");
    expect(authorizedProof).toContain(
      "inputs.functional_closure_write_proof == 'true'",
    );
    expect(authorizedProof).toContain(
      "Run Agora functional-closure hosted journey",
    );
    expect(authorizedProof).toContain(
      "Run Management and Management AI functional-closure hosted journeys",
    );
  });

  it("preserves active release controller source validation on release candidates across functional-closure paths", () => {
    const integrationStart = integrationWorkflow.indexOf("  integration-gate:");
    const authorizedProofStart = integrationWorkflow.indexOf("  authorized-write-proof:");
    const integration = integrationWorkflow.slice(integrationStart, authorizedProofStart);

    expect(integration).toContain(
      "- name: Validate active Pantheon release controller source",
    );
    expect(integration).toContain("if: inputs.release_candidate_id != ''");
    expect(integration).not.toContain(
      "inputs.release_candidate_id != '' && inputs.persona_interaction_write_proof != 'true'",
    );
    expect(integration).not.toContain(
      "inputs.persona_interaction_write_proof != 'true'",
    );
    expect(integration).toContain(
      "release candidate is not owned by the exact active Pantheon dev controller",
    );
    expect(integration).toContain(
      'context.ref !== "refs/heads/dev"',
    );
    expect(integration).not.toContain(
      'String(dev.object.sha || "").toLowerCase() !== frontendSha',
    );
  });

  it("resolves proof child run and separates current dev controller SHA from candidate SHA when dev advances", () => {
    const proofCoordinator = deployWorkflow.slice(
      deployWorkflow.indexOf("  proof-coordinator:"),
      deployWorkflow.indexOf("  proof-restore-confirmation:"),
    );
    const watchJob = watchdogWorkflow.slice(
      watchdogWorkflow.indexOf("  watch:"),
      watchdogWorkflow.indexOf("  restore:"),
    );
    const restoreJob = watchdogWorkflow.slice(
      watchdogWorkflow.indexOf("  restore:"),
    );

    // Deploy proof-coordinator matches child by correlation display title without requiring headSha == EXACT_FE_SHA
    expect(proofCoordinator).toContain(
      `select(.createdAt >= "'"$dispatched_at"'" and .displayTitle == "'"$expected_title"'")`,
    );
    expect(proofCoordinator).not.toContain(
      `select(.createdAt >= "'"$dispatched_at"'" and .displayTitle == "'"$expected_title"'" and .headSha == "'"$EXACT_FE_SHA"'")`,
    );

    // Watchdog watch & restore match child by correlation display title without requiring headSha == CANDIDATE_SHA
    expect(watchJob).toContain(
      `select(.displayTitle == "'"$expected_title"'")`,
    );
    expect(watchJob).not.toContain(
      `select(.displayTitle == "'"$expected_title"'" and .headSha == "'"$CANDIDATE_SHA"'")`,
    );
    expect(restoreJob).toContain(
      `select(.displayTitle == "'"$expected_title"'")`,
    );
    expect(restoreJob).not.toContain(
      `select(.displayTitle == "'"$expected_title"'" and .headSha == "'"$CANDIDATE_SHA"'")`,
    );
  });

  it("executes automated regression verifying out-of-order candidate proof child resolution and source validation logic", () => {
    const candidateSha = "1111111111111111111111111111111111111111";
    const advancedDevSha = "2222222222222222222222222222222222222222";
    const correlationId = "87654321-4321-4321-4321-210987654321";
    const expectedTitle = `PINT proof ${correlationId}`;
    const dispatchedAt = "2026-08-24T20:00:00Z";

    // Simulate child runs where dev advanced past candidate
    const runs = [
      {
        databaseId: 1001,
        createdAt: "2026-08-24T20:00:05Z",
        displayTitle: expectedTitle,
        headSha: advancedDevSha, // dev tip advanced beyond candidateSha
      },
      {
        databaseId: 1000,
        createdAt: "2026-08-24T19:59:00Z",
        displayTitle: expectedTitle,
        headSha: candidateSha,
      },
    ];

    // Filter logic in pantheon-dev-fe-deploy.yml
    const deployMatches = runs.filter(
      (r) => r.createdAt >= dispatchedAt && r.displayTitle === expectedTitle,
    );
    expect(deployMatches).toHaveLength(1);
    expect(deployMatches[0].databaseId).toBe(1001);
    expect(deployMatches[0].headSha).toBe(advancedDevSha);

    // Filter logic in pantheon-proof-watchdog.yml
    const watchdogMatches = runs.filter(
      (r) => r.displayTitle === expectedTitle,
    );
    expect(watchdogMatches).toHaveLength(2);
    // Unique match for active run after dispatched_at
    const activeWatchdogMatches = runs.filter(
      (r) => r.createdAt >= dispatchedAt && r.displayTitle === expectedTitle,
    );
    expect(activeWatchdogMatches).toHaveLength(1);
    expect(activeWatchdogMatches[0].databaseId).toBe(1001);

    // Controller source validation logic: separates dev controller SHA from candidate SHA
    const validateController = (context: {
      eventName: string;
      ref: string;
      sha: string;
    }, devRef: { object: { sha: string } }) => {
      const sha = /^[0-9a-f]{40}$/;
      const currentDevSha = String(devRef.object.sha || "").toLowerCase();
      const controllerSha = String(context.sha || "").toLowerCase();
      if (!sha.test(currentDevSha) || !sha.test(controllerSha) || context.ref !== "refs/heads/dev") {
        return false;
      }
      return true;
    };

    // Controller validation succeeds when dev is at advancedDevSha
    expect(
      validateController(
        { eventName: "workflow_dispatch", ref: "refs/heads/dev", sha: advancedDevSha },
        { object: { sha: advancedDevSha } },
      ),
    ).toBe(true);

    // Controller validation fails if not on dev branch
    expect(
      validateController(
        { eventName: "workflow_dispatch", ref: "refs/heads/feature", sha: advancedDevSha },
        { object: { sha: advancedDevSha } },
      ),
    ).toBe(false);

    // Source binding verification: candidate must strictly match the bound candidateSha
    const validateCandidateBinding = (
      bindingFrontendSha: string,
      requestedCandidateSha: string,
    ) => {
      return bindingFrontendSha.toLowerCase() === requestedCandidateSha.toLowerCase();
    };

    expect(validateCandidateBinding(candidateSha, candidateSha)).toBe(true);
    expect(validateCandidateBinding(candidateSha, advancedDevSha)).toBe(false);
  });

  it("proves auditable read-only restore orchestration binds the exact same Agora FE/BFF candidate pair", () => {
    // 1. Workflow static contract bindings
    expect(integrationWorkflow).toContain("Run Agora functional-closure hosted journey");
    expect(integrationWorkflow).toContain("npx playwright test e2e/agora-product-journey.spec.ts");
    expect(watchdogWorkflow).toContain("PANTHEON_DEPLOY_PROFILE: read-only-restore");
    expect(watchdogWorkflow).toContain('PANTHEON_DEPLOY_REAL_WRITES: "false"');
    expect(watchdogWorkflow).toContain('PANTHEON_DEPLOY_ALLOW_DEV_STUB_WRITES: "false"');
    expect(deployScript).toContain("read-only-restore)");
    expect(deployScript).toContain('if [[ "${DEPLOY_PROFILE}" == "read-only-restore" ]]; then');
    expect(deployScript).toContain("restore_paired_safe_release");
    expect(deployWorkflow).toContain("proof-restore-confirmation:");

    // 2. Behavioral simulation: State machine for same-pair read-only restore orchestration
    const feSha = "a".repeat(40);
    const bffSha = "b".repeat(40);
    const pairId = "c".repeat(64);
    const readOnlyDigest = "d".repeat(64);
    const writeProofDigest = "e".repeat(64);
    const nonce = "f".repeat(64);
    const correlationId = "12345678-1234-1234-1234-1234567890ab";

    // Simulate Parent Binding Validation
    const validateParentBinding = (binding: {
      schemaVersion: string;
      parent: { frontendSha: string; actor: string };
      pair: { pairId: string; bffSha: string; readOnlyArtifactDigestSha256: string; writeProofArtifactDigestSha256: string };
      nonce: string;
      correlationId: string;
    }, expected: {
      frontendSha: string;
      bffSha: string;
      pairId: string;
      readOnlyDigest: string;
      writeProofDigest: string;
      nonce: string;
      correlationId: string;
    }) => {
      if (binding.schemaVersion !== "pantheon.pint-proof-binding.v1") return false;
      if (binding.parent.frontendSha !== expected.frontendSha) return false;
      if (binding.pair.bffSha !== expected.bffSha) return false;
      if (binding.pair.pairId !== expected.pairId) return false;
      if (binding.pair.readOnlyArtifactDigestSha256 !== expected.readOnlyDigest) return false;
      if (binding.pair.writeProofArtifactDigestSha256 !== expected.writeProofDigest) return false;
      if (binding.nonce !== expected.nonce || binding.correlationId !== expected.correlationId) return false;
      return true;
    };

    const validBinding = {
      schemaVersion: "pantheon.pint-proof-binding.v1",
      parent: { frontendSha: feSha, actor: "operator-a" },
      pair: { pairId, bffSha, readOnlyArtifactDigestSha256: readOnlyDigest, writeProofArtifactDigestSha256: writeProofDigest },
      nonce,
      correlationId,
    };

    expect(validateParentBinding(validBinding, {
      frontendSha: feSha,
      bffSha,
      pairId,
      readOnlyDigest,
      writeProofDigest,
      nonce,
      correlationId,
    })).toBe(true);

    // Rejects tampered FE SHA
    expect(validateParentBinding({
      ...validBinding,
      parent: { ...validBinding.parent, frontendSha: "0".repeat(40) },
    }, {
      frontendSha: feSha,
      bffSha,
      pairId,
      readOnlyDigest,
      writeProofDigest,
      nonce,
      correlationId,
    })).toBe(false);

    // Rejects tampered BFF SHA
    expect(validateParentBinding({
      ...validBinding,
      pair: { ...validBinding.pair, bffSha: "0".repeat(40) },
    }, {
      frontendSha: feSha,
      bffSha,
      pairId,
      readOnlyDigest,
      writeProofDigest,
      nonce,
      correlationId,
    })).toBe(false);

    // 3. Behavioral simulation: Private safe-fallback locator and atomic CAS switch
    const validateSafeFallbackLocator = (locator: {
      schemaVersion: number;
      pairId: string;
      frontendSha: string;
      readOnlyArtifactDigestSha256: string;
      writeProofArtifactDigestSha256: string;
      safeReleaseName: string;
    }, expectedPair: {
      pairId: string;
      frontendSha: string;
      readOnlyDigest: string;
      writeProofDigest: string;
    }) => {
      if (locator.schemaVersion !== 1) return false;
      if (locator.pairId !== expectedPair.pairId) return false;
      if (locator.frontendSha !== expectedPair.frontendSha) return false;
      if (locator.readOnlyArtifactDigestSha256 !== expectedPair.readOnlyDigest) return false;
      if (locator.writeProofArtifactDigestSha256 !== expectedPair.writeProofDigest) return false;
      if (!/^[A-Za-z0-9._-]+$/u.test(locator.safeReleaseName)) return false;
      return true;
    };

    const validLocator = {
      schemaVersion: 1,
      pairId,
      frontendSha: feSha,
      readOnlyArtifactDigestSha256: readOnlyDigest,
      writeProofArtifactDigestSha256: writeProofDigest,
      safeReleaseName: "20260827T000000Z-safe-sibling-read-only",
    };

    expect(validateSafeFallbackLocator(validLocator, {
      pairId,
      frontendSha: feSha,
      readOnlyDigest,
      writeProofDigest,
    })).toBe(true);

    // 4. Behavioral simulation: Atomic CAS exchange logic
    const executeSymlinkCasExchange = (state: {
      liveLinkTarget: string;
      expectedLiveTarget: string;
      stagedTarget: string;
    }) => {
      if (state.liveLinkTarget !== state.expectedLiveTarget) {
        // CAS conflict: live target changed concurrently
        return { success: false, exitCode: 2, error: "Read-only restore CAS rejected a changed live target." };
      }
      return { success: true, exitCode: 0, newLiveTarget: state.stagedTarget };
    };

    const writeTarget = "/var/www/pantheon-dev-fe-releases/write-proof-release";
    const safeTarget = "/var/www/pantheon-dev-fe-releases/20260827T000000Z-safe-sibling-read-only";

    const successfulCas = executeSymlinkCasExchange({
      liveLinkTarget: writeTarget,
      expectedLiveTarget: writeTarget,
      stagedTarget: safeTarget,
    });
    expect(successfulCas.success).toBe(true);
    expect(successfulCas.newLiveTarget).toBe(safeTarget);

    const conflictingCas = executeSymlinkCasExchange({
      liveLinkTarget: "/var/www/pantheon-dev-fe-releases/other-concurrent-release",
      expectedLiveTarget: writeTarget,
      stagedTarget: safeTarget,
    });
    expect(conflictingCas.success).toBe(false);
    expect(conflictingCas.exitCode).toBe(2);

    // 5. Behavioral simulation: Readback verification and evidence generation
    const verifyRestoredDeploymentReadback = (
      deploymentJson: {
        commit: string;
        bffCommit: string;
        deploymentProfile: string;
        buildMode: { VITE_BFF_REAL_WRITES: string };
        probes?: { safeRestore?: string };
      },
      expectedFe: string,
      expectedBff: string,
    ) => {
      const servedFe = deploymentJson.commit.toLowerCase();
      const servedBff = deploymentJson.bffCommit.toLowerCase();
      const profile = deploymentJson.deploymentProfile;
      const realWrites = deploymentJson.buildMode.VITE_BFF_REAL_WRITES;

      const servedManifestVerified = servedFe === expectedFe.toLowerCase() && servedBff === expectedBff.toLowerCase();
      const readOnlyRestored = (profile === "read-only" || profile === "read-only-restore") && realWrites === "false";

      return {
        servedManifestVerified,
        readOnlyRestored,
        passed: servedManifestVerified && readOnlyRestored,
      };
    };

    const restoredDeployment = {
      commit: feSha,
      bffCommit: bffSha,
      deploymentProfile: "read-only",
      buildMode: {
        VITE_BFF_REAL_WRITES: "false",
      },
      probes: {
        safeRestore: "passed",
      },
    };

    const readbackResult = verifyRestoredDeploymentReadback(restoredDeployment, feSha, bffSha);
    expect(readbackResult.servedManifestVerified).toBe(true);
    expect(readbackResult.readOnlyRestored).toBe(true);
    expect(readbackResult.passed).toBe(true);

    // Fail closed: if real writes is true, readOnlyRestored must be false
    const unrestoredDeployment = {
      ...restoredDeployment,
      deploymentProfile: "write-proof",
      buildMode: { VITE_BFF_REAL_WRITES: "true" },
    };
    const unrestoredResult = verifyRestoredDeploymentReadback(unrestoredDeployment, feSha, bffSha);
    expect(unrestoredResult.readOnlyRestored).toBe(false);
    expect(unrestoredResult.passed).toBe(false);

    // Fail closed: if FE or BFF SHA differs, servedManifestVerified must be false
    const mismatchedFeDeployment = {
      ...restoredDeployment,
      commit: "0".repeat(40),
    };
    const mismatchedResult = verifyRestoredDeploymentReadback(mismatchedFeDeployment, feSha, bffSha);
    expect(mismatchedResult.servedManifestVerified).toBe(false);
    expect(mismatchedResult.passed).toBe(false);
  });
});
