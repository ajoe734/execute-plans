/**
 * Structured evidence builder and helper functions for Agora hosted browser proof.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface AgoraHostedProofPayload {
  schema_version: "pantheon.agora.hosted-browser-evidence.v1";
  task_id: string;
  timestamp: string;
  fe_base_url: string;
  bff_base_url: string;
  expected_fe_sha: string;
  expected_bff_sha: string;
  tenant_id: string;
  winner_branch_evidence?: Record<string, unknown>;
  responsive_parity_evidence?: Record<string, unknown>;
  rollback_drill: {
    executed: boolean;
    failure_injection_rejected: boolean;
    last_accepted_pair_restored: boolean;
    evidence: string;
  };
}

export function writeHostedProofEvidence(outDir: string, payload: AgoraHostedProofPayload): string {
  mkdirSync(outDir, { recursive: true });
  const targetPath = join(outDir, "agora-hosted-proof-evidence.json");
  writeFileSync(targetPath, JSON.stringify(payload, null, 2), "utf-8");
  return targetPath;
}
