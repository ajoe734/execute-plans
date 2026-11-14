import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  getCommitteeMemos,
  getCommitteeSessions,
  publishCommitteeMemo,
  type CommitteeMemo,
} from "@/lib/bff-v1/agora/learning";
import {
  OutcomeView, PageShell, ReadBoundary, WriteGateNote,
  useLearningRead, useLearningWriteAccess, type ActionOutcome,
} from "./shared";

function Memos({ sessionId }: { sessionId: string }) {
  const { t } = useTranslation();
  const write = useLearningWriteAccess();
  const { result, reload } = useLearningRead(() => getCommitteeMemos(sessionId), `memos:${sessionId}`);
  const [outcome, setOutcome] = useState<ActionOutcome | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const publish = async (memo: CommitteeMemo) => {
    setBusy(memo.memo_id);
    const res = await publishCommitteeMemo(sessionId, memo.memo_id);
    setBusy(null);
    if (res.state === "ok") {
      setOutcome({ kind: "receipt", title: t("agora.learning.committee.publishReceipt"), value: res.data });
      reload();
    } else setOutcome({ kind: "unavailable", reason: res.reason });
  };

  return (
    <div data-testid="committee-memos">
      <h2 className="mb-2 font-medium">{t("agora.learning.committee.memos")}</h2>
      <WriteGateNote reason={write.reason} />
      <ReadBoundary result={result}>
        {(memos) => (
          <ul className="space-y-2">
            {memos.map((memo) => (
              <li key={memo.memo_id} className="rounded border border-border p-2 text-sm" data-testid={`memo-${memo.memo_id}`}>
                <p><code>{memo.memo_id}</code> · {memo.status ?? t("agora.learning.notReported")}</p>
                {memo.summary ? <p>{memo.summary}</p> : null}
                {memo.status !== "published" ? (
                  <button
                    type="button"
                    className="mt-1 rounded border border-border px-2 py-1 text-xs disabled:opacity-50"
                    disabled={!write.allowed || busy === memo.memo_id}
                    onClick={() => void publish(memo)}
                  >
                    {t("agora.learning.committee.publish")}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </ReadBoundary>
      <OutcomeView outcome={outcome} />
    </div>
  );
}

export function CommitteePage() {
  const { t } = useTranslation();
  const { result } = useLearningRead(() => getCommitteeSessions(), "sessions");
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <PageShell title={t("agora.learning.committee.title")} testId="agora-committee-page">
      <ReadBoundary result={result}>
        {(sessions) => (
          <ul className="space-y-2" data-testid="committee-sessions">
            {sessions.map((s) => (
              <li key={s.request_id}>
                <button
                  type="button"
                  className="w-full rounded border border-border p-2 text-left text-sm"
                  aria-pressed={selected === s.request_id}
                  onClick={() => setSelected(s.request_id)}
                >
                  <code>{s.request_id}</code> · {s.status ?? t("agora.learning.notReported")}
                  {s.topic || s.question ? <span> · {s.topic ?? s.question}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </ReadBoundary>
      {selected ? <Memos key={selected} sessionId={selected} /> : null}
    </PageShell>
  );
}
