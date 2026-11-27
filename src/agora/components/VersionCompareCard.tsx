import React from "react";
import type { WorkshopCard } from "@/lib/bff-v1/agora/workshops";
import type {
  PayloadVersionCompare,
  FieldDiff,
  MetricDiff,
  RiskDiff,
  ReadinessDiff,
  GateName,
} from "./workshop-card-types";
import { formatLabel, workshopCopy } from "./workshopCardUtils";

export interface VersionCompareCardProps {
  card: WorkshopCard;
  onContinueDiscussion?: (cardId: string) => void;
}

// Evidence class display config.
// RULE: predicted must never be visually treated as an observed metric.
function getEvidenceClassConfig(evidenceClass: string): {
  label: string;
  className: string;
  badgeClass: string;
  italic: boolean;
} {
  if (evidenceClass === "predicted") {
    return {
      label: workshopCopy("agora.workshop.cardLabels.evidence_predicted", "模型預測"),
      className: "border border-dashed border-amber-500/40 bg-amber-500/10",
      badgeClass: "text-amber-300",
      italic: true,
    };
  }
  if (evidenceClass === "backtested_in_sample") {
    return {
      label: workshopCopy("agora.workshop.cardLabels.evidence_backtested_in_sample", "樣本內回測 (IS)"),
      className: "border border-sky-500/30 bg-sky-500/10",
      badgeClass: "text-sky-300",
      italic: false,
    };
  }
  if (evidenceClass === "backtested_oos") {
    return {
      label: workshopCopy("agora.workshop.cardLabels.evidence_backtested_oos", "樣本外回測 (OOS)"),
      className: "border border-emerald-500/30 bg-emerald-500/10",
      badgeClass: "text-emerald-300",
      italic: false,
    };
  }
  if (evidenceClass === "paper_observed") {
    return {
      label: workshopCopy("agora.workshop.cardLabels.evidence_paper_observed", "模擬盤實測"),
      className: "border border-purple-500/30 bg-purple-500/10",
      badgeClass: "text-purple-300",
      italic: false,
    };
  }
  return {
    label: evidenceClass,
    className: "border border-border bg-muted/30",
    badgeClass: "text-muted-foreground",
    italic: false,
  };
}

const CHANGE_KIND_CLASS: Record<string, string> = {
  added: "text-emerald-400",
  removed: "text-rose-400",
  changed: "text-amber-400",
  unchanged: "text-muted-foreground",
};

const CHANGE_KIND_PREFIX: Record<string, string> = {
  added: "+",
  removed: "-",
  changed: "~",
  unchanged: " ",
};

const MATERIALITY_CLASS: Record<string, string> = {
  critical: "border-rose-500/40 text-rose-300",
  high: "border-amber-500/40 text-amber-300",
  medium: "border-yellow-500/40 text-yellow-300",
  low: "border-border text-muted-foreground",
};

const GATE_STATE_CLASS: Record<string, string> = {
  ready: "text-emerald-400",
  conditional: "text-amber-400",
  blocked: "text-rose-400",
  not_assessed: "text-muted-foreground",
  stale: "text-amber-300",
};

const RISK_CHANGE_CLASS: Record<string, string> = {
  improved: "text-emerald-400",
  worsened: "text-rose-400",
  unchanged: "text-muted-foreground",
  uncertain: "text-amber-400",
};

function groupByCandidate<T extends { candidate_version_id: string }>(
  items: T[]
): Array<{ candidateId: string; rows: T[] }> {
  const order: string[] = [];
  const map: Record<string, T[]> = {};
  for (const item of items) {
    const id = item.candidate_version_id;
    if (!map[id]) {
      order.push(id);
      map[id] = [];
    }
    map[id].push(item);
  }
  return order.map((id) => ({ candidateId: id, rows: map[id] }));
}

function SectionHeader({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
      {children}
    </div>
  );
}

function CandidateGroupHeader({ label }: { label: string }): JSX.Element {
  return (
    <div className="my-1 inline-block rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-bold text-sky-300">
      {label}
    </div>
  );
}

function FieldDiffRow({ diff }: { diff: FieldDiff }): JSX.Element {
  const colorClass = CHANGE_KIND_CLASS[diff.change_kind] ?? "text-foreground/90";
  const prefix = CHANGE_KIND_PREFIX[diff.change_kind] ?? " ";
  return (
    <div className={`flex items-center gap-1.5 py-0.5 font-mono text-xs ${colorClass}`}>
      <span className="w-3 shrink-0">{prefix}</span>
      <span className="flex-1 text-foreground/90">{diff.path}</span>
      {diff.materiality && (
        <span
          className={`rounded border px-1 text-[10px] ${
            MATERIALITY_CLASS[diff.materiality] ?? "border-border text-muted-foreground"
          }`}
        >
          {diff.materiality}
        </span>
      )}
    </div>
  );
}

function MetricDiffRow({ diff }: { diff: MetricDiff }): JSX.Element {
  const cfg = getEvidenceClassConfig(diff.evidence_class);

  const deltaSign =
    diff.absolute_delta != null
      ? diff.absolute_delta > 0
        ? "+"
        : diff.absolute_delta < 0
          ? ""
          : "±"
      : "";

  return (
    <div
      className={`mb-1 flex items-center justify-between rounded px-2 py-1 text-xs ${cfg.className}`}
      data-testid={`metric-diff-${diff.metric}`}
      style={{ fontStyle: cfg.italic ? "italic" : "normal" }}
    >
      <div className="flex flex-col gap-0.5">
        <span className="font-medium text-foreground/90">{diff.metric}</span>
        <span className={`text-[10px] font-semibold ${cfg.badgeClass}`}>{cfg.label}</span>
      </div>
      <div className="flex flex-col items-end gap-0.5">
        {diff.base_value != null && (
          <span className="text-[11px] text-muted-foreground">
            {workshopCopy("agora.workshop.cardLabels.base", "基準")}: {diff.base_value}
          </span>
        )}
        {diff.candidate_value != null && (
          <span className="text-[11px] font-medium text-foreground">{diff.candidate_value}</span>
        )}
        {diff.absolute_delta != null && (
          <span
            className={`text-[11px] font-semibold ${
              diff.absolute_delta > 0
                ? "text-emerald-400"
                : diff.absolute_delta < 0
                  ? "text-rose-400"
                  : "text-muted-foreground"
            }`}
          >
            {deltaSign}
            {diff.absolute_delta}
          </span>
        )}
      </div>
    </div>
  );
}

function RiskDiffRow({ diff }: { diff: RiskDiff }): JSX.Element {
  const colorClass = RISK_CHANGE_CLASS[diff.change] ?? "text-muted-foreground";
  return (
    <div className="flex items-center justify-between border-b border-border/50 py-0.5 text-xs">
      <span className="text-foreground/90">{diff.risk_domain}</span>
      <div className="flex flex-col items-end">
        <span className={`font-semibold ${colorClass}`}>{diff.change}</span>
        {diff.summary && <span className="text-[11px] text-muted-foreground">{diff.summary}</span>}
      </div>
    </div>
  );
}

function ReadinessDiffRow({ diff }: { diff: ReadinessDiff }): JSX.Element {
  const gateLabel = formatLabel(diff.gate as GateName);
  const baseClass = GATE_STATE_CLASS[diff.base_state] ?? "text-muted-foreground";
  const candidateClass = GATE_STATE_CLASS[diff.candidate_state] ?? "text-muted-foreground";
  return (
    <div className="flex items-center justify-between border-b border-border/50 py-1 text-xs">
      <span className="text-foreground/90">{gateLabel}</span>
      <span className="flex items-center gap-1">
        <span className={baseClass}>{diff.base_state}</span>
        <span className="text-muted-foreground">→</span>
        <span className={`font-semibold ${candidateClass}`}>{diff.candidate_state}</span>
      </span>
    </div>
  );
}

function MetricDiffSection({ diffs }: { diffs: MetricDiff[] }): JSX.Element {
  const observed = diffs.filter((m) => m.evidence_class !== "predicted");
  const predicted = diffs.filter((m) => m.evidence_class === "predicted");
  return (
    <>
      {observed.map((diff, i) => (
        <MetricDiffRow diff={diff} key={`obs-${i}`} />
      ))}
      {predicted.length > 0 && (
        <>
          {observed.length > 0 && (
            <div className="mt-1 mb-0.5 text-[10px] font-semibold italic text-amber-300">
              {workshopCopy(
                "agora.workshop.cardLabels.predicted_effects_notice",
                "預測效果（非實測值 — 具不確定性）",
              )}
            </div>
          )}
          {predicted.map((diff, i) => (
            <MetricDiffRow diff={diff} key={`pred-${i}`} />
          ))}
        </>
      )}
    </>
  );
}

export function VersionCompareCard({
  card,
  onContinueDiscussion,
}: VersionCompareCardProps): JSX.Element {
  const p = (card.payload ?? {}) as unknown as PayloadVersionCompare;
  const candidateVersions = Array.isArray(p.candidate_versions) ? p.candidate_versions : [];
  const fieldDiffs = Array.isArray(p.field_diffs) ? p.field_diffs : [];
  const metricDiffs = Array.isArray(p.metric_diffs) ? p.metric_diffs : [];
  const riskDiffs = Array.isArray(p.risk_diffs) ? p.risk_diffs : [];
  const readinessDiffs = Array.isArray(p.readiness_diffs) ? p.readiness_diffs : [];

  const candidateMap = Object.fromEntries(
    candidateVersions.map((v) => [v.workshop_version_id, v.label])
  );
  const multiCandidate = candidateVersions.length > 1;
  const candidateLabels = candidateVersions.map((v) => v.label).join(", ");
  const baseLabel = p.base_version?.label ?? "-";

  return (
    <div
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3.5 text-card-foreground"
      data-testid={`version-compare-card-${card.card_id}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="text-[13px] font-semibold text-foreground">{card.title}</div>
        <span className="ml-2 text-[11px] text-muted-foreground">#{card.sequence_no}</span>
      </div>

      {/* Summary — matches CardShell behavior for other card types */}
      {card.summary && <div className="text-xs text-muted-foreground">{card.summary}</div>}

      {/* Version breadcrumb */}
      <div
        className="flex flex-wrap items-center gap-1.5 text-xs"
        data-testid={`version-compare-card-${card.card_id}-versions`}
      >
        <span className="rounded bg-muted/60 px-2 py-0.5 font-medium text-foreground/90">
          {workshopCopy("agora.workshop.cardLabels.base", "基準")}: {baseLabel}
        </span>
        <span className="text-muted-foreground">vs</span>
        <span className="rounded bg-sky-500/15 px-2 py-0.5 font-medium text-sky-300">
          {candidateLabels}
        </span>
      </div>

      {/* Field diffs */}
      {fieldDiffs.length > 0 && (
        <div data-testid={`version-compare-card-${card.card_id}-field-diffs`}>
          <SectionHeader>
            {workshopCopy("agora.workshop.cardLabels.field_changes_count", `欄位變更 (${fieldDiffs.length})`, {
              count: fieldDiffs.length,
            })}
          </SectionHeader>
          {multiCandidate
            ? groupByCandidate(fieldDiffs).map(({ candidateId, rows }) => (
                <div key={candidateId}>
                  <CandidateGroupHeader label={candidateMap[candidateId] ?? candidateId} />
                  {rows.map((diff, i) => (
                    <FieldDiffRow diff={diff} key={`${diff.path}-${i}`} />
                  ))}
                </div>
              ))
            : fieldDiffs.map((diff, i) => <FieldDiffRow diff={diff} key={`${diff.path}-${i}`} />)}
        </div>
      )}

      {/* Metric diffs — grouped by evidence class (predicted last, visually distinct) */}
      {metricDiffs.length > 0 && (
        <div data-testid={`version-compare-card-${card.card_id}-metric-diffs`}>
          <SectionHeader>
            {workshopCopy("agora.workshop.cardLabels.metric_differences", "指標差異")}
          </SectionHeader>
          {multiCandidate
            ? groupByCandidate(metricDiffs).map(({ candidateId, rows }) => (
                <div key={candidateId}>
                  <CandidateGroupHeader label={candidateMap[candidateId] ?? candidateId} />
                  <MetricDiffSection diffs={rows} />
                </div>
              ))
            : (
                <MetricDiffSection diffs={metricDiffs} />
              )}
        </div>
      )}

      {/* Risk diffs */}
      {riskDiffs.length > 0 && (
        <div data-testid={`version-compare-card-${card.card_id}-risk-diffs`}>
          <SectionHeader>
            {workshopCopy("agora.workshop.cardLabels.risk_changes", "風險變化")}
          </SectionHeader>
          {multiCandidate
            ? groupByCandidate(riskDiffs).map(({ candidateId, rows }) => (
                <div key={candidateId}>
                  <CandidateGroupHeader label={candidateMap[candidateId] ?? candidateId} />
                  {rows.map((diff, i) => (
                    <RiskDiffRow diff={diff} key={i} />
                  ))}
                </div>
              ))
            : riskDiffs.map((diff, i) => <RiskDiffRow diff={diff} key={i} />)}
        </div>
      )}

      {/* Readiness diffs */}
      {readinessDiffs.length > 0 && (
        <div data-testid={`version-compare-card-${card.card_id}-readiness-diffs`}>
          <SectionHeader>
            {workshopCopy("agora.workshop.cardLabels.readiness_gate_changes", "就緒閘門變化")}
          </SectionHeader>
          {multiCandidate
            ? groupByCandidate(readinessDiffs).map(({ candidateId, rows }) => (
                <div key={candidateId}>
                  <CandidateGroupHeader label={candidateMap[candidateId] ?? candidateId} />
                  {rows.map((diff, i) => (
                    <ReadinessDiffRow diff={diff} key={i} />
                  ))}
                </div>
              ))
            : readinessDiffs.map((diff, i) => <ReadinessDiffRow diff={diff} key={i} />)}
        </div>
      )}

      {/* Servant recommendation — always with trader-decides attribution */}
      {p.recommendation?.rationale && (
        <div
          className="flex flex-col gap-1 rounded-md border border-border bg-muted/30 px-2.5 py-2"
          data-testid={`version-compare-card-${card.card_id}-recommendation`}
        >
          <div className="text-[11px] font-bold uppercase text-muted-foreground">
            {workshopCopy("agora.workshop.cardLabels.servant_recommendation", "私人助理建議")}
          </div>
          <div className="text-xs text-foreground/90">{p.recommendation.rationale}</div>
          {p.recommendation.confidence != null && (
            <div className="text-[11px] text-muted-foreground">
              {workshopCopy("agora.workshop.cardLabels.confidence_level", "信心水準")}:{" "}
              {Math.round(p.recommendation.confidence * 100)}%
            </div>
          )}
          {p.recommendation.limitations && p.recommendation.limitations.length > 0 && (
            <div className="text-[11px] text-amber-300">
              {workshopCopy("agora.workshop.cardLabels.limitations", "限制")}:{" "}
              {p.recommendation.limitations.join("; ")}
            </div>
          )}
          <div
            className="mt-0.5 text-[11px] italic text-muted-foreground"
            data-testid={`version-compare-card-${card.card_id}-decision-authority`}
          >
            {workshopCopy(
              "agora.workshop.cardLabels.decision_authority_trader",
              "決策權限：交易員本人",
            )}
          </div>
        </div>
      )}

      {/* Ask Servant button */}
      {onContinueDiscussion && (
        <div>
          <button
            className="cursor-pointer rounded border border-border bg-secondary/40 px-2.5 py-1 text-[11px] text-secondary-foreground hover:bg-secondary/70"
            data-testid={`version-compare-card-${card.card_id}-discuss`}
            onClick={() => onContinueDiscussion(card.card_id)}
            type="button"
          >
            {workshopCopy("agora.workshop.actions.ask_servant", "詢問助理")}
          </button>
        </div>
      )}
    </div>
  );
}
