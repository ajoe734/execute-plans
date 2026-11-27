import {
  BackendModeBadge,
  CardShell,
  KeyValueGrid,
  NoOrderRouteBadge,
  Pill,
  ProgressBar,
  Section,
  TextList,
} from "./WorkshopCardPrimitives";
import { BacktestResultCard } from "./BacktestResultCard";
import { ConsultResultCard } from "./ConsultResultCard";
import { ResearchPlanCard } from "./ResearchPlanCard";
import { ResearchRunCard } from "./ResearchRunCard";
import { PersonaOpinionCard } from "./PersonaOpinionCard";
import { DebateCard } from "./DebateCard";
import { VersionCompareCard } from "./VersionCompareCard";
import { GovernedProposalReferences, GovernedProposalWorkshopCard } from "./GovernedProposalWorkshopCard";
import type { WorkshopCard, WorkshopDecisionRequest } from "@/lib/bff-v1/agora/workshops";
import { normalizeNextDecision } from "./workshopCompletenessDisplay";
import {
  asRecord,
  clampPercent,
  formatLabel,
  formatScalar,
  optionalString,
  recordList,
  rendererForChartKind,
  scalarEntries,
  stringList,
  stringValue,
  workshopCopy,
  type UnknownRecord,
} from "./workshopCardUtils";

export interface WorkshopCardRendererProps {
  card: WorkshopCard;
  onContinueDiscussion?: (cardId: string) => void;
  onRetryReconstruction?: (cardId: string) => void;
  onSubmitDecision?: (decision: WorkshopDecisionRequest) => void;
  decisionBusy?: boolean;
}

function ConfidencePill({ value }: { value: unknown }) {
  const confidence = optionalString(value);
  if (!confidence) return null;
  return <Pill tone="blue">{confidence}</Pill>;
}

function UserStrategyDescription({ payload }: { payload: UnknownRecord }) {
  return (
    <div className="space-y-3">
      {payload.owner_visible_content ? (
        <p className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground">
          {stringValue(payload.owner_visible_content)}
        </p>
      ) : null}
      {payload.redacted_summary ? (
        <Section title={workshopCopy("agora.workshop.cardLabels.redacted_summary", "遮蔽摘要")}>
          <p className="text-xs leading-5 text-muted-foreground">{stringValue(payload.redacted_summary)}</p>
        </Section>
      ) : null}
      <Section title={workshopCopy("agora.workshop.cardLabels.attachments", "附件")}>
        <TextList items={payload.attachment_refs} />
      </Section>
    </div>
  );
}

function formatMapEntries(record: UnknownRecord): Array<{ label: string; value: string }> {
  const items: Array<{ label: string; value: string }> = [];
  for (const [key, val] of Object.entries(record)) {
    if (val === null || val === undefined || val === "") continue;
    if (Array.isArray(val)) {
      const joined = stringList(val).join("、");
      if (joined) items.push({ label: formatLabel(key), value: joined });
    } else if (typeof val === "object") {
      const nested = Object.entries(asRecord(val))
        .filter(([, v]) => v !== null && v !== undefined && v !== "")
        .map(([k, v]) => `${formatLabel(k)}: ${formatScalar(v)}`)
        .join("；");
      if (nested) items.push({ label: formatLabel(key), value: nested });
    } else {
      items.push({ label: formatLabel(key), value: formatScalar(val) });
    }
  }
  return items;
}

function StrategyReconstructionCard({
  card,
  payload,
  onRetryReconstruction,
  onSubmitDecision,
  decisionBusy,
}: {
  card: WorkshopCard;
  payload: UnknownRecord;
  onRetryReconstruction?: (cardId: string) => void;
  onSubmitDecision?: (decision: WorkshopDecisionRequest) => void;
  decisionBusy?: boolean;
}) {
  const failureReason = optionalString(payload.failure_reason ?? asRecord(payload.error).reason);
  const isFailed = card.status === "failed" || Boolean(failureReason);

  if (isFailed) {
    const reasonCode = failureReason ?? "provider_error";
    const reasonDescription = workshopCopy(
      `agora.workshop.reconstruction.failureReasons.${reasonCode}`,
      reasonCode,
    );
    return (
      <div
        className="space-y-3 rounded-md border border-rose-500/40 bg-rose-500/10 p-3"
        data-testid={`reconstruction-failed-${card.card_id}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-semibold text-rose-300">
            {workshopCopy("agora.workshop.reconstruction.failedTitle", "策略重建未完成")}
          </div>
          <Pill tone="red">
            <span data-testid="reconstruction-failure-reason">{reasonCode}</span>
          </Pill>
        </div>
        <p className="text-xs leading-5 text-rose-200">{reasonDescription}</p>
        {onRetryReconstruction ? (
          <div>
            <button
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-rose-500/40 bg-rose-500/20 px-3 text-xs font-semibold text-rose-200 hover:bg-rose-500/30"
              data-testid="retry-reconstruction-btn"
              onClick={() => onRetryReconstruction(card.card_id)}
              type="button"
            >
              {workshopCopy("agora.workshop.reconstruction.retryAction", "重新嘗試策略重建")}
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  const nested = asRecord(payload.reconstruction);
  const recon = Object.keys(nested).length > 0 ? nested : payload;
  const strategyMap = asRecord(recon.strategy_map);
  const strategyMapEntries = formatMapEntries(strategyMap);
  const causalChain = recordList(recon.causal_chain ?? payload.causal_chain);
  const explicitFacts = stringList(recon.explicit_facts ?? recon.explicit_definitions ?? payload.explicit_definitions);
  const rawInferences = recon.inferences ?? recon.servant_inferences ?? payload.servant_inferences;
  const inferenceRecords = recordList(rawInferences);
  const inferenceStrings = inferenceRecords.length === 0 ? stringList(rawInferences) : [];
  const assumptions = stringList(recon.assumptions);
  const uncertainties = stringList(recon.uncertainties ?? payload.uncertainties);
  const contradictions = stringList(recon.contradictions ?? payload.contradictions);
  const proposedNextActions = stringList(recon.proposed_next_actions ?? payload.proposed_next_actions);
  const nextDecision = normalizeNextDecision(recon.next_decision ?? recon.next_best_question);
  const nextBestQuestionText = optionalString(recon.next_best_question);
  const providerLineage = asRecord(recon.provider_lineage);
  const draftProposal = asRecord(recon.draft_proposal);
  const registryDraftRef = optionalString(payload.registry_draft_ref ?? recon.registry_draft_ref);
  const reconstructionId = optionalString(recon.reconstruction_id);

  return (
    <div className="space-y-4" data-testid={`strategy-reconstruction-body-${card.card_id}`}>
      <KeyValueGrid
        items={[
          { label: workshopCopy("agora.workshop.cardLabels.strategy_title", "策略名稱"), value: payload.strategy_title ?? draftProposal.title },
          { label: workshopCopy("agora.workshop.cardLabels.patch_proposal", "修補提案"), value: payload.patch_proposal_ref },
        ]}
      />

      {/* Section 1: Understood strategy core & explicit rules */}
      {(strategyMapEntries.length > 0 || explicitFacts.length > 0 || causalChain.length > 0) && (
        <Section title={workshopCopy("agora.workshop.reconstruction.understoodCore", "一、已確認的策略核心與顯性規則")}>
          {strategyMapEntries.length > 0 ? (
            <dl className="grid gap-2 rounded-md border border-border/70 bg-muted/20 p-2.5 sm:grid-cols-2">
              {strategyMapEntries.map((entry) => (
                <div className="min-w-0" key={entry.label}>
                  <dt className="text-[11px] font-medium text-muted-foreground">{entry.label}</dt>
                  <dd className="break-words text-xs font-medium text-foreground/90">{entry.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {explicitFacts.length > 0 ? <TextList items={explicitFacts} /> : null}
          {causalChain.length > 0 ? (
            <ol className="space-y-2 pt-1">
              {causalChain.map((step, index) => (
                <li className="space-y-1 border-l border-border pl-3" key={`${step.step_id ?? index}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {stringValue(step.step_id, `step-${index + 1}`)}
                    </span>
                    <ConfidencePill value={step.confidence} />
                  </div>
                  <p className="text-xs leading-5 text-foreground/90">{stringValue(step.premise)}</p>
                  {step.mechanism ? <p className="text-xs leading-5 text-muted-foreground">{stringValue(step.mechanism)}</p> : null}
                  {step.expected_observation ? (
                    <p className="text-[11px] text-muted-foreground">{stringValue(step.expected_observation)}</p>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : null}
        </Section>
      )}

      {/* Section 2: Servant inferences & working assumptions */}
      {(inferenceRecords.length > 0 || inferenceStrings.length > 0 || assumptions.length > 0) && (
        <Section title={workshopCopy("agora.workshop.reconstruction.inferredAssumptions", "二、助理推定與暫時假設（待您確認）")}>
          {inferenceRecords.length > 0 ? (
            <ul className="space-y-2">
              {inferenceRecords.map((item, index) => (
                <li className="flex flex-wrap items-center gap-2 text-xs leading-5 text-foreground/85" key={`${item.statement ?? index}`}>
                  <span>{stringValue(item.statement ?? item.summary)}</span>
                  <Pill tone="amber">{workshopCopy("agora.workshop.rail.stateInferred", "助理推定")}</Pill>
                  {item.needs_confirmation === true ? (
                    <Pill tone="amber">{workshopCopy("agora.workshop.cardLabels.needs_confirmation", "需要確認")}</Pill>
                  ) : null}
                  <ConfidencePill value={item.confidence} />
                </li>
              ))}
            </ul>
          ) : null}
          {inferenceStrings.length > 0 ? (
            <ul className="space-y-1.5">
              {inferenceStrings.map((statement) => (
                <li className="flex flex-wrap items-center gap-2 text-xs leading-5 text-foreground/85" key={statement}>
                  <span>{statement}</span>
                  <Pill tone="amber">{workshopCopy("agora.workshop.rail.stateInferred", "助理推定")}</Pill>
                </li>
              ))}
            </ul>
          ) : null}
          {assumptions.length > 0 ? <TextList items={assumptions} tone="amber" /> : null}
        </Section>
      )}

      {/* Section 3: Gaps & Conflicts */}
      {(contradictions.length > 0 || uncertainties.length > 0) && (
        <Section title={workshopCopy("agora.workshop.reconstruction.gapsAndConflicts", "三、尚缺定義與潛在衝突")}>
          <TextList items={contradictions} tone="red" />
          <TextList items={uncertainties} tone="amber" />
        </Section>
      )}

      {/* Section 4: Next Highest-Value Decision Question */}
      {(nextDecision || nextBestQuestionText) && (
        <Section title={workshopCopy("agora.workshop.reconstruction.nextHighValueQuestion", "四、下一個最高價值決策問題")}>
          {nextDecision ? (
            <div className="space-y-2.5 rounded-md border border-primary/30 bg-primary/10 p-3" data-testid="reconstruction-next-decision">
              <p className="text-xs font-semibold leading-5 text-foreground">{nextDecision.question}</p>
              {nextDecision.why_high_value ? (
                <p className="text-xs leading-5 text-muted-foreground">{nextDecision.why_high_value}</p>
              ) : null}
              {nextDecision.options.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {nextDecision.options.map((opt) => (
                    <button
                      className="rounded-md border border-primary/40 bg-card px-2.5 py-1.5 text-left text-xs font-medium text-foreground transition-colors hover:bg-primary/20 disabled:opacity-50"
                      data-testid={`reconstruction-decision-option-${opt.option_id}`}
                      disabled={decisionBusy || !onSubmitDecision}
                      key={opt.option_id}
                      onClick={() =>
                        onSubmitDecision?.({
                          question_id: nextDecision.question_id,
                          selected_option_id: opt.option_id,
                        })
                      }
                      type="button"
                    >
                      <span className="font-semibold text-primary">{opt.label}</span>
                      {opt.summary ? <span className="ml-1 text-muted-foreground">— {opt.summary}</span> : null}
                    </button>
                  ))}
                </div>
              )}
              {nextDecision.servant_default && onSubmitDecision ? (
                <div className="pt-1">
                  <button
                    className="rounded-md border border-amber-500/40 bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-300 hover:bg-amber-500/25 disabled:opacity-50"
                    data-testid="reconstruction-decision-servant-default"
                    disabled={decisionBusy}
                    onClick={() =>
                      onSubmitDecision({
                        question_id: nextDecision.question_id,
                        use_servant_default: true,
                      })
                    }
                    type="button"
                  >
                    {workshopCopy("agora.workshop.rail.servantDefaultOption", `先用助理預設：${nextDecision.servant_default.label}`, {
                      label: nextDecision.servant_default.label,
                    })}
                  </button>
                </div>
              ) : null}
            </div>
          ) : nextBestQuestionText ? (
            <p className="text-xs font-medium leading-5 text-foreground/90">{nextBestQuestionText}</p>
          ) : null}
        </Section>
      )}

      {proposedNextActions.length > 0 ? (
        <Section title={workshopCopy("agora.workshop.cardLabels.proposed_next_actions", "建議後續動作")}>
          <TextList items={proposedNextActions} />
        </Section>
      ) : null}

      {/* Expandable engineering & lineage details (V10 §2.2) */}
      {(reconstructionId || registryDraftRef || Object.keys(providerLineage).length > 0) && (
        <details
          className="rounded-md border border-border/70 bg-muted/20 p-2.5 text-xs"
          data-testid="reconstruction-engineering-details"
        >
          <summary className="cursor-pointer font-medium text-muted-foreground">
            {workshopCopy("agora.workshop.reconstruction.engineeringDetails", "展開工程與模型血緣細節")}
          </summary>
          <div className="mt-2 space-y-2 pt-1">
            <KeyValueGrid
              items={[
                { label: "Reconstruction ID", value: reconstructionId },
                { label: "Draft Ref", value: registryDraftRef },
                { label: "Provider", value: providerLineage.provider },
                { label: "Model", value: providerLineage.model },
              ]}
            />
          </div>
        </details>
      )}
    </div>
  );
}

function CompletenessUpdate({ payload }: { payload: UnknownRecord }) {
  const dimensionUpdates = recordList(payload.dimension_updates);

  return (
    <div className="space-y-4">
      <KeyValueGrid
        items={[
          { label: workshopCopy("agora.workshop.cardLabels.overall_grade", "整體等級"), value: formatLabel(payload.overall_grade) },
          { label: workshopCopy("agora.workshop.cardLabels.research_ready", "研究就緒"), value: payload.research_ready },
          { label: workshopCopy("agora.workshop.cardLabels.change", "變更"), value: payload.change_since_previous },
        ]}
      />
      {dimensionUpdates.length > 0 ? (
        <Section title={workshopCopy("agora.workshop.cardLabels.dimension_updates", "維度更新")}>
          <div className="space-y-3">
            {dimensionUpdates.map((dim, index) => (
              <div className="space-y-2 border-l border-border pl-3" key={`${dim.dimension ?? index}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-foreground">{formatLabel(dim.dimension)}</span>
                  {dim.prior_grade ? <Pill>{formatLabel(dim.prior_grade)}</Pill> : null}
                  {dim.current_grade ? <Pill tone="blue">{formatLabel(dim.current_grade)}</Pill> : null}
                </div>
                <TextList items={dim.gaps} tone="amber" />
                <TextList items={dim.required_actions} />
              </div>
            ))}
          </div>
        </Section>
      ) : null}
      <Section title={workshopCopy("agora.workshop.cardLabels.blockers", "阻擋項目")}>
        <TextList items={payload.blockers} tone="red" />
      </Section>
      <Section title={workshopCopy("agora.workshop.cardLabels.readiness_gates", "就緒閘門")}>
        <TextList items={payload.readiness_gates} />
      </Section>
    </div>
  );
}

function MissingDefinition({ payload }: { payload: UnknownRecord }) {
  return (
    <div className="space-y-4">
      <KeyValueGrid
        items={[
          { label: workshopCopy("agora.workshop.cardLabels.gap", "缺口編號"), value: payload.gap_id },
          { label: workshopCopy("agora.workshop.cardLabels.category", "類別"), value: payload.category },
          { label: workshopCopy("agora.workshop.cardLabels.severity", "嚴重度"), value: payload.severity },
          { label: workshopCopy("agora.workshop.cardLabels.can_defer", "可延後"), value: payload.can_defer },
        ]}
      />
      <Section title={workshopCopy("agora.workshop.cardLabels.missing_definition", "缺少的定義")}>
        <p className="text-sm font-medium leading-6 text-foreground">{stringValue(payload.missing_definition)}</p>
      </Section>
      <Section title={workshopCopy("agora.workshop.cardLabels.why_it_matters", "重要原因")}>
        <p className="text-xs leading-5 text-muted-foreground">{stringValue(payload.why_it_matters)}</p>
      </Section>
      <Section title={workshopCopy("agora.workshop.cardLabels.blocked_capabilities", "受阻能力")}>
        <TextList items={payload.downstream_blocked_capabilities} tone="amber" />
      </Section>
      <Section title={workshopCopy("agora.workshop.cardLabels.temporary_assumption", "暫時假設")}>
        <p className="text-xs leading-5 text-muted-foreground">{stringValue(payload.suggested_temporary_assumption)}</p>
      </Section>
      <Section title={workshopCopy("agora.workshop.cardLabels.answer_options", "回答選項")}>
        <TextList items={payload.answer_options} />
      </Section>
      <Section title={workshopCopy("agora.workshop.cardLabels.deferral_consequence", "延後影響")}>
        <p className="text-xs leading-5 text-muted-foreground">{stringValue(payload.deferral_consequence)}</p>
      </Section>
    </div>
  );
}

function NextQuestion({
  payload,
  onSubmitDecision,
  decisionBusy,
}: {
  payload: UnknownRecord;
  onSubmitDecision?: (decision: WorkshopDecisionRequest) => void;
  decisionBusy?: boolean;
}) {
  const scoreComponents = asRecord(payload.score_components);
  const normalized = normalizeNextDecision(payload);

  return (
    <div className="space-y-4">
      <KeyValueGrid
        items={[
          { label: workshopCopy("agora.workshop.cardLabels.question", "問題"), value: payload.question_id },
          { label: workshopCopy("agora.workshop.cardLabels.score", "分數"), value: payload.score_total },
          { label: workshopCopy("agora.workshop.cardLabels.freeform", "自由填寫"), value: payload.freeform_allowed },
          { label: workshopCopy("agora.workshop.cardLabels.defer", "延後"), value: payload.defer_allowed },
        ]}
      />
      <Section title={workshopCopy("agora.workshop.cardLabels.question", "問題")}>
        <p className="text-sm font-medium leading-6 text-foreground">{stringValue(payload.question)}</p>
      </Section>
      {(payload.why_now || payload.why_high_value) ? (
        <Section title={workshopCopy("agora.workshop.cardLabels.why_now", "為何現在")}>
          <p className="text-xs leading-5 text-muted-foreground">
            {stringValue(payload.why_now ?? payload.why_high_value)}
          </p>
        </Section>
      ) : null}
      {Object.keys(scoreComponents).length > 0 ? (
        <Section title={workshopCopy("agora.workshop.cardLabels.score_components", "分數組成")}>
          <div className="space-y-2">
            {Object.entries(scoreComponents).map(([name, value]) => (
              <div className="grid gap-1" key={name}>
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span>{formatLabel(name)}</span>
                  <span>{formatScalar(value)}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${clampPercent(value)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Section>
      ) : null}
      {normalized && normalized.options.length > 0 ? (
        <Section title={workshopCopy("agora.workshop.cardLabels.answer_options", "回答選項")}>
          <div className="flex flex-wrap gap-2">
            {normalized.options.map((opt) => (
              <button
                className="rounded-md border border-primary/40 bg-secondary/40 px-2.5 py-1.5 text-left text-xs font-medium text-foreground hover:bg-primary/20 disabled:opacity-50"
                data-testid={`next-question-option-${opt.option_id}`}
                disabled={decisionBusy || !onSubmitDecision}
                key={opt.option_id}
                onClick={() =>
                  onSubmitDecision?.({
                    question_id: normalized.question_id,
                    selected_option_id: opt.option_id,
                  })
                }
                type="button"
              >
                <span className="font-semibold text-primary">{opt.label}</span>
                {opt.summary ? <span className="ml-1 text-muted-foreground">— {opt.summary}</span> : null}
              </button>
            ))}
          </div>
          {normalized.servant_default && onSubmitDecision ? (
            <div className="pt-1">
              <button
                className="rounded-md border border-amber-500/40 bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-300 hover:bg-amber-500/25 disabled:opacity-50"
                data-testid="next-question-servant-default"
                disabled={decisionBusy}
                onClick={() =>
                  onSubmitDecision({
                    question_id: normalized.question_id,
                    use_servant_default: true,
                  })
                }
                type="button"
              >
                {workshopCopy("agora.workshop.rail.servantDefaultOption", `先用助理預設：${normalized.servant_default.label}`, {
                  label: normalized.servant_default.label,
                })}
              </button>
            </div>
          ) : null}
        </Section>
      ) : (
        <Section title={workshopCopy("agora.workshop.cardLabels.answer_options", "回答選項")}>
          <TextList items={payload.answer_options} />
        </Section>
      )}
      {payload.defer_consequence ? (
        <Section title={workshopCopy("agora.workshop.cardLabels.defer_consequence", "延後影響")}>
          <p className="text-xs leading-5 text-muted-foreground">{stringValue(payload.defer_consequence)}</p>
        </Section>
      ) : null}
    </div>
  );
}

function ResearchProgress({ card, payload }: { card: WorkshopCard; payload: UnknownRecord }) {
  if (typeof payload.progress === "number") {
    return <ResearchRunCard card={card} />;
  }
  const progress = asRecord(payload.progress);
  const percent = clampPercent(progress.percent ?? payload.progress_percent);
  const backend = asRecord(payload.backend);

  return (
    <div className="space-y-4">
      <KeyValueGrid
        items={[
          { label: workshopCopy("agora.workshop.cardLabels.run", "執行編號"), value: payload.run_id },
          { label: workshopCopy("agora.workshop.cardLabels.plan", "計畫"), value: payload.plan_id },
          { label: workshopCopy("agora.workshop.cardLabels.stage", "階段"), value: payload.stage_id },
          { label: workshopCopy("agora.workshop.cardLabels.status", "狀態"), value: payload.execution_status },
          { label: workshopCopy("agora.workshop.cardLabels.backend", "後端"), value: payload.backend ? undefined : payload.backend_mode },
        ]}
      />
      <ProgressBar
        value={percent}
        label={stringValue(progress.phase ?? payload.stage_type, workshopCopy("agora.workshop.cardLabels.progress", "進度"))}
      />
      <div className="flex flex-wrap items-center gap-2">
        <BackendModeBadge mode={backend.mode ?? payload.backend_mode} />
        <span className="text-xs text-muted-foreground">{stringValue(backend.effective ?? payload.backend)}</span>
      </div>
      {progress.message || payload.latest_progress_message ? (
        <p className="text-xs leading-5 text-muted-foreground">
          {stringValue(progress.message ?? payload.latest_progress_message)}
        </p>
      ) : null}
      <Section title={workshopCopy("agora.workshop.cardLabels.warnings", "警告")}>
        <TextList items={payload.warnings} tone="amber" />
      </Section>
      <Section title={workshopCopy("agora.workshop.cardLabels.blocking_reasons", "阻擋原因")}>
        <TextList items={payload.blocking_reasons} tone="red" />
      </Section>
    </div>
  );
}

function ResearchResult({ card, payload }: { card: WorkshopCard; payload: UnknownRecord }) {
  const backend = asRecord(payload.backend);
  const normalizedCard: WorkshopCard = {
    ...card,
    payload: {
      ...payload,
      backend:
        Object.keys(backend).length > 0
          ? {
              effective: stringValue(backend.effective ?? backend.requested, "vectorbt"),
              mode: stringValue(backend.mode ?? payload.backend_mode, "real"),
            }
          : undefined,
    },
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {!normalizedCard.payload?.backend ? (
          <BackendModeBadge mode={backend.mode ?? payload.backend_mode} />
        ) : null}
        <NoOrderRouteBadge value={payload.no_order_route_proof} />
      </div>
      <BacktestResultCard card={normalizedCard} />
      <Section title={workshopCopy("agora.workshop.cardLabels.artifacts", "產出物")}>
        <TextList items={payload.artifact_refs} />
      </Section>
      <Section title={workshopCopy("agora.workshop.cardLabels.recommended_patch_proposals", "建議修補提案")}>
        <TextList items={payload.recommended_patch_proposal_refs} />
      </Section>
    </div>
  );
}

function PatchProposal({ payload }: { payload: UnknownRecord }) {
  return (
    <div className="space-y-4">
      <KeyValueGrid
        items={[
          { label: workshopCopy("agora.workshop.cardLabels.proposal", "提案"), value: payload.proposal_id },
          { label: workshopCopy("agora.workshop.cardLabels.base_version", "基準版本"), value: payload.base_version ?? payload.base_workshop_version_id },
          { label: workshopCopy("agora.workshop.cardLabels.validation", "驗證"), value: payload.validation_state ?? payload.validation },
        ]}
      />
      <Section title={workshopCopy("agora.workshop.cardLabels.change_summary", "變更摘要")}>
        <TextList items={payload.change_summary} />
      </Section>
      <Section title={workshopCopy("agora.workshop.cardLabels.rationale", "理由")}>
        <p className="text-xs leading-5 text-foreground/85">{stringValue(payload.rationale)}</p>
      </Section>
      <Section title={workshopCopy("agora.workshop.cardLabels.predicted_effects", "預期影響")}>
        <TextList items={payload.predicted_effects} />
      </Section>
      <Section title={workshopCopy("agora.workshop.cardLabels.warnings", "警告")}>
        <TextList items={payload.warnings ?? payload.conflicts} tone="amber" />
      </Section>
    </div>
  );
}

function VersionCompare({ card, payload }: { card: WorkshopCard; payload: UnknownRecord }) {
  if (Array.isArray(payload.candidate_versions) && payload.base_version && typeof payload.base_version === "object") {
    return <VersionCompareCard card={card} />;
  }
  return (
    <div className="space-y-4">
      <KeyValueGrid
        items={[
          { label: workshopCopy("agora.workshop.cardLabels.base", "基準"), value: payload.base_version ?? payload.base },
          { label: workshopCopy("agora.workshop.cardLabels.candidate", "候選"), value: payload.candidate_version ?? payload.candidate },
          { label: workshopCopy("agora.workshop.cardLabels.recommendation", "建議"), value: payload.recommendation },
        ]}
      />
      <Section title={workshopCopy("agora.workshop.cardLabels.field_diffs", "欄位差異")}>
        <TextList items={payload.field_diffs} />
      </Section>
      <Section title={workshopCopy("agora.workshop.cardLabels.metric_diffs", "指標差異")}>
        <TextList items={payload.metric_diffs} />
      </Section>
      <Section title={workshopCopy("agora.workshop.cardLabels.risk_diffs", "風險差異")}>
        <TextList items={payload.risk_diffs} tone="amber" />
      </Section>
      <Section title={workshopCopy("agora.workshop.cardLabels.readiness_diffs", "就緒度差異")}>
        <TextList items={payload.readiness_diffs} />
      </Section>
      <Section title={workshopCopy("agora.workshop.cardLabels.limitations", "限制")}>
        <TextList items={payload.limitations} />
      </Section>
    </div>
  );
}

function ReadinessGate({ payload }: { payload: UnknownRecord }) {
  return (
    <div className="space-y-4">
      <KeyValueGrid
        items={[
          { label: workshopCopy("agora.workshop.cardLabels.highest_ready_gate", "最高就緒閘門"), value: payload.highest_ready_gate },
          { label: workshopCopy("agora.workshop.cardLabels.staleness", "時效狀態"), value: payload.staleness },
        ]}
      />
      <Section title={workshopCopy("agora.workshop.cardLabels.requirement_states", "需求狀態")}>
        <TextList items={payload.requirement_states ?? payload.requirements} />
      </Section>
      <Section title={workshopCopy("agora.workshop.cardLabels.hard_blockers", "硬性阻擋")}>
        <TextList items={payload.hard_blockers ?? payload.blockers} tone="red" />
      </Section>
      <Section title={workshopCopy("agora.workshop.cardLabels.temporary_assumptions", "暫時假設")}>
        <TextList items={payload.temporary_assumptions} tone="amber" />
      </Section>
    </div>
  );
}

function ChartSpecSummary({ spec }: { spec: UnknownRecord }) {
  const renderer = rendererForChartKind(spec.kind);
  return (
    <Section title={workshopCopy("agora.workshop.cardLabels.chart_spec", "圖表規格")}>
      <KeyValueGrid
        items={[
          { label: workshopCopy("agora.workshop.cardLabels.kind", "類型"), value: spec.kind },
          { label: workshopCopy("agora.workshop.cardLabels.renderer", "呈現器"), value: renderer },
        ]}
      />
      <TextList items={Object.keys(asRecord(spec.encodings)).map((key) => `${key}: ${stringValue(asRecord(asRecord(spec.encodings)[key]).field)}`)} />
    </Section>
  );
}

function GenericPayload({ payload }: { payload: UnknownRecord }) {
  const chartSpec = asRecord(payload.chart_spec ?? payload.chartSpec);
  const scalarRows = scalarEntries(payload).filter(([key]) => !["chart_spec", "chartSpec"].includes(key));
  const listRows = Object.entries(payload).filter(([, value]) => Array.isArray(value));

  return (
    <div className="space-y-4">
      <KeyValueGrid items={scalarRows.map(([label, value]) => ({ label: formatLabel(label), value }))} />
      {Object.keys(chartSpec).length > 0 ? <ChartSpecSummary spec={chartSpec} /> : null}
      {listRows.map(([label, value]) => (
        <Section title={formatLabel(label)} key={label}>
          <TextList items={value} />
        </Section>
      ))}
    </div>
  );
}

function ConclusionCard({ payload }: { payload: UnknownRecord }) {
  return (
    <div className="space-y-4">
      <KeyValueGrid
        items={[
          { label: workshopCopy("agora.workshop.cardLabels.outcome", "結果"), value: payload.outcome ?? payload.concluded_outcome },
          { label: workshopCopy("agora.workshop.cardLabels.concluded_by", "結案人員"), value: payload.concluded_by ?? payload.operator_id },
          { label: workshopCopy("agora.workshop.cardLabels.concluded_at", "結案時間"), value: payload.concluded_at },
        ]}
      />
      <Section title={workshopCopy("agora.workshop.cardLabels.conclusion_summary", "結案摘要")}>
        <p className="text-xs leading-5 text-foreground/90">{stringValue(payload.summary ?? payload.conclusion_summary ?? payload.notes)}</p>
      </Section>
      <Section title={workshopCopy("agora.workshop.cardLabels.final_version", "最終版本")}>
        <p className="text-xs leading-5 text-muted-foreground">{stringValue(payload.final_version_id ?? payload.selected_version_id)}</p>
      </Section>
      <Section title={workshopCopy("agora.workshop.cardLabels.next_recommended_actions", "建議後續動作")}>
        <TextList items={payload.next_actions ?? payload.recommendations} />
      </Section>
    </div>
  );
}

function CardBody({
  card,
  onRetryReconstruction,
  onSubmitDecision,
  decisionBusy,
}: {
  card: WorkshopCard;
  onRetryReconstruction?: (cardId: string) => void;
  onSubmitDecision?: (decision: WorkshopDecisionRequest) => void;
  decisionBusy?: boolean;
}) {
  const payload = asRecord(card.payload);

  switch (card.card_type) {
    case "user_strategy_description":
      return <UserStrategyDescription payload={payload} />;
    case "strategy_reconstruction":
    case "servant_reconstruction":
      return (
        <StrategyReconstructionCard
          card={card}
          decisionBusy={decisionBusy}
          onRetryReconstruction={onRetryReconstruction}
          onSubmitDecision={onSubmitDecision}
          payload={payload}
        />
      );
    case "completeness_update":
      return <CompletenessUpdate payload={payload} />;
    case "missing_definition":
      return <MissingDefinition payload={payload} />;
    case "next_question":
      return <NextQuestion decisionBusy={decisionBusy} onSubmitDecision={onSubmitDecision} payload={payload} />;
    case "research_plan_proposal":
    case "research_plan":
      return <ResearchPlanCard payload={payload} />;
    case "research_progress":
      return <ResearchProgress card={card} payload={payload} />;
    case "research_result":
      return <ResearchResult card={card} payload={payload} />;
    case "consult_result":
      return (
        <>
          <ConsultResultCard payload={payload} />
          <GovernedProposalReferences payload={payload} />
        </>
      );
    case "version_patch_proposal":
    case "patch_proposal":
      return <PatchProposal payload={payload} />;
    case "version_compare":
      return <VersionCompare card={card} payload={payload} />;
    case "readiness_gate":
      return <ReadinessGate payload={payload} />;
    case "persona_opinion":
    case "opinion":
      return <PersonaOpinionCard payload={payload} />;
    case "debate":
    case "debate_summary":
      return <DebateCard payload={payload} />;
    case "governed_proposal":
      return <GovernedProposalWorkshopCard payload={payload} />;
    case "workshop_concluded":
    case "conclusion":
      return <ConclusionCard payload={payload} />;
    default:
      return <GenericPayload payload={payload} />;
  }
}

export function WorkshopCardRenderer({
  card,
  onContinueDiscussion,
  onRetryReconstruction,
  onSubmitDecision,
  decisionBusy,
}: WorkshopCardRendererProps) {
  return (
    <CardShell card={card} onContinueDiscussion={onContinueDiscussion}>
      <CardBody
        card={card}
        decisionBusy={decisionBusy}
        onRetryReconstruction={onRetryReconstruction}
        onSubmitDecision={onSubmitDecision}
      />
    </CardShell>
  );
}
