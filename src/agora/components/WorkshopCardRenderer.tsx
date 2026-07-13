import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
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

function UserStrategyDescription({ payload, t }: { payload: UnknownRecord; t: TFunction }) {
  return (
    <div className="space-y-3">
      {payload.owner_visible_content ? (
        <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">
          {stringValue(payload.owner_visible_content)}
        </p>
      ) : null}
      {payload.redacted_summary ? (
        <Section title={t("agora.workshop.cardLabels.redacted_summary")}>
          <p className="text-xs leading-5 text-slate-600">{stringValue(payload.redacted_summary)}</p>
        </Section>
      ) : null}
      <Section title={t("agora.workshop.cardLabels.attachments")}>
        <TextList items={payload.attachment_refs} />
      </Section>
    </div>
  );
}

function ServantReconstruction({ payload, t }: { payload: UnknownRecord; t: TFunction }) {
  const causalChain = recordList(payload.causal_chain);
  const inferences = recordList(payload.servant_inferences);

  return (
    <div className="space-y-4">
      <KeyValueGrid
        items={[
          { label: t("agora.workshop.cardLabels.strategy_title"), value: payload.strategy_title },
          { label: t("agora.workshop.cardLabels.patch_proposal"), value: payload.patch_proposal_ref },
        ]}
      />

      {causalChain.length > 0 ? (
        <Section title={t("agora.workshop.cardLabels.causal_chain")}>
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

      <Section title={t("agora.workshop.cardLabels.explicit_definitions")}>
        <TextList items={payload.explicit_definitions} />
      </Section>

      {inferences.length > 0 ? (
        <Section title={t("agora.workshop.cardLabels.servant_inferences")}>
          <ul className="space-y-2">
            {inferences.map((item, index) => (
              <li className="text-xs leading-5 text-slate-600" key={`${item.statement ?? index}`}>
                <span>{stringValue(item.statement)}</span>
                {item.needs_confirmation === true ? <Pill tone="amber">{t("agora.workshop.cardLabels.needs_confirmation")}</Pill> : null}
                <ConfidencePill value={item.confidence} />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title={t("agora.workshop.cardLabels.uncertainties")}>
        <TextList items={payload.uncertainties} tone="amber" />
      </Section>
      <Section title={t("agora.workshop.cardLabels.contradictions")}>
        <TextList items={payload.contradictions} tone="red" />
      </Section>
      <Section title={t("agora.workshop.cardLabels.proposed_next_actions")}>
        <TextList items={payload.proposed_next_actions} />
      </Section>
    </div>
  );
}

function CompletenessUpdate({ payload, t }: { payload: UnknownRecord; t: TFunction }) {
  const dimensionUpdates = recordList(payload.dimension_updates);

  return (
    <div className="space-y-4">
      <KeyValueGrid
        items={[
          { label: t("agora.workshop.cardLabels.overall_grade"), value: payload.overall_grade },
          { label: t("agora.workshop.cardLabels.research_ready"), value: payload.research_ready },
          { label: t("agora.workshop.cardLabels.change"), value: payload.change_since_previous },
        ]}
      />
      {dimensionUpdates.length > 0 ? (
        <Section title={t("agora.workshop.cardLabels.dimension_updates")}>
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
      <Section title={t("agora.workshop.cardLabels.blockers")}>
        <TextList items={payload.blockers} tone="red" />
      </Section>
      <Section title={t("agora.workshop.cardLabels.readiness_gates")}>
        <TextList items={payload.readiness_gates} />
      </Section>
    </div>
  );
}

function MissingDefinition({ payload, t }: { payload: UnknownRecord; t: TFunction }) {
  return (
    <div className="space-y-4">
      <KeyValueGrid
        items={[
          { label: t("agora.workshop.cardLabels.gap"), value: payload.gap_id },
          { label: t("agora.workshop.cardLabels.category"), value: payload.category },
          { label: t("agora.workshop.cardLabels.severity"), value: payload.severity },
          { label: t("agora.workshop.cardLabels.can_defer"), value: payload.can_defer },
        ]}
      />
      <Section title={t("agora.workshop.cardLabels.missing_definition")}>
        <p className="text-sm font-medium leading-6 text-slate-800">{stringValue(payload.missing_definition)}</p>
      </Section>
      <Section title={t("agora.workshop.cardLabels.why_it_matters")}>
        <p className="text-xs leading-5 text-slate-600">{stringValue(payload.why_it_matters)}</p>
      </Section>
      <Section title={t("agora.workshop.cardLabels.blocked_capabilities")}>
        <TextList items={payload.downstream_blocked_capabilities} tone="amber" />
      </Section>
      <Section title={t("agora.workshop.cardLabels.temporary_assumption")}>
        <p className="text-xs leading-5 text-slate-600">{stringValue(payload.suggested_temporary_assumption)}</p>
      </Section>
      <Section title={t("agora.workshop.cardLabels.answer_options")}>
        <TextList items={payload.answer_options} />
      </Section>
      <Section title={t("agora.workshop.cardLabels.deferral_consequence")}>
        <p className="text-xs leading-5 text-slate-600">{stringValue(payload.deferral_consequence)}</p>
      </Section>
    </div>
  );
}

function NextQuestion({ payload, t }: { payload: UnknownRecord; t: TFunction }) {
  const scoreComponents = asRecord(payload.score_components);

  return (
    <div className="space-y-4">
      <KeyValueGrid
        items={[
          { label: t("agora.workshop.cardLabels.question"), value: payload.question_id },
          { label: t("agora.workshop.cardLabels.score"), value: payload.score_total },
          { label: t("agora.workshop.cardLabels.freeform"), value: payload.freeform_allowed },
          { label: t("agora.workshop.cardLabels.defer"), value: payload.defer_allowed },
        ]}
      />
      <Section title={t("agora.workshop.cardLabels.question")}>
        <p className="text-sm font-medium leading-6 text-slate-800">{stringValue(payload.question)}</p>
      </Section>
      <Section title={t("agora.workshop.cardLabels.why_now")}>
        <p className="text-xs leading-5 text-slate-600">{stringValue(payload.why_now)}</p>
      </Section>
      {Object.keys(scoreComponents).length > 0 ? (
        <Section title={t("agora.workshop.cardLabels.score_components")}>
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
      <Section title={t("agora.workshop.cardLabels.answer_options")}>
        <TextList items={payload.answer_options} />
      </Section>
      <Section title={t("agora.workshop.cardLabels.defer_consequence")}>
        <p className="text-xs leading-5 text-slate-600">{stringValue(payload.defer_consequence)}</p>
      </Section>
    </div>
  );
}

function ResearchProgress({ payload, t }: { payload: UnknownRecord; t: TFunction }) {
  const progress = asRecord(payload.progress);
  const percent = clampPercent(progress.percent ?? payload.progress_percent);
  const backend = asRecord(payload.backend);

  return (
    <div className="space-y-4">
      <KeyValueGrid
        items={[
          { label: t("agora.workshop.cardLabels.run"), value: payload.run_id },
          { label: t("agora.workshop.cardLabels.plan"), value: payload.plan_id },
          { label: t("agora.workshop.cardLabels.stage"), value: payload.stage_id },
          { label: t("agora.workshop.cardLabels.status"), value: payload.execution_status },
          { label: t("agora.workshop.cardLabels.backend"), value: payload.backend ? undefined : payload.backend_mode },
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
      <Section title={t("agora.workshop.cardLabels.warnings")}>
        <TextList items={payload.warnings} tone="amber" />
      </Section>
      <Section title={t("agora.workshop.cardLabels.blocking_reasons")}>
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

function MetricGroups({ payload, t }: { payload: UnknownRecord; t: TFunction }) {
  const groups = groupedMetrics(payload);
  const entries = Object.entries(groups).filter(([, metrics]) => metrics.length > 0);
  if (entries.length === 0) return null;

  return (
    <Section title={t("agora.workshop.cardLabels.metrics")}>
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
                    <p className="text-[11px] text-slate-400">{t("agora.workshop.cardLabels.threshold")} {formatScalar(metric.threshold)}</p>
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

function FindingList({ items, t }: { items: unknown; t: TFunction }) {
  const findings = recordList(items);
  if (findings.length === 0) return null;

  return (
    <Section title={t("agora.workshop.cardLabels.findings")}>
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

function ResearchResult({ payload, t }: { payload: UnknownRecord; t: TFunction }) {
  const backend = asRecord(payload.backend);

  return (
    <div className="space-y-4">
      <KeyValueGrid
        items={[
          { label: t("agora.workshop.cardLabels.run"), value: payload.run_id },
          { label: t("agora.workshop.cardLabels.outcome"), value: payload.outcome },
          { label: t("agora.workshop.cardLabels.status"), value: payload.execution_status ?? payload.status },
          { label: t("agora.workshop.cardLabels.data_cutoff"), value: payload.data_cutoff },
        ]}
      />
      <div className="flex flex-wrap items-center gap-3">
        <BackendModeBadge mode={backend.mode ?? payload.backend_mode} />
        <NoOrderRouteBadge value={payload.no_order_route_proof} />
      </div>
      <MetricGroups payload={payload} t={t} />
      <FindingList items={payload.findings} t={t} />
      <Section title={t("agora.workshop.cardLabels.warnings")}>
        <TextList items={payload.warnings} tone="amber" />
      </Section>
      <Section title={t("agora.workshop.cardLabels.blocking_reasons")}>
        <TextList items={payload.blocking_reasons} tone="red" />
      </Section>
      <Section title={t("agora.workshop.cardLabels.artifacts")}>
        <TextList items={payload.artifact_refs} />
      </Section>
      <Section title={t("agora.workshop.cardLabels.recommended_patch_proposals")}>
        <TextList items={payload.recommended_patch_proposal_refs} />
      </Section>
    </div>
  );
}

function PatchProposal({ payload, t }: { payload: UnknownRecord; t: TFunction }) {
  return (
    <div className="space-y-4">
      <KeyValueGrid
        items={[
          { label: t("agora.workshop.cardLabels.proposal"), value: payload.proposal_id },
          { label: t("agora.workshop.cardLabels.base_version"), value: payload.base_version ?? payload.base_workshop_version_id },
          { label: t("agora.workshop.cardLabels.validation"), value: payload.validation_state ?? payload.validation },
        ]}
      />
      <Section title={t("agora.workshop.cardLabels.change_summary")}>
        <TextList items={payload.change_summary} />
      </Section>
      <Section title={t("agora.workshop.cardLabels.rationale")}>
        <p className="text-xs leading-5 text-slate-600">{stringValue(payload.rationale)}</p>
      </Section>
      <Section title={t("agora.workshop.cardLabels.predicted_effects")}>
        <TextList items={payload.predicted_effects} />
      </Section>
      <Section title={t("agora.workshop.cardLabels.warnings")}>
        <TextList items={payload.warnings ?? payload.conflicts} tone="amber" />
      </Section>
    </div>
  );
}

function VersionCompare({ payload, t }: { payload: UnknownRecord; t: TFunction }) {
  return (
    <div className="space-y-4">
      <KeyValueGrid
        items={[
          { label: t("agora.workshop.cardLabels.base"), value: payload.base_version ?? payload.base },
          { label: t("agora.workshop.cardLabels.candidate"), value: payload.candidate_version ?? payload.candidate },
          { label: t("agora.workshop.cardLabels.recommendation"), value: payload.recommendation },
        ]}
      />
      <Section title={t("agora.workshop.cardLabels.field_diffs")}>
        <TextList items={payload.field_diffs} />
      </Section>
      <Section title={t("agora.workshop.cardLabels.metric_diffs")}>
        <TextList items={payload.metric_diffs} />
      </Section>
      <Section title={t("agora.workshop.cardLabels.risk_diffs")}>
        <TextList items={payload.risk_diffs} tone="amber" />
      </Section>
      <Section title={t("agora.workshop.cardLabels.readiness_diffs")}>
        <TextList items={payload.readiness_diffs} />
      </Section>
      <Section title={t("agora.workshop.cardLabels.limitations")}>
        <TextList items={payload.limitations} />
      </Section>
    </div>
  );
}

function ReadinessGate({ payload, t }: { payload: UnknownRecord; t: TFunction }) {
  return (
    <div className="space-y-4">
      <KeyValueGrid
        items={[
          { label: t("agora.workshop.cardLabels.highest_ready_gate"), value: payload.highest_ready_gate },
          { label: t("agora.workshop.cardLabels.staleness"), value: payload.staleness },
        ]}
      />
      <Section title={t("agora.workshop.cardLabels.requirement_states")}>
        <TextList items={payload.requirement_states ?? payload.requirements} />
      </Section>
      <Section title={t("agora.workshop.cardLabels.hard_blockers")}>
        <TextList items={payload.hard_blockers ?? payload.blockers} tone="red" />
      </Section>
      <Section title={t("agora.workshop.cardLabels.temporary_assumptions")}>
        <TextList items={payload.temporary_assumptions} tone="amber" />
      </Section>
    </div>
  );
}

function ChartSpecSummary({ spec, t }: { spec: UnknownRecord; t: TFunction }) {
  const renderer = rendererForChartKind(spec.kind);
  return (
    <Section title={t("agora.workshop.cardLabels.chart_spec")}>
      <KeyValueGrid
        items={[
          { label: t("agora.workshop.cardLabels.kind"), value: spec.kind },
          { label: t("agora.workshop.cardLabels.renderer"), value: renderer },
        ]}
      />
      <TextList items={Object.keys(asRecord(spec.encodings)).map((key) => `${key}: ${stringValue(asRecord(asRecord(spec.encodings)[key]).field)}`)} />
    </Section>
  );
}

function GenericPayload({ payload, t }: { payload: UnknownRecord; t: TFunction }) {
  const chartSpec = asRecord(payload.chart_spec ?? payload.chartSpec);
  const scalarRows = scalarEntries(payload).filter(([key]) => !["chart_spec", "chartSpec"].includes(key));
  const listRows = Object.entries(payload).filter(([, value]) => Array.isArray(value));

  return (
    <div className="space-y-4">
      <KeyValueGrid items={scalarRows.map(([label, value]) => ({ label: formatLabel(label), value }))} />
      {Object.keys(chartSpec).length > 0 ? <ChartSpecSummary spec={chartSpec} t={t} /> : null}
      {listRows.map(([label, value]) => (
        <Section title={formatLabel(label)} key={label}>
          <TextList items={value} />
        </Section>
      ))}
    </div>
  );
}

function CardBody({ card, t }: { card: WorkshopCard; t: TFunction }) {
  const payload = asRecord(card.payload);

  switch (card.card_type) {
    case "user_strategy_description":
      return <UserStrategyDescription payload={payload} t={t} />;
    case "servant_reconstruction":
      return <ServantReconstruction payload={payload} t={t} />;
    case "completeness_update":
      return <CompletenessUpdate payload={payload} t={t} />;
    case "missing_definition":
      return <MissingDefinition payload={payload} t={t} />;
    case "next_question":
      return <NextQuestion payload={payload} t={t} />;
    case "research_plan_proposal":
      return <ResearchPlanCard payload={payload} />;
    case "research_progress":
      return <ResearchProgress payload={payload} t={t} />;
    case "research_result":
      return <ResearchResult payload={payload} t={t} />;
    case "consult_result":
      return <ConsultResultCard payload={payload} />;
    case "version_patch_proposal":
      return <PatchProposal payload={payload} t={t} />;
    case "version_compare":
      return <VersionCompare payload={payload} t={t} />;
    case "readiness_gate":
      return <ReadinessGate payload={payload} t={t} />;
    default:
      return <GenericPayload payload={payload} t={t} />;
  }
}

export function WorkshopCardRenderer({ card }: { card: WorkshopCard }) {
  const { t } = useTranslation();
  return (
    <CardShell card={card}>
      <CardBody card={card} t={t} />
    </CardShell>
  );
}
