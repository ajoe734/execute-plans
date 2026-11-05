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
