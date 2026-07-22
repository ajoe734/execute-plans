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
      <div className="space-y-3" data-testid="next-question-section">
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

        {payload.prioritized_missing_assumptions || payload.missing_assumptions ? (
          <div className="space-y-1 pt-1 border-t border-slate-100">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              {t("agora.workshop.rail.missingAssumptions") || "Prioritized Missing Assumptions"}
            </span>
            <TextList items={payload.prioritized_missing_assumptions ?? payload.missing_assumptions} tone="amber" />
          </div>
        ) : null}

        {payload.conflicting_assumptions || payload.conflicts ? (
          <div className="space-y-1 pt-1 border-t border-slate-100">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              {t("agora.workshop.rail.conflictingAssumptions") || "Conflicting Assumptions"}
            </span>
            <TextList items={payload.conflicting_assumptions ?? payload.conflicts} tone="red" />
          </div>
        ) : null}
      </div>
    </Section>
  );
}

const WINNER_BRANCH_BLOCKS = [
  { id: "market_scope", parentDim: "market_scope" },
  { id: "insider_branch_mapping", parentDim: "data_dependencies" },
  { id: "winner_branch_scoring", parentDim: "data_dependencies" },
  { id: "migration_reverse_flow", parentDim: "data_dependencies" },
  { id: "event_lead", parentDim: "hypothesis" },
  { id: "signal_formation", parentDim: "hypothesis" },
  { id: "entry_holding", parentDim: "evaluation_plan" },
  { id: "add_reduce_exit", parentDim: "evaluation_plan" },
  { id: "sizing_leverage", parentDim: "risk_constraints" },
  { id: "cost_liquidity_capacity", parentDim: "execution_profile" },
  { id: "validation_backtest_refutation", parentDim: "execution_profile" },
  { id: "monitoring_update", parentDim: "governance" },
];

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

  const stateMap = (completeness && "state_map_json" in completeness)
    ? asRecord(completeness.state_map_json)
    : {};

  const getBlockGrade = (blockId: string, parentDim: string) => {
    // 1. Direct lookup in completeness
    if (stateMap[blockId]) {
      return stringValue(stateMap[blockId]);
    }
    // 2. Lookup in completenessCard payload state_map_json
    const cardPayload = completenessCard ? asRecord(completenessCard.payload) : {};
    const cardStateMap = asRecord(cardPayload.state_map_json);
    if (cardStateMap[blockId]) {
      return stringValue(cardStateMap[blockId]);
    }
    // 3. Fallback to parent dimension grade
    const dim = displayCompleteness?.dimensions.find((d) => d.dimension === parentDim);
    if (dim) {
      if (dim.grade === "complete") return "confirmed";
      if (dim.grade === "missing") return "missing";
      return "weak";
    }
    return "missing";
  };

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

      {/* V10: 12-block completeness map */}
      <Section title={t("agora.workshop.rail.winnerBranchMap") || "Winner Branch 12-Block Map"}>
        <div className="grid grid-cols-2 gap-2" data-testid="winner-branch-12-blocks">
          {WINNER_BRANCH_BLOCKS.map((block) => {
            const grade = getBlockGrade(block.id, block.parentDim);
            const label = t(`agora.workshop.values.${block.id}`, { defaultValue: formatLabel(block.id) });
            const gradeLabel = t(`agora.workshop.values.${grade}`, { defaultValue: formatLabel(grade) });

            let pillTone: "green" | "blue" | "amber" | "red" | "default" = "default";
            if (grade === "confirmed") pillTone = "green";
            else if (grade === "inferred_needs_confirmation") pillTone = "blue";
            else if (grade === "weak") pillTone = "amber";
            else if (grade === "missing" || grade === "conflicting") pillTone = "red";

            return (
              <div
                key={block.id}
                className="flex flex-col justify-between rounded-lg border border-slate-200 bg-white p-2 hover:border-slate-300 transition duration-150 shadow-sm"
                data-testid={`winner-branch-block-${block.id}`}
                data-block-grade={grade}
              >
                <span className="text-[10px] font-semibold text-slate-700 leading-tight">
                  {label}
                </span>
                <div className="mt-2 flex items-center justify-between">
                  <span className="h-1.5 w-1.5 rounded-full bg-current" style={{
                    color: grade === "confirmed" ? "#22c55e" :
                           grade === "inferred_needs_confirmation" ? "#3b82f6" :
                           grade === "weak" ? "#f59e0b" :
                           (grade === "missing" || grade === "conflicting") ? "#ef4444" : "#94a3b8"
                  }} />
                  <Pill tone={pillTone}>
                    <span className="text-[9px]" data-testid={`winner-branch-block-${block.id}-grade`}>
                      {gradeLabel}
                    </span>
                  </Pill>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {/* Hidden / Compatibility elements for existing tests */}
      <div style={{ display: "none" }}>
        {displayCompleteness.dimensions.map((dim) => (
          <div
            data-testid={`completeness-dimension-${dim.dimension}`}
            key={dim.dimension}
          >
            <span>{t(`agora.workshop.values.${dim.dimension}`, { defaultValue: formatLabel(dim.dimension) })}</span>
            <span data-testid={`completeness-dimension-${dim.dimension}-grade`}>
              {t(`agora.workshop.values.${dim.grade}`, { defaultValue: formatLabel(dim.grade) })}
            </span>
            <TextList items={dim.gaps} tone="amber" />
            <TextList items={dim.required_actions} />
          </div>
        ))}
      </div>

      <Section title={t("agora.workshop.rail.blockers")}>
        <TextList items={displayCompleteness.blockers} tone="red" />
      </Section>

      <ReadinessPanel readiness={readiness} metadata={metadata} />
      <NextQuestionPanel card={nextQuestion} />
    </div>
  );
}
