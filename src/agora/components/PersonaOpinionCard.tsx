import React from "react";
import {
  KeyValueGrid,
  Pill,
  Section,
  TextList,
} from "./WorkshopCardPrimitives";
import {
  formatLabel,
  recordList,
  stringList,
  stringValue,
  workshopCopy,
  type UnknownRecord,
} from "./workshopCardUtils";
import { ShieldCheck, ShieldAlert, Bot } from "lucide-react";

export function PersonaOpinionCard({ payload }: { payload: UnknownRecord }) {
  const stance = stringValue(payload.stance ?? payload.stance_type ?? "abstain").toLowerCase();

  const stanceTone = {
    approve: "green" as const,
    reject: "red" as const,
    abstain: "slate" as const,
    needs_work: "amber" as const,
    conditional: "amber" as const,
  }[stance] || "slate" as const;

  const stanceLabel = {
    approve: workshopCopy("agora.workshop.cardLabels.stance_approve", "贊成 (Approve)"),
    reject: workshopCopy("agora.workshop.cardLabels.stance_reject", "反對 (Reject)"),
    abstain: workshopCopy("agora.workshop.cardLabels.stance_abstain", "棄權 (Abstain)"),
    needs_work: workshopCopy("agora.workshop.cardLabels.stance_needs_work", "需修正 (Needs Work)"),
    conditional: workshopCopy("agora.workshop.cardLabels.stance_conditional", "有條件贊成 (Conditional)"),
  }[stance] || formatLabel(stance);

  return (
    <div className="space-y-4">
      {/* Header stance and confidence */}
      <div className="flex items-center justify-between border-b border-border/70 pb-3">
        <div className="flex items-center gap-2">
          {stance === "approve" ? (
            <ShieldCheck className="h-5 w-5 text-emerald-400 animate-pulse" />
          ) : stance === "reject" ? (
            <ShieldAlert className="h-5 w-5 text-rose-400" />
          ) : (
            <Bot className="h-5 w-5 text-muted-foreground" />
          )}
          <span className="text-sm font-semibold text-foreground">
            {workshopCopy("agora.workshop.cardLabels.opinion_stance", "觀點立場")}:
          </span>
          <Pill tone={stanceTone}>{stanceLabel}</Pill>
        </div>
        {payload.confidence !== undefined && (
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">
              {workshopCopy("agora.workshop.cardLabels.confidence_level", "信心水準")}:
            </span>
            <Pill tone={(payload.confidence as number) >= 0.8 ? "green" : (payload.confidence as number) >= 0.5 ? "blue" : "amber"}>
              {Math.round((payload.confidence as number) * 100)}%
            </Pill>
          </div>
        )}
      </div>

      <KeyValueGrid
        items={[
          { label: workshopCopy("agora.workshop.cardLabels.opinion_id", "觀點編號"), value: payload.opinion_id },
          { label: workshopCopy("agora.workshop.cardLabels.persona", "Persona"), value: payload.persona_id ?? payload.persona_name },
          { label: workshopCopy("agora.workshop.cardLabels.persona_version", "Persona 版本"), value: payload.persona_version },
          { label: workshopCopy("agora.workshop.cardLabels.freshness", "新鮮度"), value: payload.freshness },
        ]}
      />

      {/* Rationale */}
      {payload.rationale && (
        <Section title={workshopCopy("agora.workshop.cardLabels.rationale", "理由")}>
          <p className="text-xs leading-5 text-foreground/90 whitespace-pre-wrap">
            {stringValue(payload.rationale)}
          </p>
        </Section>
      )}

      {/* Uncertainty */}
      {payload.uncertainty && (
        <Section title={workshopCopy("agora.workshop.cardLabels.uncertainty_risks", "不確定性與風險")}>
          <p className="text-xs leading-5 text-amber-300 bg-amber-500/15 p-2 rounded border border-amber-500/30">
            {stringValue(payload.uncertainty)}
          </p>
        </Section>
      )}

      {/* Recommended Measures */}
      <RecordOrTextList
        title={workshopCopy("agora.workshop.cardLabels.recommended_measures", "建議調整措施")}
        items={payload.recommended_measures}
      />

      {/* Invalidation Conditions */}
      <RecordOrTextList
        title={workshopCopy("agora.workshop.cardLabels.invalidation_conditions", "失效條件")}
        items={payload.invalidation_conditions}
        tone="red"
      />

      {/* Change Conditions */}
      <RecordOrTextList
        title={workshopCopy("agora.workshop.cardLabels.change_conditions", "改變立場條件")}
        items={payload.change_conditions}
        tone="blue"
      />

      {/* Provenance Trace (in expandable engineering detail section) */}
      {payload.provenance_trace && (
        <details className="rounded border border-border/70 bg-muted/30 p-2 text-xs">
          <summary className="cursor-pointer font-medium text-muted-foreground">
            {workshopCopy("agora.workshop.cardLabels.provenance_trace", "血緣與追蹤憑證")}
          </summary>
          <div className="mt-2 rounded bg-muted/50 p-2 font-mono text-[10px] text-muted-foreground break-all">
            {stringValue(payload.provenance_trace)}
          </div>
        </details>
      )}
    </div>
  );
}

// Helper to support list rendering of strings or records
function RecordOrTextList({
  title,
  items,
  tone,
}: {
  title: string;
  items: unknown;
  tone?: "slate" | "blue" | "green" | "amber" | "red";
}) {
  const records = recordList(items);
  const strings = stringList(items);
  if (records.length === 0 && strings.length === 0) return null;

  const tonePill = tone ?? "slate";

  return (
    <Section title={title}>
      {records.length > 0 ? (
        <ul className="space-y-2">
          {records.map((record, index) => {
            const label = stringValue(record.ref_id ?? record.id ?? record.measure_id);
            const summary = stringValue(record.summary ?? record.desc ?? record.detail ?? record.condition);
            return (
              <li className="text-xs leading-5 text-foreground/85" key={`${label}-${index}`}>
                {label ? <Pill tone={tonePill}>{label}</Pill> : null}
                {summary ? <span className={label ? "ml-2" : undefined}>{summary}</span> : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <TextList items={strings} tone={tone === "blue" ? "slate" : (tone as "slate" | "amber" | "red")} />
      )}
    </Section>
  );
}
