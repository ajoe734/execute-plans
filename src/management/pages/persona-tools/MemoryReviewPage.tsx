import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import {
  getMemoryReview, quarantineLessonCandidate, type LessonCandidate, type MemoryScope,
} from "@/lib/bff-v1/agora/learning";
import {
  OutcomeView, ReadBoundary, WriteGateNote, textInput,
  useLearningRead, useLearningWriteAccess, usePersonaIdParam, type ActionOutcome,
} from "@/agora/pages/learning/shared";
import { EnumText, PersonaPicker, ToolPageShell, useEnumLabel } from "./shared";

function entrySummary(entry: Record<string, unknown>): string | null {
  for (const key of ["title", "summary", "lesson", "content", "text"]) {
    const value = entry[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function Quarantine({ candidate, quarantined, onDone }: { candidate: LessonCandidate; quarantined: boolean; onDone: () => void }) {
  const { t } = useTranslation();
  const write = useLearningWriteAccess();
  const [reason, setReason] = useState("");
  const [audit, setAudit] = useState("");
  const [outcome, setOutcome] = useState<ActionOutcome | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const res = await quarantineLessonCandidate({ memoryId: candidate.lesson_candidate_id, reason: reason.trim(), auditReceiptId: audit.trim() });
    if (res.state === "ok") {
      setOutcome({ kind: "receipt", title: t("agora.learning.memory.quarantineReceipt"), value: res.data });
      onDone();
    } else setOutcome({ kind: "unavailable", reason: res.reason });
  };
  // After the refresh marks the candidate quarantined, the form goes away but the receipt stays.
  if (quarantined) return <OutcomeView outcome={outcome} />;
  return (
    <form onSubmit={submit} className="mt-2 flex flex-wrap items-end gap-2">
      <label className="text-xs">{t("agora.learning.memory.reason")}
        <input className={`${textInput} ml-1`} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <label className="text-xs">{t("agora.learning.memory.auditReceipt")}
        <input className={`${textInput} ml-1`} value={audit} onChange={(e) => setAudit(e.target.value)} />
      </label>
      <button type="submit" className="rounded border border-border px-2 py-1 text-xs disabled:opacity-50"
        disabled={!write.allowed || !reason.trim() || !audit.trim()}>
        {t("agora.learning.memory.quarantine")}
      </button>
      <OutcomeView outcome={outcome} />
    </form>
  );
}

export function MemoryReviewPage() {
  const { t } = useTranslation();
  const [personaId, setPersonaId] = usePersonaIdParam();
  const [scope, setScope] = useState<MemoryScope>(personaId ? "both" : "institutional");
  const write = useLearningWriteAccess();
  const label = useEnumLabel();
  const { result, reload } = useLearningRead(
    () => getMemoryReview({ personaId: personaId || undefined, scope }),
    `memory:${personaId}:${scope}`,
  );
  return (
    <ToolPageShell title={t("nav.personaMemoryReview")} subtitle={t("personaTools.memory.subtitle")} testId="management-persona-memory-page">
      <div className="flex flex-wrap items-end gap-4">
        <PersonaPicker personaId={personaId} onChange={setPersonaId} />
        <label className="flex flex-col text-xs text-muted-foreground">{t("agora.learning.memory.scope")}
          <select className={`${textInput} mt-1`} value={scope} onChange={(e) => setScope(e.target.value as MemoryScope)}>
            {(["both", "persona", "institutional"] as const).map((value) => (
              <option key={value} value={value}>{label("scope", value)}</option>
            ))}
          </select>
        </label>
      </div>
      <WriteGateNote reason={write.reason} />
      <ReadBoundary result={result}>
        {(review) => (
          <>
            <section data-testid="memory-entries">
              <h2 className="mb-2 font-medium">{t("agora.learning.memory.entries")}</h2>
              <ul className="space-y-1 text-sm">
                {review.entries.map((hit, i) => (
                  <li key={String(hit.entry.memory_id ?? hit.entry.entry_id ?? i)} className="rounded border border-border p-2">
                    <EnumText group="memoryType" value={hit.type} /> · {entrySummary(hit.entry) ?? t("personaTools.memory.untitledEntry", { n: i + 1 })}
                    <span className="ml-2 text-xs text-muted-foreground">{t("personaTools.reference")}: <code>{String(hit.entry.memory_id ?? hit.entry.entry_id ?? "")}</code></span>
                  </li>
                ))}
              </ul>
            </section>
            <section data-testid="memory-candidates">
              <h2 className="mb-2 font-medium">{t("agora.learning.memory.candidates")}</h2>
              <ul className="space-y-2 text-sm">
                {review.lesson_candidates.map((c) => (
                  <li key={c.lesson_candidate_id} className="rounded border border-border p-2" data-testid={`candidate-${c.lesson_candidate_id}`}>
                    <p className="font-medium">{c.proposed_change || t("personaTools.memory.untitledCandidate")}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("personaTools.state")}: <EnumText group="state" value={c.review_state} />
                      {" · "}{t("personaTools.reference")}: <code>{c.lesson_candidate_id}</code>
                    </p>
                    <Quarantine candidate={c} quarantined={c.review_state === "quarantined"} onDone={reload} />
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </ReadBoundary>
    </ToolPageShell>
  );
}
