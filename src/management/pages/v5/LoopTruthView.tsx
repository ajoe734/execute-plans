import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ShieldCheck,
  AlertTriangle,
  Info,
  Layers,
  Activity,
  FileText,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ChevronDown,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import type { LoopHealthEntryDTO, TruthSourceInfo } from "@/lib/bff-v1/loopTruthTypes";

interface LoopTruthViewProps {
  loops: LoopHealthEntryDTO[];
  loading?: boolean;
  onRefresh?: () => void;
}

export const truthLevelBadgeTone: Record<string, string> = {
  proven_live_evidence: "bg-status-success/15 text-status-success border-status-success/30",
  reconciled_live_proof: "bg-status-success/15 text-status-success border-status-success/30",
  scheduled_tick: "bg-accent/15 text-accent border-accent/30",
  registry_metadata: "bg-muted text-muted-foreground border-border",
  snapshot_fallback: "bg-status-warning/15 text-status-warning border-status-warning/30",
  seed_fixture: "bg-status-failed/15 text-status-failed border-status-failed/30",
};

export const truthLevelLabels: Record<string, string> = {
  proven_live_evidence: "Proven Live Evidence",
  reconciled_live_proof: "Reconciled Live Proof",
  scheduled_tick: "Scheduled Tick",
  registry_metadata: "Registry Metadata",
  snapshot_fallback: "Snapshot Fallback",
  seed_fixture: "Seed / Fixture",
};

export const LoopTruthView: React.FC<LoopTruthViewProps> = ({
  loops,
  loading = false,
  onRefresh,
}) => {
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState<string>("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = loops.filter((l) => {
    if (search) {
      const q = search.toLowerCase();
      const matchName = (l.name || l.loop_id).toLowerCase().includes(q);
      const matchId = l.loop_id.toLowerCase().includes(q);
      if (!matchName && !matchId) return false;
    }
    if (filter === "live") {
      return l.operator_truth_source?.accepted_as_live === true;
    }
    if (filter === "degraded") {
      return l.operator_truth_source?.degraded === true;
    }
    if (filter === "canonical") {
      return l.classification === "canonical";
    }
    if (filter === "composite") {
      return l.classification === "composite_overlay";
    }
    return true;
  });

  const liveCount = loops.filter((l) => l.operator_truth_source?.accepted_as_live).length;
  const degradedCount = loops.filter((l) => l.operator_truth_source?.degraded).length;

  return (
    <div className="space-y-4">
      {/* Overview Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-3">
          <div className="text-xs text-muted-foreground font-medium">Total Loops</div>
          <div className="text-2xl font-bold mt-1">{loops.length}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">12 canonical catalog loops</div>
        </Card>

        <Card className="p-3">
          <div className="text-xs text-muted-foreground font-medium">Live Proven Loops</div>
          <div className="text-2xl font-bold mt-1 text-status-success">{liveCount}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">Reconciled with live evidence</div>
        </Card>

        <Card className="p-3">
          <div className="text-xs text-muted-foreground font-medium">Degraded / Unobserved</div>
          <div className="text-2xl font-bold mt-1 text-status-warning">{degradedCount}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">Static metadata or missing controller</div>
        </Card>

        <Card className="p-3">
          <div className="text-xs text-muted-foreground font-medium">BFF Truth Contract</div>
          <div className="text-sm font-semibold mt-1 flex items-center gap-1.5 text-accent">
            <ShieldCheck className="h-4 w-4" />
            Strict Live-BFF Grounding
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">Seed/fixture visually distinguished</div>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/20 p-2.5 rounded-lg border border-border">
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            size="sm"
            variant={filter === "all" ? "default" : "outline"}
            className="h-7 text-xs px-2.5"
            onClick={() => setFilter("all")}
          >
            All ({loops.length})
          </Button>
          <Button
            size="sm"
            variant={filter === "live" ? "default" : "outline"}
            className="h-7 text-xs px-2.5"
            onClick={() => setFilter("live")}
          >
            Live Proven ({liveCount})
          </Button>
          <Button
            size="sm"
            variant={filter === "degraded" ? "default" : "outline"}
            className="h-7 text-xs px-2.5"
            onClick={() => setFilter("degraded")}
          >
            Degraded / Non-Live ({degradedCount})
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Search loop id or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 text-xs px-2.5 py-1 rounded border border-border bg-background w-48 sm:w-64 focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {onRefresh && (
            <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={onRefresh} disabled={loading}>
              Refresh
            </Button>
          )}
        </div>
      </div>

      {/* Loop Cards / Table */}
      <div className="space-y-2.5">
        {filtered.map((loop) => {
          const isExpanded = expandedId === loop.loop_id;
          const opTruth = loop.operator_truth_source;
          const isLive = opTruth?.accepted_as_live ?? false;
          const truthLevel = opTruth?.truth_level ?? "registry_metadata";

          return (
            <Card
              key={loop.loop_id}
              className={`p-3.5 border transition-all ${
                isLive ? "border-status-success/30 bg-status-success/5" : "border-border hover:border-border/80"
              }`}
            >
              {/* Card Header */}
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{loop.name || loop.loop_id}</span>
                    <code className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      {loop.loop_id}
                    </code>
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {loop.classification}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-3">
                    <span>Maturity: <strong className="text-foreground">{loop.current_maturity}</strong> (Target: {loop.target_maturity})</span>
                    {loop.controller?.controller_name && (
                      <span>Controller: <code className="text-foreground">{loop.controller.controller_name}</code></span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={truthLevelBadgeTone[truthLevel] || "bg-muted"}>
                    {truthLevelLabels[truthLevel] || truthLevel}
                  </Badge>

                  {isLive ? (
                    <Badge className="bg-status-success text-status-success-foreground hover:bg-status-success/90 text-xs gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Live Proven
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-status-warning/10 text-status-warning border-status-warning/30 text-xs gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Degraded / Static
                    </Badge>
                  )}

                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={() => setExpandedId(isExpanded ? null : loop.loop_id)}
                  >
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  </Button>
                </div>
              </div>

              {/* Degraded Note if any */}
              {opTruth?.degraded_reason && !isLive && (
                <div className="mt-2.5 text-xs bg-status-warning/10 border border-status-warning/20 text-status-warning p-2 rounded flex items-start gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>{opTruth.degraded_reason}</span>
                </div>
              )}

              {/* Expanded Truth Breakdown */}
              {isExpanded && (
                <div className="mt-4 pt-3 border-t border-border space-y-3 text-xs">
                  <div className="grid gap-3 sm:grid-cols-2">
                    {/* Desired & Controller State */}
                    <div className="bg-muted/30 p-2.5 rounded border border-border space-y-1.5">
                      <div className="font-semibold text-foreground flex items-center gap-1.5">
                        <Layers className="h-3.5 w-3.5 text-primary" />
                        Desired & Controller State
                      </div>
                      <div>
                        <span className="text-muted-foreground">Desired State Query: </span>
                        <code>{loop.controller?.desired_state_query || "N/A"}</code>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Actual State Query: </span>
                        <code>{loop.controller?.actual_state_query || "N/A"}</code>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Restart Behavior: </span>
                        <span>{loop.controller?.restart_behavior || "N/A"}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Liveness Metric: </span>
                        <code>{loop.controller?.liveness_metric || "N/A"}</code>
                      </div>
                    </div>

                    {/* Controller Health & Freshness */}
                    <div className="bg-muted/30 p-2.5 rounded border border-border space-y-1.5">
                      <div className="font-semibold text-foreground flex items-center gap-1.5">
                        <Activity className="h-3.5 w-3.5 text-primary" />
                        Controller Runtime Health
                      </div>
                      <div>
                        <span className="text-muted-foreground">Health Status: </span>
                        <strong className="capitalize">{loop.controller_health?.status || "unobserved"}</strong>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Source: </span>
                        <span>{loop.controller_health?.source || "N/A"}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Evidence Basis: </span>
                        <span>{loop.controller_health?.evidence_basis || "N/A"}</span>
                      </div>
                      {loop.controller_health?.freshness?.last_heartbeat_at && (
                        <div>
                          <span className="text-muted-foreground">Last Heartbeat: </span>
                          <span>{loop.controller_health.freshness.last_heartbeat_at}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 5-Level Truth Ladder Breakdown */}
                  {loop.truth_sources && loop.truth_sources.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="font-semibold text-foreground flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5 text-primary" />
                        Truth Provenance Ladder
                      </div>
                      <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                        {loop.truth_sources.map((ts) => (
                          <div
                            key={ts.truth_level}
                            className={`p-2 rounded border text-[11px] space-y-1 ${
                              ts.accepted_as_live
                                ? "bg-status-success/10 border-status-success/30 text-foreground"
                                : ts.status === "present"
                                ? "bg-muted/40 border-border text-foreground"
                                : "bg-muted/10 border-border/50 text-muted-foreground"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-semibold">{ts.label}</span>
                              <Badge
                                variant="outline"
                                className={`text-[9px] px-1 py-0 ${
                                  ts.status === "present" ? "border-primary/40 text-primary" : "opacity-60"
                                }`}
                              >
                                {ts.status}
                              </Badge>
                            </div>
                            <p className="text-[10px] text-muted-foreground line-clamp-2">{ts.operator_note || ts.description}</p>
                            {ts.refs && ts.refs.length > 0 && (
                              <div className="truncate text-[10px] text-muted-foreground pt-0.5">
                                Refs: {ts.refs.join(", ")}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}

        {filtered.length === 0 && (
          <div className="p-8 text-center border border-dashed rounded-lg text-muted-foreground">
            No twelve loop records match the current filter.
          </div>
        )}
      </div>
    </div>
  );
};
