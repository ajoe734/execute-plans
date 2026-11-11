// AlphaFactoryBoard — Spec Part 3 §6.8.
// Discovered / Scaffolded / Replicated three-column kanban backed by GET /bff/alpha-factory.
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useLiveStatus } from "@/lib/bff-v1";
import { alphaFactory, type AlphaFactoryCard, type AlphaFactoryEnvelope } from "@/lib/bff-v1/alphaFactory";
import { SampleMetricsPanel, LineagePanel, AttributionNote, TemplateEvaluationsPanel } from "@/management/components/discovery/DiscoveryPanels";
import { normalizeDiscovery } from "@/lib/bff-v1/discovery";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { RiskBadge } from "@/platform/components/RiskBadge";
import { useT } from "@/platform/hooks";
import {
  ALPHA_FACTORY_COLUMNS,
  buildAlphaFactoryBuckets,
  classifyAlphaFactorySource,
  type AlphaFactoryColumn,
} from "./alphaFactoryData";

export const AlphaFactoryBoardPage = () => {
  const t = useT();
  const nav = useNavigate();
  const live = useLiveStatus();
  const [envelope, setEnvelope] = useState<AlphaFactoryEnvelope | null>(null);
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

  const degradedReason =
    error ||
    surface?.message ||
    (typeof surface?.reason === "string" ? surface.reason : undefined) ||
    surface?.status ||
    "unavailable";

  const renderEmptyText = (col: AlphaFactoryColumn): string => {
    if (col === "discovered" && buckets.discoveredReason === "no_candidate_source") {
      return t("alphaFactory.empty.noCandidateSource");
    }
    return t(`alphaFactory.empty.${col}`);
  };

  const renderValueOrNotReported = (value: string | number | null | undefined): string => {
    if (value === null || value === undefined || value === "") {
      return t("alphaFactory.card.notReported");
    }
    return String(value);
  };

  const renderCard = (c: AlphaFactoryCard, col: AlphaFactoryColumn) => {
    const strategyHref = c.strategy_id
      ? `/management/strategies/${encodeURIComponent(c.strategy_id)}`
      : null;
    const authorityHref = c.authority_task_id
      ? `/management/experiments/${encodeURIComponent(c.authority_task_id)}`
      : null;
    const experimentRunCount = Array.isArray(c.experiment_run_ids)
      ? c.experiment_run_ids.length
      : null;

    return (
      <Card
        key={c.id}
        data-testid={`alpha-factory-card-${c.id}`}
        className="p-3 hover:border-accent transition cursor-pointer"
        onClick={() => {
          if (col === "replicated" && strategyHref) {
            nav(strategyHref);
          }
        }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-medium truncate text-mono">
              {renderValueOrNotReported(c.strategy_id)}
            </div>
            {c.strategy_spec_id && (
              <div className="text-xs text-muted-foreground text-mono mt-0.5 truncate">
                {c.strategy_spec_id}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {c.strategy_state?.trim().toLowerCase() === "retired" && (
              <Badge
                variant="outline"
                data-testid={`alpha-factory-card-retired-${c.id}`}
                className="text-xs"
              >
                {t("alphaFactory.card.retired")}
              </Badge>
            )}
            {c.risk !== undefined && (
              c.risk ? (
                <RiskBadge level={c.risk} />
              ) : (
                <span className="text-xs text-muted-foreground">{t("alphaFactory.card.notReported")}</span>
              )
            )}
          </div>
        </div>

        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          <div>
            <dt className="text-muted-foreground">{t("alphaFactory.card.strategyId")}</dt>
            <dd className="text-mono truncate">{renderValueOrNotReported(c.strategy_id)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("alphaFactory.card.queueStatus")}</dt>
            <dd className="text-mono">{renderValueOrNotReported(c.queue_status)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("alphaFactory.card.approver")}</dt>
            <dd className="text-mono truncate">{renderValueOrNotReported(c.approver)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("alphaFactory.card.approvedAt")}</dt>
            <dd className="text-mono truncate">{renderValueOrNotReported(c.approved_at)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("alphaFactory.card.attemptCount")}</dt>
            <dd className="text-mono">{renderValueOrNotReported(c.attempt_count)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("alphaFactory.card.experimentRunCount")}</dt>
            <dd className="text-mono">{renderValueOrNotReported(experimentRunCount)}</dd>
          </div>
          {c.replay_count !== undefined && (
            <div>
              <dt className="text-muted-foreground">{t("alphaFactory.card.replayCount")}</dt>
              <dd className="text-mono">{renderValueOrNotReported(c.replay_count)}</dd>
            </div>
          )}
          {c.last_replayed_at && (
            <div>
              <dt className="text-muted-foreground">{t("alphaFactory.card.lastReplayedAt")}</dt>
              <dd className="text-mono truncate">{c.last_replayed_at}</dd>
            </div>
          )}
          <div className="col-span-2">
            <dt className="text-muted-foreground">{t("alphaFactory.card.lastRevalidationAt")}</dt>
            <dd className="text-mono truncate">{renderValueOrNotReported(c.last_revalidation_at)}</dd>
          </div>
          {c.last_error && (
            <div className="col-span-2" data-testid={`alpha-factory-card-last-error-${c.id}`}>
              <dt className="text-muted-foreground">{t("alphaFactory.card.lastError")}</dt>
              <dd className="text-mono text-status-failed break-words">{c.last_error}</dd>
            </div>
          )}
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
            <div className="mt-2 space-y-2" data-testid={`alpha-factory-discovery-${c.id}`} onClick={(e) => e.stopPropagation()}>
              <SampleMetricsPanel view={discovery} testId={`alpha-factory-metrics-${c.id}`} collapseWhenAbsent />
              <LineagePanel view={discovery} testId={`alpha-factory-lineage-${c.id}`} />
              <AttributionNote view={discovery} testId={`alpha-factory-attribution-${c.id}`} />
            </div>
          );
        })()}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border">
          {strategyHref && (
            <Link
              to={strategyHref}
              onClick={(e) => e.stopPropagation()}
              className="text-xs text-primary hover:underline inline-flex items-center gap-1"
            >
              {t("alphaFactory.card.openStrategy")} <ArrowRight className="h-3 w-3" />
            </Link>
          )}
          {authorityHref && c.authority_task_id && (
            <Link
              to={authorityHref}
              onClick={(e) => e.stopPropagation()}
              className="text-xs text-primary hover:underline inline-flex items-center gap-1 text-mono"
            >
              {t("alphaFactory.card.openExperiment", { id: c.authority_task_id })}{" "}
              <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </div>
      </Card>
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
      <PageBody>
        <div
          data-testid="alpha-factory-source-banner"
          data-source-key={sourceKey}
          className="mb-4 rounded-md border border-status-warning/30 bg-status-warning/10 px-3 py-2 text-xs text-status-warning"
        >
          <span className="font-semibold text-mono uppercase tracking-wider">
            {t(`alphaFactory.source.${sourceKey}`)}
          </span>
          <span className="ml-2 text-mono">
            {t("alphaFactory.source.surface", {
              surface: "alpha_factory",
              status: surface?.status ?? (error ? "unavailable" : sourceKey),
              source: surface?.source ?? (error ? "transport_error" : isConfiguredMock ? "mock_seed" : "research_orchestrator"),
            })}
          </span>
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
            <div className="text-xs text-muted-foreground">
              {t("alphaFactory.unavailable.description", { reason: degradedReason })}
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" data-testid="alpha-factory-columns">
            {ALPHA_FACTORY_COLUMNS.map((col) => (
              <div key={col} className="space-y-3" data-testid={`alpha-factory-lane-${col}`}>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold uppercase tracking-wider">
                      {t(`alphaFactory.col.${col}`)}
                    </div>
                    <Badge variant="outline">{buckets[col].length}</Badge>
                  </div>
                  {col === "replicated" && (
                    <p
                      data-testid="alpha-factory-replicated-caption"
                      className="text-xs text-muted-foreground"
                    >
                      {t("alphaFactory.replicatedCaption")}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  {loading ? (
                    <Card className="p-3 text-xs text-muted-foreground">{t("ui.loading")}</Card>
                  ) : buckets[col].length === 0 ? (
                    <Card
                      data-testid={`alpha-factory-empty-${col}`}
                      className="p-3 text-xs text-muted-foreground"
                    >
                      {renderEmptyText(col)}
                    </Card>
                  ) : (
                    buckets[col].map((c) => renderCard(c, col))
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-4">
          <TemplateEvaluationsPanel templates={envelope?.data.templates} testId="alpha-factory-templates" />
        </div>
      </PageBody>
    </>
  );
};
