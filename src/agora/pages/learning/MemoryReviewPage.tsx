import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import {
  getMemoryReview, quarantineLessonCandidate, type LessonCandidate, type MemoryScope,
} from "@/lib/bff-v1/agora/learning";
import {
  OutcomeView, PageShell, PersonaIdField, ReadBoundary, WriteGateNote, textInput,
  useLearningRead, useLearningWriteAccess, usePersonaIdParam, type ActionOutcome,
} from "./shared";

function Quarantine({ candidate, onDone }: { candidate: LessonCandidate; onDone: () => void }) {
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
  const { result, reload } = useLearningRead(
    () => getMemoryReview({ personaId: personaId || undefined, scope }),
    `memory:${personaId}:${scope}`,
  );
  return (
    <PageShell title={t("agora.learning.memory.title")} testId="agora-memory-page">
      <div className="flex flex-wrap items-end gap-4">
        <PersonaIdField personaId={personaId} onChange={setPersonaId} />
        <label className="flex flex-col text-xs text-muted-foreground">{t("agora.learning.memory.scope")}
          <select className={`${textInput} mt-1`} value={scope} onChange={(e) => setScope(e.target.value as MemoryScope)}>
            <option value="both">both</option>
            <option value="persona">persona</option>
            <option value="institutional">institutional</option>
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
                    <code>{String(hit.entry.memory_id ?? hit.entry.entry_id)}</code> · {hit.type}
                  </li>
                ))}
              </ul>
            </section>
            <section data-testid="memory-candidates">
              <h2 className="mb-2 font-medium">{t("agora.learning.memory.candidates")}</h2>
              <ul className="space-y-2 text-sm">
                {review.lesson_candidates.map((c) => (
                  <li key={c.lesson_candidate_id} className="rounded border border-border p-2" data-testid={`candidate-${c.lesson_candidate_id}`}>
                    <code>{c.lesson_candidate_id}</code> · {c.review_state ?? t("agora.learning.notReported")}
                    {c.proposed_change ? <p>{c.proposed_change}</p> : null}
                    {c.review_state !== "quarantined" ? <Quarantine candidate={c} onDone={reload} /> : null}
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </ReadBoundary>
    </PageShell>
  );
}
