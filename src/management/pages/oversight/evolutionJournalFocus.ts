export type EvolutionJournalView = "history" | "auto_proposals" | "all";

export function normalizeEvolutionJournalView(value: string | null | undefined): EvolutionJournalView {
  const clean = value?.trim().toLowerCase() ?? "";
  if (clean === "auto_proposals" || clean === "all" || clean === "history") {
    return clean;
  }
  return "history";
}

export interface EvolutionJournalEntry {
  id: string;
  title?: string;
  summary?: string;
  status?: string;
  entryType?: string;
  entry_type?: string;
  source_id?: string;
  action_type?: string;
  evidence_class?: string;
  evidenceClass?: string;
  persona_id?: string;
  personaId?: string;
  route?: string;
  target?: { type?: string; id?: string; version?: string } | null;
  decision?: Record<string, unknown> | null;
  mutation_review?: Record<string, unknown> | null;
  record?: { evidence_refs?: unknown; [key: string]: unknown } | null;
}

function safeSerialize(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function evolutionEntryText(e: EvolutionJournalEntry): string {
  const target = e.target ? [e.target.type, e.target.id, e.target.version].filter(Boolean).join(" ") : "";
  const evidenceRefs = Array.isArray(e.record?.evidence_refs)
    ? e.record.evidence_refs.map((ref) => JSON.stringify(ref)).join(" ")
    : "";
  return [
    e.id,
    e.title,
    e.summary,
    e.status,
    e.entryType,
    e.entry_type,
    e.source_id,
    e.action_type,
    e.evidence_class,
    e.evidenceClass,
    e.persona_id,
    e.personaId,
    e.route,
    target,
    evidenceRefs,
    safeSerialize(e.decision),
    safeSerialize(e.mutation_review),
    safeSerialize(e.record),
  ].filter(Boolean).join(" ").toLowerCase();
}

export function normalizeEvolutionFocusToken(value: string | null, rejectDate = false): string {
  const candidate = value?.trim() ?? "";
  if (!candidate || ["nan", "undefined", "null", "none", "n/a", "na"].includes(candidate.toLowerCase())) return "";
  if (rejectDate && /^\d{4}[-/]\d{2}[-/]\d{2}(?:[ T]|$)/.test(candidate)) return "";
  return candidate;
}

export function filterEvolutionJournalRowsForFocus<T extends EvolutionJournalEntry>(
  rows: T[],
  focus: { personaFocus?: string; mutationFocus?: string },
): { rows: T[]; matched: boolean } {
  let scoped = rows;
  let matched = true;
  const mutationFocus = focus.mutationFocus?.trim() ?? "";
  const personaFocus = focus.personaFocus?.trim() ?? "";

  if (mutationFocus) {
    const needle = mutationFocus.toLowerCase();
    const next = scoped.filter((entry) => evolutionEntryText(entry).includes(needle));
    matched = matched && next.length > 0;
    scoped = next;
  }

  if (personaFocus) {
    const needle = personaFocus.toLowerCase();
    const next = scoped.filter((entry) => evolutionEntryText(entry).includes(needle));
    matched = matched && next.length > 0;
    scoped = next;
  }

  return { rows: scoped, matched };
}

// ---------------------------------------------------------------------------
// FE-EVO-JOURNAL-DIRECTION-20261125 presentation helpers (pure, no i18n here)
// ---------------------------------------------------------------------------

export interface PoolMemberRef {
  artifact_ref: string;
  stage?: string | null;
  risk_weight?: number | null;
}

export type PoolMemberChange =
  | { kind: "added"; member: PoolMemberRef }
  | { kind: "removed"; member: PoolMemberRef }
  | { kind: "changed"; ref: string; from: PoolMemberRef; to: PoolMemberRef };

export function normalizePoolMembers(raw: unknown): PoolMemberRef[] {
  if (!Array.isArray(raw)) return [];
  const out: PoolMemberRef[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const ref = typeof rec.artifact_ref === "string" ? rec.artifact_ref.trim() : "";
    if (!ref) continue;
    out.push({
      artifact_ref: ref,
      stage: typeof rec.stage === "string" ? rec.stage : null,
      risk_weight: typeof rec.risk_weight === "number" && Number.isFinite(rec.risk_weight) ? rec.risk_weight : null,
    });
  }
  return out;
}

/** Before/after diff computed only from the member lists the BFF returned. */
export function diffPoolMembers(before: PoolMemberRef[], after: PoolMemberRef[]): PoolMemberChange[] {
  const b = new Map(before.map((m) => [m.artifact_ref, m]));
  const a = new Map(after.map((m) => [m.artifact_ref, m]));
  const changes: PoolMemberChange[] = [];
  for (const m of after) {
    const prev = b.get(m.artifact_ref);
    if (!prev) changes.push({ kind: "added", member: m });
    else if (prev.stage !== m.stage || prev.risk_weight !== m.risk_weight) {
      changes.push({ kind: "changed", ref: m.artifact_ref, from: prev, to: m });
    }
  }
  for (const m of before) if (!a.has(m.artifact_ref)) changes.push({ kind: "removed", member: m });
  return changes;
}

/** Last known token of an owner reason code such as `registry_entry_unreadable:TimeoutError`. */
export function splitReasonCode(code: string | null | undefined): { head: string; raw: string } | null {
  const raw = code?.trim();
  if (!raw) return null;
  return { head: raw.split(":")[0].trim(), raw };
}

const TEST_CLASS_VALUES = new Set(["test", "acceptance", "fixture", "synthetic", "seed", "sandbox"]);

function classToken(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/**
 * True only when the BFF / owner RECORDED the row as a test record, via a
 * classification or origin field. Never decided from the row name. A row with
 * no such field is not a test record (stays visible).
 */
export function isRecordedTestRecord(row: unknown): boolean {
  if (!row || typeof row !== "object") return false;
  const rec = row as Record<string, unknown>;
  const meta = rec.metadata && typeof rec.metadata === "object" ? (rec.metadata as Record<string, unknown>) : {};
  for (const key of ["subject_class", "record_class", "classification", "data_scope", "origin_class"]) {
    if (TEST_CLASS_VALUES.has(classToken(rec[key])) || TEST_CLASS_VALUES.has(classToken(meta[key]))) return true;
  }
  if (rec.is_test === true || rec.isTest === true || meta.is_test === true) return true;
  return TEST_CLASS_VALUES.has(classToken(rec.origin)) || TEST_CLASS_VALUES.has(classToken(rec.originKind));
}
