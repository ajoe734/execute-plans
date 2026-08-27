/**
 * Structured evidence builder and helper functions for Agora hosted browser proof.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface AgoraHostedProofPayload {
  schema_version: "pantheon.agora.hosted-browser-evidence.v2";
  task_id: string;
  timestamp: string;
  fe_base_url: string;
  bff_base_url: string;
  expected_fe_sha: string;
  expected_bff_sha: string;
  tenant_id: string;
  live_deployment_identity_verified: boolean;
  projects_run: string[];
  winner_branch_evidence?: Record<string, unknown>;
  responsive_parity_evidence?: Record<string, unknown>;
  /**
   * Deliberately no rollback_drill field. This workflow has no deploy
   * authority to inject a bad candidate or observe rejection/rollback --
   * that proof belongs to AGORA-HOSTED-DEPLOY-REACCEPT-20260815's six-gate
   * verifier and scripts/deploy-dev-vm.sh (see scripts/test-deploy-dev-vm.sh
   * for its real reject/rollback coverage). A prior version of this
   * workflow fabricated this field with hardcoded `true` values; do not
   * reintroduce it here or anywhere in this repo's hosted-acceptance path.
   */
  scope_note: string;
}

export interface AgoraDemoRunEvidence {
  schema_version: "pantheon.agora.demo-run-evidence.v1";
  demo_run_id: string;
  started_at: string;
  completed_at: string;
  status: "passed" | "failed" | "degraded";
  exact_pair: {
    frontend_sha: string;
    bff_sha: string;
    manifest_pair_id: string;
  };
  profile: "bounded-write-proof" | "operator-live" | "read-only";
  objects: {
    proposal_id: string;
    persona_id: string;
    workshop_id: string;
    message_event_id: string;
    reconstruction_id: string;
    strategy_id: string;
    version_id: string;
    interaction_id: string;
    [key: string]: unknown;
  };
  steps: Array<{
    id: string;
    status: "passed" | "failed" | "skipped";
    receipt_ref?: string;
    readback_ref?: string;
    [key: string]: unknown;
  }>;
  negative_controls: {
    viewer_write_denied: boolean;
    cross_tenant_non_enumerating: boolean;
    no_order_route_proof: boolean;
    [key: string]: unknown;
  };
  restoration: {
    read_only_restored: boolean;
    served_manifest_verified: boolean;
    [key: string]: unknown;
  };
}

export function writeHostedProofEvidence(outDir: string, payload: AgoraHostedProofPayload): string {
  mkdirSync(outDir, { recursive: true });
  const targetPath = join(outDir, "agora-hosted-proof-evidence.json");
  writeFileSync(targetPath, JSON.stringify(payload, null, 2), "utf-8");
  return targetPath;
}

export function writeDemoRunEvidence(outDir: string, payload: AgoraDemoRunEvidence): string {
  mkdirSync(outDir, { recursive: true });
  const targetPath = join(outDir, "agora-demo-run-evidence.json");
  writeFileSync(targetPath, JSON.stringify(payload, null, 2), "utf-8");
  return targetPath;
}
