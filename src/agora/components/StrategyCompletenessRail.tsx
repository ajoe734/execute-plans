import { CheckCircle2, CircleAlert, CircleDashed, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import type { StrategyCompleteness } from "@/lib/bff-v1/agora/types";
import type {
  WorkshopCard,
  WorkshopCompleteness,
  WorkshopReadinessAssessment,
} from "@/lib/bff-v1/agora/workshops";
import { materializeWorkshopCompleteness } from "./workshopCompletenessDisplay";
import {
  KeyValueGrid,
  Pill,
  ProgressBar,
  Section,
  TextList,
} from "./WorkshopCardPrimitives";
import { asRecord, booleanValue, formatLabel, recordList, stringList, stringValue } from "./workshopCardUtils";

const OVERALL_TONE: Record<StrategyCompleteness["overall_grade"], string> = {
  complete: "text-green-700",
  mostly_complete: "text-amber-600",
  partial: "text-orange-600",
  incomplete: "text-red-600",
};

function DimensionIcon({ grade }: { grade: string }) {
  if (grade === "complete") return <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />;
  if (grade === "partial") return <CircleDashed className="h-3.5 w-3.5 text-amber-600" />;
  return <CircleAlert className="h-3.5 w-3.5 text-red-500" />;
}

const OVERALL_PROGRESS: Record<StrategyCompleteness["overall_grade"], number> = {
  complete: 100,
  mostly_complete: 75,
  partial: 50,
  incomplete: 0,
};

function ReadinessPanel({
  readiness,
  metadata,
}: {
  readiness?: WorkshopReadinessAssessment | Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}) {
  const { t } = useTranslation();
  const readinessRecord = asRecord(readiness);
  const explicitGates = recordList(readinessRecord.gates);
  const metadataGates = stringList(metadata?.readiness_gates);
  const singleGate = stringValue(readinessRecord.gate);
  const gateRows =
    explicitGates.length > 0
      ? explicitGates
      : singleGate
        ? [readinessRecord]
        : metadataGates.map((gate) => ({ gate }));

  return (
    <Section title={t("agora.workshop.rail.readiness")}>
      <div className="space-y-2" data-testid={gateRows.length === 0 ? "readiness-gates-empty" : undefined}>
        {gateRows.length === 0 ? (
          <p className="text-xs text-slate-400">{t("agora.workshop.rail.readinessEmpty")}</p>
        ) : (
          gateRows.map((gateRecord) => {
            const gate = stringValue(gateRecord.gate, "unknown");
            const state = stringValue(gateRecord.state);
            const passed = booleanValue(gateRecord.passed);
            const isReady = passed === true || state === "ready" || state === "passed";
            const stateLabel = state
              ? t(`agora.workshop.values.${state}`, { defaultValue: formatLabel(state) })
              : passed === undefined
                ? t("agora.workshop.rail.notAssessed")
                : passed
                  ? t("agora.workshop.rail.passed")
                  : t("agora.workshop.rail.blocked");
            return (
              <div
                className={cn(
                  "space-y-2 border-l pl-3",
                  isReady ? "border-green-400 bg-green-50/60 py-2 pr-2" : "border-slate-200",
                )}
                data-readiness-state={isReady ? "ready" : "not-ready"}
                data-testid={`readiness-gate-${gate}`}
                key={gate}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <ShieldCheck className={cn("h-3.5 w-3.5", isReady ? "text-green-600" : "text-slate-400")} />
                  <span className={cn("text-xs font-medium", isReady ? "text-green-900" : "text-slate-800")}>
                    {t(`agora.workshop.values.${gate}`, { defaultValue: formatLabel(gate) })}
                  </span>
                  <Pill tone={isReady ? "green" : "amber"}>
                    <span data-testid={`readiness-gate-${gate}-state`}>{stateLabel}</span>
                  </Pill>
                </div>
                <TextList items={gateRecord.blockers ?? gateRecord.blocking_requirement_ids} tone="red" />
                {gateRecord.assessed_at ? (
                  <p className="text-[11px] text-slate-400">{stringValue(gateRecord.assessed_at)}</p>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </Section>
  );
}

function NextQuestionPanel({ card }: { card?: WorkshopCard | null }) {
  const { t } = useTranslation();
  if (!card || card.card_type !== "next_question") return null;

  const payload = asRecord(card.payload);
  const question = stringValue(payload.question);
  const whyNow = stringValue(payload.why_now);
  const score = stringValue(payload.score_total ?? payload.score);

  if (!question && !whyNow && !score) return null;

  return (
    <Section title={t("agora.workshop.rail.nextQuestion")}>
      <div className="space-y-2" data-testid="next-question-section">
        {question ? (
          <p className="text-xs font-medium leading-5 text-slate-700" data-testid="next-question-text">
            {question}
          </p>
        ) : null}
        {whyNow ? <p className="text-xs leading-5 text-slate-500">{whyNow}</p> : null}
        {score ? (
          <Pill tone="blue">
            <span data-testid="next-question-score">{score}</span>
          </Pill>
        ) : null}
      </div>
    </Section>
  );
}

export function StrategyCompletenessRail({
  completeness,
  completenessCard,
  readiness,
  nextQuestion,
}: {
  completeness: WorkshopCompleteness | null;
  completenessCard?: WorkshopCard | null;
  readiness?: WorkshopReadinessAssessment | Record<string, unknown> | null;
  nextQuestion?: WorkshopCard | null;
}) {
  const { t } = useTranslation();
  const displayCompleteness = materializeWorkshopCompleteness(completeness, completenessCard);
  const metadata = asRecord(displayCompleteness?.metadata);

  if (!displayCompleteness) {
    return (
      <div className="flex flex-col gap-4 overflow-y-auto p-3" data-testid="strategy-completeness-rail">
        <div className="flex flex-col items-center justify-center gap-2 p-4 text-center" data-testid="completeness-empty">
          <p className="text-xs text-slate-400">{t("agora.workshop.rail.completenessEmpty")}</p>
        </div>
        <ReadinessPanel readiness={readiness} metadata={metadata} />
        <NextQuestionPanel card={nextQuestion} />
      </div>
    );
  }

  const progress = OVERALL_PROGRESS[displayCompleteness.overall_grade] ?? 0;

  return (
    <div className="flex flex-col gap-4 overflow-y-auto p-3" data-testid="strategy-completeness-rail">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase text-slate-500">{t("agora.workshop.rail.completeness")}</span>
          <span
            className={cn("text-xs font-semibold", OVERALL_TONE[displayCompleteness.overall_grade] ?? "text-slate-500")}
            data-testid="completeness-overall-grade"
          >
            {t(`agora.workshop.values.${displayCompleteness.overall_grade}`, { defaultValue: formatLabel(displayCompleteness.overall_grade) })}
          </span>
        </div>
        <ProgressBar value={progress} label={t("agora.workshop.rail.overallCompleteness")} />
      </div>

      <KeyValueGrid
        items={[
          { label: t("agora.workshop.rail.researchReady"), value: displayCompleteness.research_ready },
          { label: t("agora.workshop.rail.assessedBy"), value: displayCompleteness.assessed_by_persona_id },
          { label: t("agora.workshop.rail.assessedAt"), value: displayCompleteness.assessed_at },
        ]}
      />

      <Section title={t("agora.workshop.rail.dimensions")}>
        <div className="space-y-3">
          {displayCompleteness.dimensions.map((dim) => (
            <div
              className="space-y-2 border-l border-slate-200 pl-3"
              data-testid={`completeness-dimension-${dim.dimension}`}
              key={dim.dimension}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2 text-xs font-medium text-slate-700">
                  <DimensionIcon grade={dim.grade} />
                  <span className="truncate">{t(`agora.workshop.values.${dim.dimension}`, { defaultValue: formatLabel(dim.dimension) })}</span>
                </span>
                <Pill tone={dim.grade === "complete" ? "green" : dim.grade === "partial" ? "amber" : "red"}>
                  <span data-testid={`completeness-dimension-${dim.dimension}-grade`}>{t(`agora.workshop.values.${dim.grade}`, { defaultValue: formatLabel(dim.grade) })}</span>
                </Pill>
              </div>
              <TextList items={dim.gaps} tone="amber" />
              <TextList items={dim.required_actions} />
            </div>
          ))}
        </div>
      </Section>

      <Section title={t("agora.workshop.rail.blockers")}>
        <TextList items={displayCompleteness.blockers} tone="red" />
      </Section>

      <ReadinessPanel readiness={readiness} metadata={metadata} />
      <NextQuestionPanel card={nextQuestion} />
    </div>
  );
}
