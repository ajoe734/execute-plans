import { useTranslation } from "react-i18next";
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
              <li className="text-xs leading-5 text-slate-600" key={`${label}-${index}`}>
                {label ? <span className="font-medium text-slate-800">{formatLabel(label)}</span> : null}
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
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <KeyValueGrid
        items={[
          { label: t("agora.workshop.cardLabels.consultation"), value: payload.consultation_id },
          { label: t("agora.workshop.cardLabels.type"), value: payload.consultation_type },
          { label: t("agora.workshop.cardLabels.status"), value: payload.status },
          { label: t("agora.workshop.cardLabels.freshness"), value: payload.freshness },
        ]}
      />

      <Section title={t("agora.workshop.cardLabels.participants")}>
        <PersonaRefs refs={payload.participant_persona_refs} />
      </Section>

      {payload.consensus_summary ? (
        <Section title={t("agora.workshop.cardLabels.consensus")}>
          <p className="text-xs leading-5 text-slate-700">{stringValue(payload.consensus_summary)}</p>
        </Section>
      ) : null}

      <RecordOrTextList title={t("agora.workshop.cardLabels.disagreements")} items={payload.disagreements} tone="amber" />
      <RecordOrTextList title={t("agora.workshop.cardLabels.risk_notes")} items={payload.risk_notes} tone="red" />
      <RecordOrTextList title={t("agora.workshop.cardLabels.conditions")} items={payload.conditions} />
      <RecordOrTextList title={t("agora.workshop.cardLabels.evidence_refs")} items={payload.evidence_refs} />
    </div>
  );
}
