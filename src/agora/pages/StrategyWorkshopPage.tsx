// Strategy Workshop tab — §11.1 IA spec.
// Route: /agora/strategy-workshop  (list view)
//        /agora/strategy-workshop/:workshopId  (session view)
//
// Layout split when in session:
//   WorkshopConversation (70%) | StrategyCompletenessRail (30%)
//   ServantComposer (bottom input)
//
// All BFF calls go through @/lib/bff-v1/agora/workshops — pages must not
// call fetch() directly.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  listWorkshops,
  getWorkshop,
  listWorkshopCards,
  getWorkshopCompleteness,
  getWorkshopReadiness,
  postWorkshopMessage,
  type WorkshopCard,
  type WorkshopCardType,
} from "@/lib/bff-v1/agora/workshops";
import type {
  StrategyWorkshop,
  StrategyCompleteness,
} from "@/lib/bff-v1/agora/types";

// ─── WorkshopListPanel ────────────────────────────────────────────────────────

function WorkshopListPanel({ workshops }: { workshops: StrategyWorkshop[] }) {
  if (workshops.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <p className="text-sm text-slate-500">尚無策略工坊</p>
        <p className="text-xs text-slate-400">從此處開啟新工坊，與 Servant 一起探索策略</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-slate-100" role="list">
      {workshops.map((ws) => (
        <li key={ws.workshop_id}>
          <a
            className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors"
            href={`/agora/strategy-workshop/${ws.workshop_id}`}
          >
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium text-slate-900">
                {ws.subject.title ?? ws.subject.ref}
              </p>
              <p className="mt-0.5 text-xs text-slate-400">
                {ws.workshop_id.slice(0, 8)}… · {ws.status}
              </p>
            </div>
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                ws.status === "open"
                  ? "bg-green-50 text-green-700"
                  : ws.status === "in_review"
                    ? "bg-amber-50 text-amber-700"
                    : "bg-slate-100 text-slate-500",
              )}
            >
              {ws.status}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

// ─── Card type label ──────────────────────────────────────────────────────────

function cardTypeLabel(type: WorkshopCardType): string {
  const labels: Record<WorkshopCardType, string> = {
    user_strategy_description: "Strategy Description",
    servant_reconstruction: "Servant Reconstruction",
    completeness_update: "Completeness Update",
    missing_definition: "Missing Definition",
    next_question: "Question",
    research_plan_proposal: "Research Plan",
    research_progress: "Research Progress",
    research_result: "Research Result",
    consult_result: "Consult Result",
    version_patch_proposal: "Version Patch",
    version_compare: "Version Compare",
    readiness_gate: "Readiness Gate",
  };
  return labels[type] ?? type;
}

// ─── WorkshopConversation ─────────────────────────────────────────────────────

function WorkshopConversation({
  cards,
  loading,
}: {
  cards: WorkshopCard[];
  loading: boolean;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [cards]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-slate-400">載入對話…</p>
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="text-sm text-slate-500">工坊剛剛開始</p>
        <p className="text-xs text-slate-400">在下方輸入框描述你的策略構想</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
      {cards.map((card) => (
        <div
          className={cn(
            "rounded-lg border p-3 text-sm",
            card.emitted_by === "user"
              ? "ml-auto max-w-[75%] border-blue-200 bg-blue-50"
              : "mr-auto max-w-[90%] border-slate-200 bg-white",
          )}
          key={card.card_id}
        >
          <div className="mb-1 flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500">
              {cardTypeLabel(card.card_type)}
            </span>
            <span className="text-xs text-slate-300">#{card.sequence}</span>
          </div>
          <pre className="whitespace-pre-wrap text-xs text-slate-700 font-sans">
            {JSON.stringify(card.payload, null, 2)}
          </pre>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

// ─── StrategyCompletenessRail ─────────────────────────────────────────────────

function StrategyCompletenessRail({
  completeness,
}: {
  completeness: StrategyCompleteness | null;
}) {
  if (!completeness) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-4 text-center">
        <p className="text-xs text-slate-400">策略完整度尚未評估</p>
      </div>
    );
  }

  const gradeColor: Record<StrategyCompleteness["overall_grade"], string> = {
    complete: "text-green-700",
    mostly_complete: "text-amber-600",
    partial: "text-orange-600",
    incomplete: "text-red-600",
  };

  return (
    <div className="flex flex-col gap-3 overflow-y-auto p-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Completeness
        </span>
        <span className={cn("text-xs font-medium", gradeColor[completeness.overall_grade])}>
          {completeness.overall_grade.replace(/_/g, " ")}
        </span>
      </div>

      {completeness.dimensions.map((dim) => (
        <div className="rounded border border-slate-100 bg-slate-50 p-2" key={dim.dimension}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-700">
              {dim.dimension.replace(/_/g, " ")}
            </span>
            <span
              className={cn(
                "text-xs",
                dim.grade === "complete"
                  ? "text-green-600"
                  : dim.grade === "partial"
                    ? "text-amber-600"
                    : "text-red-500",
              )}
            >
              {dim.grade}
            </span>
          </div>
          {dim.gaps && dim.gaps.length > 0 && (
            <ul className="mt-1 list-disc pl-4">
              {dim.gaps.map((gap, i) => (
                <li className="text-xs text-slate-400" key={i}>
                  {gap}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}

      {completeness.blockers && completeness.blockers.length > 0 && (
        <div className="rounded border border-red-100 bg-red-50 p-2">
          <p className="text-xs font-medium text-red-700">Blockers</p>
          <ul className="mt-1 list-disc pl-4">
            {completeness.blockers.map((b, i) => (
              <li className="text-xs text-red-600" key={i}>
                {b}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── ServantComposer ──────────────────────────────────────────────────────────

function ServantComposer({
  disabled,
  onSend,
}: {
  disabled: boolean;
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState("");

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && text.trim()) {
      e.preventDefault();
      onSend(text.trim());
      setText("");
    }
  };

  const handleSubmit = () => {
    if (text.trim()) {
      onSend(text.trim());
      setText("");
    }
  };

  return (
    <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-3">
      <div className="flex gap-2">
        <textarea
          className="flex-1 resize-none rounded-md border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-blue-400 focus:outline-none disabled:opacity-50"
          disabled={disabled}
          onKeyDown={handleKeyDown}
          onChange={(e) => setText(e.target.value)}
          placeholder="描述你的策略構想…（Cmd+Enter 送出）"
          rows={3}
          value={text}
        />
        <button
          className="self-end rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          disabled={disabled || !text.trim()}
          onClick={handleSubmit}
          type="button"
        >
          送出
        </button>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function StrategyWorkshopPage() {
  const { workshopId } = useParams<{ workshopId?: string }>();

  // List view state
  const [workshops, setWorkshops] = useState<StrategyWorkshop[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  // Session view state
  const [workshop, setWorkshop] = useState<StrategyWorkshop | null>(null);
  const [cards, setCards] = useState<WorkshopCard[]>([]);
  const [completeness, setCompleteness] = useState<StrategyCompleteness | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // Load workshop list when no workshopId
  useEffect(() => {
    if (workshopId) return;
    setListLoading(true);
    setListError(null);
    listWorkshops()
      .then((res) => setWorkshops(res.items))
      .catch((err) => setListError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setListLoading(false));
  }, [workshopId]);

  // Load session data when workshopId is present
  useEffect(() => {
    if (!workshopId) return;
    setSessionLoading(true);
    Promise.all([
      getWorkshop(workshopId),
      listWorkshopCards(workshopId),
      getWorkshopCompleteness(workshopId),
      getWorkshopReadiness(workshopId),
    ])
      .then(([ws, cardsRes, comp]) => {
        setWorkshop(ws);
        setCards(cardsRes.items);
        setCompleteness(comp);
      })
      .catch((err) => {
        console.error("[StrategyWorkshopPage] session load error", err);
      })
      .finally(() => setSessionLoading(false));
  }, [workshopId]);

  // handleSend is a stub — full wiring deferred to AG-FE-SW-002.
  const handleSend = useCallback(
    async (text: string) => {
      if (!workshopId) return;
      setSendError(null);
      try {
        await postWorkshopMessage(workshopId, { content: text });
        // Reload cards after sending
        const cardsRes = await listWorkshopCards(workshopId);
        setCards(cardsRes.items);
      } catch (err) {
        setSendError(err instanceof Error ? err.message : "送出失敗");
        if (process.env.NODE_ENV !== "production") {
          console.error("[StrategyWorkshopPage] send error", err);
        }
      }
    },
    [workshopId],
  );

  // ── List view ────────────────────────────────────────────────────────────────
  if (!workshopId) {
    return (
      <div className="flex flex-1 flex-col">
        <div className="flex h-12 shrink-0 items-center gap-3 border-b border-slate-200 px-4">
          <h2 className="text-sm font-semibold text-slate-900">策略工坊</h2>
          <span className="flex-1" />
          <span className="text-xs text-slate-400">
            {workshops.length > 0 ? `${workshops.length} 個工坊` : ""}
          </span>
        </div>

        {listLoading && (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-slate-400">載入中…</p>
          </div>
        )}

        {listError && !listLoading && (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-red-500">{listError}</p>
          </div>
        )}

        {!listLoading && !listError && (
          <WorkshopListPanel workshops={workshops} />
        )}
      </div>
    );
  }

  // ── Session view ─────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Session header */}
      <div className="flex h-10 shrink-0 items-center gap-3 border-b border-slate-200 px-4">
        <a
          className="text-xs text-slate-500 hover:text-slate-700"
          href="/agora/strategy-workshop"
        >
          ← 工坊列表
        </a>
        {workshop && (
          <span className="text-xs font-medium text-slate-700 truncate">
            {workshop.subject.title ?? workshop.subject.ref}
          </span>
        )}
      </div>

      {/* Main split pane */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* WorkshopConversation — 70% */}
        <div className="flex min-h-0 flex-1 flex-col" style={{ flex: "0 0 70%" }}>
          <WorkshopConversation cards={cards} loading={sessionLoading} />
          {sendError && (
            <p className="shrink-0 px-4 py-1 text-xs text-red-500">{sendError}</p>
          )}
          <ServantComposer
            disabled={sessionLoading || workshop?.status === "concluded"}
            onSend={handleSend}
          />
        </div>

        {/* StrategyCompletenessRail — 30% */}
        <div
          className="shrink-0 overflow-y-auto border-l border-slate-200 bg-slate-50"
          style={{ flex: "0 0 30%" }}
        >
          <div className="flex h-10 items-center border-b border-slate-200 px-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Completeness
            </span>
          </div>
          <StrategyCompletenessRail completeness={completeness} />
        </div>
      </div>
    </div>
  );
}

export default StrategyWorkshopPage;
