import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  writeDemoRunEvidence,
  type AgoraDemoRunEvidence,
} from "../../e2e/agora-hosted-evidence";

describe("Agora Demo Run Evidence Schema", () => {
  it("loads and parses demo-run-evidence.v1.schema.json", () => {
    const schemaPath = join(process.cwd(), "docs/contracts/agora/demo-run-evidence.v1.schema.json");
    const raw = readFileSync(schemaPath, "utf-8");
    const schema = JSON.parse(raw);
    expect(schema.schema_version?.const || schema.properties?.schema_version?.const).toBe(
      "pantheon.agora.demo-run-evidence.v1",
    );
    expect(schema.required).toContain("demo_run_id");
    expect(schema.required).toContain("exact_pair");
    expect(schema.required).toContain("objects");
    expect(schema.required).toContain("negative_controls");
    expect(schema.required).toContain("restoration");
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
