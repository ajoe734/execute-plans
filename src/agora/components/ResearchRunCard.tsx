import React from "react";
import type { ResearchRunProjection } from "@/lib/bff-v1/agora/research";
import type { WorkshopCard } from "@/lib/bff-v1/agora/workshops";
import type { PayloadResearchProgress, ResearchExecutionStatus } from "./workshop-card-types";
import { workshopCopy } from "./workshopCardUtils";

export interface ResearchRunCardProps {
  card: WorkshopCard;
  onContinueDiscussion?: (cardId: string) => void;
}

const EXECUTION_STATUS_CLASS: Record<ResearchExecutionStatus, string> = {
  queued: "text-muted-foreground",
  dispatching: "text-sky-400",
  running: "text-sky-400",
  succeeded: "text-emerald-400",
  failed: "text-rose-400",
  cancelled: "text-muted-foreground",
  timed_out: "text-amber-400",
};

const CARD_STATUS_CLASS: Record<string, string> = {
  informational: "border-border text-muted-foreground bg-muted/40",
  action_required: "border-amber-500/40 text-amber-300 bg-amber-500/15",
  running: "border-sky-500/40 text-sky-300 bg-sky-500/15",
  completed: "border-emerald-500/40 text-emerald-300 bg-emerald-500/15",
  failed: "border-rose-500/40 text-rose-300 bg-rose-500/15",
  stale: "border-border text-muted-foreground bg-muted/30",
};

export function ResearchRunCard({ card, onContinueDiscussion }: ResearchRunCardProps): JSX.Element {
  const payload = (card.payload ?? {}) as unknown as PayloadResearchProgress;
  const rawProgress = typeof payload.progress === "number" ? payload.progress : 0;
  const progressPct = Math.min(100, Math.max(0, rawProgress));
  const statusClass = EXECUTION_STATUS_CLASS[payload.execution_status] ?? "text-muted-foreground";
  const cardStatusClass = CARD_STATUS_CLASS[card.status] ?? CARD_STATUS_CLASS.informational;

  return (
    <div
      className="flex flex-col gap-2.5 rounded-lg border border-border bg-card p-3.5 text-card-foreground"
      data-testid={`research-run-card-${card.card_id}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="text-sm font-semibold text-foreground">{card.title}</div>
          {card.summary && (
            <div className="mt-0.5 text-xs text-muted-foreground">{card.summary}</div>
          )}
        </div>
        <span
          className={`ml-2 shrink-0 whitespace-nowrap rounded border px-2 py-0.5 text-[11px] font-semibold ${cardStatusClass}`}
          data-testid={`research-run-card-${card.card_id}-card-status`}
        >
          {card.status}
        </span>
      </div>

      <div
        className="flex justify-between text-xs"
        data-testid={`research-run-card-${card.card_id}-meta`}
      >
        <span className="text-muted-foreground">
          {payload.stage_type}
          {payload.backend && (
            <span className="ml-1.5 text-muted-foreground/80">
              · {typeof payload.backend === "string" ? payload.backend : String((payload.backend as Record<string, unknown>).effective ?? "")}
            </span>
          )}
        </span>
        <span
          className={`font-semibold ${statusClass}`}
          data-testid={`research-run-card-${card.card_id}-execution-status`}
        >
          {payload.execution_status}
        </span>
      </div>

      <div
        className="h-1.5 overflow-hidden rounded bg-muted"
        data-testid={`research-run-card-${card.card_id}-progress-bar`}
      >
        <div
          className={`h-full rounded transition-all duration-300 ${
            payload.execution_status === "succeeded" ? "bg-emerald-500" : "bg-primary"
          }`}
          style={{ width: `${progressPct}%` }}
        />
      </div>
      <div
        className="-mt-1.5 text-right text-[11px] text-muted-foreground"
        data-testid={`research-run-card-${card.card_id}-progress-pct`}
      >
        {Math.round(progressPct)}%
      </div>

      {payload.latest_progress_message && (
        <div
          className="text-xs text-muted-foreground"
          data-testid={`research-run-card-${card.card_id}-message`}
        >
          {payload.latest_progress_message}
        </div>
      )}

      {payload.warnings && payload.warnings.length > 0 && (
        <div
          className="rounded border border-amber-500/30 bg-amber-500/15 px-2.5 py-1.5"
          data-testid={`research-run-card-${card.card_id}-warnings`}
        >
          <div className="mb-0.5 text-xs font-semibold text-amber-300">
            {workshopCopy("agora.workshop.cardLabels.warnings", "警告")}
          </div>
          {payload.warnings.map((w, i) => (
            <div className="text-xs text-amber-200" key={i}>
              {w}
            </div>
          ))}
        </div>
      )}

      {payload.blocking_reasons && payload.blocking_reasons.length > 0 && (
        <div
          className="rounded border border-rose-500/30 bg-rose-500/15 px-2.5 py-1.5"
          data-testid={`research-run-card-${card.card_id}-blocking`}
        >
          <div className="mb-0.5 text-xs font-semibold text-rose-300">
            {workshopCopy("agora.workshop.cardLabels.blocking_reasons", "阻擋原因")}
          </div>
          {payload.blocking_reasons.map((r, i) => (
            <div className="text-xs text-rose-200" key={i}>
              {r}
            </div>
          ))}
        </div>
      )}

      <div className="mt-0.5 flex gap-2">
        {card.allowed_actions?.["cancel"] && (
          <button
            className="cursor-pointer rounded border border-rose-500/40 bg-rose-500/15 px-3 py-1 text-xs text-rose-300 hover:bg-rose-500/25"
            data-testid={`research-run-card-${card.card_id}-cancel`}
            type="button"
          >
            {workshopCopy("agora.workshop.actions.cancel", "取消")}
          </button>
        )}
        {onContinueDiscussion && (
          <button
            className="cursor-pointer rounded border border-border bg-secondary/40 px-3 py-1 text-xs text-secondary-foreground hover:bg-secondary/70"
            data-testid={`research-run-card-${card.card_id}-discuss`}
            onClick={() => onContinueDiscussion(card.card_id)}
            type="button"
          >
            {workshopCopy("agora.workshop.actions.ask_servant", "詢問助理")}
          </button>
        )}
      </div>
    </div>
  );
}

/** Read-back view of a persisted research run (progress and outcome come from the BFF). */
export function ResearchRunProjectionCard({ run }: { run: ResearchRunProjection }): JSX.Element {
  const percent = Math.max(0, Math.min(100, Math.round(run.progress?.percent ?? 0)));
  return (
    <div className="rounded border border-border bg-card/60 p-2 text-xs space-y-1" data-testid={`research-run-${run.run_id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] text-muted-foreground">{run.run_id}</span>
        <span className="font-semibold text-foreground" data-testid="research-run-status">{run.execution_status}</span>
        <span data-testid="research-run-outcome">
          {workshopCopy("agora.workshop.cardLabels.outcome", "結果")}: {run.outcome}
        </span>
      </div>
      <div className="h-1.5 rounded bg-muted" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-1.5 rounded bg-primary" style={{ width: `${percent}%` }} />
      </div>
      <p className="text-muted-foreground">{run.progress?.phase} · {percent}%{run.progress?.message ? ` · ${run.progress.message}` : ""}</p>
      {run.failure?.message ? <p className="text-rose-400">{run.failure.message}</p> : null}
      {(run.blocking_reasons ?? []).map((reason) => <p key={reason} className="text-amber-300">{reason}</p>)}
    </div>
  );
}
