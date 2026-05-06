// v4 / Pack C §C045 — Reproducibility lock.

export interface ReproducibilityRecord {
  seed: string;
  dataSnapshotId: string;
  codeCommit: string;
  configHash: string;
  dockerImageDigest?: string;
  createdAt: string;
}
