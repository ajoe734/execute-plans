import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv from "ajv";
import {
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
        manifest_pair_id: "a".repeat(40) + ":" + "b".repeat(40),
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
        manifest_pair_id: "0".repeat(40) + ":" + "b".repeat(40),
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
        manifest_pair_id: "a".repeat(40) + ":" + "0".repeat(40),
      },
    };
    expect(validate(bffZeroSample)).toBe(false);
  });

  it("fails validation if object IDs contain unknown or are empty", () => {
    const sampleWithUnknown: AgoraDemoRunEvidence = {
      schema_version: "pantheon.agora.demo-run-evidence.v1",
      demo_run_id: "demo-test-123",
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      status: "passed",
      exact_pair: {
        frontend_sha: "a".repeat(40),
        bff_sha: "b".repeat(40),
        manifest_pair_id: "a".repeat(40) + ":" + "b".repeat(40),
      },
      profile: "bounded-write-proof",
      objects: {
        proposal_id: "prop-unknown",
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

    expect(validate(sampleWithUnknown)).toBe(false);
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
        manifest_pair_id: "a".repeat(40) + ":" + "b".repeat(40),
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
        read_only_restored: true,
        served_manifest_verified: true,
      },
    };

    expect(validate(sampleWithFalseNegControl)).toBe(false);

    const sampleWithFalseRestore = {
      ...sampleWithFalseNegControl,
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
    expect(validate(sampleWithFalseRestore)).toBe(false);
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
        manifest_pair_id: "a".repeat(40) + ":" + "b".repeat(40),
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
        manifest_pair_id: "a".repeat(40) + ":" + "b".repeat(40),
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

