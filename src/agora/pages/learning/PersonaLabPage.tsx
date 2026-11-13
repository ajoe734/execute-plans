import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import {
  acceptChange, draftPatch, draftSkillPatch, getChangeLog, getEvaluationRuns, getEvaluationSuites,
  getHarness, getShadowComparison, neverAgain, runShadow, submitPatch, tellWhy, undoChange,
  type ChangeLogEntry, type LearningRead,
} from "@/lib/bff-v1/agora/learning";
import {
  OutcomeView, PageShell, PersonaIdField, ReadBoundary, WriteGateNote, textInput,
  useLearningRead, useLearningWriteAccess, usePersonaIdParam, type ActionOutcome,
} from "./shared";

function useOutcome() {
  const [outcome, setOutcome] = useState<ActionOutcome | null>(null);
  const settle = <T,>(title: string, res: LearningRead<T>) => {
    setOutcome(res.state === "ok" ? { kind: "receipt", title, value: res.data } : { kind: "unavailable", reason: res.reason });
    return res.state === "ok";
  };
  return { outcome, settle };
}

// ─── Draft (patch or skill coaching) ─────────────────────────────────────────

function DraftPanel({ personaId, skill, onDone }: { personaId: string; skill: boolean; onDone: () => void }) {
  const { t } = useTranslation();
  const write = useLearningWriteAccess();
  const { outcome, settle } = useOutcome();
  const [text, setText] = useState("");
  const [parseError, setParseError] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    let body: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(text);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
      body = parsed as Record<string, unknown>;
    } catch {
      setParseError(true);
      return;
    }
    setParseError(false);
    const res = await (skill ? draftSkillPatch : draftPatch)(personaId, body);
    if (settle(t("agora.learning.lab.draftReceipt"), res)) onDone();
  };
  return (
    <form onSubmit={submit} data-testid={skill ? "skill-coaching-form" : "patch-draft-form"} className="space-y-2">
      <label className="block text-xs">{skill ? t("agora.learning.lab.skillBody") : t("agora.learning.lab.patchBody")}
        <textarea className={`${textInput} mt-1 block w-full font-mono`} rows={5} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      {parseError ? <p role="alert" className="text-xs text-destructive">{t("agora.learning.lab.invalidJson")}</p> : null}
      <button type="submit" className="rounded border border-border px-3 py-1 text-sm disabled:opacity-50" disabled={!write.allowed || !text.trim()}>
        {t("agora.learning.lab.createDraft")}
      </button>
      <OutcomeView outcome={outcome} />
    </form>
  );
}

// ─── Patch list: shadow run + submit ─────────────────────────────────────────

function PatchActions({ personaId, patchId, onDone }: { personaId: string; patchId: string; onDone: () => void }) {
  const { t } = useTranslation();
  const write = useLearningWriteAccess();
  const { outcome, settle } = useOutcome();
  const [adoptionRef, setAdoptionRef] = useState("");
  return (
    <div className="mt-1 space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="rounded border border-border px-2 py-1 text-xs disabled:opacity-50" disabled={!write.allowed}
          onClick={() => void runShadow(personaId, patchId).then((r) => { if (settle(t("agora.learning.lab.shadowReceipt"), r)) onDone(); })}>
          {t("agora.learning.lab.runShadow")}
        </button>
        <input aria-label={t("agora.learning.lab.adoptionRef")} placeholder={t("agora.learning.lab.adoptionRef")} className={textInput}
          value={adoptionRef} onChange={(e) => setAdoptionRef(e.target.value)} />
        <button type="button" className="rounded border border-border px-2 py-1 text-xs disabled:opacity-50" disabled={!write.allowed}
          onClick={() => void submitPatch(personaId, patchId, adoptionRef.trim() || undefined).then((r) => { if (settle(t("agora.learning.lab.submitReceipt"), r)) onDone(); })}>
          {t("agora.learning.lab.submit")}
        </button>
      </div>
      <OutcomeView outcome={outcome} />
    </div>
  );
}

function PatchesPanel({ personaId, revision }: { personaId: string; revision: number }) {
  const { t } = useTranslation();
  const { result, reload } = useLearningRead(() => getHarness(personaId), `harness:${personaId}`, revision);
  return (
    <ReadBoundary result={result}>
      {(state) => {
        const ids = Object.keys(state.patches ?? {});
        if (!ids.length) return <p className="text-sm text-muted-foreground">{t("agora.learning.lab.noPatches")}</p>;
        return (
          <ul className="space-y-2" data-testid="lab-patches">
            {ids.map((id) => (
              <li key={id} className="rounded border border-border p-2 text-sm" data-testid={`patch-${id}`}>
                <code>{id}</code> · {state.patches?.[id]?.status ?? t("agora.learning.notReported")}
                <PatchActions personaId={personaId} patchId={id} onDone={reload} />
              </li>
            ))}
          </ul>
        );
      }}
    </ReadBoundary>
  );
}

// ─── Evaluation ──────────────────────────────────────────────────────────────

function EvaluationPanel({ personaId }: { personaId: string }) {
  const { t } = useTranslation();
  const suites = useLearningRead(() => getEvaluationSuites(personaId), `suites:${personaId}`).result;
  const runs = useLearningRead(() => getEvaluationRuns(personaId), `runs:${personaId}`).result;
  return (
    <div className="space-y-3" data-testid="lab-evaluation">
      <ReadBoundary result={suites}>
        {(list) => (
          <ul className="text-sm">{list.map((s) => <li key={s.suite_id}><code>{s.suite_id}</code> · {t("agora.learning.lab.runsCount", { count: s.runs })}</li>)}</ul>
        )}
      </ReadBoundary>
      <ReadBoundary result={runs}>
        {(list) => (
          <ul className="space-y-1 text-sm">
            {list.map((r) => (
              <li key={r.run_id} className="rounded border border-border p-2">
                <code>{r.run_id}</code> · {r.status ?? t("agora.learning.notReported")} · {r.decision ?? t("agora.learning.notReported")}
                {r.reasons.length ? <span> · {r.reasons.join(", ")}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </ReadBoundary>
    </div>
  );
}

// ─── Shadow comparison ───────────────────────────────────────────────────────

function ShadowPanel({ personaId }: { personaId: string }) {
  const { t } = useTranslation();
  const [patchId, setPatchId] = useState("");
  const [applied, setApplied] = useState("");
  const { result } = useLearningRead(applied ? () => getShadowComparison(personaId, applied) : null, `shadow:${personaId}:${applied}`);
  const fmt = (v: unknown) => (v === undefined || v === null ? t("agora.learning.notReported") : typeof v === "string" ? v : JSON.stringify(v));
  return (
    <div data-testid="lab-shadow" className="space-y-2">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setApplied(patchId.trim()); }}>
        <input aria-label={t("agora.learning.lab.patchId")} placeholder={t("agora.learning.lab.patchId")} className={textInput} value={patchId} onChange={(e) => setPatchId(e.target.value)} />
        <button type="submit" className="rounded border border-border px-2 py-1 text-xs">{t("agora.learning.lab.compare")}</button>
      </form>
      {applied ? (
        <ReadBoundary result={result}>
          {(cmp) => (
            <table className="w-full text-xs">
              <thead><tr><th>{t("agora.learning.lab.decisionTime")}</th>{cmp.arms.map((a) => <th key={a}>{a}</th>)}<th>{t("agora.learning.lab.differs")}</th><th>{t("agora.learning.lab.bookDelta")}</th></tr></thead>
              <tbody>
                {cmp.rows.map((row, i) => (
                  <tr key={`${row.decision_time ?? "row"}-${i}`}>
                    <td>{fmt(row.decision_time)}</td>
                    {cmp.arms.map((a) => <td key={a}>{fmt((row as unknown as Record<string, unknown>)[a])}</td>)}
                    <td>{row.decisions_differ === null || row.decisions_differ === undefined ? t("agora.learning.notReported") : String(row.decisions_differ)}</td>
                    <td>{fmt(row.virtual_book_delta)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </ReadBoundary>
      ) : null}
    </div>
  );
}

// ─── Change log: accept / undo / never again / tell AI why ───────────────────

type ActionKind = "accept" | "undo" | "never_again" | "tell_why";

function ChangeEntry({ personaId, entry, onDone }: { personaId: string; entry: ChangeLogEntry; onDone: () => void }) {
  const { t } = useTranslation();
  const write = useLearningWriteAccess();
  const { outcome, settle } = useOutcome();
  const [action, setAction] = useState<ActionKind | null>(null);
  const [value, setValue] = useState("");
  const [why, setWhy] = useState({ reflection_id: "", episodes: "", version: "", expiry: "" });
  const patchId = entry.patch_id ?? "";

  const run = async (e: FormEvent) => {
    e.preventDefault();
    if (!action) return;
    let res: LearningRead<unknown>;
    if (action === "accept") res = await acceptChange(personaId, patchId, value.trim());
    else if (action === "undo") res = await undoChange(personaId, patchId, value.trim());
    else if (action === "never_again") res = await neverAgain(personaId, patchId, value.trim());
    else res = await tellWhy(personaId, patchId, {
      reflection_id: why.reflection_id.trim(),
      trade_episode_ids: why.episodes.split(",").map((s) => s.trim()).filter(Boolean),
      reflection_version: why.version.trim(),
      text: value.trim(),
      expiry: why.expiry.trim(),
    });
    if (settle(t(`agora.learning.lab.receipt.${action}`), res)) {
      setAction(null);
      setValue("");
      onDone(); // refresh: the recorded effect appears on the entry itself
    }
  };

  return (
    <li className="rounded border border-border p-2 text-sm" data-testid={`change-${patchId}`}>
      <p>v{String(entry.version)} · <code>{patchId}</code> · {entry.status ?? t("agora.learning.notReported")}
        {entry.active ? <strong> · {t("agora.learning.lab.active")}</strong> : null}</p>
      <p className="text-xs text-muted-foreground">
        {t("agora.learning.lab.evidence")}: {entry.evidence_refs.length ? entry.evidence_refs.join(", ") : t("agora.learning.notReported")}
      </p>
      {entry.experience ? <p className="text-xs" data-testid={`effect-experience-${patchId}`}>{t("agora.learning.lab.recordedExperience")}: {JSON.stringify(entry.experience)}</p> : null}
      {entry.operator_feedback ? <p className="text-xs">{t("agora.learning.lab.operatorFeedback")}: {JSON.stringify(entry.operator_feedback)}</p> : null}
      <div className="mt-1 flex flex-wrap gap-2">
        {entry.actions.map((a) => (
          <button key={a} type="button" className="rounded border border-border px-2 py-1 text-xs disabled:opacity-50"
            disabled={!write.allowed || !patchId} aria-pressed={action === a} onClick={() => setAction(a)}>
            {t(`agora.learning.lab.action.${a}`)}
          </button>
        ))}
      </div>
      {action ? (
        <form onSubmit={run} className="mt-2 space-y-1">
          <label className="block text-xs">{t(`agora.learning.lab.field.${action}`)}
            <input className={`${textInput} ml-1`} value={value} onChange={(e) => setValue(e.target.value)} />
          </label>
          {action === "tell_why" ? (
            <div className="grid grid-cols-2 gap-1">
              {(["reflection_id", "episodes", "version", "expiry"] as const).map((k) => (
                <input key={k} aria-label={t(`agora.learning.lab.why.${k}`)} placeholder={t(`agora.learning.lab.why.${k}`)} className={textInput}
                  value={why[k]} onChange={(e) => setWhy({ ...why, [k]: e.target.value })} />
              ))}
            </div>
          ) : null}
          <button type="submit" className="rounded border border-border px-2 py-1 text-xs disabled:opacity-50" disabled={!value.trim()}>{t("agora.learning.lab.confirm")}</button>
        </form>
      ) : null}
      <OutcomeView outcome={outcome} />
    </li>
  );
}

function ChangeLogPanel({ personaId, revision }: { personaId: string; revision: number }) {
  const { t } = useTranslation();
  const { result, reload } = useLearningRead(() => getChangeLog(personaId), `changelog:${personaId}`, revision);
  return (
    <ReadBoundary result={result}>
      {(log) => log.entries.length === 0
        ? <p className="text-sm text-muted-foreground">{t("agora.learning.lab.noChanges")}</p>
        : (
          <div data-testid="lab-changelog">
            <p className="text-xs text-muted-foreground">{t("agora.learning.lab.activeVersion")}: {String(log.active_version ?? t("agora.learning.notReported"))}</p>
            <ul className="space-y-2">{log.entries.map((e) => <ChangeEntry key={`${e.version}-${e.patch_id}`} personaId={personaId} entry={e} onDone={reload} />)}</ul>
          </div>
        )}
    </ReadBoundary>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export function PersonaLabPage() {
  const { t } = useTranslation();
  const [personaId, setPersonaId] = usePersonaIdParam();
  const write = useLearningWriteAccess();
  const [revision, setRevision] = useState(0);
  const bump = () => setRevision((n) => n + 1);
  return (
    <PageShell title={t("agora.learning.lab.title")} testId="agora-persona-lab-page">
      <PersonaIdField personaId={personaId} onChange={setPersonaId} />
      <WriteGateNote reason={write.reason} />
      {!personaId ? <p className="text-sm text-muted-foreground" data-testid="learning-persona-required">{t("agora.learning.persona.required")}</p> : (
        <div key={personaId} className="space-y-6">
          <section><h2 className="mb-2 font-medium">{t("agora.learning.lab.drafts")}</h2><DraftPanel personaId={personaId} skill={false} onDone={bump} /></section>
          <section><h2 className="mb-2 font-medium">{t("agora.learning.lab.skillCoaching")}</h2><DraftPanel personaId={personaId} skill onDone={bump} /></section>
          <section><h2 className="mb-2 font-medium">{t("agora.learning.lab.patches")}</h2><PatchesPanel personaId={personaId} revision={revision} /></section>
          <section><h2 className="mb-2 font-medium">{t("agora.learning.lab.evaluation")}</h2><EvaluationPanel personaId={personaId} /></section>
          <section><h2 className="mb-2 font-medium">{t("agora.learning.lab.shadow")}</h2><ShadowPanel personaId={personaId} /></section>
          <section><h2 className="mb-2 font-medium">{t("agora.learning.lab.changeLog")}</h2><ChangeLogPanel personaId={personaId} revision={revision} /></section>
        </div>
      )}
    </PageShell>
  );
}
