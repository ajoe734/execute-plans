import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ShadowComparisonPanel } from "@/agora/pages/trading-room/ShadowComparisonPanel";
import { WorkspaceWidgetRevisionDrawer } from "@/agora/trading-room/WorkspaceWidgetRevisionDrawer";
import {
  getAgoraJournalTimeline,
  getChangeLog,
  type AgoraJournalEntry,
  type ChangeLog,
} from "@/lib/bff-v1/agora/learning";
import {
  interaction,
  type ContextRef,
  type PersonaEligibility,
  type SubmitInteractionResponse,
} from "@/lib/bff-v1/agora/interaction";
import {
  getServantSession,
  getServantSessionStream,
  terminateServantSession,
  type ServantSessionStreamSnapshot,
} from "@/lib/bff-v1/agora/servant";
import {
  acceptWidgetRevisionProposal,
  createWidgetRevisionProposal,
  getTradingRoom,
  getTradingRoomWorkspaceByStrategyWithMeta,
  listDecisionEvents,
  listTradingRoomWorkspaceVersions,
  type TradingDecisionEvent,
} from "@/lib/bff-v1/agora/tradingRoom";
import type {
  TradingRoomDashboardVersion,
  TradingRoomViewSpec,
  TradingRoomWidgetSpec,
  TradingRoomWorkspace,
} from "@/lib/bff-v1/agora/tradingRoomTypes";
import { ServantCorrectionSection } from "./ServantCorrectionSection";

export type GlobalDrawerId =
  | "servant"
  | "shadow"
  | "journal"
  | "expert-review"
  | "layout"
  | "personalization";

export interface ServantSessionTaskItem {
  id: string;
  command: string;
  status: "submitting" | "completed" | "degraded" | "error";
  sessionId: string | null;
  answer: string | null;
  errorMessage: string | null;
  contextSnapshot: {
    page: string;
    route?: string;
    strategy?: string | null;
    selectedWidget?: string | null;
  };
}

// ─── 1. Servant Tasks Session Extension (inside 交易僕人任務 drawer) ────────

export interface ServantSessionTasksSectionProps {
  tasks: ServantSessionTaskItem[];
  commandDisabledReason: string | null;
  commandSubmitting: boolean;
  onSubmitCommand: (text: string) => Promise<void>;
}

interface SessionLiveDetail {
  loading: boolean;
  terminating: boolean;
  state: string | null;
  stream: ServantSessionStreamSnapshot | null;
  error: string | null;
}

export function ServantSessionTasksSection({
  tasks,
  commandDisabledReason,
  commandSubmitting,
  onSubmitCommand,
}: ServantSessionTasksSectionProps): JSX.Element {
  const { t } = useTranslation();
  const [messageInput, setMessageInput] = useState("");
  const [detailsBySession, setDetailsBySession] = useState<Record<string, SessionLiveDetail>>({});

  const refreshSessionDetail = useCallback(async (sessionId: string) => {
    setDetailsBySession((prev) => ({
      ...prev,
      [sessionId]: {
        loading: true,
        terminating: prev[sessionId]?.terminating ?? false,
        state: prev[sessionId]?.state ?? null,
        stream: prev[sessionId]?.stream ?? null,
        error: null,
      },
    }));
    try {
      const [sessionRes, streamRes] = await Promise.all([
        getServantSession(sessionId),
        getServantSessionStream(sessionId),
      ]);
      setDetailsBySession((prev) => ({
        ...prev,
        [sessionId]: {
          loading: false,
          terminating: false,
          state: sessionRes.state || streamRes.sessionStatus || "active",
          stream: streamRes,
          error: null,
        },
      }));
    } catch (err) {
      const reason = err instanceof Error ? err.message : "unknown_error";
      setDetailsBySession((prev) => ({
        ...prev,
        [sessionId]: {
          loading: false,
          terminating: false,
          state: prev[sessionId]?.state ?? null,
          stream: prev[sessionId]?.stream ?? null,
          error: reason,
        },
      }));
    }
  }, []);

  const handleTerminateSession = useCallback(async (sessionId: string) => {
    setDetailsBySession((prev) => ({
      ...prev,
      [sessionId]: {
        loading: prev[sessionId]?.loading ?? false,
        terminating: true,
        state: prev[sessionId]?.state ?? null,
        stream: prev[sessionId]?.stream ?? null,
        error: null,
      },
    }));
    try {
      const terminated = await terminateServantSession(sessionId);
      setDetailsBySession((prev) => ({
        ...prev,
        [sessionId]: {
          loading: false,
          terminating: false,
          state: terminated.state || "canceled",
          stream: prev[sessionId]?.stream ?? null,
          error: null,
        },
      }));
    } catch (err) {
      const reason = err instanceof Error ? err.message : "unknown_error";
      setDetailsBySession((prev) => ({
        ...prev,
        [sessionId]: {
          loading: false,
          terminating: false,
          state: prev[sessionId]?.state ?? null,
          stream: prev[sessionId]?.stream ?? null,
          error: reason,
        },
      }));
    }
  }, []);

  return (
    <div
      data-testid="servant-drawer-session-controls"
      style={{ display: "flex", flexDirection: "column", gap: 10 }}
    >
      <div style={{ color: "#e8b750", fontSize: 12, fontWeight: 700 }}>
        {t("agora.drawers.servantTasks.heading")}
      </div>

      <form
        data-testid="servant-drawer-message-form"
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = messageInput.trim();
          if (!trimmed || commandDisabledReason || commandSubmitting) return;
          setMessageInput("");
          void onSubmitCommand(trimmed);
        }}
        style={{
          background: "#171b22",
          border: "1px solid #2a2e38",
          borderRadius: 6,
          padding: 10,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <label
          htmlFor="servant-drawer-message-input"
          style={{ color: "#8c96a6", fontSize: 11, fontWeight: 600 }}
        >
          {t("agora.drawers.servantTasks.composerLabel")}
        </label>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            id="servant-drawer-message-input"
            type="text"
            data-testid="servant-drawer-message-input"
            value={messageInput}
            disabled={Boolean(commandDisabledReason) || commandSubmitting}
            onChange={(e) => setMessageInput(e.target.value)}
            placeholder={t("agora.drawers.servantTasks.composerPlaceholder")}
            style={{
              flex: 1,
              background: "#12161f",
              border: "1px solid #2a2e38",
              borderRadius: 6,
              color: "#f0ece4",
              fontSize: 12,
              padding: "5px 8px",
            }}
          />
          <button
            type="submit"
            data-testid="servant-drawer-message-submit"
            disabled={Boolean(commandDisabledReason) || commandSubmitting || !messageInput.trim()}
            style={{
              background: "#e8b750",
              border: "1px solid #e8b750",
              borderRadius: 6,
              color: "#111417",
              cursor:
                commandDisabledReason || commandSubmitting || !messageInput.trim()
                  ? "not-allowed"
                  : "pointer",
              fontSize: 12,
              fontWeight: 700,
              padding: "5px 10px",
              whiteSpace: "nowrap",
            }}
          >
            {commandSubmitting
              ? t("agora.drawers.servantTasks.composerSubmitting")
              : t("agora.drawers.servantTasks.composerSubmit")}
          </button>
        </div>
      </form>

      {tasks.map((task) => {
        if (!task.sessionId) return null;
        const sid = task.sessionId;
        const detail = detailsBySession[sid];
        const isCanceled = detail?.state === "canceled" || detail?.state === "closed";
        return (
          <div
            key={`session-ctrl-${task.id}`}
            data-testid={`servant-session-panel-${sid}`}
            style={{
              background: "#171b22",
              border: "1px solid #2a2e38",
              borderRadius: 6,
              padding: 10,
              display: "flex",
              flexDirection: "column",
              gap: 6,
              fontSize: 12,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 6,
                flexWrap: "wrap",
              }}
            >
              <span style={{ color: "#8c96a6", fontFamily: "monospace", fontSize: 11 }}>
                {t("agora.drawers.servantTasks.sessionStateLabel", {
                  state: detail?.state ?? task.status,
                })}
              </span>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  data-testid={`servant-session-refresh-${sid}`}
                  disabled={detail?.loading}
                  onClick={() => {
                    void refreshSessionDetail(sid);
                  }}
                  style={{
                    background: "#12161f",
                    border: "1px solid #2a2e38",
                    borderRadius: 4,
                    color: "#c5cad2",
                    cursor: detail?.loading ? "wait" : "pointer",
                    fontSize: 11,
                    padding: "3px 8px",
                  }}
                >
                  {detail?.loading
                    ? t("agora.drawers.servantTasks.refreshingSession")
                    : t("agora.drawers.servantTasks.refreshSession")}
                </button>
                <button
                  type="button"
                  data-testid={`servant-session-terminate-${sid}`}
                  disabled={detail?.terminating || isCanceled}
                  onClick={() => {
                    void handleTerminateSession(sid);
                  }}
                  style={{
                    background: "#231418",
                    border: "1px solid #5c2b33",
                    borderRadius: 4,
                    color: "#f87171",
                    cursor: detail?.terminating || isCanceled ? "not-allowed" : "pointer",
                    fontSize: 11,
                    padding: "3px 8px",
                  }}
                >
                  {detail?.terminating
                    ? t("agora.drawers.servantTasks.terminatingSession")
                    : isCanceled
                      ? t("agora.drawers.servantTasks.sessionTerminated")
                      : t("agora.drawers.servantTasks.terminateSession")}
                </button>
              </div>
            </div>

            {detail?.error ? (
              <div
                data-testid={`servant-session-error-${sid}`}
                role="alert"
                style={{ color: "#f87171", fontSize: 11 }}
              >
                {t("agora.drawers.servantTasks.streamError", { reason: detail.error })}
              </div>
            ) : null}

            {detail?.stream ? (
              <div
                data-testid={`servant-session-stream-${sid}`}
                style={{ display: "flex", flexDirection: "column", gap: 6 }}
              >
                <div style={{ color: "#8c96a6", fontSize: 11, fontWeight: 600 }}>
                  {t("agora.drawers.servantTasks.runningTurnsTitle")}
                </div>
                {detail.stream.runningTurns.length === 0 ? (
                  <div style={{ color: "#8c96a6", fontSize: 11 }}>
                    {t("agora.drawers.servantTasks.noRunningTurns")}
                  </div>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: 16, color: "#e8b750", fontSize: 11 }}>
                    {detail.stream.runningTurns.map((turn) => (
                      <li key={turn.turn_id}>
                        {t("agora.drawers.servantTasks.runningTurnItem", {
                          turnId: turn.turn_id,
                          status: turn.status,
                        })}
                      </li>
                    ))}
                  </ul>
                )}

                <div style={{ color: "#8c96a6", fontSize: 11, fontWeight: 600 }}>
                  {t("agora.drawers.servantTasks.streamMessagesTitle")}
                </div>
                {detail.stream.messages.length === 0 ? (
                  <div style={{ color: "#8c96a6", fontSize: 11 }}>
                    {t("agora.drawers.servantTasks.streamEmpty")}
                  </div>
                ) : (
                  <ul
                    data-testid={`servant-session-messages-${sid}`}
                    style={{
                      listStyle: "none",
                      margin: 0,
                      padding: 0,
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                    }}
                  >
                    {detail.stream.messages.map((msg) => (
                      <li
                        key={msg.message_id}
                        style={{
                          background: "#12161f",
                          border: "1px solid #2a2e38",
                          borderRadius: 4,
                          padding: "4px 8px",
                          fontSize: 11,
                        }}
                      >
                        <strong
                          style={{
                            color: msg.role === "assistant" ? "#e8b750" : "#38bdf8",
                          }}
                        >
                          {msg.role === "assistant"
                            ? t("agora.drawers.servantTasks.roleAssistant")
                            : t("agora.drawers.servantTasks.roleUser")}
                        </strong>
                        : {msg.content ?? "—"}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

// ─── 2. Shadow Global Drawer (Shadow 四方對照) ──────────────────────────────

export interface ShadowGlobalDrawerProps {
  onClose: () => void;
  isNarrowViewport: boolean;
}

export function ShadowGlobalDrawer({
  onClose,
  isNarrowViewport,
}: ShadowGlobalDrawerProps): JSX.Element {
  const { t } = useTranslation();
  const [events, setEvents] = useState<TradingDecisionEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listDecisionEvents();
      const list = Array.isArray(res) ? res : (res?.items ?? []);
      setEvents(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "decision_events_unavailable");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  return (
    <DrawerContainer
      testId="trading-desk-shadow-drawer"
      title={t("agora.drawers.shadow.title")}
      description={t("agora.drawers.shadow.description")}
      onClose={onClose}
      isNarrowViewport={isNarrowViewport}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        {loading ? (
          <span data-testid="shadow-drawer-events-loading" style={{ color: "#8c96a6", fontSize: 12 }}>
            {t("agora.drawers.shadow.loadingEvents")}
          </span>
        ) : error ? (
          <span
            data-testid="shadow-drawer-events-error"
            role="status"
            style={{ color: "#f87171", fontSize: 12 }}
          >
            {t("agora.drawers.shadow.eventsError", { reason: error })}
          </span>
        ) : events.length === 0 ? (
          <span data-testid="shadow-drawer-events-empty" style={{ color: "#8c96a6", fontSize: 12 }}>
            {t("agora.drawers.shadow.eventsEmpty")}
          </span>
        ) : (
          <span style={{ color: "#8c96a6", fontSize: 12 }}>
            {events.length}
          </span>
        )}
        <button
          type="button"
          data-testid="shadow-drawer-refresh-events"
          onClick={() => {
            void loadEvents();
          }}
          style={{
            background: "#171b22",
            border: "1px solid #2a2e38",
            borderRadius: 6,
            color: "#c5cad2",
            cursor: "pointer",
            fontSize: 11,
            padding: "4px 8px",
          }}
        >
          {t("agora.drawers.shadow.refreshEvents")}
        </button>
      </div>

      <ShadowComparisonPanel decisionEvents={events} />
    </DrawerContainer>
  );
}

// ─── 3. Journal/Replay Global Drawer (/bff/agora/journal & /bff/agora/decision-journal) ───

export interface JournalReplayGlobalDrawerProps {
  onClose: () => void;
  isNarrowViewport: boolean;
}

export function JournalReplayGlobalDrawer({
  onClose,
  isNarrowViewport,
}: JournalReplayGlobalDrawerProps): JSX.Element {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<AgoraJournalEntry[]>([]);
  const [journalCount, setJournalCount] = useState<number>(0);
  const [decisionCount, setDecisionCount] = useState<number>(0);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorReason, setErrorReason] = useState<string | null>(null);

  const loadTimeline = useCallback(async () => {
    setLoading(true);
    setErrorReason(null);
    try {
      const res = await getAgoraJournalTimeline();
      if (res.state === "unavailable") {
        setErrorReason(res.reason);
        setEntries([]);
      } else {
        setEntries(res.data.entries);
        setJournalCount(res.data.journalCount);
        setDecisionCount(res.data.decisionJournalCount);
        setSelectedIndex(0);
      }
    } catch (err) {
      setErrorReason(err instanceof Error ? err.message : "journal_unavailable");
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTimeline();
  }, [loadTimeline]);

  const selectedEntry = entries[selectedIndex] ?? null;
  const noneLabel = t("agora.drawers.journal.noneValue");

  return (
    <DrawerContainer
      testId="trading-desk-journal-drawer"
      title={t("agora.drawers.journal.title")}
      description={t("agora.drawers.journal.description")}
      onClose={onClose}
      isNarrowViewport={isNarrowViewport}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <span
          data-testid="journal-drawer-source-counts"
          style={{ color: "#8c96a6", fontSize: 11, fontFamily: "monospace" }}
        >
          {t("agora.drawers.journal.sourceCounts", {
            journalCount,
            decisionCount,
          })}
        </span>
        <button
          type="button"
          data-testid="journal-drawer-refresh"
          onClick={() => {
            void loadTimeline();
          }}
          style={{
            background: "#171b22",
            border: "1px solid #2a2e38",
            borderRadius: 6,
            color: "#c5cad2",
            cursor: "pointer",
            fontSize: 11,
            padding: "4px 8px",
          }}
        >
          {t("agora.drawers.journal.refresh")}
        </button>
      </div>

      {loading ? (
        <div data-testid="journal-drawer-loading" style={{ color: "#8c96a6", fontSize: 12 }}>
          {t("agora.drawers.journal.loading")}
        </div>
      ) : errorReason ? (
        <div
          data-testid="journal-drawer-error"
          role="alert"
          style={{
            background: "#231418",
            border: "1px solid #5c2b33",
            borderRadius: 6,
            color: "#f87171",
            fontSize: 12,
            padding: 10,
          }}
        >
          {t("agora.drawers.journal.error", { reason: errorReason })}
        </div>
      ) : entries.length === 0 ? (
        <div
          data-testid="journal-drawer-empty"
          style={{
            background: "#171b22",
            border: "1px solid #2a2e38",
            borderRadius: 6,
            color: "#8c96a6",
            fontSize: 12,
            padding: 10,
          }}
        >
          {t("agora.drawers.journal.empty")}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div
            aria-label={t("agora.drawers.journal.replayControlsLabel")}
            data-testid="journal-replay-controls"
            role="group"
            style={{
              background: "#171b22",
              border: "1px solid #2a2e38",
              borderRadius: 6,
              padding: "8px 10px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <button
              type="button"
              data-testid="journal-replay-prev"
              disabled={selectedIndex <= 0}
              onClick={() => setSelectedIndex((idx) => Math.max(0, idx - 1))}
              style={{
                background: "#12161f",
                border: "1px solid #2a2e38",
                borderRadius: 4,
                color: selectedIndex <= 0 ? "#5a6270" : "#c5cad2",
                cursor: selectedIndex <= 0 ? "not-allowed" : "pointer",
                fontSize: 12,
                padding: "4px 10px",
              }}
            >
              {t("agora.drawers.journal.prevStep")}
            </button>
            <span
              data-testid="journal-replay-step-indicator"
              style={{ color: "#e8b750", fontSize: 12, fontWeight: 600 }}
            >
              {t("agora.drawers.journal.stepIndicator", {
                current: selectedIndex + 1,
                total: entries.length,
              })}
            </span>
            <button
              type="button"
              data-testid="journal-replay-next"
              disabled={selectedIndex >= entries.length - 1}
              onClick={() =>
                setSelectedIndex((idx) => Math.min(entries.length - 1, idx + 1))
              }
              style={{
                background: "#12161f",
                border: "1px solid #2a2e38",
                borderRadius: 4,
                color: selectedIndex >= entries.length - 1 ? "#5a6270" : "#c5cad2",
                cursor: selectedIndex >= entries.length - 1 ? "not-allowed" : "pointer",
                fontSize: 12,
                padding: "4px 10px",
              }}
            >
              {t("agora.drawers.journal.nextStep")}
            </button>
          </div>

          {selectedEntry ? (
            <div
              data-testid="journal-replay-selected-entry"
              style={{
                background: "#171b22",
                border: "1px solid #e8b750",
                borderRadius: 8,
                padding: 12,
                display: "flex",
                flexDirection: "column",
                gap: 6,
                fontSize: 12,
              }}
            >
              <div style={{ color: "#8c96a6", fontSize: 11 }}>
                {t("agora.drawers.journal.selectedEntryTitle")}
              </div>
              <strong style={{ color: "#f0ece4", fontSize: 14 }}>{selectedEntry.title}</strong>
              {selectedEntry.body ? (
                <div style={{ color: "#c5cad2", lineHeight: 1.5 }}>{selectedEntry.body}</div>
              ) : null}
              <div style={{ color: "#8c96a6", fontSize: 11, fontFamily: "monospace" }}>
                {t("agora.drawers.journal.entryIdLabel", { id: selectedEntry.id })} ·{" "}
                {t("agora.drawers.journal.entryVersionLabel", {
                  version: selectedEntry.version,
                })}
              </div>
              <div style={{ color: "#8c96a6", fontSize: 11, fontFamily: "monospace" }}>
                {t("agora.drawers.journal.entrySourceLabel", {
                  route: selectedEntry.sourceRoute,
                })}
              </div>
              <div style={{ color: "#8c96a6", fontSize: 11 }}>
                {t("agora.drawers.journal.entryUpdatedLabel", {
                  time: selectedEntry.updatedAt || selectedEntry.createdAt || noneLabel,
                })}
              </div>
              <div style={{ color: "#8c96a6", fontSize: 11 }}>
                {t("agora.drawers.journal.entryStrategiesLabel", {
                  strategies:
                    selectedEntry.linkedStrategyIds.length > 0
                      ? selectedEntry.linkedStrategyIds.join(", ")
                      : noneLabel,
                })}
              </div>
              <div style={{ color: "#8c96a6", fontSize: 11 }}>
                {t("agora.drawers.journal.entryPersonasLabel", {
                  personas:
                    selectedEntry.linkedPersonaIds.length > 0
                      ? selectedEntry.linkedPersonaIds.join(", ")
                      : noneLabel,
                })}
              </div>
              <div style={{ color: "#8c96a6", fontSize: 11 }}>
                {t("agora.drawers.journal.entryTagsLabel", {
                  tags:
                    selectedEntry.tags.length > 0
                      ? selectedEntry.tags.join(", ")
                      : noneLabel,
                })}
              </div>
            </div>
          ) : null}

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ color: "#8c96a6", fontSize: 11, fontWeight: 600 }}>
              {t("agora.drawers.journal.timelineListTitle")}
            </div>
            <ul
              data-testid="journal-replay-timeline-list"
              style={{
                listStyle: "none",
                margin: 0,
                padding: 0,
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              {entries.map((entry, idx) => {
                const active = idx === selectedIndex;
                return (
                  <li key={entry.id}>
                    <button
                      type="button"
                      data-testid={`journal-timeline-node-${entry.id}`}
                      onClick={() => setSelectedIndex(idx)}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        background: active ? "rgba(232,183,80,0.14)" : "#171b22",
                        border: active ? "1px solid #e8b750" : "1px solid #2a2e38",
                        borderRadius: 6,
                        padding: "8px 10px",
                        color: "#f0ece4",
                        cursor: "pointer",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: 11,
                          color: "#8c96a6",
                          fontFamily: "monospace",
                        }}
                      >
                        <span>{entry.id}</span>
                        <span>{entry.sourceRoute}</span>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, marginTop: 2 }}>
                        {entry.title}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </DrawerContainer>
  );
}

// ─── 4. Expert Review Global Drawer (專家審視: Ask / Challenge / Compare / Propose / Reflect) ───

export type ExpertReviewMode =
  | "ask"
  | "challenge"
  | "compare"
  | "propose_action"
  | "reflect";

export type ExpertReviewObjectType =
  | "strategy"
  | "decision_event"
  | "journal_entry"
  | "workshop"
  | "persona";

const EXPERT_REVIEW_MODES: readonly ExpertReviewMode[] = [
  "ask",
  "challenge",
  "compare",
  "propose_action",
  "reflect",
];

const EXPERT_REVIEW_MODE_LABEL_KEYS: Record<ExpertReviewMode, string> = {
  ask: "agora.drawers.expertReview.modes.ask",
  challenge: "agora.drawers.expertReview.modes.challenge",
  compare: "agora.drawers.expertReview.modes.compare",
  propose_action: "agora.drawers.expertReview.modes.propose_action",
  reflect: "agora.drawers.expertReview.modes.reflect",
};

const EXPERT_REVIEW_OBJECT_TYPE_LABEL_KEYS: Record<ExpertReviewObjectType, string> = {
  strategy: "agora.drawers.expertReview.objectTypes.strategy",
  decision_event: "agora.drawers.expertReview.objectTypes.decision_event",
  journal_entry: "agora.drawers.expertReview.objectTypes.journal_entry",
  workshop: "agora.drawers.expertReview.objectTypes.workshop",
  persona: "agora.drawers.expertReview.objectTypes.persona",
};

export interface ExpertReviewGlobalDrawerProps {
  onClose: () => void;
  isNarrowViewport: boolean;
  strategyId: string | null;
  workshopId: string | null;
  servantPersonaId: string | null;
  onNavigateToWorkshop: (path: string) => void;
}

export function ExpertReviewGlobalDrawer({
  onClose,
  isNarrowViewport,
  strategyId,
  workshopId,
  servantPersonaId,
  onNavigateToWorkshop,
}: ExpertReviewGlobalDrawerProps): JSX.Element {
  const { t } = useTranslation();

  const defaultObjectType: ExpertReviewObjectType = strategyId
    ? "strategy"
    : workshopId
      ? "workshop"
      : servantPersonaId
        ? "persona"
        : "decision_event";
  const defaultObjectId =
    strategyId ?? workshopId ?? servantPersonaId ?? "evt-current";

  const [mode, setMode] = useState<ExpertReviewMode>("ask");
  const [objectType, setObjectType] = useState<ExpertReviewObjectType>(defaultObjectType);
  const [objectId, setObjectId] = useState<string>(defaultObjectId);
  const [objectVersion, setObjectVersion] = useState<string>("v1");
  const [topic, setTopic] = useState<string>("");
  const [participants, setParticipants] = useState<PersonaEligibility[]>([]);
  const [selectedPersonaIds, setSelectedPersonaIds] = useState<string[]>([]);
  const [loadingParticipants, setLoadingParticipants] = useState<boolean>(false);
  const [participantsError, setParticipantsError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<SubmitInteractionResponse | null>(null);

  const effectiveWorkshopId = workshopId ?? "wksp-global-review";

  useEffect(() => {
    let active = true;
    setLoadingParticipants(true);
    setParticipantsError(null);

    void interaction
      .participants({
        workshop_id: effectiveWorkshopId,
        mode,
        environment: "paper",
        required_capability: "persona_opinion",
      })
      .then((res) => {
        if (!active) return;
        const included = res.data.included ?? [];
        setParticipants(included);
        const recommended = included.filter((p) => p.recommended);
        const initialIds = (recommended.length > 0 ? recommended : included)
          .slice(0, 3)
          .map((p) => p.persona_id);
        setSelectedPersonaIds(initialIds);
        setLoadingParticipants(false);
      })
      .catch((err) => {
        if (!active) return;
        setParticipants([]);
        setSelectedPersonaIds([]);
        setParticipantsError(
          err instanceof Error ? err.message : "participants_unavailable",
        );
        setLoadingParticipants(false);
      });

    return () => {
      active = false;
    };
  }, [effectiveWorkshopId, mode]);

  function togglePersona(personaId: string) {
    setSelectedPersonaIds((prev) =>
      prev.includes(personaId)
        ? prev.filter((id) => id !== personaId)
        : [...prev, personaId],
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    setReceipt(null);

    const cleanId = objectId.trim() || defaultObjectId;
    const contextRef: ContextRef =
      objectType === "strategy"
        ? {
            type: "strategy",
            id: cleanId,
            version_id: objectVersion.trim() || "v1",
          }
        : {
            type: objectType,
            id: cleanId,
          };

    try {
      const resolved = await interaction.resolveContext({
        context_refs: [contextRef],
        ...(workshopId ? { workshop_id: workshopId } : {}),
        environment: "paper",
      });

      const resolvedWorkshopId = resolved.data.workshop_id || effectiveWorkshopId;
      const eligibility = await interaction.participants({
        workshop_id: resolvedWorkshopId,
        mode,
        environment: "paper",
        required_capability: "persona_opinion",
      });

      const includedIds = eligibility.data.included.map((item) => item.persona_id);
      const chosenIds =
        selectedPersonaIds.filter((id) => includedIds.includes(id)).length > 0
          ? selectedPersonaIds.filter((id) => includedIds.includes(id))
          : includedIds.slice(0, 3);

      const cleanTopic =
        topic.trim() || `${t(EXPERT_REVIEW_MODE_LABEL_KEYS[mode])} · ${objectType}:${cleanId}`;

      const submitted = await interaction.submit({
        workshop_id: resolvedWorkshopId,
        mode,
        environment: "paper",
        required_capability: "persona_opinion",
        topic: cleanTopic,
        participant_persona_ids: chosenIds,
        context_refs: resolved.data.context_refs ?? [contextRef],
      });

      setReceipt(submitted.data);
    } catch (err) {
      const reason = err instanceof Error ? err.message : "interaction_submit_failed";
      setSubmitError(t("agora.drawers.expertReview.submitError", { reason }));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DrawerContainer
      testId="trading-desk-expert-review-drawer"
      title={t("agora.drawers.expertReview.title")}
      description={t("agora.drawers.expertReview.description")}
      onClose={onClose}
      isNarrowViewport={isNarrowViewport}
    >
      <form
        data-testid="expert-review-form"
        onSubmit={(e) => {
          void handleSubmit(e);
        }}
        style={{ display: "flex", flexDirection: "column", gap: 10 }}
      >
        <div
          style={{
            background: "#171b22",
            border: "1px solid #2a2e38",
            borderRadius: 6,
            padding: 10,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <strong style={{ color: "#e8b750", fontSize: 12 }}>
            {t("agora.drawers.expertReview.currentObjectTitle")}
          </strong>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11 }}>
            <span style={{ color: "#8c96a6" }}>
              {t("agora.drawers.expertReview.objectTypeLabel")}
            </span>
            <select
              data-testid="expert-review-object-type"
              value={objectType}
              onChange={(e) => setObjectType(e.target.value as ExpertReviewObjectType)}
              style={{
                background: "#12161f",
                border: "1px solid #2a2e38",
                borderRadius: 6,
                color: "#f0ece4",
                fontSize: 12,
                padding: "5px 8px",
              }}
            >
              {(Object.keys(EXPERT_REVIEW_OBJECT_TYPE_LABEL_KEYS) as ExpertReviewObjectType[]).map(
                (kind) => (
                  <option key={kind} value={kind}>
                    {t(EXPERT_REVIEW_OBJECT_TYPE_LABEL_KEYS[kind])}
                  </option>
                ),
              )}
            </select>
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11 }}>
            <span style={{ color: "#8c96a6" }}>
              {t("agora.drawers.expertReview.objectIdLabel")}
            </span>
            <input
              type="text"
              data-testid="expert-review-object-id"
              value={objectId}
              onChange={(e) => setObjectId(e.target.value)}
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

          {objectType === "strategy" ? (
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11 }}>
              <span style={{ color: "#8c96a6" }}>
                {t("agora.drawers.expertReview.objectVersionLabel")}
              </span>
              <input
                type="text"
                data-testid="expert-review-object-version"
                value={objectVersion}
                onChange={(e) => setObjectVersion(e.target.value)}
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
        </div>

        <div>
          <div style={{ color: "#8c96a6", fontSize: 11, marginBottom: 4 }}>
            {t("agora.drawers.expertReview.modeLabel")}
          </div>
          <div
            data-testid="expert-review-modes"
            role="group"
            aria-label={t("agora.drawers.expertReview.modeLabel")}
            style={{ display: "flex", flexWrap: "wrap", gap: 6 }}
          >
            {EXPERT_REVIEW_MODES.map((m) => {
              const active = mode === m;
              return (
                <button
                  key={m}
                  type="button"
                  aria-pressed={active}
                  data-testid={`expert-review-mode-${m}`}
                  onClick={() => setMode(m)}
                  style={{
                    padding: "5px 10px",
                    borderRadius: 6,
                    border: active ? "1px solid #e8b750" : "1px solid #2a2e38",
                    background: active ? "rgba(232,183,80,0.16)" : "#171b22",
                    color: active ? "#e8b750" : "#c5cad2",
                    fontSize: 12,
                    fontWeight: active ? 700 : 500,
                    cursor: "pointer",
                  }}
                >
                  {t(EXPERT_REVIEW_MODE_LABEL_KEYS[m])}
                </button>
              );
            })}
          </div>
        </div>

        <div
          data-testid="expert-review-participants"
          style={{
            background: "#171b22",
            border: "1px solid #2a2e38",
            borderRadius: 6,
            padding: 10,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <div style={{ color: "#8c96a6", fontSize: 11, fontWeight: 600 }}>
            {t("agora.drawers.expertReview.participantsTitle")}
          </div>
          {loadingParticipants ? (
            <div data-testid="expert-review-participants-loading" style={{ color: "#8c96a6", fontSize: 12 }}>
              {t("agora.drawers.expertReview.loadingParticipants")}
            </div>
          ) : participantsError ? (
            <div
              data-testid="expert-review-participants-error"
              role="status"
              style={{ color: "#f87171", fontSize: 12 }}
            >
              {t("agora.drawers.expertReview.participantsError", { reason: participantsError })}
            </div>
          ) : participants.length === 0 ? (
            <div data-testid="expert-review-participants-empty" style={{ color: "#8c96a6", fontSize: 12 }}>
              {t("agora.drawers.expertReview.participantsEmpty")}
            </div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {participants.map((p) => {
                const selected = selectedPersonaIds.includes(p.persona_id);
                return (
                  <button
                    key={p.persona_id}
                    type="button"
                    aria-pressed={selected}
                    data-testid={`expert-review-participant-${p.persona_id}`}
                    onClick={() => togglePersona(p.persona_id)}
                    style={{
                      background: selected ? "rgba(56,189,248,0.16)" : "#12161f",
                      border: selected ? "1px solid #38bdf8" : "1px solid #2a2e38",
                      borderRadius: 4,
                      color: selected ? "#38bdf8" : "#c5cad2",
                      cursor: "pointer",
                      fontSize: 11,
                      padding: "4px 8px",
                    }}
                  >
                    {p.display_name || p.persona_id}
                    {p.recommended ? ` · ${t("agora.drawers.expertReview.recommendedBadge")}` : ""}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
          <span style={{ color: "#8c96a6", fontSize: 11 }}>
            {t("agora.drawers.expertReview.topicLabel")}
          </span>
          <textarea
            data-testid="expert-review-topic-input"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder={t("agora.drawers.expertReview.topicPlaceholder")}
            rows={3}
            style={{
              background: "#171b22",
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
            data-testid="expert-review-error"
            role="alert"
            style={{
              background: "#231418",
              border: "1px solid #5c2b33",
              borderRadius: 6,
              color: "#f87171",
              fontSize: 12,
              padding: 8,
            }}
          >
            {submitError}
          </div>
        ) : null}

        <button
          type="submit"
          data-testid="expert-review-submit"
          disabled={submitting}
          style={{
            background: "#e8b750",
            border: "1px solid #e8b750",
            borderRadius: 6,
            color: "#111417",
            cursor: submitting ? "wait" : "pointer",
            fontSize: 12,
            fontWeight: 700,
            padding: "7px 12px",
          }}
        >
          {submitting
            ? t("agora.drawers.expertReview.submitting")
            : t("agora.drawers.expertReview.submit")}
        </button>
      </form>

      {receipt ? (
        <div
          data-testid="expert-review-receipt"
          style={{
            background: "rgba(34,197,94,0.1)",
            border: "1px solid rgba(34,197,94,0.35)",
            borderRadius: 8,
            padding: 10,
            display: "flex",
            flexDirection: "column",
            gap: 4,
            fontSize: 12,
          }}
        >
          <strong style={{ color: "#4ade80" }}>
            {t("agora.drawers.expertReview.receiptTitle")}
          </strong>
          <div style={{ color: "#c5cad2", fontFamily: "monospace", fontSize: 11 }}>
            {t("agora.drawers.expertReview.receiptId", { id: receipt.interaction_id })}
          </div>
          <div style={{ color: "#c5cad2", fontFamily: "monospace", fontSize: 11 }}>
            {t("agora.drawers.expertReview.receiptWorkshop", { id: receipt.workshop_id })}
          </div>
          <div style={{ color: "#c5cad2", fontSize: 11 }}>
            {t("agora.drawers.expertReview.receiptMode", { mode: receipt.mode })} ·{" "}
            {t("agora.drawers.expertReview.receiptStatus", { status: receipt.status })}
          </div>
          <div style={{ color: "#8c96a6", fontSize: 11 }}>
            {t("agora.drawers.expertReview.receiptAuthority", {
              authority: receipt.execution_authority,
            })}
          </div>
          <button
            type="button"
            data-testid="expert-review-open-workshop"
            onClick={() =>
              onNavigateToWorkshop(
                `/agora/strategy-workshop/${encodeURIComponent(receipt.workshop_id)}`,
              )
            }
            style={{
              marginTop: 4,
              background: "#171b22",
              border: "1px solid #38bdf8",
              borderRadius: 6,
              color: "#38bdf8",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
              padding: "5px 10px",
            }}
          >
            {t("agora.drawers.expertReview.openInWorkshop")}
          </button>
        </div>
      ) : null}
    </DrawerContainer>
  );
}

// ─── 5. Layout Adjustment Global Drawer (版面調整) ──────────────────────────

export interface LayoutAdjustmentGlobalDrawerProps {
  onClose: () => void;
  isNarrowViewport: boolean;
  isTradingRoom: boolean;
  strategyId: string | null;
  selectedWidget: string | null;
  onNavigateToTradingRoom: () => void;
}

function widgetIdOf(widget: TradingRoomWidgetSpec): string {
  const rec = widget as unknown as Record<string, unknown>;
  return String(rec.id ?? rec.widgetId ?? "");
}

function viewTitleOf(view: TradingRoomViewSpec): string {
  const rec = view as unknown as Record<string, unknown>;
  return String(rec.title ?? rec.viewName ?? rec.id ?? "");
}

function workspaceIdOf(workspace: TradingRoomWorkspace): string {
  const rec = workspace as unknown as Record<string, unknown>;
  return String(rec.id ?? rec.workspaceId ?? "");
}

function versionIdOf(ver: TradingRoomDashboardVersion): string {
  const rec = ver as unknown as Record<string, unknown>;
  return String(rec.id ?? rec.versionId ?? `v-${ver.dashboardVersion}`);
}

export function LayoutAdjustmentGlobalDrawer({
  onClose,
  isNarrowViewport,
  isTradingRoom,
  strategyId,
  selectedWidget,
  onNavigateToTradingRoom,
}: LayoutAdjustmentGlobalDrawerProps): JSX.Element {
  const { t } = useTranslation();
  const [workspace, setWorkspace] = useState<TradingRoomWorkspace | null>(null);
  const [workspaceEtag, setWorkspaceEtag] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorReason, setErrorReason] = useState<string | null>(null);
  const [activeRevisionTarget, setActiveRevisionTarget] = useState<{
    view: TradingRoomViewSpec;
    widget: TradingRoomWidgetSpec;
  } | null>(null);

  const loadWorkspace = useCallback(async () => {
    if (!isTradingRoom) return;
    setLoading(true);
    setErrorReason(null);
    try {
      let targetStrategyId = strategyId;
      let targetStrategyVersion = "v1";
      if (!targetStrategyId) {
        const room = await getTradingRoom();
        const firstStrategy = room.strategies[0];
        if (firstStrategy) {
          targetStrategyId = firstStrategy.strategy_id;
          targetStrategyVersion =
            firstStrategy.strategy_spec_registry_id ||
            ((firstStrategy as unknown as Record<string, unknown>).version_id as string | undefined) ||
            "v1";
        }
      }
      if (!targetStrategyId) {
        setWorkspace(null);
        setLoading(false);
        return;
      }
      const meta = await getTradingRoomWorkspaceByStrategyWithMeta(
        targetStrategyId,
        targetStrategyVersion,
      );
      setWorkspace(meta.workspace);
      setWorkspaceEtag(meta.etag);
    } catch (err) {
      setErrorReason(err instanceof Error ? err.message : "workspace_unavailable");
      setWorkspace(null);
    } finally {
      setLoading(false);
    }
  }, [isTradingRoom, strategyId]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const allWidgets: Array<{ view: TradingRoomViewSpec; widget: TradingRoomWidgetSpec }> = [];
  if (workspace) {
    for (const v of workspace.views) {
      for (const w of v.widgets) {
        allWidgets.push({ view: v, widget: w });
      }
    }
  }

  function triggerTradingRoomDomAction(selector: string): boolean {
    const el = document.querySelector<HTMLElement>(selector);
    if (el) {
      el.click();
      return true;
    }
    return false;
  }

  function handleOpenWidgetRevisionFlow() {
    if (selectedWidget) {
      if (
        triggerTradingRoomDomAction(
          `[data-testid="workspace-widget-ask-servant-${selectedWidget}"]`,
        )
      ) {
        return;
      }
    }
    if (triggerTradingRoomDomAction('[data-testid="workspace-header-ask-servant"]')) {
      return;
    }
    const matched =
      (selectedWidget
        ? allWidgets.find((item) => widgetIdOf(item.widget) === selectedWidget)
        : undefined) ?? allWidgets[0];
    if (matched) {
      setActiveRevisionTarget(matched);
    }
  }

  return (
    <DrawerContainer
      testId="trading-desk-layout-drawer"
      title={t("agora.drawers.layout.title")}
      description={t("agora.drawers.layout.description")}
      onClose={onClose}
      isNarrowViewport={isNarrowViewport}
    >
      {!isTradingRoom ? (
        <div
          data-testid="layout-drawer-disabled-reason"
          role="status"
          style={{
            background: "#231c14",
            border: "1px solid #6b4e23",
            borderRadius: 8,
            color: "#e8b750",
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          <div>{t("agora.drawers.layout.disabledOutsideTradingRoom")}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              data-testid="layout-drawer-open-widget-revision"
              disabled
              style={{
                background: "#171b22",
                border: "1px solid #2a2e38",
                borderRadius: 6,
                color: "#5a6270",
                cursor: "not-allowed",
                fontSize: 12,
                padding: "6px 10px",
              }}
            >
              {t("agora.drawers.layout.openWidgetRevision")}
            </button>
            <button
              type="button"
              data-testid="layout-drawer-switch-trading-room"
              onClick={onNavigateToTradingRoom}
              style={{
                background: "#e8b750",
                border: "1px solid #e8b750",
                borderRadius: 6,
                color: "#111417",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 700,
                padding: "6px 12px",
              }}
            >
              {t("agora.drawers.layout.switchToTradingRoom")}
            </button>
          </div>
        </div>
      ) : (
        <div
          data-testid="layout-drawer-trading-room-controls"
          style={{ display: "flex", flexDirection: "column", gap: 10 }}
        >
          <div
            style={{
              background: "#171b22",
              border: "1px solid #2a2e38",
              borderRadius: 8,
              padding: 12,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              fontSize: 12,
            }}
          >
            <strong style={{ color: "#e8b750" }}>
              {t("agora.drawers.layout.activeWorkspaceTitle")}
            </strong>
            <div style={{ color: "#c5cad2" }}>
              {selectedWidget
                ? t("agora.drawers.layout.selectedWidgetLine", { widget: selectedWidget })
                : t("agora.drawers.layout.noWidgetSelected")}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button
                type="button"
                data-testid="layout-drawer-open-widget-revision"
                onClick={handleOpenWidgetRevisionFlow}
                style={{
                  background: "#e8b750",
                  border: "1px solid #e8b750",
                  borderRadius: 6,
                  color: "#111417",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 700,
                  padding: "6px 12px",
                }}
              >
                {t("agora.drawers.layout.openWidgetRevision")}
              </button>
              <button
                type="button"
                data-testid="layout-drawer-open-layout-proposal"
                onClick={() => {
                  triggerTradingRoomDomAction('[data-testid="workspace-layout-proposal-open"]');
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
                {t("agora.drawers.layout.openLayoutProposal")}
              </button>
              <button
                type="button"
                data-testid="layout-drawer-toggle-edit-mode"
                onClick={() => {
                  triggerTradingRoomDomAction('[data-testid="workspace-edit-mode-toggle"]');
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
                {t("agora.drawers.layout.toggleGridEditMode")}
              </button>
            </div>
          </div>

          {loading ? (
            <div data-testid="layout-drawer-workspace-loading" style={{ color: "#8c96a6", fontSize: 12 }}>
              {t("agora.drawers.layout.workspaceLoading")}
            </div>
          ) : errorReason ? (
            <div
              data-testid="layout-drawer-workspace-error"
              role="status"
              style={{ color: "#f87171", fontSize: 12 }}
            >
              {t("agora.drawers.layout.workspaceError", { reason: errorReason })}
            </div>
          ) : allWidgets.length === 0 ? (
            <div data-testid="layout-drawer-workspace-empty" style={{ color: "#8c96a6", fontSize: 12 }}>
              {t("agora.drawers.layout.workspaceEmpty")}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ color: "#8c96a6", fontSize: 11, fontWeight: 600 }}>
                {t("agora.drawers.layout.widgetListTitle")}
              </div>
              <ul
                data-testid="layout-drawer-widget-list"
                style={{
                  listStyle: "none",
                  margin: 0,
                  padding: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                {allWidgets.map(({ view, widget }) => {
                  const wid = widgetIdOf(widget);
                  const vTitle = viewTitleOf(view);
                  return (
                    <li
                      key={wid}
                      style={{
                        background: "#171b22",
                        border: "1px solid #2a2e38",
                        borderRadius: 6,
                        padding: "8px 10px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <div>
                        <div style={{ color: "#f0ece4", fontSize: 12, fontWeight: 600 }}>
                          {widget.title}
                        </div>
                        <div style={{ color: "#8c96a6", fontSize: 11, fontFamily: "monospace" }}>
                          {wid} · {vTitle}
                        </div>
                      </div>
                      <button
                        type="button"
                        data-testid={`layout-drawer-revise-widget-${wid}`}
                        onClick={() => setActiveRevisionTarget({ view, widget })}
                        style={{
                          background: "#12161f",
                          border: "1px solid #e8b750",
                          borderRadius: 4,
                          color: "#e8b750",
                          cursor: "pointer",
                          fontSize: 11,
                          fontWeight: 600,
                          padding: "4px 8px",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {t("agora.drawers.layout.reviseThisWidget")}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {workspace && activeRevisionTarget ? (
            <WorkspaceWidgetRevisionDrawer
              open={true}
              workspace={workspace}
              workspaceEtag={workspaceEtag}
              view={activeRevisionTarget.view}
              widget={activeRevisionTarget.widget}
              onClose={() => setActiveRevisionTarget(null)}
              onCreateProposal={(workspaceId, widgetId, request) =>
                createWidgetRevisionProposal(workspaceId, widgetId, request)
              }
              onAcceptProposal={(proposalId, etag, options) =>
                acceptWidgetRevisionProposal(proposalId, etag, options)
              }
              onAccepted={(result) => {
                setWorkspace(result.workspace);
                setWorkspaceEtag(result.etag);
                setActiveRevisionTarget(null);
              }}
            />
          ) : null}
        </div>
      )}
    </DrawerContainer>
  );
}

// ─── 6. Personalization Global Drawer (個人化紀錄: workspace versions + what servant learned) ───

export interface PersonalizationGlobalDrawerProps {
  onClose: () => void;
  isNarrowViewport: boolean;
  strategyId: string | null;
  servantPersonaId: string | null;
  servantDisplayName: string;
  defaultSubjectRef: string;
}

export function PersonalizationGlobalDrawer({
  onClose,
  isNarrowViewport,
  strategyId,
  servantPersonaId,
  servantDisplayName,
  defaultSubjectRef,
}: PersonalizationGlobalDrawerProps): JSX.Element {
  const { t } = useTranslation();
  const [versions, setVersions] = useState<TradingRoomDashboardVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState<boolean>(true);
  const [versionsError, setVersionsError] = useState<string | null>(null);

  const [changeLog, setChangeLog] = useState<ChangeLog | null>(null);
  const [learnedLoading, setLearnedLoading] = useState<boolean>(false);
  const [learnedError, setLearnedError] = useState<string | null>(null);

  const loadPersonalization = useCallback(async () => {
    setVersionsLoading(true);
    setVersionsError(null);
    try {
      let targetStrategyId = strategyId;
      let targetStrategyVersion = "v1";
      if (!targetStrategyId) {
        const room = await getTradingRoom();
        const first = room.strategies[0];
        if (first) {
          targetStrategyId = first.strategy_id;
          targetStrategyVersion =
            first.strategy_spec_registry_id ||
            ((first as unknown as Record<string, unknown>).version_id as string | undefined) ||
            "v1";
        }
      }
      if (!targetStrategyId) {
        setVersions([]);
      } else {
        const wsMeta = await getTradingRoomWorkspaceByStrategyWithMeta(
          targetStrategyId,
          targetStrategyVersion,
        );
        const versionList = await listTradingRoomWorkspaceVersions(
          workspaceIdOf(wsMeta.workspace),
        );
        setVersions(versionList);
      }
    } catch (err) {
      setVersionsError(err instanceof Error ? err.message : "workspace_versions_unavailable");
      setVersions([]);
    } finally {
      setVersionsLoading(false);
    }

    if (!servantPersonaId) {
      setChangeLog(null);
      setLearnedError(null);
      return;
    }
    setLearnedLoading(true);
    setLearnedError(null);
    try {
      const logRes = await getChangeLog(servantPersonaId);
      if (logRes.state === "ok") {
        setChangeLog(logRes.data);
      } else {
        setChangeLog(null);
        setLearnedError(logRes.reason);
      }
    } catch (err) {
      setChangeLog(null);
      setLearnedError(err instanceof Error ? err.message : "change_log_unavailable");
    } finally {
      setLearnedLoading(false);
    }
  }, [strategyId, servantPersonaId]);

  useEffect(() => {
    void loadPersonalization();
  }, [loadPersonalization]);

  const entries = Array.isArray(changeLog?.entries) ? changeLog.entries : [];

  return (
    <DrawerContainer
      testId="trading-desk-personalization-drawer"
      title={t("agora.drawers.personalization.title")}
      description={t("agora.drawers.personalization.description")}
      onClose={onClose}
      isNarrowViewport={isNarrowViewport}
    >
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          data-testid="personalization-drawer-refresh"
          onClick={() => {
            void loadPersonalization();
          }}
          style={{
            background: "#171b22",
            border: "1px solid #2a2e38",
            borderRadius: 6,
            color: "#c5cad2",
            cursor: "pointer",
            fontSize: 11,
            padding: "4px 8px",
          }}
        >
          {t("agora.drawers.personalization.refresh")}
        </button>
      </div>

      <section
        data-testid="personalization-workspace-versions-section"
        style={{
          background: "#171b22",
          border: "1px solid #2a2e38",
          borderRadius: 8,
          padding: 12,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <strong style={{ color: "#e8b750", fontSize: 13 }}>
          {t("agora.drawers.personalization.workspaceVersionsTitle")}
        </strong>
        {versionsLoading ? (
          <div data-testid="personalization-workspace-versions-loading" style={{ color: "#8c96a6", fontSize: 12 }}>
            {t("agora.drawers.personalization.workspaceVersionsLoading")}
          </div>
        ) : versionsError ? (
          <div
            data-testid="personalization-workspace-versions-error"
            role="status"
            style={{ color: "#f87171", fontSize: 12 }}
          >
            {t("agora.drawers.personalization.workspaceVersionsError", {
              reason: versionsError,
            })}
          </div>
        ) : versions.length === 0 ? (
          <div data-testid="personalization-workspace-versions-empty" style={{ color: "#8c96a6", fontSize: 12 }}>
            {t("agora.drawers.personalization.workspaceVersionsEmpty")}
          </div>
        ) : (
          <ul
            data-testid="personalization-workspace-versions-list"
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {versions.map((ver) => {
              const vid = versionIdOf(ver);
              return (
                <li
                  key={vid}
                  data-testid={`personalization-workspace-version-${ver.dashboardVersion}`}
                  style={{
                    background: "#12161f",
                    border: "1px solid #2a2e38",
                    borderRadius: 6,
                    padding: "8px 10px",
                    fontSize: 12,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      color: "#e8b750",
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    <span>
                      {t("agora.drawers.personalization.versionBadge", {
                        version: ver.dashboardVersion,
                      })}
                    </span>
                    <span style={{ color: "#8c96a6", fontFamily: "monospace" }}>
                      {vid}
                    </span>
                  </div>
                  <div style={{ color: "#f0ece4", marginTop: 4 }}>{ver.changeSummary}</div>
                  <div style={{ color: "#8c96a6", fontSize: 11, marginTop: 4 }}>
                    {t("agora.drawers.personalization.generatedByLabel", {
                      source: ver.generatedBy,
                    })}{" "}
                    ·{" "}
                    {t("agora.drawers.personalization.createdAtLabel", {
                      time: ver.createdAt,
                    })}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section
        data-testid="personalization-servant-learned-section"
        style={{
          background: "#171b22",
          border: "1px solid #2a2e38",
          borderRadius: 8,
          padding: 12,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <strong style={{ color: "#e8b750", fontSize: 13 }}>
          {t("agora.drawers.personalization.servantLearnedTitle")}
        </strong>
        {learnedLoading ? (
          <div data-testid="personalization-servant-learned-loading" style={{ color: "#8c96a6", fontSize: 12 }}>
            {t("agora.drawers.personalization.servantLearnedLoading")}
          </div>
        ) : learnedError ? (
          <div
            data-testid="personalization-servant-learned-error"
            role="status"
            style={{ color: "#f87171", fontSize: 12 }}
          >
            {t("agora.drawers.personalization.servantLearnedError", {
              reason: learnedError,
            })}
          </div>
        ) : (
          <>
            <div style={{ color: "#8c96a6", fontSize: 11, fontFamily: "monospace" }}>
              {changeLog?.active_version !== undefined && changeLog?.active_version !== null
                ? t("agora.drawers.personalization.activeVersionLine", {
                    version: String(changeLog.active_version),
                  })
                : t("agora.drawers.personalization.activeVersionNone")}
            </div>
            {entries.length === 0 ? (
              <div data-testid="personalization-servant-learned-empty" style={{ color: "#8c96a6", fontSize: 12 }}>
                {t("agora.drawers.personalization.servantLearnedEmpty")}
              </div>
            ) : (
              <ul
                data-testid="personalization-servant-learned-list"
                style={{
                  listStyle: "none",
                  margin: 0,
                  padding: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                {entries.map((entry, idx) => {
                  const pid = String(entry.patch_id ?? `patch-${idx}`);
                  return (
                    <li
                      key={pid}
                      data-testid={`personalization-servant-learned-item-${pid}`}
                      style={{
                        background: "#12161f",
                        border: "1px solid #2a2e38",
                        borderRadius: 6,
                        padding: "8px 10px",
                        fontSize: 12,
                      }}
                    >
                      <div style={{ color: "#f0ece4", fontWeight: 600 }}>
                        {t("agora.drawers.personalization.patchEntryTitle", {
                          patchId: pid,
                          version: String(entry.version ?? "1"),
                        })}
                      </div>
                      <div style={{ color: "#8c96a6", fontSize: 11, marginTop: 2 }}>
                        {t("agora.drawers.personalization.evidenceRefsLine", {
                          refs:
                            Array.isArray(entry.evidence_refs) && entry.evidence_refs.length > 0
                              ? entry.evidence_refs.join(", ")
                              : "—",
                        })}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </section>

      <ServantCorrectionSection
        servantPersonaId={servantPersonaId}
        servantDisplayName={servantDisplayName}
        defaultSubjectRef={defaultSubjectRef}
      />
    </DrawerContainer>
  );
}

// ─── Shared Global Drawer Shell ─────────────────────────────────────────────

interface DrawerContainerProps {
  testId: string;
  title: string;
  description: string;
  onClose: () => void;
  isNarrowViewport: boolean;
  children: React.ReactNode;
}

function DrawerContainer({
  testId,
  title,
  description,
  onClose,
  isNarrowViewport,
  children,
}: DrawerContainerProps): JSX.Element {
  const { t } = useTranslation();

  return (
    <aside
      aria-label={title}
      aria-modal={isNarrowViewport ? true : undefined}
      role={isNarrowViewport ? "dialog" : undefined}
      data-testid={testId}
      style={
        isNarrowViewport
          ? {
              position: "fixed",
              top: 52,
              right: 0,
              bottom: 0,
              width: "100%",
              maxWidth: "100vw",
              zIndex: 60,
              borderLeft: "1px solid #2a2e38",
              background: "#12161f",
              padding: 16,
              overflowY: "auto",
              boxSizing: "border-box",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }
          : {
              width: 440,
              maxWidth: "45vw",
              borderLeft: "1px solid #2a2e38",
              background: "#12161f",
              padding: 16,
              overflowY: "auto",
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }
      }
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 8,
          borderBottom: "1px solid #2a2e38",
          paddingBottom: 10,
        }}
      >
        <div>
          <strong style={{ color: "#f0ece4", fontSize: 15 }}>{title}</strong>
          <div style={{ color: "#8c96a6", fontSize: 12, marginTop: 4, lineHeight: 1.45 }}>
            {description}
          </div>
        </div>
        <button
          type="button"
          data-testid={`${testId}-close`}
          onClick={onClose}
          style={{
            background: "#171b22",
            border: "1px solid #2a2e38",
            borderRadius: 6,
            color: "#c5cad2",
            cursor: "pointer",
            fontSize: 12,
            padding: "4px 10px",
            whiteSpace: "nowrap",
          }}
        >
          {t("agora.drawers.toolbar.closeDrawer")}
        </button>
      </div>
      {children}
    </aside>
  );
}
