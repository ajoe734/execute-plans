// Runs, Canaries, Watermarks and Freshness panel (SD-SRCM-04).

import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  Database,
  ExternalLink,
  Layers,
  Loader2,
  RefreshCcw,
  Shield,
  XCircle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ManagementTableScroll } from "@/management/components/ManagementTableScroll";
import {
  managementDataSourceReads,
  type ManagementDataSourceV2DTO,
  type SourceCanaryResult,
  type SourceObservation,
} from "@/lib/bff-v1/managementDataSources";
import {
  canaryTone,
  fmtToken,
  formatAgeSeconds,
  formatBytes,
  formatTime,
  healthStateTone,
  toneClass,
} from "./dataSourceModels";

export interface DataSourceRunsPanelProps {
  sources: ManagementDataSourceV2DTO[];
  onSelectSource?: (sourceId: string) => void;
}

export function DataSourceRunsPanel({ sources, onSelectSource }: DataSourceRunsPanelProps) {
  const { t } = useTranslation();
  const [selectedSourceId, setSelectedSourceId] = useState<string>(
    sources[0]?.source_instance_id || sources[0]?.connector_id || "",
  );
  const [runs, setRuns] = useState<{ observations: SourceObservation[]; canaries: SourceCanaryResult[] }>({
    observations: [],
    canaries: [],
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedSourceId && sources.length > 0) {
      setSelectedSourceId(sources[0].source_instance_id || sources[0].connector_id);
    }
  }, [sources, selectedSourceId]);

  const loadRuns = async () => {
    if (!selectedSourceId) return;
    setLoading(true);
    try {
      const res = await managementDataSourceReads.runs(selectedSourceId);
      setRuns(res);
    } catch {
      // Keep state on error
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedSourceId) {
      loadRuns();
    }
  }, [selectedSourceId]);

  const activeSource = sources.find(
    (s) => (s.source_instance_id || s.connector_id) === selectedSourceId,
  );

  return (
    <div className="space-y-6">
      {/* Selector & Actions Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-muted-foreground">
            {t("mgmt.dataSources.runs.selectSource")}:
          </span>
          <div className="flex gap-1.5 flex-wrap">
            {sources.map((s) => {
              const id = s.source_instance_id || s.connector_id;
              const isSelected = id === selectedSourceId;
              return (
                <Button
                  key={id}
                  size="sm"
                  variant={isSelected ? "default" : "outline"}
                  className="h-8 text-xs font-mono"
                  onClick={() => setSelectedSourceId(id)}
                >
                  {s.provider || id}
                </Button>
              );
            })}
          </div>
        </div>

        <Button size="sm" variant="outline" onClick={loadRuns} disabled={loading} className="h-8">
          <RefreshCcw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
          {t("mgmt.actions.refresh")}
        </Button>
      </div>

      {/* Freshness & Watermark Summary Cards */}
      {activeSource && (
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4 text-xs">
          <Card className="p-3">
            <span className="text-muted-foreground">{t("mgmt.dataSources.detail.watermark")}</span>
            <div className="mt-1 font-mono font-medium text-sm truncate">
              {activeSource.observed?.freshness?.watermark || "—"}
            </div>
          </Card>
          <Card className="p-3">
            <span className="text-muted-foreground">{t("mgmt.dataSources.detail.age")}</span>
            <div className="mt-1 font-mono font-medium text-sm">
              {formatAgeSeconds(activeSource.observed?.freshness?.age_seconds)}
            </div>
          </Card>
          <Card className="p-3">
            <span className="text-muted-foreground">{t("mgmt.dataSources.detail.freshnessSla")}</span>
            <div className="mt-1 font-mono font-medium text-sm">
              {activeSource.instance?.freshness_sla_seconds
                ? `${activeSource.instance.freshness_sla_seconds / 3600}h`
                : "—"}
            </div>
          </Card>
          <Card className="p-3">
            <span className="text-muted-foreground">{t("mgmt.dataSources.detail.health")}</span>
            <div className="mt-1 font-medium text-sm">
              <Badge variant="outline" className={healthStateTone(activeSource.observed?.health_state)}>
                {fmtToken(activeSource.observed?.health_state || "healthy")}
              </Badge>
            </div>
          </Card>
        </div>
      )}

      {/* Canaries Timeline */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <Activity className="h-4 w-4 text-primary" />
            {t("mgmt.dataSources.runs.boundedCanariesTitle")}
          </h3>
          <span className="text-xs text-muted-foreground">
            {t("mgmt.dataSources.runs.canaryReadOnlyNotice")}
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("mgmt.dataSources.runs.loadingRuns")}
          </div>
        ) : runs.canaries.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-xs">
            {t("mgmt.dataSources.runs.noCanariesFound")}
          </div>
        ) : (
          <div className="space-y-3">
            {runs.canaries.map((canary) => (
              <div
                key={canary.canary_id}
                className="p-3 rounded-lg border bg-card text-xs space-y-2"
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-foreground">
                      {canary.canary_id}
                    </span>
                    <Badge variant="outline" className={canaryTone(canary.status)}>
                      {canary.status}
                    </Badge>
                  </div>
                  <span className="font-mono text-muted-foreground text-[11px]">
                    {formatTime(canary.completed_at || canary.started_at)}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-muted-foreground font-mono">
                  <div>Rows Ingested: <span className="font-semibold text-foreground">{canary.row_count ?? 0}</span></div>
                  <div>Rejected: <span className="font-semibold text-foreground">{canary.rejected_count ?? 0}</span></div>
                  <div>License: <span className="text-foreground">{canary.license_scope || "—"}</span></div>
                  <div>Hosts: <span className="text-foreground">{(canary.allowed_hosts ?? []).join(", ") || "—"}</span></div>
                </div>

                {/* Stages Breadcrumb */}
                {canary.stages && canary.stages.length > 0 && (
                  <div className="pt-1.5 border-t">
                    <span className="text-[10px] text-muted-foreground block mb-1">
                      Stage Progression:
                    </span>
                    <div className="flex flex-wrap items-center gap-1 text-[10px] font-mono">
                      {canary.stages.map((stage, sIdx) => (
                        <React.Fragment key={stage.stage || sIdx}>
                          <span
                            className={`px-1.5 py-0.5 rounded ${
                              stage.status === "passed" || stage.status === "completed"
                                ? "bg-status-success/10 text-status-success"
                                : stage.status === "failed"
                                  ? "bg-status-failed/10 text-status-failed"
                                  : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {fmtToken(stage.stage)}
                          </span>
                          {sIdx < canary.stages!.length - 1 && (
                            <span className="text-muted-foreground">→</span>
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Observations / Ingest History Table */}
      <Card className="p-4 space-y-3">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <Clock className="h-4 w-4 text-primary" />
          {t("mgmt.dataSources.runs.observationHistoryTitle")}
        </h3>

        {loading ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("mgmt.dataSources.runs.loadingRuns")}
          </div>
        ) : runs.observations.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-xs">
            {t("mgmt.dataSources.runs.noObservationsFound")}
          </div>
        ) : (
          <ManagementTableScroll minScrollWidth={680}>
            <table className="w-full min-w-[680px] text-xs">
              <thead className="border-b border-border text-left uppercase text-muted-foreground">
                <tr>
                  <th className="py-2 px-3 font-medium">{t("mgmt.dataSources.detail.time")}</th>
                  <th className="py-2 px-3 font-medium">{t("mgmt.dataSources.detail.revision")}</th>
                  <th className="py-2 px-3 font-medium">{t("mgmt.dataSources.health")}</th>
                  <th className="py-2 px-3 font-medium">Reconciliation</th>
                  <th className="py-2 px-3 font-medium">{t("mgmt.dataSources.detail.watermark")}</th>
                  <th className="py-2 px-3 font-medium">Rows</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 font-mono">
                {runs.observations.map((obs, idx) => (
                  <tr key={idx} className="hover:bg-muted/30">
                    <td className="py-2 px-3">{formatTime(obs.observed_at)}</td>
                    <td className="py-2 px-3">r{obs.observed_revision}</td>
                    <td className="py-2 px-3 font-sans">
                      <Badge variant="outline" className={healthStateTone(obs.health_state)}>
                        {fmtToken(obs.health_state)}
                      </Badge>
                    </td>
                    <td className="py-2 px-3 font-sans">
                      <Badge variant="outline">
                        {fmtToken(obs.reconciliation_status)}
                      </Badge>
                    </td>
                    <td className="py-2 px-3 truncate max-w-[200px]">{obs.watermark || "—"}</td>
                    <td className="py-2 px-3 font-medium">{obs.row_count ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ManagementTableScroll>
        )}
      </Card>
    </div>
  );
}
