import React, { useEffect, useState } from "react";
import { Activity, Database, ShieldCheck } from "lucide-react";

import { Card } from "@/components/ui/card";
import {
  getAgoraOperationalReadiness,
  type AgoraFreshness,
  type AgoraOperationalReadiness,
  type AgoraOperationalReadinessSurface,
} from "@/lib/bff-v1/agora/operationalReadiness";
import { safeDateTime } from "@/lib/utils";

import { DataSourceControlCenter } from "./oversight/dataSources/DataSourceControlCenter";

type ReadinessLoadState = "loading" | "ready" | "unavailable";

const SURFACES_TO_SHOW = ["signals", "decision_events", "candidates"];

const GENERIC_FRESHNESS_REASONS = new Set([
  "",
  "ok",
  "healthy",
  "fresh",
  "stale",
  "nan",
  "null",
  "undefined",
]);

const SESSION_FRESH_REASON_RE =
  /session|holiday|weekend|calendar|non[\s_-]*trading|market[\s_-]*close|carry/i;

export type DataSourceFreshnessInput = {
  age_seconds?: number | null;
  ageSeconds?: number | null;
  sla_seconds?: number | null;
  slaSeconds?: number | null;
  freshness?: AgoraFreshness | string | null;
  freshness_status?: AgoraFreshness | string | null;
  freshnessStatus?: AgoraFreshness | string | null;
  freshness_reason?: string | null;
  freshnessReason?: string | null;
  reason?: string | null;
  calendar_reason?: string | null;
};

export function formatDuration(seconds: number | null | undefined): string | null {
  if (
    seconds === null ||
    seconds === undefined ||
    typeof seconds !== "number" ||
    !Number.isFinite(seconds) ||
    seconds < 0
  ) {
    return null;
  }
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) {
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    return "1h";
  }
  const hours = (seconds / 3600).toFixed(1).replace(/\.0$/, "");
  return `${hours}h`;
}

function cleanFreshnessReason(rawReason?: string | null): string | null {
  if (typeof rawReason !== "string") return null;
  const trimmed = rawReason.trim();
  if (!trimmed || GENERIC_FRESHNESS_REASONS.has(trimmed.toLowerCase())) {
    return null;
  }
  return trimmed.replace(/_/g, " ");
}

function resolveFreshnessDetails(input: DataSourceFreshnessInput) {
  const rawAge = input.age_seconds ?? input.ageSeconds ?? null;
  const ageSeconds =
    typeof rawAge === "number" && Number.isFinite(rawAge) && rawAge >= 0
      ? rawAge
      : null;
  const rawSla = input.sla_seconds ?? input.slaSeconds ?? null;
  const slaSeconds =
    typeof rawSla === "number" && Number.isFinite(rawSla) && rawSla > 0
      ? rawSla
      : null;
  const rawFreshness =
    input.freshness ?? input.freshness_status ?? input.freshnessStatus ?? null;
  const freshness =
    typeof rawFreshness === "string" && rawFreshness.trim()
      ? rawFreshness.trim().toLowerCase()
      : null;
  const reason = cleanFreshnessReason(
    input.freshness_reason ??
      input.freshnessReason ??
      input.calendar_reason ??
      input.reason ??
      null,
  );
  const ageText = formatDuration(ageSeconds);
  const slaText = formatDuration(slaSeconds);
  const exceedsNominalSla =
    ageSeconds !== null && slaSeconds !== null && ageSeconds > slaSeconds;
  const isFreshStatus = freshness === "fresh" || freshness === "empty_fresh";
  const hasSessionReason = Boolean(reason && SESSION_FRESH_REASON_RE.test(reason));
  const isSessionAwareFresh =
    isFreshStatus && (exceedsNominalSla || hasSessionReason);

  return {
    ageSeconds,
    slaSeconds,
    freshness,
    reason,
    ageText,
    slaText,
    exceedsNominalSla,
    isSessionAwareFresh,
  };
}

export function formatAgeVsSla(
  ageOrSource: number | null | undefined | DataSourceFreshnessInput,
  slaSeconds?: number | null,
  freshnessOrOptions?: AgoraFreshness | string | DataSourceFreshnessInput | null,
  freshnessReason?: string | null,
): string {
  let input: DataSourceFreshnessInput;
  if (typeof ageOrSource === "number" || ageOrSource === null || ageOrSource === undefined) {
    const numericAge: number | null = typeof ageOrSource === "number" ? ageOrSource : null;
    if (typeof freshnessOrOptions === "string" || freshnessOrOptions === null || freshnessOrOptions === undefined) {
      const stringFreshness: string | null =
        typeof freshnessOrOptions === "string" ? freshnessOrOptions : null;
      input = {
        age_seconds: numericAge,
        sla_seconds: slaSeconds ?? null,
        freshness: stringFreshness,
        freshness_reason: freshnessReason ?? null,
      };
    } else {
      input = {
        ...freshnessOrOptions,
        age_seconds: numericAge,
        sla_seconds: slaSeconds ?? freshnessOrOptions.sla_seconds ?? null,
      };
    }
  } else {
    input = ageOrSource;
  }

  const {
    ageText,
    slaText,
    freshness,
    reason,
    exceedsNominalSla,
    isSessionAwareFresh,
  } = resolveFreshnessDetails(input);

  if (ageText === null) return "age not reported";

  if (isSessionAwareFresh) {
    const reasonSuffix = reason ? ` · ${reason}` : "";
    if (slaText) {
      return `${ageText} wall-clock age · session-fresh across non-trading session/holiday (${slaText} trading-day SLA${reasonSuffix})`;
    }
    return `${ageText} wall-clock age · session-fresh across non-trading session/holiday${reasonSuffix}`;
  }

  if (freshness === "stale" && exceedsNominalSla && slaText) {
    return `${ageText} old of ${slaText} SLA (exceeded)`;
  }

  return slaText ? `${ageText} old of ${slaText} SLA` : `${ageText} old`;
}

export const ageLabel = formatAgeVsSla;

export function readinessExplanation(readiness: AgoraOperationalReadiness): string {
  const sourceInput = readiness.source as DataSourceFreshnessInput;
  const { freshness, ageText, slaText, reason, isSessionAwareFresh } =
    resolveFreshnessDetails(sourceInput);

  switch (freshness) {
    case "stale":
      return "The active snapshot exceeded its source SLA. Dependent surfaces may be unavailable until a fresh snapshot arrives.";
    case "empty_fresh":
      if (isSessionAwareFresh) {
        return `The source remains session-fresh from the latest market close (${ageText ?? "reported"} wall-clock age across a non-trading session or holiday against the ${slaText ?? "nominal"} trading-day SLA) and produced zero qualifying signals. This is a confirmed empty result, not an outage.`;
      }
      return "The source is fresh but produced zero qualifying signals. This is a confirmed empty result, not an outage.";
    case "unavailable":
    case "not_configured":
      return "No active source snapshot can be confirmed. Use the downstream reason to identify the unavailable dependency.";
    case "degraded":
      return "The source or its producer is degraded. Downstream values should not be treated as fully current.";
    default:
      if (isSessionAwareFresh) {
        const reasonClause = reason ? ` (${reason})` : "";
        return `The active source snapshot remains session-fresh from the latest market close${reasonClause}. Its ${ageText ?? "reported"} wall-clock age exceeds the nominal ${slaText ?? "24h"} trading-day SLA because the market session or holiday calendar is closed.`;
      }
      return "The active source snapshot and its dependent producer were read from the operational readiness projection.";
  }
}

function surfaceLabel(name: string): string {
  return name.replace(/_/g, " ");
}

function SurfaceReadiness({ name, surface }: { name: string; surface?: AgoraOperationalReadinessSurface }) {
  if (!surface) return null;
  return (
    <li data-testid={`data-source-readiness-surface-${name}`} className="rounded border border-border/70 bg-background/50 px-2 py-1.5">
      <span className="font-medium capitalize">{surfaceLabel(name)}</span>
      <span className="ml-1 text-muted-foreground">{surface.status} · {surface.count} items</span>
      {surface.reason ? <span className="ml-1 text-muted-foreground">· {surface.reason}</span> : null}
    </li>
  );
}

function DataSourcesOperationalReadiness() {
  const [state, setState] = useState<ReadinessLoadState>("loading");
  const [readiness, setReadiness] = useState<AgoraOperationalReadiness | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAgoraOperationalReadiness()
      .then((next) => {
        if (cancelled) return;
        setReadiness(next);
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("unavailable");
      });
    return () => { cancelled = true; };
  }, []);

  if (state === "loading") {
    return (
      <Card className="p-4 text-sm text-muted-foreground" data-testid="data-sources-operational-readiness-loading">
        Loading the read-only Agora source readiness projection…
      </Card>
    );
  }

  if (state === "unavailable" || !readiness) {
    return (
      <Card className="border-status-warning/40 bg-status-warning/5 p-4 text-sm" data-testid="data-sources-operational-readiness-unavailable">
        <div className="flex items-center gap-2 font-semibold text-foreground">
          <Activity className="h-4 w-4 text-status-warning" />
          Agora operational readiness unavailable
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          The read-only BFF projection did not return source, producer, or downstream truth. No source state is inferred from this failure.
        </p>
      </Card>
    );
  }

  const source = readiness.source;
  const sourceInput = source as DataSourceFreshnessInput;
  const sourceFreshness =
    source.freshness ?? sourceInput.freshness_status ?? "unavailable";
  const producer = readiness.signal_producer;
  return (
    <Card
      className="space-y-3 border-primary/25 bg-primary/5 p-4"
      data-readiness-status={readiness.status}
      data-testid="data-sources-operational-readiness"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-semibold text-foreground">
          <Database className="h-4 w-4 text-primary" />
          Agora source readiness
        </div>
        <span className="rounded-full border border-primary/30 bg-background px-2 py-0.5 text-xs font-medium uppercase text-foreground">
          {readiness.status}
        </span>
      </div>
      <p className="text-xs text-muted-foreground" data-testid="data-source-readiness-explanation">
        {readinessExplanation(readiness)}
      </p>

      <div className="grid gap-3 text-xs md:grid-cols-2 xl:grid-cols-4">
        <div>
          <div className="text-muted-foreground">Active source snapshot</div>
          <div className="mt-0.5 break-all font-medium text-foreground" data-testid="data-source-readiness-snapshot">
            {source.snapshot_id ?? "not reported"}
          </div>
          <div className="mt-1 text-muted-foreground" data-testid="data-source-readiness-instance">
            {source.source_instance_id ?? "source instance not reported"}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground">Freshness</div>
          <div className="mt-0.5 font-medium text-foreground" data-testid="data-source-readiness-freshness">
            {sourceFreshness}
          </div>
          <div className="mt-1 text-muted-foreground" data-testid="data-source-readiness-age">
            {formatAgeVsSla(sourceInput)}
          </div>
          <div className="mt-1 text-muted-foreground">{safeDateTime(source.source_timestamp)}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Dependent producer</div>
          <div className="mt-0.5 break-all font-medium text-foreground" data-testid="data-source-readiness-producer">
            {producer.producer_id}
          </div>
          <div className="mt-1 break-all text-muted-foreground">{producer.active_binding ?? "active binding not reported"}</div>
          <div className="mt-1 break-all text-muted-foreground">Consumes {producer.consumed_snapshot_id ?? "no snapshot reported"}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Projection boundary</div>
          <div className="mt-0.5 flex items-center gap-1 font-medium text-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-status-success" />
            Read-only operational read
          </div>
          <div className="mt-1 text-muted-foreground">No data-source, capital, or order mutation is exposed here.</div>
        </div>
      </div>

      <ul className="grid gap-2 text-xs lg:grid-cols-3">
        {SURFACES_TO_SHOW.map((name) => (
          <SurfaceReadiness key={name} name={name} surface={readiness.surfaces[name]} />
        ))}
      </ul>
    </Card>
  );
}

/** The canonical /management/data-sources page, with Agora snapshot provenance above the control center. */
export function DataSourcesPage() {
  return (
    <div>
      <div className="px-6 pt-6">
        <DataSourcesOperationalReadiness />
      </div>
      <DataSourceControlCenter />
    </div>
  );
}

export default DataSourcesPage;
