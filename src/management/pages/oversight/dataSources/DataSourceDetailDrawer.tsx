// Data source detail drawer with desired vs observed inspection, config, schedule, runs and receipts (SD-SRCM-04).

import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Database,
  ExternalLink,
  FileText,
  KeyRound,
  Layers,
  RefreshCcw,
  Shield,
  X,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ManagementTableScroll } from "@/management/components/ManagementTableScroll";
import {
  managementDataSourceReads,
  type ManagementDataSourceV2DTO,
  type SourceCanaryResult,
  type SourceCommandReceipt,
  type SourceObservation,
} from "@/lib/bff-v1/managementDataSources";
import { realWritesEnabled } from "@/lib/bff-v1/liveTransport";
import {
  canaryTone,
  credentialTone,
  fmtToken,
  formatAgeSeconds,
  formatBytes,
  formatTime,
  hasDivergence,
  healthStateTone,
  joinOrDash,
  lifecycleTone,
  reconciliationTone,
  receiptStatusTone,
  toneClass,
} from "./dataSourceModels";
import {
  DATA_SOURCE_ACTIONS,
  isActionAllowed,
  type DataSourceActionKey,
} from "./dataSourceActions";
import { DataSourceCommandDialog } from "./DataSourceCommandDialog";

export interface DataSourceDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceInstanceId: string | null;
  initialSource?: ManagementDataSourceV2DTO | null;
  onSourceUpdated?: () => void;
}

export function DataSourceDetailDrawer({
  open,
  onOpenChange,
  sourceInstanceId,
  initialSource,
  onSourceUpdated,
}: DataSourceDetailDrawerProps) {
  const { t } = useTranslation();
  const [source, setSource] = useState<ManagementDataSourceV2DTO | null>(initialSource ?? null);
  const [loading, setLoading] = useState(false);
  const [runs, setRuns] = useState<{ observations: SourceObservation[]; canaries: SourceCanaryResult[] }>({
    observations: [],
    canaries: [],
  });
  const [receipts, setReceipts] = useState<SourceCommandReceipt[]>([]);
  const [activeTab, setActiveTab] = useState("overview");

  const [activeCommand, setActiveCommand] = useState<DataSourceActionKey | null>(null);
  const [commandDialogOpen, setCommandDialogOpen] = useState(false);

  useEffect(() => {
    if (initialSource && (!sourceInstanceId || initialSource.source_instance_id === sourceInstanceId)) {
      setSource(initialSource);
    }
  }, [initialSource, sourceInstanceId]);

  const loadData = React.useCallback(async () => {
    if (!sourceInstanceId) return;
    setLoading(true);
    try {
      const [detailRes, runsRes, receiptsRes] = await Promise.allSettled([
        managementDataSourceReads.detail(sourceInstanceId),
        managementDataSourceReads.runs(sourceInstanceId),
        managementDataSourceReads.receipts(sourceInstanceId),
      ]);

      if (detailRes.status === "fulfilled" && detailRes.value.data) {
        setSource(detailRes.value.data);
      }
      if (runsRes.status === "fulfilled") {
        setRuns(runsRes.value);
      }
      if (receiptsRes.status === "fulfilled") {
        setReceipts(receiptsRes.value.receipts);
      }
    } catch {
      // Keep existing state if failed
    } finally {
      setLoading(false);
    }
  }, [sourceInstanceId]);

  useEffect(() => {
    if (open && sourceInstanceId) {
      loadData();
    }
  }, [open, sourceInstanceId, loadData]);

  if (!source && !loading) return null;

  const currentSource = source!;
  const divergence = currentSource ? hasDivergence(currentSource) : false;
  const allowedActions = currentSource?.allowed_actions || currentSource?.allowedActions;
  const sourceId = currentSource?.source_instance_id || currentSource?.connector_id || sourceInstanceId || "";

  const openAction = (key: DataSourceActionKey) => {
    setActiveCommand(key);
    setCommandDialogOpen(true);
  };

  const handleCommandSuccess = () => {
    loadData();
    onSourceUpdated?.();
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-3xl overflow-y-auto p-0 flex flex-col bg-background"
        >
          {/* Header */}
          <div className="p-6 border-b border-border space-y-3 bg-card shrink-0">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Database className="h-5 w-5 text-primary shrink-0" />
                  <SheetTitle className="text-xl font-bold font-mono">
                    {sourceId}
                  </SheetTitle>
                  <Badge
                    variant="outline"
                    className={lifecycleTone(currentSource?.instance?.lifecycle_state)}
                  >
                    {fmtToken(currentSource?.instance?.lifecycle_state)}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={healthStateTone(currentSource?.observed?.health_state)}
                  >
                    {fmtToken(currentSource?.observed?.health_state)}
                  </Badge>
                  <Badge variant="outline" className="font-mono text-xs">
                    Rev {currentSource?.desired?.revision ?? currentSource?.instance?.revision ?? 1}
                  </Badge>
                </div>
                <SheetDescription className="text-xs text-muted-foreground">
                  {currentSource?.provider} · {fmtToken(currentSource?.source_class)} · {currentSource?.definition?.definition_id}
                </SheetDescription>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={loadData}
                  disabled={loading}
                  aria-label={t("mgmt.actions.refresh")}
                >
                  <RefreshCcw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onOpenChange(false)}
                  aria-label={t("mgmt.actions.close")}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {divergence && (
              <Card className="p-3 bg-status-warning/10 border-status-warning/30 text-xs text-status-warning flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">{t("mgmt.dataSources.detail.divergenceTitle")}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {t("mgmt.dataSources.detail.divergenceDesc", {
                      desired: currentSource?.desired?.desired_lifecycle,
                      observed: currentSource?.observed?.effective_lifecycle,
                      recon: currentSource?.observed?.reconciliation_status,
                    })}
                  </p>
                </div>
              </Card>
            )}

            {/* Quick Action Buttons */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {DATA_SOURCE_ACTIONS.map((action) => {
                const writesLive = realWritesEnabled();
                const { allowed, reasons } = isActionAllowed(action.key, allowedActions, writesLive);
                const actionDisabled = !allowed || loading;
                const tooltip = !writesLive
                  ? t("mgmt.dataSources.realWritesRequired")
                  : !allowed
                    ? reasons.join(", ")
                    : undefined;
                return (
                  <Button
                    key={action.key}
                    size="sm"
                    variant={action.destructive ? "outline" : "secondary"}
                    className={`h-7 px-2.5 text-xs ${action.destructive && allowed ? "text-status-failed hover:bg-status-failed/10" : ""}`}
                    disabled={actionDisabled}
                    title={tooltip}
                    onClick={() => openAction(action.key)}
                  >
                    {t(action.labelKey)}
                  </Button>
                );
              })}
            </div>
          </div>

          {/* Body Tabs */}
          <div className="flex-1 p-6 space-y-4">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid grid-cols-6 w-full text-xs">
                <TabsTrigger value="overview">{t("mgmt.dataSources.detail.tabs.overview")}</TabsTrigger>
                <TabsTrigger value="desiredObserved">{t("mgmt.dataSources.detail.tabs.desiredObserved")}</TabsTrigger>
                <TabsTrigger value="config">{t("mgmt.dataSources.detail.tabs.config")}</TabsTrigger>
                <TabsTrigger value="schedule">{t("mgmt.dataSources.detail.tabs.schedule")}</TabsTrigger>
                <TabsTrigger value="runs">{t("mgmt.dataSources.detail.tabs.runs")}</TabsTrigger>
                <TabsTrigger value="receipts">{t("mgmt.dataSources.detail.tabs.receipts")}</TabsTrigger>
              </TabsList>

              {/* Tab 1: Overview & Policy */}
              <TabsContent value="overview" className="space-y-4 mt-4">
                <Card className="p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <Shield className="h-4 w-4 text-primary" />
                    {t("mgmt.dataSources.detail.policyIdentity")}
                  </h3>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-muted-foreground">{t("mgmt.dataSources.detail.sourceId")}:</span>
                      <p className="font-mono font-medium">{sourceId}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{t("mgmt.dataSources.detail.connectorId")}:</span>
                      <p className="font-mono font-medium">{currentSource?.connector_id}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{t("mgmt.dataSources.provider")}:</span>
                      <p className="font-medium">{currentSource?.provider}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{t("mgmt.dataSources.detail.sourceClass")}:</span>
                      <p className="font-medium">{fmtToken(currentSource?.source_class)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{t("mgmt.dataSources.detail.licenseScope")}:</span>
                      <p className="font-mono">{currentSource?.instance?.license_scope || "—"}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{t("mgmt.dataSources.detail.freshnessSla")}:</span>
                      <p className="font-mono">
                        {currentSource?.instance?.freshness_sla_seconds
                          ? `${currentSource.instance.freshness_sla_seconds}s (${currentSource.instance.freshness_sla_seconds / 3600}h)`
                          : "—"}
                      </p>
                    </div>
                    <div className="col-span-2">
                      <span className="text-muted-foreground">{t("mgmt.dataSources.detail.allowedUse")}:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {(currentSource?.instance?.allowed_use ?? []).map((use) => (
                          <Badge key={use} variant="outline" className="text-[10px]">
                            {fmtToken(use)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{t("mgmt.dataSources.detail.retentionPolicy")}:</span>
                      <p className="font-mono text-[11px] truncate">
                        {currentSource?.instance?.retention_policy_ref || "—"}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{t("mgmt.dataSources.detail.deletionPolicy")}:</span>
                      <p className="font-mono text-[11px] truncate">
                        {currentSource?.instance?.deletion_policy_ref || "—"}
                      </p>
                    </div>
                  </div>
                </Card>

                {/* Lineage & Consumers */}
                <Card className="p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <Layers className="h-4 w-4 text-primary" />
                    {t("mgmt.dataSources.detail.lineageConsumers")}
                  </h3>
                  <div className="space-y-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">{t("mgmt.dataSources.consumers")}:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {(currentSource?.observed?.dependent_refs ?? []).length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          currentSource.observed.dependent_refs.map((ref) => (
                            <Link
                              key={ref}
                              to={`/management/personas/${encodeURIComponent(ref)}`}
                              className="font-mono text-xs text-primary hover:underline bg-primary/5 px-2 py-0.5 rounded border border-primary/20"
                            >
                              {ref}
                            </Link>
                          ))
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div>
                        <span className="text-muted-foreground">{t("mgmt.dataSources.detail.datasets")}:</span>
                        <p className="font-mono">{joinOrDash(currentSource?.instance?.datasets)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">{t("mgmt.dataSources.markets")}:</span>
                        <p className="font-mono">{joinOrDash(currentSource?.instance?.markets)}</p>
                      </div>
                    </div>
                    {currentSource?.observed?.last_run?.evidence_bundle_id && (
                      <div className="pt-1">
                        <span className="text-muted-foreground">{t("mgmt.dataSources.evidence")}:</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <code className="font-mono text-[11px] bg-muted px-1.5 py-0.5 rounded">
                            {currentSource.observed.last_run.evidence_bundle_id}
                          </code>
                          <Button asChild size="sm" variant="ghost" className="h-6 px-2 text-xs">
                            <Link to="/management/evidence">
                              <ExternalLink className="h-3 w-3 mr-1" />
                              {t("mgmt.actions.evidence")}
                            </Link>
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </Card>
              </TabsContent>

              {/* Tab 2: Desired vs Observed State */}
              <TabsContent value="desiredObserved" className="space-y-4 mt-4">
                <Card className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                      <Activity className="h-4 w-4 text-primary" />
                      {t("mgmt.dataSources.detail.stateComparison")}
                    </h3>
                    <Badge
                      variant="outline"
                      className={reconciliationTone(currentSource?.observed?.reconciliation_status)}
                    >
                      {fmtToken(currentSource?.observed?.reconciliation_status ?? "unknown")}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-xs pt-1">
                    {/* Desired Column */}
                    <div className="p-3 rounded-md bg-muted/30 border space-y-2">
                      <div className="font-semibold text-foreground border-b pb-1">
                        {t("mgmt.dataSources.detail.desiredState")}
                      </div>
                      <div className="space-y-1.5">
                        <div>
                          <span className="text-muted-foreground">{t("mgmt.dataSources.detail.revision")}:</span>
                          <p className="font-mono font-medium">Rev {currentSource?.desired?.revision ?? 1}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">{t("mgmt.dataSources.detail.lifecycle")}:</span>
                          <Badge variant="outline" className={lifecycleTone(currentSource?.desired?.desired_lifecycle)}>
                            {fmtToken(currentSource?.desired?.desired_lifecycle)}
                          </Badge>
                        </div>
                        <div>
                          <span className="text-muted-foreground">{t("mgmt.dataSources.detail.scheduleStatus")}:</span>
                          <p>{currentSource?.desired?.schedule?.enabled ? t("mgmt.dataSources.liveOn") : t("mgmt.dataSources.liveOff")}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">{t("mgmt.dataSources.detail.definitionSha")}:</span>
                          <p className="font-mono text-[10px] truncate">{currentSource?.desired?.definition_deployment_sha || "—"}</p>
                        </div>
                      </div>
                    </div>

                    {/* Observed Column */}
                    <div className="p-3 rounded-md bg-muted/30 border space-y-2">
                      <div className="font-semibold text-foreground border-b pb-1">
                        {t("mgmt.dataSources.detail.observedState")}
                      </div>
                      <div className="space-y-1.5">
                        <div>
                          <span className="text-muted-foreground">{t("mgmt.dataSources.detail.observedRevision")}:</span>
                          <p className="font-mono font-medium">
                            Rev {currentSource?.observed?.observed_revision ?? currentSource?.desired?.revision ?? 1}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">{t("mgmt.dataSources.detail.effectiveLifecycle")}:</span>
                          <Badge variant="outline" className={lifecycleTone(currentSource?.observed?.effective_lifecycle)}>
                            {fmtToken(currentSource?.observed?.effective_lifecycle)}
                          </Badge>
                        </div>
                        <div>
                          <span className="text-muted-foreground">{t("mgmt.dataSources.detail.health")}:</span>
                          <Badge variant="outline" className={healthStateTone(currentSource?.observed?.health_state)}>
                            {fmtToken(currentSource?.observed?.health_state)}
                          </Badge>
                        </div>
                        <div>
                          <span className="text-muted-foreground">{t("mgmt.dataSources.detail.credentialState")}:</span>
                          <Badge variant="outline" className={credentialTone(currentSource?.observed?.credential_state)}>
                            {fmtToken(currentSource?.observed?.credential_state)}
                          </Badge>
                        </div>
                        <div>
                          <span className="text-muted-foreground">{t("mgmt.dataSources.detail.validationState")}:</span>
                          <Badge variant="outline">{fmtToken(currentSource?.observed?.validation_state)}</Badge>
                        </div>
                        <div>
                          <span className="text-muted-foreground">{t("mgmt.dataSources.detail.canaryState")}:</span>
                          <Badge variant="outline" className={canaryTone(currentSource?.observed?.canary_state)}>
                            {fmtToken(currentSource?.observed?.canary_state)}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Freshness metrics */}
                  <div className="grid grid-cols-3 gap-2 pt-2 text-xs">
                    <Card className="p-2.5">
                      <span className="text-muted-foreground text-[11px]">{t("mgmt.dataSources.detail.watermark")}:</span>
                      <p className="font-mono font-medium mt-0.5 truncate">{currentSource?.observed?.freshness?.watermark || "—"}</p>
                    </Card>
                    <Card className="p-2.5">
                      <span className="text-muted-foreground text-[11px]">{t("mgmt.dataSources.detail.age")}:</span>
                      <p className="font-mono font-medium mt-0.5">{formatAgeSeconds(currentSource?.observed?.freshness?.age_seconds)}</p>
                    </Card>
                    <Card className="p-2.5">
                      <span className="text-muted-foreground text-[11px]">{t("mgmt.dataSources.detail.lastSuccess")}:</span>
                      <p className="font-mono font-medium mt-0.5 truncate">{formatTime(currentSource?.observed?.freshness?.last_success_at)}</p>
                    </Card>
                  </div>
                </Card>
              </TabsContent>

              {/* Tab 3: Configuration & Secrets */}
              <TabsContent value="config" className="space-y-4 mt-4">
                <Card className="p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <KeyRound className="h-4 w-4 text-primary" />
                    {t("mgmt.dataSources.detail.connectionConfig")}
                  </h3>

                  {/* Secret Reference Guard */}
                  <div className="p-3 bg-muted/40 rounded-md border space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-foreground">{t("mgmt.dataSources.detail.secretRefId")}:</span>
                      <Badge variant="outline" className="font-mono">
                        {currentSource?.desired?.connector_config?.secret_ref_id || t("mgmt.dataSources.detail.noSecretRequired")}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {t("mgmt.dataSources.detail.secretRefNotice")}
                    </p>
                  </div>

                  {/* Public Config Table */}
                  <div className="space-y-2 text-xs">
                    <span className="font-medium text-foreground">{t("mgmt.dataSources.detail.publicConfig")}:</span>
                    <div className="border rounded-md divide-y">
                      {Object.entries(currentSource?.desired?.connector_config?.public ?? {}).length === 0 ? (
                        <div className="p-3 text-muted-foreground text-center">
                          {t("mgmt.dataSources.detail.noPublicConfig")}
                        </div>
                      ) : (
                        Object.entries(currentSource.desired.connector_config.public ?? {}).map(([k, v]) => (
                          <div key={k} className="p-2.5 flex justify-between font-mono">
                            <span className="text-muted-foreground">{k}</span>
                            <span className="font-medium text-foreground">{String(v)}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Limits & Egress Allowlist */}
                  <div className="grid grid-cols-2 gap-3 pt-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">{t("mgmt.dataSources.detail.allowedHosts")}:</span>
                      <div className="space-y-1 mt-1">
                        {(currentSource?.desired?.allowed_hosts ?? currentSource?.definition?.allowed_host_patterns ?? []).map((host) => (
                          <code key={host} className="block font-mono text-[11px] bg-muted px-2 py-0.5 rounded">
                            {host}
                          </code>
                        ))}
                      </div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{t("mgmt.dataSources.detail.fetchLimits")}:</span>
                      <div className="space-y-1 mt-1 text-[11px] font-mono">
                        <div>Max Records: {currentSource?.desired?.limits?.max_records ?? currentSource?.definition?.default_limits?.max_records ?? "—"}</div>
                        <div>Max Bytes: {formatBytes(currentSource?.desired?.limits?.max_bytes ?? currentSource?.definition?.default_limits?.max_bytes)}</div>
                        <div>Timeout: {currentSource?.desired?.limits?.timeout_seconds ?? currentSource?.definition?.default_limits?.timeout_seconds ?? 15}s</div>
                      </div>
                    </div>
                  </div>
                </Card>
              </TabsContent>

              {/* Tab 4: Schedule & Active Universe */}
              <TabsContent value="schedule" className="space-y-4 mt-4">
                <Card className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                      <Calendar className="h-4 w-4 text-primary" />
                      {t("mgmt.dataSources.detail.scheduleUniverse")}
                    </h3>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openAction("schedule")}
                      disabled={!allowedActions?.canChangeSchedule || loading}
                      className="h-7 text-xs"
                    >
                      {t("mgmt.dataSources.actions.changeSchedule")}
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs pt-1">
                    <div>
                      <span className="text-muted-foreground">{t("mgmt.dataSources.detail.scheduleStatus")}:</span>
                      <Badge variant="outline" className={currentSource?.desired?.schedule?.enabled ? toneClass.ok : toneClass.muted}>
                        {currentSource?.desired?.schedule?.enabled ? t("mgmt.dataSources.liveOn") : t("mgmt.dataSources.liveOff")}
                      </Badge>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{t("mgmt.dataSources.detail.cadenceCron")}:</span>
                      <p className="font-mono font-medium">{currentSource?.desired?.schedule?.cadence || "—"}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{t("mgmt.dataSources.detail.timezone")}:</span>
                      <p className="font-mono">{currentSource?.desired?.schedule?.timezone || "UTC"}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{t("mgmt.dataSources.detail.jitterSeconds")}:</span>
                      <p className="font-mono">{currentSource?.desired?.schedule?.jitter_seconds ?? 0}s</p>
                    </div>
                    <div className="col-span-2">
                      <span className="text-muted-foreground">{t("mgmt.dataSources.detail.universePolicyRef")}:</span>
                      <p className="font-mono text-[11px] mt-0.5 truncate">
                        {currentSource?.desired?.universe_policy_ref || currentSource?.lineage_summary?.universe_policy_ref || "—"}
                      </p>
                    </div>
                  </div>
                </Card>
              </TabsContent>

              {/* Tab 5: Runs & Canaries */}
              <TabsContent value="runs" className="space-y-4 mt-4">
                {/* Canaries Section */}
                <Card className="p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <Activity className="h-4 w-4 text-primary" />
                    {t("mgmt.dataSources.detail.canaryRuns")}
                  </h3>
                  {runs.canaries.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t("mgmt.dataSources.detail.noCanaries")}</p>
                  ) : (
                    <div className="space-y-2">
                      {runs.canaries.slice(0, 5).map((canary) => (
                        <div key={canary.canary_id} className="p-2.5 rounded border bg-card text-xs space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-medium">{canary.canary_id}</span>
                            <Badge variant="outline" className={canaryTone(canary.status)}>
                              {canary.status}
                            </Badge>
                          </div>
                          <div className="flex justify-between text-muted-foreground text-[11px]">
                            <span>Rows: {canary.row_count ?? 0} (rej: {canary.rejected_count ?? 0})</span>
                            <span>{formatTime(canary.completed_at || canary.started_at)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                {/* Observations Section */}
                <Card className="p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <Clock className="h-4 w-4 text-primary" />
                    {t("mgmt.dataSources.detail.recentObservations")}
                  </h3>
                  {runs.observations.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t("mgmt.dataSources.detail.noObservations")}</p>
                  ) : (
                    <ManagementTableScroll minScrollWidth={400}>
                      <table className="w-full text-xs">
                        <thead className="border-b text-left text-muted-foreground">
                          <tr>
                            <th className="py-1.5">{t("mgmt.dataSources.detail.time")}</th>
                            <th className="py-1.5">{t("mgmt.dataSources.detail.revision")}</th>
                            <th className="py-1.5">{t("mgmt.dataSources.health")}</th>
                            <th className="py-1.5">{t("mgmt.dataSources.detail.watermark")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {runs.observations.slice(0, 10).map((obs, idx) => (
                            <tr key={idx} className="border-b border-border/50">
                              <td className="py-1.5 font-mono">{formatTime(obs.observed_at)}</td>
                              <td className="py-1.5 font-mono">r{obs.observed_revision}</td>
                              <td className="py-1.5">
                                <Badge variant="outline" className={healthStateTone(obs.health_state)}>
                                  {obs.health_state}
                                </Badge>
                              </td>
                              <td className="py-1.5 font-mono truncate max-w-[150px]">{obs.watermark || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </ManagementTableScroll>
                  )}
                </Card>
              </TabsContent>

              {/* Tab 6: Command Receipts */}
              <TabsContent value="receipts" className="space-y-4 mt-4">
                <Card className="p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <FileText className="h-4 w-4 text-primary" />
                    {t("mgmt.dataSources.detail.commandReceipts")}
                  </h3>
                  {receipts.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t("mgmt.dataSources.detail.noReceipts")}</p>
                  ) : (
                    <div className="space-y-2">
                      {receipts.map((rcp) => (
                        <div key={rcp.receipt_id} className="p-3 rounded border bg-card text-xs space-y-1.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="font-mono">
                                {rcp.command_type}
                              </Badge>
                              <span className="font-mono text-muted-foreground text-[11px]">{rcp.receipt_id}</span>
                            </div>
                            <Badge variant="outline" className={receiptStatusTone(rcp.status)}>
                              {rcp.status}
                            </Badge>
                          </div>
                          <div className="flex justify-between text-muted-foreground text-[11px]">
                            <span>
                              Rev: {rcp.before_revision ?? "—"} → {rcp.after_revision ?? "—"}
                            </span>
                            <span>{formatTime(rcp.completed_at || rcp.created_at)}</span>
                          </div>
                          {rcp.readback && (
                            <div className="text-[11px] font-mono text-muted-foreground">
                              Reconciliation: {rcp.readback.reconciliation_status ?? "—"}
                            </div>
                          )}
                          {rcp.failure && (
                            <div className="text-[11px] text-status-failed bg-status-failed/5 p-2 rounded">
                              {rcp.failure.message || rcp.failure.code}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </SheetContent>
      </Sheet>

      {/* Command Action Dialog */}
      <DataSourceCommandDialog
        open={commandDialogOpen}
        onOpenChange={setCommandDialogOpen}
        actionKey={activeCommand}
        targetSource={currentSource}
        onCommandSuccess={handleCommandSuccess}
      />
    </>
  );
}
