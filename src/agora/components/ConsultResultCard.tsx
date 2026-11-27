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

function PersonaRefs({ refs }: { refs: unknown }) {
  const values = stringList(refs);
  if (values.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((ref) => (
        <Pill key={ref} tone="blue">
          {ref}
        </Pill>
      ))}
    </div>
  );
}

function RecordOrTextList({
  title,
  items,
  tone,
}: {
  title: string;
  items: unknown;
  tone?: "slate" | "amber" | "red";
}) {
  const records = recordList(items);
  const strings = stringList(items);
  if (records.length === 0 && strings.length === 0) return null;

  return (
    <Section title={title}>
      {records.length > 0 ? (
        <ul className="space-y-2">
          {records.map((record, index) => {
            const label = stringValue(record.persona_ref ?? record.persona_id ?? record.condition_id ?? record.note_id);
            const summary = stringValue(record.summary ?? record.note ?? record.condition ?? record.risk ?? record.reason);
            return (
              <li className="text-xs leading-5 text-foreground/85" key={`${label}-${index}`}>
                {label ? <span className="font-medium text-foreground">{formatLabel(label)}</span> : null}
                {summary ? <span className={label ? "ml-1" : undefined}>{summary}</span> : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <TextList items={strings} tone={tone} />
      )}
    </Section>
  );
}

export function ConsultResultCard({ payload }: { payload: UnknownRecord }) {
  return (
    <div className="space-y-4">
      <KeyValueGrid
        items={[
          { label: workshopCopy("agora.workshop.cardLabels.consultation", "諮詢"), value: payload.consultation_id },
          { label: workshopCopy("agora.workshop.cardLabels.type", "類型"), value: payload.consultation_type },
          { label: workshopCopy("agora.workshop.cardLabels.status", "狀態"), value: payload.status },
          { label: workshopCopy("agora.workshop.cardLabels.freshness", "新鮮度"), value: payload.freshness },
        ]}
      />

      <Section title={workshopCopy("agora.workshop.cardLabels.participants", "參與者")}>
        <PersonaRefs refs={payload.participant_persona_refs} />
      </Section>

      {payload.consensus_summary ? (
        <Section title={workshopCopy("agora.workshop.cardLabels.consensus", "共識")}>
          <p className="text-xs leading-5 text-foreground/90">{stringValue(payload.consensus_summary)}</p>
        </Section>
      ) : null}

      <RecordOrTextList
        title={workshopCopy("agora.workshop.cardLabels.disagreements", "歧異")}
        items={payload.disagreements}
        tone="amber"
      />
      <RecordOrTextList
        title={workshopCopy("agora.workshop.cardLabels.risk_notes", "風險備註")}
        items={payload.risk_notes}
        tone="red"
      />
      <RecordOrTextList
        title={workshopCopy("agora.workshop.cardLabels.conditions", "條件限制")}
        items={payload.conditions}
      />
      <RecordOrTextList
        title={workshopCopy("agora.workshop.cardLabels.evidence_refs", "證據參考")}
        items={payload.evidence_refs}
      />
    </div>
  );
}
