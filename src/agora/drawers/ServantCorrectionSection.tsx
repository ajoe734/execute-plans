import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  getHumanEvidence,
  getPersonaHumanEvidence,
  submitHumanEvidence,
  type HumanEvidenceKind,
} from "@/lib/bff-v1/agora/learning";

export interface ServantCorrectionSectionProps {
  servantPersonaId: string | null;
  servantDisplayName: string;
  defaultSubjectRef: string;
  trainerActive?: boolean;
  onItemSubmitted?: (item: Record<string, unknown>) => void;
}

const CORRECTION_KINDS: readonly HumanEvidenceKind[] = [
  "signal-feedback",
  "notes",
  "insights",
  "training-examples",
];

const KIND_LABEL_KEYS: Record<HumanEvidenceKind, string> = {
  "signal-feedback": "agora.drawers.correction.kinds.signalFeedback",
  notes: "agora.drawers.correction.kinds.notes",
  insights: "agora.drawers.correction.kinds.insights",
  "training-examples": "agora.drawers.correction.kinds.trainingExamples",
};

function extractContentSummary(item: Record<string, unknown>): string {
  const content =
    item.content && typeof item.content === "object" && !Array.isArray(item.content)
      ? (item.content as Record<string, unknown>)
      : {};
  const text =
    (typeof content.summary === "string" && content.summary.trim()) ||
    (typeof content.text === "string" && content.text.trim()) ||
    (typeof content.note === "string" && content.note.trim()) ||
    (typeof content.insight === "string" && content.insight.trim()) ||
    (typeof content.example === "string" && content.example.trim()) ||
    (typeof item.summary === "string" && item.summary.trim()) ||
    "";
  if (text) return text;
  return JSON.stringify(content);
}

export function ServantCorrectionSection({
  servantPersonaId,
  servantDisplayName,
  defaultSubjectRef,
  trainerActive = false,
  onItemSubmitted,
}: ServantCorrectionSectionProps): JSX.Element {
  const { t } = useTranslation();
  const [kind, setKind] = useState<HumanEvidenceKind>("signal-feedback");
  const [subjectRef, setSubjectRef] = useState<string>(defaultSubjectRef);
  const [content, setContent] = useState<string>("");
  const [verdict, setVerdict] = useState<"agree" | "adjust" | "reject">("adjust");
  const [expectedAction, setExpectedAction] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [latestReadback, setLatestReadback] = useState<Record<string, unknown> | null>(null);
  const [historyItems, setHistoryItems] = useState<Array<Record<string, unknown>>>([]);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    setSubjectRef((prev) => (prev.trim() ? prev : defaultSubjectRef));
  }, [defaultSubjectRef]);

  const loadHistory = useCallback(
    async (options?: { silentInit?: boolean; isMounted?: () => boolean }) => {
      const isMounted = options?.isMounted ?? (() => true);
      if (!servantPersonaId) {
        if (isMounted() && !options?.silentInit) {
          setHistoryItems([]);
          setHistoryError(null);
        }
        return;
      }
      if (!options?.silentInit) {
        setHistoryLoading(true);
        setHistoryError(null);
      }
      try {
        const res = await getPersonaHumanEvidence(servantPersonaId);
        if (!isMounted()) return;
        if (res.state === "ok") {
          setHistoryItems(res.data.items);
          setHistoryError(null);
        } else if (
          res.reason === "no_new_human_evidence" ||
          res.reason === "RESOURCE_NOT_FOUND"
        ) {
          if (!options?.silentInit) {
            setHistoryItems([]);
          }
        } else {
          setHistoryError(res.reason);
        }
      } catch (err) {
        if (!isMounted()) return;
        setHistoryError(err instanceof Error ? err.message : "unknown_error");
      } finally {
        if (isMounted() && !options?.silentInit) {
          setHistoryLoading(false);
        }
      }
    },
    [servantPersonaId],
  );

  useEffect(() => {
    let mounted = true;
    void loadHistory({ silentInit: true, isMounted: () => mounted });
    return () => {
      mounted = false;
    };
  }, [loadHistory]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!servantPersonaId || submitting) return;
    const trimmedContent = content.trim();
    if (!trimmedContent) {
      setSubmitError(t("agora.drawers.correction.validationEmpty"));
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    const cleanSubject = subjectRef.trim() || defaultSubjectRef || `persona:${servantPersonaId}`;
    const evidenceId = `ev-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const idempotencyKey = `idem-${evidenceId}`;

    const contentPayload: Record<string, unknown> = {
      summary: trimmedContent,
      text: trimmedContent,
      kind,
    };
    if (kind === "signal-feedback") {
      contentPayload.verdict = verdict;
    }
    if (kind === "training-examples" && expectedAction.trim()) {
      contentPayload.expected_action = expectedAction.trim();
    }

    try {
      const submitRes = await submitHumanEvidence(
        kind,
        {
          evidence_id: evidenceId,
          persona_id: servantPersonaId,
          subject_ref: cleanSubject,
          content: contentPayload,
          source_refs: [cleanSubject],
          captured_at: new Date().toISOString(),
          consent_granted: true,
          learning_eligible: true,
          retention_days: 90,
          environment_ceiling: "paper",
        },
        idempotencyKey,
      );

      if (submitRes.state === "unavailable") {
        setSubmitError(
          t("agora.drawers.correction.submitError", { reason: submitRes.reason }),
        );
        return;
      }

      const [singleReadback, listReadback] = await Promise.all([
        getHumanEvidence(evidenceId),
        getPersonaHumanEvidence(servantPersonaId),
      ]);

      const readbackItem: Record<string, unknown> =
        singleReadback.state === "ok"
          ? singleReadback.data
          : submitRes.data.data ?? {
              evidence_id: evidenceId,
              persona_id: servantPersonaId,
              subject_ref: cleanSubject,
              content: contentPayload,
            };

      setLatestReadback(readbackItem);
      if (listReadback.state === "ok") {
        setHistoryItems(listReadback.data.items);
        setHistoryError(null);
      } else {
        setHistoryItems((prev) => [
          readbackItem,
          ...prev.filter((item) => item.evidence_id !== evidenceId),
        ]);
      }
      setContent("");
      setExpectedAction("");
      onItemSubmitted?.(readbackItem);
    } catch (err) {
      const reason = err instanceof Error ? err.message : "unknown_error";
      setSubmitError(t("agora.drawers.correction.submitError", { reason }));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      aria-label={t("agora.drawers.correction.title")}
      data-testid="servant-correction-section"
      data-trainer-active={trainerActive ? "true" : "false"}
      style={{
        background: "#171b22",
        border: trainerActive ? "1px solid #e8b750" : "1px solid #2a2e38",
        borderRadius: 8,
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <strong style={{ color: "#e8b750", fontSize: 13 }}>
            {t("agora.drawers.correction.title")}
          </strong>
          {servantPersonaId ? (
            <span
              data-testid="servant-correction-bound-persona"
              style={{ color: "#38bdf8", fontSize: 11, fontFamily: "monospace" }}
            >
              {t("agora.drawers.correction.boundServantLabel", {
                name: servantDisplayName,
                id: servantPersonaId,
              })}
            </span>
          ) : null}
        </div>
        <div style={{ color: "#8c96a6", fontSize: 12, marginTop: 4, lineHeight: 1.5 }}>
          {t("agora.drawers.correction.subtitle")}
        </div>
      </div>

      {!servantPersonaId ? (
        <div
          data-testid="servant-correction-unavailable"
          style={{
            background: "#12161f",
            border: "1px solid #2a2e38",
            borderRadius: 6,
            color: "#d4a84b",
            fontSize: 12,
            padding: "8px 10px",
          }}
        >
          {t("agora.drawers.correction.servantUnavailable")}
        </div>
      ) : (
        <form
          data-testid="servant-correction-form"
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
          style={{ display: "flex", flexDirection: "column", gap: 8 }}
        >
          <div>
            <div style={{ color: "#8c96a6", fontSize: 11, marginBottom: 4 }}>
              {t("agora.drawers.correction.kindLabel")}
            </div>
            <div
              data-testid="servant-correction-kinds"
              role="group"
              aria-label={t("agora.drawers.correction.kindLabel")}
              style={{ display: "flex", flexWrap: "wrap", gap: 6 }}
            >
              {CORRECTION_KINDS.map((itemKind) => {
                const active = kind === itemKind;
                return (
                  <button
                    key={itemKind}
                    type="button"
                    aria-pressed={active}
                    data-testid={`servant-correction-kind-${itemKind}`}
                    onClick={() => {
                      setKind(itemKind);
                      setSubmitError(null);
                    }}
                    style={{
                      padding: "4px 10px",
                      borderRadius: 6,
                      border: active ? "1px solid #e8b750" : "1px solid #2a2e38",
                      background: active ? "rgba(232,183,80,0.16)" : "#12161f",
                      color: active ? "#e8b750" : "#c5cad2",
                      fontSize: 12,
                      fontWeight: active ? 600 : 500,
                      cursor: "pointer",
                    }}
                  >
                    {t(KIND_LABEL_KEYS[itemKind])}
                  </button>
                );
              })}
            </div>
          </div>

          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
            <span style={{ color: "#8c96a6", fontSize: 11 }}>
              {t("agora.drawers.correction.subjectRefLabel")}
            </span>
            <input
              type="text"
              data-testid="servant-correction-subject-input"
              value={subjectRef}
              onChange={(e) => setSubjectRef(e.target.value)}
              placeholder={t("agora.drawers.correction.subjectRefPlaceholder")}
              style={{
                background: "#12161f",
                border: "1px solid #2a2e38",
                borderRadius: 6,
                color: "#f0ece4",
                fontSize: 12,
                padding: "5px 8px",
              }}
            />
          </label>

          {kind === "signal-feedback" ? (
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
              <span style={{ color: "#8c96a6", fontSize: 11 }}>
                {t("agora.drawers.correction.verdictLabel")}
              </span>
              <select
                data-testid="servant-correction-verdict-select"
                value={verdict}
                onChange={(e) =>
                  setVerdict(e.target.value as "agree" | "adjust" | "reject")
                }
                style={{
                  background: "#12161f",
                  border: "1px solid #2a2e38",
                  borderRadius: 6,
                  color: "#f0ece4",
                  fontSize: 12,
                  padding: "5px 8px",
                }}
              >
                <option value="agree">{t("agora.drawers.correction.verdictAgree")}</option>
                <option value="adjust">{t("agora.drawers.correction.verdictAdjust")}</option>
                <option value="reject">{t("agora.drawers.correction.verdictReject")}</option>
              </select>
            </label>
          ) : null}

          {kind === "training-examples" ? (
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
              <span style={{ color: "#8c96a6", fontSize: 11 }}>
                {t("agora.drawers.correction.expectedActionLabel")}
              </span>
              <input
                type="text"
                data-testid="servant-correction-expected-action-input"
                value={expectedAction}
                onChange={(e) => setExpectedAction(e.target.value)}
                placeholder={t("agora.drawers.correction.expectedActionPlaceholder")}
                style={{
                  background: "#12161f",
                  border: "1px solid #2a2e38",
                  borderRadius: 6,
                  color: "#f0ece4",
                  fontSize: 12,
                  padding: "5px 8px",
                }}
              />
            </label>
          ) : null}

          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
            <span style={{ color: "#8c96a6", fontSize: 11 }}>
              {t("agora.drawers.correction.contentLabel")}
            </span>
            <textarea
              data-testid="servant-correction-content-input"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t("agora.drawers.correction.contentPlaceholder")}
              rows={3}
              style={{
                background: "#12161f",
                border: "1px solid #2a2e38",
                borderRadius: 6,
                color: "#f0ece4",
                fontSize: 12,
                padding: "6px 8px",
                resize: "vertical",
              }}
            />
          </label>

          {submitError ? (
            <div
              data-testid="servant-correction-error"
              role="alert"
              style={{
                background: "#231418",
                border: "1px solid #5c2b33",
                borderRadius: 6,
                color: "#f87171",
                fontSize: 12,
                padding: "6px 8px",
              }}
            >
              {submitError}
            </div>
          ) : null}

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="submit"
              data-testid="servant-correction-submit"
              disabled={submitting}
              style={{
                background: "#e8b750",
                border: "1px solid #e8b750",
                borderRadius: 6,
                color: "#111417",
                cursor: submitting ? "wait" : "pointer",
                fontSize: 12,
                fontWeight: 700,
                padding: "6px 12px",
              }}
            >
              {submitting
                ? t("agora.drawers.correction.submitting")
                : t("agora.drawers.correction.submit")}
            </button>
            <button
              type="button"
              data-testid="servant-correction-refresh"
              onClick={() => {
                void loadHistory();
              }}
              style={{
                background: "#12161f",
                border: "1px solid #2a2e38",
                borderRadius: 6,
                color: "#c5cad2",
                cursor: "pointer",
                fontSize: 12,
                padding: "6px 10px",
              }}
            >
              {t("agora.drawers.correction.refreshHistory")}
            </button>
          </div>
        </form>
      )}

      {latestReadback ? (
        <div
          data-testid="servant-correction-readback"
          style={{
            background: "rgba(34,197,94,0.1)",
            border: "1px solid rgba(34,197,94,0.35)",
            borderRadius: 6,
            padding: "8px 10px",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <strong style={{ color: "#4ade80", fontSize: 12 }}>
            {t("agora.drawers.correction.latestReadbackTitle")}
          </strong>
          <div style={{ color: "#c5cad2", fontSize: 11, fontFamily: "monospace" }}>
            {t("agora.drawers.correction.readbackStatus", {
              id: String(latestReadback.evidence_id ?? ""),
            })}
          </div>
          <div
            data-testid="servant-correction-readback-summary"
            style={{ color: "#f0ece4", fontSize: 12 }}
          >
            {extractContentSummary(latestReadback)}
          </div>
        </div>
      ) : null}

      <div
        data-testid="servant-correction-history"
        style={{
          borderTop: "1px solid #2a2e38",
          paddingTop: 8,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <div style={{ color: "#8c96a6", fontSize: 12, fontWeight: 600 }}>
          {t("agora.drawers.correction.historyTitle", { count: historyItems.length })}
        </div>
        {historyLoading ? (
          <div
            data-testid="servant-correction-history-loading"
            style={{ color: "#8c96a6", fontSize: 12 }}
          >
            {t("agora.drawers.correction.historyLoading")}
          </div>
        ) : historyError ? (
          <div
            data-testid="servant-correction-history-error"
            style={{ color: "#f87171", fontSize: 12 }}
          >
            {t("agora.drawers.correction.historyError", { reason: historyError })}
          </div>
        ) : historyItems.length === 0 ? (
          <div
            data-testid="servant-correction-history-empty"
            style={{ color: "#8c96a6", fontSize: 12 }}
          >
            {t("agora.drawers.correction.historyEmpty")}
          </div>
        ) : (
          <ul
            data-testid="servant-correction-history-list"
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {historyItems.slice(0, 8).map((item, idx) => {
              const evId = String(item.evidence_id ?? `idx-${idx}`);
              const evType = String(item.evidence_type ?? item.kind ?? "signal_feedback");
              const subj = String(item.subject_ref ?? "");
              return (
                <li
                  key={evId}
                  data-testid={`servant-correction-history-item-${evId}`}
                  style={{
                    background: "#12161f",
                    border: "1px solid #2a2e38",
                    borderRadius: 6,
                    padding: "6px 8px",
                    fontSize: 12,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      color: "#8c96a6",
                      fontSize: 11,
                      fontFamily: "monospace",
                    }}
                  >
                    <span>{evId}</span>
                    <span>{evType}</span>
                  </div>
                  <div style={{ color: "#f0ece4", marginTop: 2 }}>
                    {extractContentSummary(item)}
                  </div>
                  {subj ? (
                    <div style={{ color: "#8c96a6", fontSize: 11, marginTop: 2 }}>
                      {subj}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
