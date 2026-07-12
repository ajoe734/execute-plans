import React from "react";
import {
  KeyValueGrid,
  Pill,
  Section,
  TextList,
  EvidenceRefs,
} from "./WorkshopCardPrimitives";
import {
  formatLabel,
  recordList,
  stringList,
  stringValue,
  type UnknownRecord,
} from "./workshopCardUtils";
import { ShieldCheck, ShieldAlert, Bot, HelpCircle } from "lucide-react";

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
    approve: "Approve (贊成)",
    reject: "Reject (反對)",
    abstain: "Abstain (棄權)",
    needs_work: "Needs Work (需修正)",
    conditional: "Conditional (有條件贊成)",
  }[stance] || formatLabel(stance);

  return (
    <div className="space-y-4">
      {/* Header stance and confidence */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          {stance === "approve" ? (
            <ShieldCheck className="h-5 w-5 text-green-600 animate-pulse" />
          ) : stance === "reject" ? (
            <ShieldAlert className="h-5 w-5 text-red-600" />
          ) : (
            <Bot className="h-5 w-5 text-slate-500" />
          )}
          <span className="text-sm font-semibold text-slate-900">
            Opinion Stance:
          </span>
          <Pill tone={stanceTone}>{stanceLabel}</Pill>
        </div>
        {payload.confidence !== undefined && (
          <div className="flex items-center gap-1">
            <span className="text-xs text-slate-400">Confidence:</span>
            <Pill tone={payload.confidence as number >= 0.8 ? "green" : payload.confidence as number >= 0.5 ? "blue" : "amber"}>
              {Math.round((payload.confidence as number) * 100)}%
            </Pill>
          </div>
        )}
      </div>

      <KeyValueGrid
        items={[
          { label: "Opinion ID", value: payload.opinion_id },
          { label: "Persona", value: payload.persona_id ?? payload.persona_name },
          { label: "Persona Version", value: payload.persona_version },
          { label: "Freshness", value: payload.freshness },
        ]}
      />

      {/* Rationale */}
      {payload.rationale && (
        <Section title="Rationale">
          <p className="text-xs leading-5 text-slate-700 whitespace-pre-wrap">
            {stringValue(payload.rationale)}
          </p>
        </Section>
      )}

      {/* Uncertainty */}
      {payload.uncertainty && (
        <Section title="Uncertainty & Risks">
          <p className="text-xs leading-5 text-amber-700 bg-amber-50/50 p-2 rounded border border-amber-100/50">
            {stringValue(payload.uncertainty)}
          </p>
        </Section>
      )}

      {/* Recommended Measures */}
      <RecordOrTextList title="Recommended Measures" items={payload.recommended_measures} />

      {/* Invalidation Conditions */}
      <RecordOrTextList title="Invalidation Conditions" items={payload.invalidation_conditions} tone="red" />

      {/* Change Conditions */}
      <RecordOrTextList title="Conditions to Change Stance" items={payload.change_conditions} tone="blue" />

      {/* Provenance Trace */}
      {payload.provenance_trace && (
        <Section title="Provenance & Trace">
          <div className="rounded bg-slate-50 p-2 font-mono text-[10px] text-slate-500 break-all">
            {stringValue(payload.provenance_trace)}
          </div>
        </Section>
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
              <li className="text-xs leading-5 text-slate-600" key={`${label}-${index}`}>
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
