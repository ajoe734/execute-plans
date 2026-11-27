import React from "react";
import type { WorkshopCard } from "@/lib/bff-v1/agora/workshops";
import type { PayloadResearchResult, ResearchMetric } from "./workshop-card-types";
import { formatLabel, workshopCopy } from "./workshopCardUtils";

export interface BacktestResultCardProps {
  card: WorkshopCard;
  onContinueDiscussion?: (cardId: string) => void;
}

const OUTCOME_CLASS: Record<string, string> = {
  pass: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
  fail: "border-rose-500/40 bg-rose-500/15 text-rose-300",
  inconclusive: "border-amber-500/40 bg-amber-500/15 text-amber-300",
  pending: "border-border bg-muted/40 text-muted-foreground",
};

const BACKEND_MODE_CLASS: Record<string, string> = {
  real: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  fixture: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  stub: "border-border bg-muted/40 text-muted-foreground",
};

const SEVERITY_BORDER_CLASS: Record<string, string> = {
  info: "border-l-border",
  watch: "border-l-sky-400",
  warning: "border-l-amber-400",
  high: "border-l-rose-400",
  critical: "border-l-rose-500",
};

const SEVERITY_TEXT_CLASS: Record<string, string> = {
  info: "text-muted-foreground",
  watch: "text-sky-300",
  warning: "text-amber-300",
  high: "text-rose-300",
  critical: "text-rose-400",
};

const GATE_RESULT_CLASS: Record<string, string> = {
  pass: "text-emerald-300",
  fail: "text-rose-300",
  not_applicable: "text-muted-foreground",
  not_evaluated: "text-muted-foreground",
};

function groupMetricsByCategory(metrics: ResearchMetric[]): Map<string, ResearchMetric[]> {
  const groups = new Map<string, ResearchMetric[]>();
  for (const m of metrics) {
    const existing = groups.get(m.category);
    if (existing) {
      existing.push(m);
    } else {
      groups.set(m.category, [m]);
    }
  }
  return groups;
}

export function BacktestResultCard({
  card,
  onContinueDiscussion,
}: BacktestResultCardProps): JSX.Element {
  const payload = (card.payload ?? {}) as unknown as PayloadResearchResult;
  const outcomeClass = OUTCOME_CLASS[payload.outcome] ?? OUTCOME_CLASS.pending;
  const metricGroups =
    payload.metrics && Array.isArray(payload.metrics) && payload.metrics.length > 0
      ? groupMetricsByCategory(payload.metrics)
      : null;

  return (
    <div
      className="flex flex-col gap-2.5 rounded-lg border border-border bg-card p-3.5 text-card-foreground"
      data-testid={`backtest-result-card-${card.card_id}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="text-sm font-semibold text-foreground">{card.title}</div>
          {card.summary && (
            <div className="mt-0.5 text-xs text-muted-foreground">{card.summary}</div>
          )}
        </div>
        <div className="ml-2 flex shrink-0 items-center gap-1.5">
          {payload.outcome && (
            <span
              className={`rounded border px-2 py-0.5 text-xs font-semibold ${outcomeClass}`}
              data-testid={`backtest-result-card-${card.card_id}-outcome`}
            >
              {payload.outcome}
            </span>
          )}
          {payload.backend && (
            <span
              className={`rounded border px-1.5 py-0.5 text-[11px] font-semibold ${
                BACKEND_MODE_CLASS[payload.backend.mode] ?? BACKEND_MODE_CLASS.stub
              }`}
              data-testid={`backtest-result-card-${card.card_id}-backend-mode`}
            >
              {payload.backend.effective} · <span>{formatLabel(payload.backend.mode)}</span>
            </span>
          )}
        </div>
      </div>

      {metricGroups && (
        <div data-testid={`backtest-result-card-${card.card_id}-metrics`}>
          {Array.from(metricGroups.entries()).map(([category, metrics]) => (
            <div className="mb-1.5" key={category}>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {formatLabel(category)}
              </div>
              {metrics.map((m, i) => (
                <div
                  className="flex items-center justify-between py-0.5 text-xs"
                  data-testid={`backtest-result-card-${card.card_id}-metric-${m.name.replace(/\s+/g, "-").toLowerCase()}`}
                  key={i}
                >
                  <span className="text-foreground/90">{m.name}</span>
                  <span className={`font-medium ${GATE_RESULT_CLASS[m.gate_result] ?? "text-muted-foreground"}`}>
                    {m.value}
                    {m.unit ? ` ${m.unit}` : ""}
                    <span className={`ml-1.5 text-[11px] ${GATE_RESULT_CLASS[m.gate_result] ?? "text-muted-foreground"}`}>
                      {m.gate_result}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {payload.findings && payload.findings.length > 0 && (
        <div data-testid={`backtest-result-card-${card.card_id}-findings`}>
          <div className="mb-1 text-xs font-semibold text-foreground/90">
            {workshopCopy("agora.workshop.cardLabels.findings", "發現")}
          </div>
          {payload.findings.map((f) => (
            <div
              className={`mb-1 border-l-4 py-0.5 pl-2 text-xs text-foreground/90 ${
                SEVERITY_BORDER_CLASS[f.severity] ?? "border-l-border"
              }`}
              key={f.finding_id}
            >
              <span
                className={`mr-1.5 text-[11px] font-semibold uppercase ${
                  SEVERITY_TEXT_CLASS[f.severity] ?? "text-muted-foreground"
                }`}
              >
                {f.severity}
              </span>
              {f.summary}
            </div>
          ))}
        </div>
      )}

      {payload.warnings && payload.warnings.length > 0 && (
        <div
          className="rounded border border-amber-500/30 bg-amber-500/15 px-2.5 py-1.5"
          data-testid={`backtest-result-card-${card.card_id}-warnings`}
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
          data-testid={`backtest-result-card-${card.card_id}-blocking`}
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

      {payload.gate_impacts && payload.gate_impacts.length > 0 && (
        <div
          className="text-xs text-foreground/90"
          data-testid={`backtest-result-card-${card.card_id}-gate-impacts`}
        >
          <span className="font-medium">
            {workshopCopy("agora.workshop.cardLabels.gate_impacts", "影響閘門")}:{" "}
          </span>
          {payload.gate_impacts.join(", ")}
        </div>
      )}

      {payload.data_cutoff && (
        <div
          className="text-[11px] text-muted-foreground"
          data-testid={`backtest-result-card-${card.card_id}-data-cutoff`}
        >
          {workshopCopy("agora.workshop.cardLabels.data_cutoff", "資料截止時間")}: {payload.data_cutoff}
        </div>
      )}

      <div className="mt-0.5 flex gap-2">
        {onContinueDiscussion && (
          <button
            className="cursor-pointer rounded border border-border bg-secondary/40 px-3 py-1 text-xs text-secondary-foreground hover:bg-secondary/70"
            data-testid={`backtest-result-card-${card.card_id}-discuss`}
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
