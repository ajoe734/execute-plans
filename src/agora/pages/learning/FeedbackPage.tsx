import { useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import {
  getPersonaHumanEvidence, submitHumanEvidence, type HumanEvidenceKind,
} from "@/lib/bff-v1/agora/learning";
import { idempotencyKey } from "@/lib/bff-v1/headers";
import {
  OutcomeView, PageShell, PersonaIdField, ReadBoundary, WriteGateNote, textInput,
  useLearningRead, useLearningWriteAccess, usePersonaIdParam, type ActionOutcome,
} from "./shared";

const KINDS: Array<{ kind: HumanEvidenceKind; field: string }> = [
  { kind: "signal-feedback", field: "feedback" },
  { kind: "notes", field: "note" },
  { kind: "insights", field: "insight" },
  { kind: "training-examples", field: "example" },
];

function EvidenceForm({ kind, field, personaId, onDone }: { kind: HumanEvidenceKind; field: string; personaId: string; onDone: () => void }) {
  const { t } = useTranslation();
  const write = useLearningWriteAccess();
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [consent, setConsent] = useState(false);
  const [outcome, setOutcome] = useState<ActionOutcome | null>(null);
  // A submission freezes its full payload (evidence_id, captured_at) and
  // Idempotency-Key. Re-sending identical content (a retry, even after a
  // lost response) replays that exact request; any edit rotates both ids.
  const attempt = useRef<{ signature: string; key: string; payload: Parameters<typeof submitHumanEvidence>[1] } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const signature = JSON.stringify([personaId, subject.trim(), text.trim(), consent]);
    if (!attempt.current || attempt.current.signature !== signature) {
      attempt.current = {
        signature,
        key: idempotencyKey(),
        payload: {
          evidence_id: `ev-${idempotencyKey()}`,
          persona_id: personaId,
          subject_ref: subject.trim(),
          content: { [field]: text.trim() },
          source_refs: [],
          captured_at: new Date().toISOString(),
          consent_granted: consent,
          learning_eligible: true,
          retention_days: 30,
          environment_ceiling: "paper",
        },
      };
    }
    const res = await submitHumanEvidence(kind, attempt.current.payload, attempt.current.key);
    if (res.state === "ok") {
      setOutcome({ kind: "receipt", title: t("agora.learning.feedback.receipt"), value: res.data });
      onDone();
    } else setOutcome({ kind: "unavailable", reason: res.reason });
  };

  return (
    <form onSubmit={submit} className="space-y-2 rounded border border-border p-3" data-testid={`feedback-form-${kind}`}>
      <h3 className="font-medium">{t(`agora.learning.feedback.kind.${kind}`)}</h3>
      <label className="block text-xs">{t("agora.learning.feedback.subject")}
        <input className={`${textInput} ml-1`} value={subject} onChange={(e) => setSubject(e.target.value)} />
      </label>
      <label className="block text-xs">{t("agora.learning.feedback.content")}
        <textarea className={`${textInput} mt-1 block w-full`} rows={3} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        {t("agora.learning.feedback.consent")}
      </label>
      <button type="submit" className="rounded border border-border px-3 py-1 text-sm disabled:opacity-50"
        disabled={!write.allowed || !subject.trim() || !text.trim() || !consent}>
        {t("agora.learning.feedback.submit")}
      </button>
      <OutcomeView outcome={outcome} />
    </form>
  );
}

export function FeedbackPage() {
  const { t } = useTranslation();
  const [personaId, setPersonaId] = usePersonaIdParam();
  const write = useLearningWriteAccess();
  const { result, reload } = useLearningRead(personaId ? () => getPersonaHumanEvidence(personaId) : null, `evidence:${personaId}`);
  return (
    <PageShell title={t("agora.learning.feedback.title")} testId="agora-feedback-page">
      <PersonaIdField personaId={personaId} onChange={setPersonaId} />
      <WriteGateNote reason={write.reason} />
      {!personaId ? <p className="text-sm text-muted-foreground" data-testid="learning-persona-required">{t("agora.learning.persona.required")}</p> : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {KINDS.map((k) => <EvidenceForm key={`${personaId}:${k.kind}`} {...k} personaId={personaId} onDone={reload} />)}
          </div>
          <section data-testid="feedback-observed">
            <h2 className="mb-2 font-medium">{t("agora.learning.feedback.observed")}</h2>
            <ReadBoundary result={result}>
              {(obs) => (
                <ul className="space-y-1 text-sm">
                  {obs.items.map((item, i) => <li key={String(item.evidence_id ?? i)} className="rounded border border-border p-2"><code>{String(item.evidence_id ?? "")}</code> · {String(item.evidence_type ?? "")}</li>)}
                </ul>
              )}
            </ReadBoundary>
          </section>
        </>
      )}
    </PageShell>
  );
}
