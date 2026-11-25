// AlphaFactoryBoard — Spec Part 3 §6.8, reshaped by FE-ALPHA-FACTORY-PIPELINE-TRUTH-20261125.
// Reads GET /bff/alpha-factory (BFF-ALPHA-FACTORY-PIPELINE-TRUTH-20261125) and shows the real
// discovery pipeline: who is looking for what, which searches and gate attempts ran, and the
// candidates with a recorded backtest pass. Document-check records never read as passes.
// Read-only: the page issues no write.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useLiveStatus } from "@/lib/bff-v1";
import { alphaFactory, type AlphaFactoryPipelineEnvelope } from "@/lib/bff-v1/alphaFactory";
import { SampleMetricsPanel, LineagePanel, AttributionNote, TemplateEvaluationsPanel } from "@/management/components/discovery/DiscoveryPanels";
import { normalizeDiscovery } from "@/lib/bff-v1/discovery";
import { safeDateTime } from "@/lib/utils";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { RiskBadge } from "@/platform/components/RiskBadge";
import { useT } from "@/platform/hooks";
import { demandMeasureText } from "@/management/pages/researchPresentation";
import {
  ALPHA_FACTORY_COLUMNS,
  buildAlphaFactoryBuckets,
  classifyAlphaFactorySource,
  type AlphaFactoryAdmissionCard,
  type AlphaFactoryColumn,
  type AlphaFactoryCount,
  type AlphaFactoryLaneRead,
  type AlphaFactoryPipelineItem,
} from "./alphaFactoryData";

type TFn = ReturnType<typeof useT>;

/** Typed reason codes the page explains in plain words; anything else shows its raw code as secondary text. */
const KNOWN_REASON_CODES = [
  "mandate_universe_missing",
  "survivorship_limited",
  "below_threshold",
  "dataset_unavailable",
  "reason_not_recorded",
  "run_budget_exhausted",
  "template_search_unavailable",
  "owner_credential_unconfigured",
  "no_external_match",
  "retrain_failed",
] as const;

const KNOWN_UNAVAILABLE_REASONS = [
  "no_bounded_owner_read",
  "owner_read_failed",
  "reader_unconfigured",
  "not_reported",
  "value_not_reported",
  "demand_scope_mismatch",
  "persona_directory_read_failed",
] as const;

const KNOWN_DOCUMENT_CHECK_REASONS = [
  "retired",
  "test_scope",
  "simulation_or_raw_market_seed",
  "no_passing_gate_result",
  "gate_result_unavailable",
] as const;

const RESEARCH_ITEMS_HREF = "/management/experiments";

/** Long ids and codes wrap anywhere so nothing leaves the card at 390 px. */
const WRAP = "break-words [overflow-wrap:anywhere]";

function includes(list: readonly string[], value: string | null | undefined): value is string {
  return typeof value === "string" && list.includes(value);
}

/** Plain text for a failure code; the raw code is returned only when the code is unknown. */
export function alphaReasonText(code: string | null | undefined, t: TFn): { text: string; raw: string | null } | null {
  const raw = code?.trim();
  if (!raw) return null;
  const token = raw.split(":").map((part) => part.trim()).reverse().find((part) => includes(KNOWN_REASON_CODES, part));
  if (token) return { text: t(`alphaFactory.reasons.${token}`), raw: null };
  return { text: t("alphaFactory.reasons.unknown"), raw };
}

function unavailableText(reason: string | null | undefined, t: TFn): string {
  const raw = reason?.trim() || "not_reported";
  if (includes(KNOWN_UNAVAILABLE_REASONS, raw)) {
    return t("alphaFactory.unavailableCount", { reason: t(`alphaFactory.unavailableReasons.${raw}`) });
  }
  return t("alphaFactory.unavailableCount", { reason: raw });
}

function documentCheckText(reason: string | null | undefined, t: TFn): { text: string; raw: string | null } {
  const raw = reason?.trim();
  if (includes(KNOWN_DOCUMENT_CHECK_REASONS, raw)) return { text: t(`alphaFactory.documentChecked.reasons.${raw}`), raw: null };
  return { text: t("alphaFactory.documentChecked.reasons.unknown"), raw: raw || null };
}

function ReasonLine({ code, fallback, testId }: { code: string | null | undefined; fallback?: string | null; testId: string }) {
  const t = useT();
  const reason = alphaReasonText(code, t) ?? alphaReasonText(fallback, t);
  if (!reason) return null;
  return (
    <div className="text-xs" data-testid={testId}>
      <span className="text-status-failed">{reason.text}</span>
      {reason.raw && (
        <span className={`block text-muted-foreground text-mono ${WRAP}`} data-testid={`${testId}-raw`}>
          {t("alphaFactory.rawCode", { code: reason.raw })}
        </span>
      )}
    </div>
  );
}

function SecondaryId({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <div className={`text-[11px] text-muted-foreground text-mono ${WRAP}`} data-testid={testId}>
      {children}
    </div>
  );
}

function CardLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      onClick={(e) => e.stopPropagation()}
      className="text-xs text-primary hover:underline inline-flex items-center gap-1"
    >
      {children} <ArrowRight className="h-3 w-3 shrink-0" />
    </Link>
  );
}

function personaName(item: Pick<AlphaFactoryPipelineItem, "display_name">, t: TFn): string {
  return item.display_name ?? t("alphaFactory.pipeline.personaUnknown");
}

function formatWhen(value: string | null | undefined): string | null {
  return value ? safeDateTime(value) : null;
}

function StageCounts({ counts }: { counts: ReturnType<typeof buildAlphaFactoryBuckets>["counts"] }) {
  const t = useT();
  const value = (count: AlphaFactoryCount) =>
    count.status === "ok" ? String(count.value) : unavailableText(count.reason, t);
  const templates = (() => {
    const evaluated = counts.templates_evaluated;
    const registered = counts.templates_registered;
    if (evaluated.status === "ok" && registered.status === "ok") {
      return t("alphaFactory.stages.templatesValue", { evaluated: evaluated.value, registered: registered.value });
    }
    return unavailableText(evaluated.status !== "ok" ? evaluated.reason : registered.reason, t);
  })();
  const stages: Array<{ key: string; label: string; text: string; ok: boolean }> = [
    { key: "collected", label: t("alphaFactory.stages.collected"), text: value(counts.collected_text_records), ok: counts.collected_text_records.status === "ok" },
    { key: "dropped", label: t("alphaFactory.stages.dropped"), text: value(counts.dropped_irrelevant), ok: counts.dropped_irrelevant.status === "ok" },
    { key: "cards", label: t("alphaFactory.stages.cards"), text: value(counts.hypothesis_cards), ok: counts.hypothesis_cards.status === "ok" },
    {
      key: "templates",
      label: t("alphaFactory.stages.templates"),
      text: templates,
      ok: counts.templates_evaluated.status === "ok" && counts.templates_registered.status === "ok",
    },
    { key: "searches", label: t("alphaFactory.stages.searches"), text: value(counts.searches), ok: counts.searches.status === "ok" },
    { key: "passes", label: t("alphaFactory.stages.passes"), text: value(counts.passes), ok: counts.passes.status === "ok" },
  ];
  return (
    <ol
      data-testid="alpha-factory-stage-counts"
      aria-label={t("alphaFactory.stages.title")}
      className="mb-4 flex flex-wrap items-stretch gap-x-1 gap-y-2 text-xs"
    >
      {stages.map((stage, index) => (
        <li key={stage.key} className="flex items-center gap-1 min-w-0" data-testid={`alpha-factory-stage-${stage.key}`}>
          {index > 0 && <ArrowRight aria-hidden className="h-3 w-3 shrink-0 text-muted-foreground" />}
          <span className="rounded-md border border-border px-2 py-1 min-w-0">
            <span className="text-muted-foreground">{stage.label}</span>{" "}
            <strong
              className={stage.ok ? "text-foreground" : `font-normal text-status-warning ${WRAP}`}
              data-testid={`alpha-factory-stage-${stage.key}-value`}
              data-status={stage.ok ? "ok" : "unavailable"}
            >
              {stage.text}
            </strong>
          </span>
        </li>
      ))}
    </ol>
  );
}

function PipelineItemCard({
  item,
  measureFor,
}: {
  item: AlphaFactoryPipelineItem;
  measureFor: (demandId: string | null) => string | null;
}) {
  const t = useT();
  const personaHref = item.persona_id ? `/management/personas/${encodeURIComponent(item.persona_id)}` : null;
  const since = formatWhen(item.since);

  let title: string;
  if (item.kind === "hypothesis_card") {
    title = t("alphaFactory.pipeline.cardTitle", {
      source: item.display_name ?? item.source_id ?? t("alphaFactory.pipeline.sourceUnknown"),
      claim: item.claim ?? t("alphaFactory.pipeline.claimUnknown"),
    });
  } else if (item.kind === "template_search") {
    const measure = item.short_measure ?? measureFor(item.demand_id);
    title = t("alphaFactory.pipeline.searchTitle", {
      persona: personaName(item, t),
      measure: measure ? demandMeasureText(measure, t) : t("research.demand.measureUnknown"),
    });
  } else {
    title = t("alphaFactory.pipeline.demandTitle", {
      persona: personaName(item, t),
      measure: demandMeasureText(item.short_measure, t),
    });
  }

  const failed = item.kind === "template_search" && item.outcome?.toLowerCase() !== "completed";

  return (
    <Card data-testid={`alpha-factory-item-${item.id}`} data-kind={item.kind} className="p-3 min-w-0 space-y-1.5">
      <div className={`text-sm font-medium ${WRAP}`} data-testid={`alpha-factory-item-title-${item.id}`}>
        {title}
      </div>

      {item.kind === "research_demand" && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          {item.missing_datasets.length > 0 && (
            <div className={WRAP}>{t("research.demand.missingData", { datasets: item.missing_datasets.join("、") })}</div>
          )}
          <div className={WRAP}>
            {item.tried_families.length > 0
              ? t("research.demand.tried", {
                  families: item.tried_families.map((f) => t(`research.demand.families.${f}`, { defaultValue: f })).join("、"),
                })
              : t("research.demand.triedNone")}
          </div>
          {since && <div>{t("alphaFactory.pipeline.since", { date: since })}</div>}
          {item.latest_reason_code || item.latest_reason ? (
            <ReasonLine code={item.latest_reason_code} fallback={item.latest_reason} testId={`alpha-factory-item-reason-${item.id}`} />
          ) : (
            <div data-testid={`alpha-factory-item-reason-${item.id}`}>{t("alphaFactory.pipeline.noOutcome")}</div>
          )}
        </div>
      )}

      {item.kind === "hypothesis_card" && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          {since && <div>{t("alphaFactory.pipeline.since", { date: since })}</div>}
          {item.status && <div className={WRAP}>{t("alphaFactory.pipeline.cardStatus", { status: item.status })}</div>}
        </div>
      )}

      {item.kind === "template_search" && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          <div>
            {item.attempt_count != null
              ? t("alphaFactory.pipeline.attempts", { count: item.attempt_count })
              : t("alphaFactory.card.notReported")}
            {item.latest_at && <> · {t("alphaFactory.pipeline.latestAt", { date: safeDateTime(item.latest_at) })}</>}
          </div>
          {failed ? (
            <ReasonLine
              code={item.latest_reason_code ?? "reason_not_recorded"}
              fallback={item.latest_reason}
              testId={`alpha-factory-item-reason-${item.id}`}
            />
          ) : (
            <div data-testid={`alpha-factory-item-reason-${item.id}`}>{t("alphaFactory.pipeline.searchCompleted")}</div>
          )}
        </div>
      )}

      <SecondaryId testId={`alpha-factory-item-id-${item.id}`}>
        {[item.demand_id ?? item.seed_id ?? item.id, item.persona_id, item.latest_run_id].filter(Boolean).join(" · ")}
      </SecondaryId>

      <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1.5 border-t border-border">
        {personaHref && <CardLink to={personaHref}>{t("alphaFactory.links.persona")}</CardLink>}
        <CardLink to={RESEARCH_ITEMS_HREF}>{t("alphaFactory.links.researchItem")}</CardLink>
      </div>
    </Card>
  );
}

function AdmissionCard({ c, col }: { c: AlphaFactoryAdmissionCard; col: AlphaFactoryColumn | "document_checked" }) {
  const t = useT();
  const nav = useNavigate();
  const strategyHref = c.strategy_id ? `/management/strategies/${encodeURIComponent(c.strategy_id)}` : null;
  const authorityHref = c.authority_task_id
    ? `/management/experiments/${encodeURIComponent(c.authority_task_id)}`
    : null;
  const experimentRunCount = Array.isArray(c.experiment_run_ids) ? c.experiment_run_ids.length : null;
  const notReported = (value: string | number | null | undefined): string =>
    value === null || value === undefined || value === "" ? t("alphaFactory.card.notReported") : String(value);

  const title =
    col === "replicated"
      ? t("alphaFactory.admission.passedTitle")
      : col === "document_checked"
        ? t("alphaFactory.admission.documentTitle")
        : t("alphaFactory.admission.attemptTitle", {
            status: c.queue_status
              ? t(`alphaFactory.queueStatus.${c.queue_status}`, { defaultValue: c.queue_status })
              : t("alphaFactory.queueStatus.not_queued"),
          });
  const docReason = col === "document_checked" ? documentCheckText(c.document_check_reason, t) : null;

  return (
    <Card
      data-testid={`alpha-factory-card-${c.id}`}
      className={`p-3 min-w-0 transition ${col === "replicated" && strategyHref ? "hover:border-accent cursor-pointer" : ""}`}
      onClick={() => {
        if (col === "replicated" && strategyHref) nav(strategyHref);
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className={`text-sm font-medium ${WRAP}`}>{title}</div>
          <SecondaryId>{notReported(c.strategy_id)}</SecondaryId>
          {c.strategy_spec_id && <SecondaryId>{c.strategy_spec_id}</SecondaryId>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {c.strategy_state?.trim().toLowerCase() === "retired" && (
            <Badge variant="outline" data-testid={`alpha-factory-card-retired-${c.id}`} className="text-xs">
              {t("alphaFactory.card.retired")}
            </Badge>
          )}
          {c.risk !== undefined &&
            (c.risk ? (
              <RiskBadge level={c.risk} />
            ) : (
              <span className="text-xs text-muted-foreground">{t("alphaFactory.card.notReported")}</span>
            ))}
        </div>
      </div>

      {docReason && (
        <div className="mt-1 text-xs" data-testid={`alpha-factory-document-reason-${c.id}`}>
          {docReason.text}
          {docReason.raw && <span className={`block text-muted-foreground text-mono ${WRAP}`}>{t("alphaFactory.rawCode", { code: docReason.raw })}</span>}
        </div>
      )}

      {col === "scaffolded" && (c.reason_code || c.last_error) && (
        <div className="mt-1" data-testid={`alpha-factory-card-last-error-${c.id}`}>
          <ReasonLine code={c.reason_code} fallback={c.last_error} testId={`alpha-factory-card-reason-${c.id}`} />
          {c.last_error && (
            <div className={`text-[11px] text-muted-foreground text-mono ${WRAP}`}>
              {t("alphaFactory.card.lastError")}: {c.last_error}
            </div>
          )}
        </div>
      )}

      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <div className="min-w-0">
          <dt className="text-muted-foreground">{t("alphaFactory.card.approvedAt")}</dt>
          <dd className={`text-mono ${WRAP}`}>{notReported(c.approved_at)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted-foreground">{t("alphaFactory.card.approver")}</dt>
          <dd className={`text-mono ${WRAP}`}>{notReported(c.approver)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted-foreground">{t("alphaFactory.card.attemptCount")}</dt>
          <dd className="text-mono">{notReported(c.attempt_count)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted-foreground">{t("alphaFactory.card.experimentRunCount")}</dt>
          <dd className="text-mono">{notReported(experimentRunCount)}</dd>
        </div>
        {c.replay_count !== undefined && (
          <div className="min-w-0">
            <dt className="text-muted-foreground">{t("alphaFactory.card.replayCount")}</dt>
            <dd className="text-mono">{notReported(c.replay_count)}</dd>
          </div>
        )}
        {c.last_replayed_at && (
          <div className="min-w-0">
            <dt className="text-muted-foreground">{t("alphaFactory.card.lastReplayedAt")}</dt>
            <dd className={`text-mono ${WRAP}`}>{c.last_replayed_at}</dd>
          </div>
        )}
        <div className="col-span-2 min-w-0">
          <dt className="text-muted-foreground">{t("alphaFactory.card.lastRevalidationAt")}</dt>
          <dd className={`text-mono ${WRAP}`}>{notReported(c.last_revalidation_at)}</dd>
        </div>
      </dl>

      {c.sharpe !== undefined && (
        <div className="mt-2 flex items-center gap-3 text-xs text-mono">
          <span>
            {t("table.sharpe")}{" "}
            {typeof c.sharpe === "number" && Number.isFinite(c.sharpe) ? (
              <strong>{c.sharpe.toFixed(2)}</strong>
            ) : (
              <span className="text-muted-foreground">{t("alphaFactory.card.notReported")}</span>
            )}
          </span>
        </div>
      )}

      {(() => {
        const discovery = normalizeDiscovery(c.discovery);
        return (
          <div className="mt-2 space-y-2 min-w-0" data-testid={`alpha-factory-discovery-${c.id}`} onClick={(e) => e.stopPropagation()}>
            <SampleMetricsPanel view={discovery} testId={`alpha-factory-metrics-${c.id}`} collapseWhenAbsent />
            <LineagePanel view={discovery} testId={`alpha-factory-lineage-${c.id}`} />
            <AttributionNote view={discovery} testId={`alpha-factory-attribution-${c.id}`} />
          </div>
        );
      })()}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 border-t border-border">
        {strategyHref && <CardLink to={strategyHref}>{t("alphaFactory.card.openStrategy")}</CardLink>}
        {authorityHref && c.authority_task_id && (
          <CardLink to={authorityHref}>
            <span className={WRAP}>{t("alphaFactory.card.openExperiment", { id: c.authority_task_id })}</span>
          </CardLink>
        )}
      </div>
    </Card>
  );
}

function LaneUnavailable({ read, testId }: { read: AlphaFactoryLaneRead; testId: string }) {
  const t = useT();
  if (read.status === "ok") return null;
  return (
    <Card data-testid={testId} className="p-3 text-xs border-status-warning/40 bg-status-warning/5 text-status-warning">
      <span className={WRAP}>{unavailableText(read.reason, t)}</span>
    </Card>
  );
}

function EmptyLane({ testId, children }: { testId: string; children: ReactNode }) {
  return (
    <Card data-testid={testId} className="p-3 text-xs text-muted-foreground">
      {children}
    </Card>
  );
}

export const AlphaFactoryBoardPage = () => {
  const t = useT();
  const nav = useNavigate();
  const live = useLiveStatus();
  const [envelope, setEnvelope] = useState<AlphaFactoryPipelineEnvelope | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    setError(null);

    alphaFactory
      .get(undefined, { signal: controller.signal })
      .then((res) => {
        if (cancelled) return;
        setEnvelope(res);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setEnvelope(null);
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [live.mode]);

  const meta = envelope?.meta;
  const surface = meta?.surfaces?.alpha_factory;
  const sourceKey = classifyAlphaFactorySource(live, meta, error);
  const isConfiguredMock = sourceKey === "mock";
  const isLiveData = sourceKey === "live";
  const surfaceStatus = surface?.status?.trim().toLowerCase();
  const isDegraded =
    !loading &&
    (Boolean(error) ||
      sourceKey === "degraded" ||
      sourceKey === "fallback" ||
      surfaceStatus === "unavailable" ||
      surfaceStatus === "degraded" ||
      surfaceStatus === "error" ||
      surfaceStatus === "failed");

  const buckets = useMemo(() => {
    return buildAlphaFactoryBuckets(envelope, {
      includeMockFixtures: isConfiguredMock,
      includeReplicated: isLiveData || isConfiguredMock,
    });
  }, [envelope, isConfiguredMock, isLiveData]);

  const measureFor = useMemo(() => {
    const byDemand = new Map(buckets.discovered.map((item) => [item.demand_id, item.short_measure]));
    return (demandId: string | null) => (demandId ? byDemand.get(demandId) ?? null : null);
  }, [buckets.discovered]);

  const degradedReason =
    error ||
    surface?.message ||
    (typeof surface?.reason === "string" ? surface.reason : undefined) ||
    surface?.status ||
    "unavailable";

  const laneCount = (col: AlphaFactoryColumn): number =>
    col === "discovered"
      ? buckets.discovered.length + buckets.discoveredCards.length
      : col === "scaffolded"
        ? buckets.searches.length + buckets.scaffolded.length
        : buckets.replicated.length;

  const renderLane = (col: AlphaFactoryColumn): ReactNode => {
    if (loading) return <Card className="p-3 text-xs text-muted-foreground">{t("ui.loading")}</Card>;

    if (col === "discovered") {
      const unavailable = buckets.reads.demands.status !== "ok";
      return (
        <>
          <LaneUnavailable read={buckets.reads.demands} testId="alpha-factory-unavailable-discovered" />
          {buckets.discovered.map((item) => (
            <PipelineItemCard key={item.id} item={item} measureFor={measureFor} />
          ))}
          {buckets.discoveredCards.map((c) => (
            <AdmissionCard key={c.id} c={c} col="discovered" />
          ))}
          {!unavailable && laneCount(col) === 0 && (
            <EmptyLane testId="alpha-factory-empty-discovered">{t("alphaFactory.empty.discovered")}</EmptyLane>
          )}
        </>
      );
    }

    if (col === "scaffolded") {
      const unavailable = buckets.reads.runs.status !== "ok";
      return (
        <>
          <LaneUnavailable read={buckets.reads.runs} testId="alpha-factory-unavailable-scaffolded" />
          {buckets.searches.map((item) => (
            <PipelineItemCard key={item.id} item={item} measureFor={measureFor} />
          ))}
          {buckets.scaffolded.map((c) => (
            <AdmissionCard key={c.id} c={c} col="scaffolded" />
          ))}
          {!unavailable && laneCount(col) === 0 && (
            <EmptyLane testId="alpha-factory-empty-scaffolded">{t("alphaFactory.empty.scaffolded")}</EmptyLane>
          )}
        </>
      );
    }

    // Passed: only an owner-recorded gate pass. When the runs read failed the BFF promotes
    // nothing, so "none passed" would be a guess — say the result is unavailable instead.
    const runsUnavailable = buckets.reads.runs.status !== "ok";
    return (
      <>
        {buckets.replicated.map((c) => (
          <AdmissionCard key={c.id} c={c} col="replicated" />
        ))}
        {buckets.replicated.length === 0 &&
          (runsUnavailable ? (
            <LaneUnavailable read={buckets.reads.runs} testId="alpha-factory-unavailable-replicated" />
          ) : (
            <EmptyLane testId="alpha-factory-empty-replicated">{t("alphaFactory.empty.replicated")}</EmptyLane>
          ))}
      </>
    );
  };

  return (
    <>
      <PageHeader
        title={t("nav.alphaFactory")}
        subtitle={t("alphaFactory.subtitle")}
        actions={
          <Button size="sm" variant="outline" onClick={() => nav("/management/strategies")}>
            {t("alphaFactory.openList")}
          </Button>
        }
      />
      {/* pb-24 keeps the last card clear of the floating assistant button (bottom-4, 48 px). */}
      <PageBody className="pb-24">
        <div
          data-testid="alpha-factory-source-banner"
          data-source-key={sourceKey}
          className="mb-3 rounded-md border border-status-warning/30 bg-status-warning/10 px-3 py-2 text-xs text-status-warning"
        >
          <span className="font-semibold">{t(`alphaFactory.source.${sourceKey}`)}</span>
          <span className="ml-2 text-foreground/70">{t("alphaFactory.source.explain")}</span>
        </div>

        {isDegraded ? (
          <Card
            role="alert"
            data-testid="alpha-factory-degraded-state"
            className="p-6 border-status-failed/40 bg-status-failed/5 text-sm space-y-1"
          >
            <div className="flex items-center gap-2 font-semibold text-status-failed">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{t("alphaFactory.unavailable.title")}</span>
            </div>
            <div className={`text-xs text-muted-foreground ${WRAP}`}>
              {t("alphaFactory.unavailable.description", { reason: degradedReason })}
            </div>
          </Card>
        ) : (
          <>
            {!loading && <StageCounts counts={buckets.counts} />}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" data-testid="alpha-factory-columns">
              {ALPHA_FACTORY_COLUMNS.map((col) => (
                <div key={col} className="space-y-3 min-w-0" data-testid={`alpha-factory-lane-${col}`}>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold">{t(`alphaFactory.col.${col}`)}</div>
                      <Badge variant="outline">{laneCount(col)}</Badge>
                    </div>
                    <p data-testid={`alpha-factory-${col}-caption`} className="text-xs text-muted-foreground">
                      {t(`alphaFactory.caption.${col}`)}
                    </p>
                  </div>
                  <div className="space-y-2">{renderLane(col)}</div>
                </div>
              ))}
            </div>

            {!loading && (
              <details className="mt-4 rounded-md border border-border" data-testid="alpha-factory-document-checked">
                <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium">
                  {t("alphaFactory.documentChecked.title", { count: buckets.documentChecked.length })}
                </summary>
                <div className="px-3 pb-3 space-y-2">
                  <p className="text-xs text-muted-foreground">{t("alphaFactory.documentChecked.explain")}</p>
                  {buckets.documentChecked.length === 0 ? (
                    <p className="text-xs text-muted-foreground" data-testid="alpha-factory-document-checked-empty">
                      {t("alphaFactory.documentChecked.empty")}
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
                      {buckets.documentChecked.map((c) => (
                        <AdmissionCard key={c.id} c={c} col="document_checked" />
                      ))}
                    </div>
                  )}
                </div>
              </details>
            )}
          </>
        )}
        <div className="mt-4 min-w-0">
          <TemplateEvaluationsPanel templates={envelope?.data.templates} testId="alpha-factory-templates" />
        </div>
      </PageBody>
    </>
  );
};
