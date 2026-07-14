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
import { ConsultResultCard } from "./ConsultResultCard";
import { ResearchPlanCard } from "./ResearchPlanCard";
import { PersonaOpinionCard } from "./PersonaOpinionCard";
import { DebateCard } from "./DebateCard";
import type { WorkshopCard } from "@/lib/bff-v1/agora/workshops";
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
  type UnknownRecord,
} from "./workshopCardUtils";

function ConfidencePill({ value }: { value: unknown }) {
  const confidence = optionalString(value);
  if (!confidence) return null;
  return <Pill tone="blue">{confidence}</Pill>;
}

function UserStrategyDescription({ payload }: { payload: UnknownRecord }) {
  return (
    <div className="space-y-3">
      {payload.owner_visible_content ? (
        <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">
          {stringValue(payload.owner_visible_content)}
        </p>
      ) : null}
      {payload.redacted_summary ? (
        <Section title="Redacted Summary">
          <p className="text-xs leading-5 text-slate-600">{stringValue(payload.redacted_summary)}</p>
        </Section>
      ) : null}
      <Section title="Attachments">
        <TextList items={payload.attachment_refs} />
      </Section>
    </div>
  );
}

function ServantReconstruction({ payload }: { payload: UnknownRecord }) {
  const causalChain = recordList(payload.causal_chain);
  const inferences = recordList(payload.servant_inferences);

  return (
    <div className="space-y-4">
      <KeyValueGrid
        items={[
          { label: "Strategy title", value: payload.strategy_title },
          { label: "Patch proposal", value: payload.patch_proposal_ref },
        ]}
      />

      {causalChain.length > 0 ? (
        <Section title="Causal Chain">
          <ol className="space-y-3">
            {causalChain.map((step, index) => (
              <li className="space-y-1 border-l border-slate-200 pl-3" key={`${step.step_id ?? index}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] text-slate-400">
                    {stringValue(step.step_id, `step-${index + 1}`)}
                  </span>
                  <ConfidencePill value={step.confidence} />
                </div>
                <p className="text-xs leading-5 text-slate-700">{stringValue(step.premise)}</p>
                {step.mechanism ? <p className="text-xs leading-5 text-slate-600">{stringValue(step.mechanism)}</p> : null}
                {step.expected_observation ? (
                  <p className="text-[11px] text-slate-500">{stringValue(step.expected_observation)}</p>
                ) : null}
              </li>
            ))}
          </ol>
        </Section>
      ) : null}

      <Section title="Explicit Definitions">
        <TextList items={payload.explicit_definitions} />
      </Section>

      {inferences.length > 0 ? (
        <Section title="Servant Inferences">
          <ul className="space-y-2">
            {inferences.map((item, index) => (
              <li className="text-xs leading-5 text-slate-600" key={`${item.statement ?? index}`}>
                <span>{stringValue(item.statement)}</span>
                {item.needs_confirmation === true ? <Pill tone="amber">Needs confirmation</Pill> : null}
                <ConfidencePill value={item.confidence} />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Uncertainties">
        <TextList items={payload.uncertainties} tone="amber" />
      </Section>
      <Section title="Contradictions">
        <TextList items={payload.contradictions} tone="red" />
      </Section>
      <Section title="Proposed Next Actions">
        <TextList items={payload.proposed_next_actions} />
      </Section>
    </div>
  );
}

function CompletenessUpdate({ payload }: { payload: UnknownRecord }) {
  const dimensionUpdates = recordList(payload.dimension_updates);

  return (
    <div className="space-y-4">
      <KeyValueGrid
        items={[
          { label: "Overall grade", value: payload.overall_grade },
          { label: "Research ready", value: payload.research_ready },
          { label: "Change", value: payload.change_since_previous },
        ]}
      />
      {dimensionUpdates.length > 0 ? (
        <Section title="Dimension Updates">
          <div className="space-y-3">
            {dimensionUpdates.map((dim, index) => (
              <div className="space-y-2 border-l border-slate-200 pl-3" key={`${dim.dimension ?? index}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-slate-800">{formatLabel(dim.dimension)}</span>
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
      <Section title="Blockers">
        <TextList items={payload.blockers} tone="red" />
      </Section>
      <Section title="Readiness Gates">
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
          { label: "Gap", value: payload.gap_id },
          { label: "Category", value: payload.category },
          { label: "Severity", value: payload.severity },
          { label: "Can defer", value: payload.can_defer },
        ]}
      />
      <Section title="Missing Definition">
        <p className="text-sm font-medium leading-6 text-slate-800">{stringValue(payload.missing_definition)}</p>
      </Section>
      <Section title="Why It Matters">
        <p className="text-xs leading-5 text-slate-600">{stringValue(payload.why_it_matters)}</p>
      </Section>
      <Section title="Blocked Capabilities">
        <TextList items={payload.downstream_blocked_capabilities} tone="amber" />
      </Section>
      <Section title="Temporary Assumption">
        <p className="text-xs leading-5 text-slate-600">{stringValue(payload.suggested_temporary_assumption)}</p>
      </Section>
      <Section title="Answer Options">
        <TextList items={payload.answer_options} />
      </Section>
      <Section title="Deferral Consequence">
        <p className="text-xs leading-5 text-slate-600">{stringValue(payload.deferral_consequence)}</p>
      </Section>
    </div>
  );
}

function NextQuestion({ payload }: { payload: UnknownRecord }) {
  const scoreComponents = asRecord(payload.score_components);

  return (
    <div className="space-y-4">
      <KeyValueGrid
        items={[
          { label: "Question", value: payload.question_id },
          { label: "Score", value: payload.score_total },
          { label: "Freeform", value: payload.freeform_allowed },
          { label: "Defer", value: payload.defer_allowed },
        ]}
      />
      <Section title="Question">
        <p className="text-sm font-medium leading-6 text-slate-800">{stringValue(payload.question)}</p>
      </Section>
      <Section title="Why Now">
        <p className="text-xs leading-5 text-slate-600">{stringValue(payload.why_now)}</p>
      </Section>
      {Object.keys(scoreComponents).length > 0 ? (
        <Section title="Score Components">
          <div className="space-y-2">
            {Object.entries(scoreComponents).map(([name, value]) => (
              <div className="grid gap-1" key={name}>
                <div className="flex justify-between text-[11px] text-slate-500">
                  <span>{formatLabel(name)}</span>
                  <span>{formatScalar(value)}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-slate-500" style={{ width: `${clampPercent(value)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Section>
      ) : null}
      <Section title="Answer Options">
        <TextList items={payload.answer_options} />
      </Section>
      <Section title="Defer Consequence">
        <p className="text-xs leading-5 text-slate-600">{stringValue(payload.defer_consequence)}</p>
      </Section>
    </div>
  );
}

function ResearchProgress({ payload }: { payload: UnknownRecord }) {
  const progress = asRecord(payload.progress);
  const percent = clampPercent(progress.percent ?? payload.progress_percent);
  const backend = asRecord(payload.backend);

  return (
    <div className="space-y-4">
      <KeyValueGrid
        items={[
          { label: "Run", value: payload.run_id },
          { label: "Plan", value: payload.plan_id },
          { label: "Stage", value: payload.stage_id },
          { label: "Status", value: payload.execution_status },
          { label: "Backend", value: payload.backend ? undefined : payload.backend_mode },
        ]}
      />
      <ProgressBar value={percent} label={stringValue(progress.phase ?? payload.stage_type, "Progress")} />
      <div className="flex flex-wrap items-center gap-2">
        <BackendModeBadge mode={backend.mode ?? payload.backend_mode} />
        <span className="text-xs text-slate-500">{stringValue(backend.effective ?? payload.backend)}</span>
      </div>
      {progress.message || payload.latest_progress_message ? (
        <p className="text-xs leading-5 text-slate-600">
          {stringValue(progress.message ?? payload.latest_progress_message)}
        </p>
      ) : null}
      <Section title="Warnings">
        <TextList items={payload.warnings} tone="amber" />
      </Section>
      <Section title="Blocking Reasons">
        <TextList items={payload.blocking_reasons} tone="red" />
      </Section>
    </div>
  );
}

function groupedMetrics(payload: UnknownRecord): Record<string, UnknownRecord[]> {
  const raw = payload.metrics ?? payload.metrics_by_category ?? payload.metrics_summary;
  if (Array.isArray(raw)) {
    return recordList(raw).reduce<Record<string, UnknownRecord[]>>((groups, metric) => {
      const category = stringValue(metric.category, "metrics");
      groups[category] = [...(groups[category] ?? []), metric];
      return groups;
    }, {});
  }
  const record = asRecord(raw);
  const groups: Record<string, UnknownRecord[]> = {};
  for (const [category, value] of Object.entries(record)) {
    if (Array.isArray(value)) {
      groups[category] = recordList(value);
    } else if (value && typeof value === "object") {
      groups[category] = Object.entries(asRecord(value)).map(([name, metricValue]) => ({
        name,
        value: metricValue,
      }));
    } else {
      groups.metrics = [...(groups.metrics ?? []), { name: category, value }];
    }
  }
  return groups;
}

function MetricGroups({ payload }: { payload: UnknownRecord }) {
  const groups = groupedMetrics(payload);
  const entries = Object.entries(groups).filter(([, metrics]) => metrics.length > 0);
  if (entries.length === 0) return null;

  return (
    <Section title="Metrics">
      <div className="space-y-3">
        {entries.map(([category, metrics]) => (
          <div className="space-y-2" key={category}>
            <div className="text-[11px] font-semibold uppercase text-slate-500">{formatLabel(category)}</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {metrics.map((metric, index) => (
                <div className="border-l border-slate-200 pl-3" key={`${category}-${metric.name ?? index}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-700">{formatLabel(metric.name)}</span>
                    {metric.gate_result ? <Pill tone={metric.gate_result === "pass" ? "green" : "amber"}>{formatLabel(metric.gate_result)}</Pill> : null}
                  </div>
                  <div className="mt-0.5 font-mono text-sm text-slate-900">
                    {formatScalar(metric.value)}
                    {metric.unit ? <span className="ml-1 text-[11px] text-slate-400">{stringValue(metric.unit)}</span> : null}
                  </div>
                  {metric.threshold !== undefined ? (
                    <p className="text-[11px] text-slate-400">Threshold {formatScalar(metric.threshold)}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function FindingList({ items }: { items: unknown }) {
  const findings = recordList(items);
  if (findings.length === 0) return null;

  return (
    <Section title="Findings">
      <ul className="space-y-2">
        {findings.map((finding, index) => (
          <li className="space-y-1 border-l border-slate-200 pl-3 text-xs" key={`${finding.finding_id ?? index}`}>
            <div className="flex flex-wrap items-center gap-2">
              {finding.severity ? <Pill tone={finding.severity === "critical" || finding.severity === "high" ? "red" : "amber"}>{formatLabel(finding.severity)}</Pill> : null}
              <span className="font-medium text-slate-800">{stringValue(finding.summary)}</span>
            </div>
            {finding.detail ? <p className="leading-5 text-slate-600">{stringValue(finding.detail)}</p> : null}
          </li>
        ))}
      </ul>
    </Section>
  );
}

function ResearchResult({ payload }: { payload: UnknownRecord }) {
  const backend = asRecord(payload.backend);

  return (
    <div className="space-y-4">
      <KeyValueGrid
        items={[
          { label: "Run", value: payload.run_id },
          { label: "Outcome", value: payload.outcome },
          { label: "Status", value: payload.execution_status ?? payload.status },
          { label: "Data cutoff", value: payload.data_cutoff },
        ]}
      />
      <div className="flex flex-wrap items-center gap-3">
        <BackendModeBadge mode={backend.mode ?? payload.backend_mode} />
        <NoOrderRouteBadge value={payload.no_order_route_proof} />
      </div>
      <MetricGroups payload={payload} />
      <FindingList items={payload.findings} />
      <Section title="Warnings">
        <TextList items={payload.warnings} tone="amber" />
      </Section>
      <Section title="Blocking Reasons">
        <TextList items={payload.blocking_reasons} tone="red" />
      </Section>
      <Section title="Artifacts">
        <TextList items={payload.artifact_refs} />
      </Section>
      <Section title="Recommended Patch Proposals">
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
          { label: "Proposal", value: payload.proposal_id },
          { label: "Base version", value: payload.base_version ?? payload.base_workshop_version_id },
          { label: "Validation", value: payload.validation_state ?? payload.validation },
        ]}
      />
      <Section title="Change Summary">
        <TextList items={payload.change_summary} />
      </Section>
      <Section title="Rationale">
        <p className="text-xs leading-5 text-slate-600">{stringValue(payload.rationale)}</p>
      </Section>
      <Section title="Predicted Effects">
        <TextList items={payload.predicted_effects} />
      </Section>
      <Section title="Warnings">
        <TextList items={payload.warnings ?? payload.conflicts} tone="amber" />
      </Section>
    </div>
  );
}

function VersionCompare({ payload }: { payload: UnknownRecord }) {
  return (
    <div className="space-y-4">
      <KeyValueGrid
        items={[
          { label: "Base", value: payload.base_version ?? payload.base },
          { label: "Candidate", value: payload.candidate_version ?? payload.candidate },
          { label: "Recommendation", value: payload.recommendation },
        ]}
      />
      <Section title="Field Diffs">
        <TextList items={payload.field_diffs} />
      </Section>
      <Section title="Metric Diffs">
        <TextList items={payload.metric_diffs} />
      </Section>
      <Section title="Risk Diffs">
        <TextList items={payload.risk_diffs} tone="amber" />
      </Section>
      <Section title="Readiness Diffs">
        <TextList items={payload.readiness_diffs} />
      </Section>
      <Section title="Limitations">
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
          { label: "Highest ready gate", value: payload.highest_ready_gate },
          { label: "Staleness", value: payload.staleness },
        ]}
      />
      <Section title="Requirement States">
        <TextList items={payload.requirement_states ?? payload.requirements} />
      </Section>
      <Section title="Hard Blockers">
        <TextList items={payload.hard_blockers ?? payload.blockers} tone="red" />
      </Section>
      <Section title="Temporary Assumptions">
        <TextList items={payload.temporary_assumptions} tone="amber" />
      </Section>
    </div>
  );
}

function ChartSpecSummary({ spec }: { spec: UnknownRecord }) {
  const renderer = rendererForChartKind(spec.kind);
  return (
    <Section title="Chart Spec">
      <KeyValueGrid
        items={[
          { label: "Kind", value: spec.kind },
          { label: "Renderer", value: renderer },
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

function CardBody({ card }: { card: WorkshopCard }) {
  const payload = asRecord(card.payload);

  switch (card.card_type) {
    case "user_strategy_description":
      return <UserStrategyDescription payload={payload} />;
    case "servant_reconstruction":
      return <ServantReconstruction payload={payload} />;
    case "completeness_update":
      return <CompletenessUpdate payload={payload} />;
    case "missing_definition":
      return <MissingDefinition payload={payload} />;
    case "next_question":
      return <NextQuestion payload={payload} />;
    case "research_plan_proposal":
      return <ResearchPlanCard payload={payload} />;
    case "research_progress":
      return <ResearchProgress payload={payload} />;
    case "research_result":
      return <ResearchResult payload={payload} />;
    case "consult_result":
      return <ConsultResultCard payload={payload} />;
    case "version_patch_proposal":
      return <PatchProposal payload={payload} />;
    case "version_compare":
      return <VersionCompare payload={payload} />;
    case "readiness_gate":
      return <ReadinessGate payload={payload} />;
    case "persona_opinion":
    case "opinion":
      return <PersonaOpinionCard payload={payload} />;
    case "debate":
      return <DebateCard payload={payload} />;
    default:
      return <GenericPayload payload={payload} />;
  }
}

export function WorkshopCardRenderer({
  card,
  onContinueDiscussion,
}: {
  card: WorkshopCard;
  onContinueDiscussion?: (cardId: string) => void;
}) {
  return (
    <CardShell card={card} onContinueDiscussion={onContinueDiscussion}>
      <CardBody card={card} />
    </CardShell>
  );
}
