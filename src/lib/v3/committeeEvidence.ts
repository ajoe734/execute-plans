// v3 §18 Committee Evidence Pack. Resolves G51 / G58.

export type EvidenceMime =
  | "application/pdf" | "text/markdown" | "text/plain"
  | "text/csv" | "image/png" | "image/jpeg";

export const COMMITTEE_EVIDENCE_ALLOWED_MIMES: readonly EvidenceMime[] = [
  "application/pdf", "text/markdown", "text/plain",
  "text/csv", "image/png", "image/jpeg",
] as const;

export interface EvidenceFile {
  id: string;
  fileName: string;
  mimeType: EvidenceMime;
  sizeBytes: number;
  storageUrl: string;
  extractedTextStatus: "not_started" | "running" | "completed" | "failed";
}

export interface LinkedEntity {
  type: "strategy" | "signal" | "incident" | "research_note" | "artifact";
  id: string;
}

export interface CommitteeEvidencePack {
  id: string;
  sessionId: string;
  targetEntityType: LinkedEntity["type"];
  targetEntityId: string;
  uploadedFiles: EvidenceFile[];
  linkedEntities: LinkedEntity[];
  notes: string;
  createdBy: string;
  createdAt: string;
}

export const EVIDENCE_LIMITS = {
  maxFilesPerPack: 12,
  maxFileSizeBytes: 20 * 1024 * 1024,
  maxTotalSizeBytes: 100 * 1024 * 1024,
} as const;

export interface EvidenceUploadError {
  code: "too_many_files" | "file_too_large" | "total_too_large" | "mime_not_allowed" | "missing_metadata";
  fileName?: string;
}

export function validateEvidenceUpload(
  existing: EvidenceFile[],
  incoming: { fileName: string; mimeType: string; sizeBytes: number; metadata?: { source?: string; title?: string; uploadedBy?: string; createdAt?: string } }[],
): EvidenceUploadError[] {
  const errs: EvidenceUploadError[] = [];
  if (existing.length + incoming.length > EVIDENCE_LIMITS.maxFilesPerPack) {
    errs.push({ code: "too_many_files" });
  }
  let total = existing.reduce((s, f) => s + f.sizeBytes, 0);
  for (const f of incoming) {
    total += f.sizeBytes;
    if (f.sizeBytes > EVIDENCE_LIMITS.maxFileSizeBytes) errs.push({ code: "file_too_large", fileName: f.fileName });
    if (!COMMITTEE_EVIDENCE_ALLOWED_MIMES.includes(f.mimeType as EvidenceMime)) errs.push({ code: "mime_not_allowed", fileName: f.fileName });
    const md = f.metadata ?? {};
    if (!md.source || !md.title || !md.uploadedBy || !md.createdAt) errs.push({ code: "missing_metadata", fileName: f.fileName });
  }
  if (total > EVIDENCE_LIMITS.maxTotalSizeBytes) errs.push({ code: "total_too_large" });
  return errs;
}

export const COMMITTEE_EVIDENCE_ENDPOINTS = {
  createPack: (sessionId: string) => `/bff/agora/committee/${sessionId}/evidence-pack`,
  uploadFiles: (sessionId: string) => `/bff/agora/committee/${sessionId}/evidence-pack/files`,
} as const;
