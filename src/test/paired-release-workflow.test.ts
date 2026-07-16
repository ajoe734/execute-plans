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
    expect(integrationWorkflow).toContain("--profile read-only");
    expect(integrationWorkflow).toContain("--profile write-proof");
    expect(integrationWorkflow).toContain("PANTHEON_CANDIDATE_PAIR_ID");
    expect(integrationWorkflow).toContain(
      "PANTHEON_EXPECTED_WRITE_PROOF_DIGEST",
    );
    expect(integrationWorkflow).toContain(
      "node scripts/serve-release-candidate.mjs .release-candidate/dist",
    );
    expect(integrationWorkflow).toContain(
      "name: pantheon-fe-release-candidate-attempt-${{ github.run_attempt }}",
    );
    expect(integrationWorkflow).toContain("github.event_name == 'push' &&");
    expect(integrationWorkflow).toContain("github.ref == 'refs/heads/dev' &&");
  });

  it("admits write-proof only for an authorized exact manual deploy and restores the pair", () => {
    expect(deployWorkflow).toContain('"read-only"');
    expect(deployWorkflow).toContain('"write-proof"');
    expect(deployWorkflow).toContain("proof_window_ack:");
    expect(deployWorkflow).toContain(
      "workflow_run deployments are always read-only",
    );
    expect(deployWorkflow).toContain(
      "write-proof cannot be combined with emergency_override or rollback_drill",
    );
    expect(deployWorkflow).toContain(
      "write-proof requires an authorized deploy operator",
    );
    expect(deployWorkflow).toContain(
      "Verify authenticated paired candidate identity",
    );
    expect(deployWorkflow).toContain(
      "PANTHEON_DEPLOY_EXPECTED_PAIR_ID: ${{ steps.pair.outputs.pair_id }}",
    );
    expect(deployWorkflow).toContain(
      "PANTHEON_DEPLOY_PROFILE: ${{ steps.gate.outputs.deployment_profile }}",
    );
    expect(deployWorkflow).toContain(
      "PANTHEON_DEPLOY_PROFILE: read-only-restore",
    );
    expect(deployWorkflow).toContain(
      "if: always() && steps.pair.outcome == 'success' && steps.gate.outputs.deployment_profile == 'write-proof'",
    );
    expect(
      deployWorkflow.indexOf("Restore the same authenticated pair read-only"),
    ).toBeLessThan(
      deployWorkflow.indexOf(
        "Cancel or confirm correlated proof terminal after safe restore",
      ),
    );
  });

  it("binds hosted proof to one successful dev-push artifact and paired manifest", () => {
    expect(integrationWorkflow).toContain(
      'runPath !== ".github/workflows/pantheon-integration-gate.yml"',
    );
    expect(integrationWorkflow).toContain('run.event !== "push"');
    expect(integrationWorkflow).toContain('run.head_branch !== "dev"');
    expect(integrationWorkflow).toContain(
      "Hosted write proof requires the exact current dev tip",
    );
    expect(integrationWorkflow).toContain(
      "Hosted PINT proof source artifact does not match the exact immutable dev-push pair",
    );
    expect(integrationWorkflow).toContain(
      "Download and authenticate exact source candidate pair",
    );
    expect(integrationWorkflow).toContain(
      "actions/artifacts/${SOURCE_ARTIFACT_ID}/zip",
    );
    expect(integrationWorkflow).toContain(
      '--expected-pair-id "$EXPECTED_PAIR_ID"',
    );
    expect(integrationWorkflow).toContain("pint-source-pair.txt");
    expect(integrationWorkflow).toContain(
      "Verify exact paired hosted deployment before PINT proof",
    );
    expect(integrationWorkflow).toContain(
      "Verify exact paired hosted deployment after all PINT proof steps",
    );
    expect(integrationWorkflow).toContain("deployment-before-pint.json");
    expect(integrationWorkflow).toContain(
      "deployment-after-all-proof-steps.json",
    );
    expect(integrationWorkflow).toContain("pint-proof-correlation.json");
    expect(integrationWorkflow).toContain('manifest.profile === "write-proof"');
    expect(integrationWorkflow).toContain(
      "manifest.pair?.readOnlyArtifactDigestSha256",
    );
    expect(integrationWorkflow).toContain(
      "manifest.pair?.writeProofArtifactDigestSha256",
    );
    expect(deployWorkflow).toContain(
      "gh workflow run pantheon-integration-gate.yml",
    );
    expect(deployWorkflow).toContain(
      '-f source_gate_run_id="$SOURCE_GATE_RUN_ID"',
    );
    expect(deployWorkflow).toContain(
      '-f source_artifact_id="$SOURCE_ARTIFACT_ID"',
    );
    expect(deployWorkflow).toContain('-f expected_pair_id="$EXPECTED_PAIR_ID"');
    expect(deployWorkflow).toContain(
      '-f proof_correlation_id="$proof_correlation_id"',
    );
    expect(deployWorkflow).toContain('require("node:crypto").randomUUID()');
    expect(deployWorkflow).toContain("gh run watch");
    expect(deployWorkflow).toContain("gh run cancel");
  });
});
