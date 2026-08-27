import React, { useEffect, useState } from "react";
import { Activity, Database, ShieldCheck } from "lucide-react";

import { Card } from "@/components/ui/card";
import {
  getAgoraOperationalReadiness,
  type AgoraOperationalReadiness,
  type AgoraOperationalReadinessSurface,
} from "@/lib/bff-v1/agora/operationalReadiness";
import { safeDateTime } from "@/lib/utils";

import { DataSourceControlCenter } from "./oversight/dataSources/DataSourceControlCenter";

type ReadinessLoadState = "loading" | "ready" | "unavailable";

const SURFACES_TO_SHOW = ["signals", "decision_events", "candidates"];

function ageLabel(ageSeconds: number | null, slaSeconds: number): string {
  if (ageSeconds === null) return "age not reported";
  if (ageSeconds < 60) return `${Math.round(ageSeconds)}s old of ${slaSeconds}s SLA`;
  if (ageSeconds < 3600) return `${Math.round(ageSeconds / 60)}m old of ${slaSeconds}s SLA`;
  return `${(ageSeconds / 3600).toFixed(1)}h old of ${slaSeconds}s SLA`;
}

function readinessExplanation(readiness: AgoraOperationalReadiness): string {
  switch (readiness.source.freshness) {
    case "stale":
      return "The active snapshot exceeded its source SLA. Dependent surfaces may be unavailable until a fresh snapshot arrives.";
    case "empty_fresh":
      return "The source is fresh but produced zero qualifying signals. This is a confirmed empty result, not an outage.";
    case "unavailable":
    case "not_configured":
      return "No active source snapshot can be confirmed. Use the downstream reason to identify the unavailable dependency.";
    case "degraded":
      return "The source or its producer is degraded. Downstream values should not be treated as fully current.";
    default:
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
      <p className="text-xs text-muted-foreground">{readinessExplanation(readiness)}</p>

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
            {source.freshness}
          </div>
          <div className="mt-1 text-muted-foreground">{ageLabel(source.age_seconds, source.sla_seconds)}</div>
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
