import { CheckCircle2, CircleAlert, CircleDashed, ShieldCheck } from "lucide-react";

import { cn } from "@/lib/utils";
import type { StrategyCompleteness } from "@/lib/bff-v1/agora/types";
import type { WorkshopCard, WorkshopReadinessAssessment } from "@/lib/bff-v1/agora/workshops";
import {
  KeyValueGrid,
  Pill,
  ProgressBar,
  Section,
  TextList,
} from "./WorkshopCardPrimitives";
import { asRecord, formatLabel, stringList, stringValue } from "./workshopCardUtils";

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

function dimensionProgress(completeness: StrategyCompleteness): number {
  if (!completeness.dimensions.length) return 0;
  const score = completeness.dimensions.reduce((sum, dim) => {
    if (dim.grade === "complete") return sum + 1;
    if (dim.grade === "partial") return sum + 0.5;
    return sum;
  }, 0);
  return (score / completeness.dimensions.length) * 100;
}

function ReadinessPanel({
  readiness,
  metadata,
}: {
  readiness?: WorkshopReadinessAssessment | null;
  metadata?: Record<string, unknown>;
}) {
  const gates = stringList(metadata?.readiness_gates);

  return (
    <Section title="Readiness">
      <div className="space-y-2">
        {readiness ? (
          <div className="space-y-2 border-l border-slate-200 pl-3" data-testid={`readiness-gate-${readiness.gate}`}>
            <div className="flex flex-wrap items-center gap-2">
              <ShieldCheck className="h-3.5 w-3.5 text-slate-400" />
              <span className="text-xs font-medium text-slate-800">{formatLabel(readiness.gate)}</span>
              <span data-testid={`readiness-gate-${readiness.gate}-state`}>
                <Pill tone={readiness.passed ? "green" : "amber"}>
                  {readiness.passed ? "Passed" : "Blocked"}
                </Pill>
              </span>
            </div>
            <TextList items={readiness.blockers} tone="red" />
            <p className="text-[11px] text-slate-400">{readiness.assessed_at}</p>
          </div>
        ) : null}
        {gates.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {gates.map((gate) => (
              <Pill key={gate}>{formatLabel(gate)}</Pill>
            ))}
          </div>
        ) : null}
        {!readiness && gates.length === 0 ? (
          <p className="text-xs text-slate-400" data-testid="readiness-gates-empty">
            Readiness not yet assessed
          </p>
        ) : null}
      </div>
    </Section>
  );
}

function NextQuestionPanel({ card }: { card?: WorkshopCard | null }) {
  if (!card || card.card_type !== "next_question") return null;

  const payload = asRecord(card.payload);
  const question = stringValue(payload.question);
  if (!question) return null;

  return (
    <div data-testid="next-question-section">
      <Section title="Next Question">
        <div className="space-y-2">
          <p className="text-xs font-medium leading-5 text-slate-800" data-testid="next-question-text">
            {question}
          </p>
          {payload.score_total !== undefined ? (
            <p className="text-[11px] text-slate-400" data-testid="next-question-score">
              Score {stringValue(payload.score_total)}
            </p>
          ) : null}
          {payload.why_now ? (
            <p className="text-xs leading-5 text-slate-600">{stringValue(payload.why_now)}</p>
          ) : null}
        </div>
      </Section>
    </div>
  );
}

export function StrategyCompletenessRail({
  completeness,
  readiness,
  nextQuestion,
}: {
  completeness: StrategyCompleteness | null;
  readiness?: WorkshopReadinessAssessment | null;
  nextQuestion?: WorkshopCard | null;
}) {
  const metadata = asRecord(completeness?.metadata);
  const progress = completeness ? dimensionProgress(completeness) : 0;

  return (
    <div className="flex flex-col gap-4 overflow-y-auto p-3" data-testid="strategy-completeness-rail">
      {completeness ? (
        <>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase text-slate-500">Completeness</span>
              <span
                className={cn("text-xs font-semibold", OVERALL_TONE[completeness.overall_grade])}
                data-testid="completeness-overall-grade"
              >
                {formatLabel(completeness.overall_grade)}
              </span>
            </div>
            <ProgressBar value={progress} label="Dimension coverage" />
          </div>

          <KeyValueGrid
            items={[
              { label: "Research ready", value: completeness.research_ready },
              { label: "Assessed by", value: completeness.assessed_by_persona_id },
              { label: "Assessed at", value: completeness.assessed_at },
            ]}
          />

          <Section title="Dimensions">
            <div className="space-y-3">
              {completeness.dimensions.map((dim) => (
                <div
                  className="space-y-2 border-l border-slate-200 pl-3"
                  data-testid={`completeness-dimension-${dim.dimension}`}
                  key={dim.dimension}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2 text-xs font-medium text-slate-700">
                      <DimensionIcon grade={dim.grade} />
                      <span className="truncate">{formatLabel(dim.dimension)}</span>
                    </span>
                    <span data-testid={`completeness-dimension-${dim.dimension}-grade`}>
                      <Pill tone={dim.grade === "complete" ? "green" : dim.grade === "partial" ? "amber" : "red"}>
                        {formatLabel(dim.grade)}
                      </Pill>
                    </span>
                  </div>
                  <TextList items={dim.gaps} tone="amber" />
                  <TextList items={dim.required_actions} />
                </div>
              ))}
            </div>
          </Section>

          <Section title="Blockers">
            <TextList items={completeness.blockers} tone="red" />
          </Section>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 p-4 text-center" data-testid="completeness-empty">
          <p className="text-xs text-slate-400">策略完整度尚未評估</p>
        </div>
      )}

      <ReadinessPanel readiness={readiness} metadata={metadata} />
      <NextQuestionPanel card={nextQuestion} />
    </div>
  );
}
