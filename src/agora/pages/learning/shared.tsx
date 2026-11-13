import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import type { LearningRead } from "@/lib/bff-v1/agora/learning";
import { useAgoraWriteAccess } from "@/agora/useAgoraWriteAccess";

/** `null` while loading, otherwise the owner result. Never defaults to data. */
export function useLearningRead<T>(load: (() => Promise<LearningRead<T>>) | null, key: string, refresh = 0) {
  const [result, setResult] = useState<LearningRead<T> | null>(null);
  const [tick, setTick] = useState(0);
  const keyRef = useRef(key);
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    const fn = loadRef.current;
    if (!fn) {
      setResult(null);
      return;
    }
    let live = true;
    // Only a different subject clears the view; a refresh keeps the current
    // data mounted (so local action receipts survive) until the new read lands.
    if (keyRef.current !== key) {
      keyRef.current = key;
      setResult(null);
    }
    void fn().then((value) => {
      if (live) setResult(value);
    });
    return () => {
      live = false;
    };
  }, [key, tick, refresh]);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { result, reload };
}

export function usePersonaIdParam(): [string, (next: string) => void] {
  const [params, setParams] = useSearchParams();
  const personaId = (params.get("personaId") ?? "").trim();
  const set = (next: string) => {
    const copy = new URLSearchParams(params);
    if (next.trim()) copy.set("personaId", next.trim());
    else copy.delete("personaId");
    setParams(copy, { replace: true });
  };
  return [personaId, set];
}

export function PersonaIdField({ personaId, onChange }: { personaId: string; onChange: (id: string) => void }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(personaId);
  useEffect(() => setDraft(personaId), [personaId]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onChange(draft);
  };
  return (
    <form onSubmit={submit} className="flex items-end gap-2" data-testid="learning-persona-form">
      <label className="flex flex-col text-xs text-muted-foreground">
        {t("agora.learning.persona.label")}
        <input
          className="mt-1 rounded border border-border bg-background px-2 py-1 text-sm text-foreground"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
      </label>
      <button type="submit" className="rounded border border-border px-3 py-1 text-sm">
        {t("agora.learning.persona.apply")}
      </button>
    </form>
  );
}

export function UnavailableNotice({ reason, owner }: { reason: string; owner?: string }) {
  const { t } = useTranslation();
  return (
    <div role="status" data-testid="learning-unavailable" className="rounded border border-dashed border-border p-3 text-sm text-muted-foreground">
      <p className="font-medium text-foreground">{t("agora.learning.unavailable")}</p>
      <p>
        {t("agora.learning.reason")}: <code>{reason}</code>
        {owner ? <> · {t("agora.learning.owner")}: <code>{owner}</code></> : null}
      </p>
    </div>
  );
}

/** Loading / unavailable / ok wrapper. */
export function ReadBoundary<T>({ result, children }: { result: LearningRead<T> | null; children: (data: T) => ReactNode }) {
  const { t } = useTranslation();
  if (!result) return <p className="text-sm text-muted-foreground" data-testid="learning-loading">{t("agora.learning.loading")}</p>;
  if (result.state === "unavailable") return <UnavailableNotice reason={result.reason} owner={result.owner} />;
  return <>{children(result.data)}</>;
}

export function Receipt({ title, value }: { title: string; value: unknown }) {
  return (
    <section data-testid="learning-receipt" className="mt-2 rounded border border-border bg-muted/30 p-2 text-xs">
      <p className="font-medium">{title}</p>
      <pre className="overflow-x-auto whitespace-pre-wrap">{JSON.stringify(value, null, 2)}</pre>
    </section>
  );
}

export type ActionOutcome =
  | { kind: "receipt"; title: string; value: unknown }
  | { kind: "unavailable"; reason: string };

export function OutcomeView({ outcome }: { outcome: ActionOutcome | null }) {
  if (!outcome) return null;
  if (outcome.kind === "unavailable") return <UnavailableNotice reason={outcome.reason} />;
  return <Receipt title={outcome.title} value={outcome.value} />;
}

/** Writes need the session's write access; otherwise the control is disabled with the reason. */
export function useLearningWriteAccess() {
  const access = useAgoraWriteAccess();
  return { allowed: !access.loading && access.writeAllowed, reason: access.loading ? null : access.writeDisabledReason };
}

export function WriteGateNote({ reason }: { reason: string | null }) {
  const { t } = useTranslation();
  if (!reason) return null;
  return <p className="text-xs text-muted-foreground" data-testid="learning-write-disabled">{t("agora.learning.writeDisabled")}: {reason}</p>;
}

export function PageShell({ title, testId, children }: { title: string; testId: string; children: ReactNode }) {
  return (
    <div className="h-full min-h-0 overflow-y-auto p-4" data-testid={testId}>
      <h1 className="mb-1 text-lg font-semibold">{title}</h1>
      <p className="mb-4 text-xs text-muted-foreground">paper · execution_authority: none</p>
      <div className="space-y-6">{children}</div>
    </div>
  );
}

export const textInput = "rounded border border-border bg-background px-2 py-1 text-sm text-foreground";
