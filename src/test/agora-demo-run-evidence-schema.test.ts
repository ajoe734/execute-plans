import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv from "ajv";
import {
  requireHostedManifestPairId,
  writeDemoRunEvidence,
  type AgoraDemoRunEvidence,
} from "../../e2e/agora-hosted-evidence";

describe("Agora Demo Run Evidence Schema", () => {
  const schemaPath = join(process.cwd(), "docs/contracts/agora/demo-run-evidence.v1.schema.json");
  const rawSchema = readFileSync(schemaPath, "utf-8");
  const schema = JSON.parse(rawSchema);
  const ajv = new Ajv({ allErrors: true });
  const validate = ajv.compile(schema);

  it("loads and parses demo-run-evidence.v1.schema.json", () => {
    expect(schema.schema_version?.const || schema.properties?.schema_version?.const).toBe(
      "pantheon.agora.demo-run-evidence.v1",
    );
    expect(schema.required).toContain("demo_run_id");
    expect(schema.required).toContain("exact_pair");
    expect(schema.required).toContain("objects");
    expect(schema.required).toContain("negative_controls");
    expect(schema.required).toContain("restoration");
  });

  it("validates a conforming evidence payload against the JSON schema", () => {
    const validSample: AgoraDemoRunEvidence = {
      schema_version: "pantheon.agora.demo-run-evidence.v1",
      demo_run_id: "demo-test-123",
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      status: "passed",
      exact_pair: {
        frontend_sha: "a".repeat(40),
        bff_sha: "b".repeat(40),
        manifest_pair_id: "c".repeat(64),
      },
      profile: "bounded-write-proof",
      objects: {
        proposal_id: "prop-123",
        persona_id: "agora-servant-dev",
        workshop_id: "ws-123",
        message_event_id: "evt-123",
        reconstruction_id: "recon-123",
        strategy_id: "strat-123",
        version_id: "ver-123",
        interaction_id: "int-123",
      },
      steps: [
        {
          id: "interaction_terminal_readback",
          status: "passed",
          receipt_ref: "int-123",
          readback_ref: "int-123",
        },
      ],
      negative_controls: {
        viewer_write_denied: true,
        cross_tenant_non_enumerating: true,
        no_order_route_proof: true,
      },
      restoration: {
        read_only_restored: true,
        served_manifest_verified: true,
      },
    };

    const valid = validate(validSample);
    expect(validate.errors).toBeNull();
    expect(valid).toBe(true);

    for (const invalidPairId of [
      "",
      "0".repeat(64),
      "c".repeat(63),
      "a".repeat(40) + ":" + "b".repeat(40),
    ]) {
      expect(validate({
        ...validSample,
        exact_pair: { ...validSample.exact_pair, manifest_pair_id: invalidPairId },
      })).toBe(false);
    }
  });

  it("fails validation if required fields are missing", () => {
    const invalidSample = {
      schema_version: "pantheon.agora.demo-run-evidence.v1",
      demo_run_id: "demo-test-456",
      // missing negative_controls and restoration
    };
    const valid = validate(invalidSample);
    expect(valid).toBe(false);
    expect(validate.errors).not.toBeNull();
  });

  it("fails validation if zero SHAs or zero pair IDs are provided", () => {
    const baseSample: AgoraDemoRunEvidence = {
      schema_version: "pantheon.agora.demo-run-evidence.v1",
      demo_run_id: "demo-test-123",
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      status: "passed",
      exact_pair: {
        frontend_sha: "0".repeat(40),
        bff_sha: "b".repeat(40),
        manifest_pair_id: "c".repeat(64),
      },
      profile: "bounded-write-proof",
      objects: {
        proposal_id: "prop-123",
        persona_id: "agora-servant-dev",
        workshop_id: "ws-123",
        message_event_id: "evt-123",
        reconstruction_id: "recon-123",
        strategy_id: "strat-123",
        version_id: "ver-123",
        interaction_id: "int-123",
      },
      steps: [
        {
          id: "interaction_terminal_readback",
          status: "passed",
          receipt_ref: "int-123",
          readback_ref: "int-123",
        },
      ],
      negative_controls: {
        viewer_write_denied: true,
        cross_tenant_non_enumerating: true,
        no_order_route_proof: true,
      },
      restoration: {
        read_only_restored: true,
        served_manifest_verified: true,
      },
    };

    expect(validate(baseSample)).toBe(false);

    const bffZeroSample = {
      ...baseSample,
      exact_pair: {
        frontend_sha: "a".repeat(40),
        bff_sha: "0".repeat(40),
        manifest_pair_id: "c".repeat(64),
      },
    };
    expect(validate(bffZeroSample)).toBe(false);
  });

  it("fails validation if object IDs contain unknown or are empty (case-insensitively)", () => {
    const baseSample: AgoraDemoRunEvidence = {
      schema_version: "pantheon.agora.demo-run-evidence.v1",
      demo_run_id: "demo-test-123",
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      status: "passed",
      exact_pair: {
        frontend_sha: "a".repeat(40),
        bff_sha: "b".repeat(40),
        manifest_pair_id: "c".repeat(64),
      },
      profile: "bounded-write-proof",
      objects: {
        proposal_id: "prop-123",
        persona_id: "agora-servant-dev",
        workshop_id: "ws-123",
        message_event_id: "evt-123",
        reconstruction_id: "recon-123",
        strategy_id: "strat-123",
        version_id: "ver-123",
        interaction_id: "int-123",
      },
      steps: [
        {
          id: "interaction_terminal_readback",
          status: "passed",
          receipt_ref: "int-123",
          readback_ref: "int-123",
        },
      ],
      negative_controls: {
        viewer_write_denied: true,
        cross_tenant_non_enumerating: true,
        no_order_route_proof: true,
      },
      restoration: {
        read_only_restored: false,
        served_manifest_verified: true,
      },
    };

    // Rejects lowercase "unknown"
    expect(validate({
      ...baseSample,
      objects: { ...baseSample.objects, proposal_id: "prop-unknown" },
    })).toBe(false);

    // Rejects uppercase "UNKNOWN"
    expect(validate({
      ...baseSample,
      objects: { ...baseSample.objects, proposal_id: "prop-UNKNOWN" },
    })).toBe(false);

    // Rejects mixed-case "Unknown" and "UnKnOwN"
    expect(validate({
      ...baseSample,
      objects: { ...baseSample.objects, persona_id: "agora-Unknown-dev" },
    })).toBe(false);

    expect(validate({
      ...baseSample,
      objects: { ...baseSample.objects, workshop_id: "ws-UnKnOwN-99" },
    })).toBe(false);

    // Rejects UNKNOWN in demo_run_id
    expect(validate({
      ...baseSample,
      demo_run_id: "demo-UNKNOWN-123",
    })).toBe(false);

    // Rejects UNKNOWN in step receipt_ref or readback_ref
    expect(validate({
      ...baseSample,
      steps: [
        {
          id: "interaction_terminal_readback",
          status: "passed",
          receipt_ref: "receipt-UNKNOWN",
        },
      ],
    })).toBe(false);

    // Rejects empty ID
    expect(validate({
      ...baseSample,
      objects: { ...baseSample.objects, interaction_id: "" },
    })).toBe(false);
  });

  it("fails validation if negative controls or restoration are false when status=passed", () => {
    const sampleWithFalseNegControl: AgoraDemoRunEvidence = {
      schema_version: "pantheon.agora.demo-run-evidence.v1",
      demo_run_id: "demo-test-123",
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      status: "passed",
      exact_pair: {
        frontend_sha: "a".repeat(40),
        bff_sha: "b".repeat(40),
        manifest_pair_id: "c".repeat(64),
      },
      profile: "bounded-write-proof",
      objects: {
        proposal_id: "prop-123",
        persona_id: "agora-servant-dev",
        workshop_id: "ws-123",
        message_event_id: "evt-123",
        reconstruction_id: "recon-123",
        strategy_id: "strat-123",
        version_id: "ver-123",
        interaction_id: "int-123",
      },
      steps: [
        {
          id: "interaction_terminal_readback",
          status: "passed",
          receipt_ref: "int-123",
          readback_ref: "int-123",
        },
      ],
      negative_controls: {
        viewer_write_denied: false,
        cross_tenant_non_enumerating: true,
        no_order_route_proof: true,
      },
      restoration: {
        read_only_restored: false,
        served_manifest_verified: true,
      },
    };

    expect(validate(sampleWithFalseNegControl)).toBe(false);

    const sampleWithFalseServedManifest = {
      ...sampleWithFalseNegControl,
      negative_controls: {
        viewer_write_denied: true,
        cross_tenant_non_enumerating: true,
        no_order_route_proof: true,
      },
      restoration: {
        read_only_restored: true,
        served_manifest_verified: false,
      },
    };
    expect(validate(sampleWithFalseServedManifest)).toBe(false);

    // Profile read-only with read_only_restored false must fail
    const readOnlyUnrestoredSample: AgoraDemoRunEvidence = {
      ...sampleWithFalseNegControl,
      profile: "read-only",
      negative_controls: {
        viewer_write_denied: true,
        cross_tenant_non_enumerating: true,
        no_order_route_proof: true,
      },
      restoration: {
        read_only_restored: false,
        served_manifest_verified: true,
      },
    };
    expect(validate(readOnlyUnrestoredSample)).toBe(false);
  });

  it("fails validation if steps are skipped or failed when status=passed", () => {
    const sampleWithSkippedStep: AgoraDemoRunEvidence = {
      schema_version: "pantheon.agora.demo-run-evidence.v1",
      demo_run_id: "demo-test-123",
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      status: "passed",
      exact_pair: {
        frontend_sha: "a".repeat(40),
        bff_sha: "b".repeat(40),
        manifest_pair_id: "c".repeat(64),
      },
      profile: "bounded-write-proof",
      objects: {
        proposal_id: "prop-123",
        persona_id: "agora-servant-dev",
        workshop_id: "ws-123",
        message_event_id: "evt-123",
        reconstruction_id: "recon-123",
        strategy_id: "strat-123",
        version_id: "ver-123",
        interaction_id: "int-123",
      },
      steps: [
        {
          id: "interaction_terminal_readback",
          status: "skipped",
          receipt_ref: "int-123",
          readback_ref: "int-123",
        },
      ],
      negative_controls: {
        viewer_write_denied: true,
        cross_tenant_non_enumerating: true,
        no_order_route_proof: true,
      },
      restoration: {
        read_only_restored: true,
        served_manifest_verified: true,
      },
    };

    expect(validate(sampleWithSkippedStep)).toBe(false);
  });

  it("writeDemoRunEvidence outputs valid structured JSON", () => {
    const sample: AgoraDemoRunEvidence = {
      schema_version: "pantheon.agora.demo-run-evidence.v1",
      demo_run_id: "demo-test-123",
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      status: "passed",
      exact_pair: {
        frontend_sha: "a".repeat(40),
        bff_sha: "b".repeat(40),
        manifest_pair_id: "c".repeat(64),
      },
      profile: "bounded-write-proof",
      objects: {
        proposal_id: "prop-123",
        persona_id: "agora-servant-dev",
        workshop_id: "ws-123",
        message_event_id: "evt-123",
        reconstruction_id: "recon-123",
        strategy_id: "strat-123",
        version_id: "ver-123",
        interaction_id: "int-123",
      },
      steps: [
        {
          id: "interaction_terminal_readback",
          status: "passed",
          receipt_ref: "int-123",
          readback_ref: "int-123",
        },
      ],
      negative_controls: {
        viewer_write_denied: true,
        cross_tenant_non_enumerating: true,
        no_order_route_proof: true,
      },
      restoration: {
        read_only_restored: true,
        served_manifest_verified: true,
      },
    };

    const outDir = "/tmp/agora-demo-test-evidence";
    const written = writeDemoRunEvidence(outDir, sample);
    const parsed = JSON.parse(readFileSync(written, "utf-8"));
    expect(parsed.schema_version).toBe("pantheon.agora.demo-run-evidence.v1");
    expect(parsed.demo_run_id).toBe("demo-test-123");
    expect(parsed.objects.proposal_id).toBe("prop-123");
  });
});

describe("Hosted Agora artifact-pair identity readback", () => {
  const pairId = "c".repeat(64);
  const manifest = { pairId, pair: { pairId } };

  it("preserves the actual served digest and validates the parent's independent expectation", () => {
    expect(requireHostedManifestPairId(manifest, pairId)).toBe(pairId);
    expect(requireHostedManifestPairId(manifest)).toBe(pairId);
  });

  it.each([
    null,
    {},
    { pairId },
    { pair: { pairId } },
    { pairId, pair: { pairId: "d".repeat(64) } },
    { pairId: "0".repeat(64), pair: { pairId: "0".repeat(64) } },
    {
      pairId: "a".repeat(40) + ":" + "b".repeat(40),
      pair: { pairId: "a".repeat(40) + ":" + "b".repeat(40) },
    },
  ])("rejects missing, contradictory, or fabricated commit-pair identities: %j", (invalid) => {
    expect(() => requireHostedManifestPairId(invalid)).toThrow(/matching SHA-256/u);
  });

  it.each(["", "d".repeat(64), "0".repeat(64), "c".repeat(63)])(
    "fails closed for an invalid or mismatched parent expectation: %s",
    (expected) => {
      expect(() => requireHostedManifestPairId(manifest, expected)).toThrow(/authenticated expectation/u);
    },
  );

  it("rejects a pair switch during the journey even when both served fields agree", () => {
    const original = requireHostedManifestPairId(manifest, pairId);
    const changed = { pairId: "d".repeat(64), pair: { pairId: "d".repeat(64) } };
    expect(() => requireHostedManifestPairId(changed, original)).toThrow(/authenticated expectation/u);
  });

  it("binds browser evidence to served readback and retains the parent's exact verifier", () => {
    const journey = readFileSync(join(process.cwd(), "e2e/agora-product-journey.spec.ts"), "utf8");
    const workflow = readFileSync(join(process.cwd(), ".github/workflows/pantheon-integration-gate.yml"), "utf8");
    const parent = readFileSync(join(process.cwd(), ".github/workflows/pantheon-dev-fe-deploy.yml"), "utf8");
    expect(journey).toContain("requireHostedManifestPairId(deployment, EXPECTED_PAIR_ID)");
    expect(journey).toContain("const manifestPairId = await assertOperatorLiveCandidate(page)");
    expect(journey).toContain("requireHostedManifestPairId(dep, manifestPairId)");
    expect(journey).toContain("manifest_pair_id: manifestPairId");
    expect(journey).not.toContain("manifest_pair_id: `${feSha}:${bffSha}`");
    expect(workflow).toContain("EXPECTED_PAIR_ID: ${{ inputs.expected_pair_id }}");
    expect(parent).toContain("if manifest_pair != expected_pair:");
  });
});
