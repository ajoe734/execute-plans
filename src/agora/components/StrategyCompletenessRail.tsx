import { CheckCircle2, CircleAlert, CircleDashed, ShieldCheck, Zap } from "lucide-react";

import { cn } from "@/lib/utils";
import type { StrategyCompleteness } from "@/lib/bff-v1/agora/types";
import type {
  WorkshopCard,
  WorkshopCompleteness,
  WorkshopDecisionRequest,
  WorkshopNextDecision,
  WorkshopReadinessAssessment,
  WorkshopStrategyBlock,
  WorkshopV10BlockState,
} from "@/lib/bff-v1/agora/workshops";
import { materializeWorkshopCompleteness, normalizeNextDecision } from "./workshopCompletenessDisplay";
import {
  KeyValueGrid,
  Pill,
  ProgressBar,
  Section,
  TextList,
} from "./WorkshopCardPrimitives";
import {
  asRecord,
  booleanValue,
  formatLabel,
  recordList,
  stringList,
  stringValue,
  workshopCopy,
} from "./workshopCardUtils";

const OVERALL_TONE: Record<StrategyCompleteness["overall_grade"], string> = {
  complete: "text-emerald-400",
  mostly_complete: "text-amber-400",
  partial: "text-amber-300",
  incomplete: "text-rose-400",
};

const BLOCK_STATE_TONE: Record<WorkshopV10BlockState, "green" | "amber" | "red" | "slate"> = {
  confirmed: "green",
  inferred: "amber",
  missing: "slate",
  weak: "amber",
  conflict: "red",
};

const BLOCK_STATE_BORDER: Record<WorkshopV10BlockState, string> = {
  confirmed: "border-l-emerald-500/60 bg-emerald-500/5",
  inferred: "border-l-amber-500/60 bg-amber-500/5",
  missing: "border-l-border bg-muted/20",
  weak: "border-l-amber-400/50 bg-amber-500/5",
  conflict: "border-l-rose-500/70 bg-rose-500/10",
};

function blockStateLabel(state: WorkshopV10BlockState): string {
  switch (state) {
    case "confirmed":
      return workshopCopy("agora.workshop.rail.stateConfirmed", "已確認");
    case "inferred":
      return workshopCopy("agora.workshop.rail.stateInferred", "助理推定");
    case "missing":
      return workshopCopy("agora.workshop.rail.stateMissing", "尚缺");
    case "weak":
      return workshopCopy("agora.workshop.rail.stateWeak", "薄弱");
    case "conflict":
      return workshopCopy("agora.workshop.rail.stateConflict", "衝突");
  }
}

function BlockStateIcon({ state }: { state: WorkshopV10BlockState }) {
  if (state === "confirmed") return <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />;
  if (state === "inferred") return <CircleDashed className="h-3.5 w-3.5 shrink-0 text-amber-400" />;
  if (state === "conflict") return <Zap className="h-3.5 w-3.5 shrink-0 text-rose-400" />;
  if (state === "weak") return <CircleAlert className="h-3.5 w-3.5 shrink-0 text-amber-300" />;
  return <CircleDashed className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
}

function DimensionIcon({ grade }: { grade: string }) {
  if (grade === "complete") return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />;
  if (grade === "partial") return <CircleDashed className="h-3.5 w-3.5 text-amber-400" />;
  return <CircleAlert className="h-3.5 w-3.5 text-rose-400" />;
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
    <Section title={workshopCopy("agora.workshop.rail.readiness", "就緒度")}>
      <div className="space-y-2" data-testid={gateRows.length === 0 ? "readiness-gates-empty" : undefined}>
        {gateRows.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {workshopCopy("agora.workshop.rail.readinessEmpty", "尚未評估就緒閘門。")}
          </p>
        ) : (
          gateRows.map((gateRecord) => {
            const gate = stringValue(gateRecord.gate, "unknown");
            const state = stringValue(gateRecord.state);
            const passed = booleanValue(gateRecord.passed);
            const isReady = passed === true || state === "ready" || state === "passed";
            const stateLabel = state
              ? formatLabel(state)
              : passed === undefined
                ? workshopCopy("agora.workshop.rail.notAssessed", "尚未評估")
                : passed
                  ? workshopCopy("agora.workshop.rail.passed", "已通過")
                  : workshopCopy("agora.workshop.rail.blocked", "已阻擋");
            return (
              <div
                className={cn(
                  "space-y-2 rounded-r border-l-2 pl-3",
                  isReady ? "border-emerald-500/60 bg-emerald-500/15 py-2 pr-2" : "border-border",
                )}
                data-readiness-state={isReady ? "ready" : "not-ready"}
                data-testid={`readiness-gate-${gate}`}
                key={gate}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <ShieldCheck className={cn("h-3.5 w-3.5", isReady ? "text-emerald-400" : "text-muted-foreground")} />
                  <span className={cn("text-xs font-medium", isReady ? "text-emerald-300" : "text-foreground/90")}>
                    {formatLabel(gate)}
                  </span>
                  <Pill tone={isReady ? "green" : "amber"}>
                    <span data-testid={`readiness-gate-${gate}-state`}>{stateLabel}</span>
                  </Pill>
                </div>
                <TextList items={gateRecord.blockers ?? gateRecord.blocking_requirement_ids} tone="red" />
                {gateRecord.assessed_at ? (
                  <p className="text-[11px] text-muted-foreground">{stringValue(gateRecord.assessed_at)}</p>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </Section>
  );
}

function TwelveBlocksPanel({
  blocks,
  isBranchStrategy,
}: {
  blocks: WorkshopStrategyBlock[];
  isBranchStrategy?: boolean;
}) {
  if (!blocks || blocks.length === 0) return null;

  return (
    <Section title={workshopCopy("agora.workshop.rail.twelveBlocksTitle", "策略完整度（12 區塊）")}>
      <div className="space-y-2" data-testid="v10-twelve-blocks-section">
        <div className="flex items-center justify-between">
          <Pill tone="blue">
            {isBranchStrategy
              ? workshopCopy("agora.workshop.rail.branchProfileBadge", "籌碼／分點策略結構")
              : workshopCopy("agora.workshop.rail.genericProfileBadge", "通用量化策略結構")}
          </Pill>
          <span className="text-[11px] text-muted-foreground">
            {blocks.filter((b) => b.state === "confirmed").length}/{blocks.length}{" "}
            {workshopCopy("agora.workshop.rail.stateConfirmed", "已確認")}
          </span>
        </div>
        <div className="space-y-1.5">
          {blocks.map((block, idx) => (
            <div
              className={cn(
                "space-y-1 rounded-r border-l-2 px-2.5 py-2 transition-colors",
                BLOCK_STATE_BORDER[block.state] ?? "border-l-border bg-muted/20",
              )}
              data-block-state={block.state}
              data-testid={`v10-block-${block.block_id}`}
              key={block.block_id}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-foreground">
                  <BlockStateIcon state={block.state} />
                  <span className="font-mono text-[10px] text-muted-foreground">{idx + 1}.</span>
                  <span className="truncate" data-testid={`v10-block-${block.block_id}-title`}>
                    {block.title_zh}
                  </span>
                </span>
                <Pill tone={BLOCK_STATE_TONE[block.state] ?? "slate"}>
                  <span data-testid={`v10-block-${block.block_id}-state`}>
                    {blockStateLabel(block.state)}
                  </span>
                </Pill>
              </div>
              {block.note ? (
                <p
                  className="pl-5 text-[11px] leading-4 text-muted-foreground"
                  data-testid={`v10-block-${block.block_id}-note`}
                >
                  {block.note}
                </p>
              ) : null}
              {block.citations && block.citations.length > 0 ? (
                <div className="flex flex-wrap gap-1 pl-5 pt-0.5">
                  {block.citations.map((cit, cIdx) => (
                    <span
                      className="rounded border border-border/70 bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                      key={`${cit.turn_index ?? cIdx}`}
                      title={cit.quote}
                    >
                      {cit.turn_index !== undefined ? `#${cit.turn_index}` : ""}{" "}
                      {cit.quote ? cit.quote.slice(0, 28) : ""}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

function NextDecisionPanel({
  decision,
  card,
  onSubmitDecision,
  decisionBusy,
}: {
  decision?: WorkshopNextDecision | null;
  card?: WorkshopCard | null;
  onSubmitDecision?: (decision: WorkshopDecisionRequest) => void;
  decisionBusy?: boolean;
}) {
  const validCard = card && card.card_type === "next_question" ? card : null;
  const cardPayload = validCard ? asRecord(validCard.payload) : {};
  const resolvedDecision = decision ?? (validCard ? normalizeNextDecision(cardPayload) : null);
  const question = resolvedDecision?.question || stringValue(cardPayload.question);
  const whyNow = resolvedDecision?.why_high_value || stringValue(cardPayload.why_now ?? cardPayload.why_high_value);
  const score = stringValue(cardPayload.score_total ?? cardPayload.score);
  const options = resolvedDecision?.options ?? [];
  const servantDefault = resolvedDecision?.servant_default ?? null;
  const questionId = resolvedDecision?.question_id || stringValue(cardPayload.question_id, "next_decision");

  if (!question && !whyNow && !score) return null;

  return (
    <Section title={workshopCopy("agora.workshop.rail.nextDecisionTitle", "下一個最值得先決定的問題")}>
      <div
        className="space-y-2.5 rounded-md border border-primary/30 bg-primary/10 p-2.5"
        data-testid="next-question-section"
      >
        {question ? (
          <p className="text-xs font-semibold leading-5 text-foreground" data-testid="next-question-text">
            {question}
          </p>
        ) : null}
        {whyNow ? <p className="text-xs leading-5 text-muted-foreground">{whyNow}</p> : null}
        {score ? (
          <Pill tone="blue">
            <span data-testid="next-question-score">{score}</span>
          </Pill>
        ) : null}
        {options.length > 0 && (
          <div className="flex flex-col gap-1.5 pt-1" data-testid="next-decision-options">
            {options.map((opt) => (
              <button
                className="w-full rounded-md border border-primary/40 bg-card px-2.5 py-1.5 text-left text-xs font-medium text-foreground transition-colors hover:bg-primary/20 disabled:opacity-50"
                data-testid={`rail-decision-option-${opt.option_id}`}
                disabled={decisionBusy || !onSubmitDecision}
                key={opt.option_id}
                onClick={() =>
                  onSubmitDecision?.({
                    question_id: questionId,
                    selected_option_id: opt.option_id,
                  })
                }
                type="button"
              >
                <div className="font-semibold text-primary">{opt.label}</div>
                {opt.summary ? <div className="mt-0.5 text-[11px] text-muted-foreground">{opt.summary}</div> : null}
              </button>
            ))}
          </div>
        )}
        {servantDefault && onSubmitDecision ? (
          <div className="pt-1">
            <button
              className="w-full rounded-md border border-amber-500/40 bg-amber-500/15 px-2.5 py-1.5 text-left text-xs font-medium text-amber-300 transition-colors hover:bg-amber-500/25 disabled:opacity-50"
              data-testid="rail-decision-servant-default"
              disabled={decisionBusy}
              onClick={() =>
                onSubmitDecision({
                  question_id: questionId,
                  use_servant_default: true,
                })
              }
              type="button"
            >
              {workshopCopy("agora.workshop.rail.servantDefaultOption", `先用助理預設：${servantDefault.label}`, {
                label: servantDefault.label,
              })}
            </button>
          </div>
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
  onSubmitDecision,
  decisionBusy,
}: {
  completeness: WorkshopCompleteness | null;
  completenessCard?: WorkshopCard | null;
  readiness?: WorkshopReadinessAssessment | Record<string, unknown> | null;
  nextQuestion?: WorkshopCard | null;
  onSubmitDecision?: (decision: WorkshopDecisionRequest) => void;
  decisionBusy?: boolean;
}) {
  const displayCompleteness = materializeWorkshopCompleteness(completeness, completenessCard);
  const metadata = asRecord(displayCompleteness?.metadata);

  if (!displayCompleteness) {
    return (
      <div className="flex flex-col gap-4 overflow-y-auto p-3 text-foreground" data-testid="strategy-completeness-rail">
        <div className="flex flex-col items-center justify-center gap-2 p-4 text-center" data-testid="completeness-empty">
          <p className="text-xs text-muted-foreground">
            {workshopCopy("agora.workshop.rail.completenessEmpty", "策略完整度尚未評估")}
          </p>
        </div>
        <ReadinessPanel metadata={metadata} readiness={readiness} />
        <NextDecisionPanel
          card={nextQuestion}
          decisionBusy={decisionBusy}
          onSubmitDecision={onSubmitDecision}
        />
      </div>
    );
  }

  const progress = OVERALL_PROGRESS[displayCompleteness.overall_grade] ?? 0;

  return (
    <div className="flex flex-col gap-4 overflow-y-auto p-3 text-foreground" data-testid="strategy-completeness-rail">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase text-muted-foreground">
            {workshopCopy("agora.workshop.rail.completeness", "完整度")}
          </span>
          <span
            className={cn("text-xs font-semibold", OVERALL_TONE[displayCompleteness.overall_grade] ?? "text-muted-foreground")}
            data-testid="completeness-overall-grade"
          >
            {formatLabel(displayCompleteness.overall_grade)}
          </span>
        </div>
        <ProgressBar
          label={workshopCopy("agora.workshop.rail.overallCompleteness", "整體完整度")}
          value={progress}
        />
      </div>

      <KeyValueGrid
        items={[
          { label: workshopCopy("agora.workshop.rail.researchReady", "研究就緒"), value: displayCompleteness.research_ready },
          { label: workshopCopy("agora.workshop.rail.assessedBy", "評估者"), value: displayCompleteness.assessed_by_persona_id },
          { label: workshopCopy("agora.workshop.rail.assessedAt", "評估時間"), value: displayCompleteness.assessed_at },
        ]}
      />

      {displayCompleteness.twelve_blocks && displayCompleteness.twelve_blocks.length > 0 ? (
        <TwelveBlocksPanel
          blocks={displayCompleteness.twelve_blocks}
          isBranchStrategy={displayCompleteness.is_branch_strategy}
        />
      ) : null}

      < NextDecisionPanel
        card={nextQuestion}
        decision={displayCompleteness.next_decision}
        decisionBusy={decisionBusy}
        onSubmitDecision={onSubmitDecision}
      />

      {displayCompleteness.dimensions.length > 0 ? (
        <Section title={workshopCopy("agora.workshop.rail.dimensions", "維度")}>
          <div className="space-y-3">
            {displayCompleteness.dimensions.map((dim) => (
              <div
                className="space-y-2 border-l border-border pl-3"
                data-testid={`completeness-dimension-${dim.dimension}`}
                key={dim.dimension}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2 text-xs font-medium text-foreground/90">
                    <DimensionIcon grade={dim.grade} />
                    <span className="truncate">{formatLabel(dim.dimension)}</span>
                  </span>
                  <Pill tone={dim.grade === "complete" ? "green" : dim.grade === "partial" ? "amber" : "red"}>
                    <span data-testid={`completeness-dimension-${dim.dimension}-grade`}>{formatLabel(dim.grade)}</span>
                  </Pill>
                </div>
                <TextList items={dim.gaps} tone="amber" />
                <TextList items={dim.required_actions} />
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {displayCompleteness.blockers && displayCompleteness.blockers.length > 0 ? (
        <Section title={workshopCopy("agora.workshop.rail.blockers", "阻擋項目")}>
          <TextList items={displayCompleteness.blockers} tone="red" />
        </Section>
      ) : null}

      <ReadinessPanel metadata={metadata} readiness={readiness} />
    </div>
  );
}
