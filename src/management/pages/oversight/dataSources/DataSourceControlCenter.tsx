// Data Source Control Center container orchestrating instances, catalog, runs, and receipts (SD-SRCM-04).

import React, { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Activity,
  BookOpen,
  Database,
  FileText,
  Plus,
  RefreshCcw,
  Shield,
  ShieldCheck,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { managementConsoleReads, mgmt } from "@/lib/bff-v1";
import type { ManagementDataSource, ManagementPersonaFleetRow } from "@/lib/bff-v1/management";
import type { ManagementDataSourceV2DTO } from "@/lib/bff-v1/managementDataSources";
import {
  dataSourceTone,
  summarizeSystemDataSources,
  type SystemDataSourceRecord,
  type SystemDataSourceSummary,
} from "@/lib/v5/management/systemDataSources";
import { useV5Live } from "@/management/pages/v5/useV5Live";
import { ManagementTableScroll } from "@/management/components/ManagementTableScroll";
import { realWritesEnabled } from "@/lib/bff-v1/liveTransport";
import {
  personaFleetDataSources,
  dataSourceProviderCount,
  dataSourceProviderStatusCounts,
  dataSourceState,
  dataSourceStatus,
} from "../personaFleetDataSources";

import {
  MISSING_DATA_SOURCE_FIELD_LABEL,
  cleanSourceToken,
  extractDataSourceEnvelopeItems,
  fmtToken,
  isV2,
  joinOrDash,
  resolveDataSourceSurfaceState,
  toneClass,
  translateDataSourceSurfaceReason,
  translateDataSourceSurfaceStatus,
  v2ToLegacyRecord,
  type ControlCenterTab,
} from "./dataSourceModels";
import { DataSourceInstancesTable } from "./DataSourceInstancesTable";
import { DataSourceCatalogPanel } from "./DataSourceCatalogPanel";
import { DataSourceRunsPanel } from "./DataSourceRunsPanel";
import { DataSourceReceiptPanel } from "./DataSourceReceiptPanel";
import { DataSourceDetailDrawer } from "./DataSourceDetailDrawer";
import { DataSourceAddWizard } from "./DataSourceAddWizard";
import { DataSourceCommandDialog } from "./DataSourceCommandDialog";
import type { DataSourceActionKey } from "./dataSourceActions";

function matchesToken(needle: string, values: string[]): boolean {
  const normalized = needle.trim().toLowerCase();
  return values.some((value) => value.trim().toLowerCase() === normalized);
}

function unique(values: Array<string | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((v) => cleanSourceToken(v))
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function sourceMatchesRecord(record: SystemDataSourceRecord, sourceFocus: string): boolean {
  return matchesToken(sourceFocus, [
    record.providerKey,
    record.provider,
    ...record.sourceClasses,
  ]);
}

function sourceMatchesV2(dto: ManagementDataSourceV2DTO, sourceFocus: string): boolean {
  const values = [
    dto.source_instance_id,
    dto.connector_id,
    dto.provider,
    dto.definition?.provider,
    dto.source_class,
    ...(dto.instance?.markets ?? []),
    ...(dto.instance?.datasets ?? []),
  ]
    .map((v) => cleanSourceToken(v))
    .filter((v): v is string => Boolean(v));
  return matchesToken(sourceFocus, values);
}

function credentialStateFor(status: string, source?: ManagementDataSource): SystemDataSourceRecord["credentialState"] {
  if (/credential/i.test(status)) return "missing";
  if (dataSourceTone(status) === "ok") return "configured";
  if (source?.sourceClass === "official_reference") return "not_required";
  return "unknown";
}

function refsForProvider(refs: string[] | undefined, providerKey: string): string[] {
  const normalized = providerKey.toLowerCase();
  const cleanedRefs = (refs ?? [])
    .map((r) => cleanSourceToken(r))
    .filter((r): r is string => Boolean(r));
  const matches = cleanedRefs.filter((ref) => ref.toLowerCase().includes(normalized));
  return matches.length > 0 ? matches : cleanedRefs;
}

function tonePriority(state: string): number {
  const tone = dataSourceTone(state);
  if (tone === "ok") return 0;
  if (tone === "warn") return 1;
  if (tone === "bad") return 2;
  return 3;
}

function firstStatusCount(row: ManagementPersonaFleetRow): string | undefined {
  return Object.entries(dataSourceProviderStatusCounts(row))
    .filter(([, count]) => count > 0)
    .sort(([left], [right]) => tonePriority(left) - tonePriority(right) || left.localeCompare(right))[0]?.[0];
}

export function personaSourceRecord(
  persona: ManagementPersonaFleetRow,
  source: ManagementDataSource,
): SystemDataSourceRecord {
  const status = dataSourceStatus(persona);
  const providerKey = cleanSourceToken(source.providerKey) || MISSING_DATA_SOURCE_FIELD_LABEL;
  const sourceStatus =
    cleanSourceToken(source.status) ||
    cleanSourceToken(dataSourceState(persona)) ||
    MISSING_DATA_SOURCE_FIELD_LABEL;
  const provider =
    cleanSourceToken(source.provider) ||
    cleanSourceToken(source.providerKey) ||
    MISSING_DATA_SOURCE_FIELD_LABEL;
  return {
    providerKey,
    provider,
    markets: unique([source.market, ...(persona.marketScope ?? [])]),
    sourceClasses: unique([source.sourceClass]),
    status: sourceStatus,
    tone: dataSourceTone(sourceStatus),
    credentialState: credentialStateFor(sourceStatus, source),
    readOnly: source.readOnly ?? status?.readOnly ?? true,
    orderCapableProvider: Boolean(source.orderCapableProvider),
    orderSideEffectsAllowed: Boolean(source.orderSideEffectsAllowed ?? status?.orderSideEffectsAllowed),
    capitalSideEffectsAllowed: Boolean(source.capitalSideEffectsAllowed ?? status?.capitalSideEffectsAllowed),
    liveIngestionEnabled: Boolean(status?.liveIngestionEnabled),
    consumerPersonaIds: [persona.personaId],
    consumerPersonaNames: [cleanSourceToken(persona.personaName) || persona.personaId],
    evidenceRefs: unique([
      source.evidenceRef,
      ...refsForProvider(status?.readbackRefs, providerKey),
      status?.researchDatasetRef,
      status?.researchDatasetManifestRef,
    ]),
    unavailableRefs: refsForProvider(status?.unavailableRefs, providerKey),
    lastReadbackAt: cleanSourceToken(status?.readbackCapturedAt),
    reasons: unique([source.reason, status?.summary]),
  };
}

export function fallbackPersonaSourceRecord(
  persona: ManagementPersonaFleetRow,
): SystemDataSourceRecord | null {
  const status = dataSourceStatus(persona);
  if (!status) return null;
  const sourceStatus =
    cleanSourceToken(dataSourceState(persona)) ||
    cleanSourceToken(firstStatusCount(persona)) ||
    MISSING_DATA_SOURCE_FIELD_LABEL;
  return {
    providerKey: MISSING_DATA_SOURCE_FIELD_LABEL,
    provider: MISSING_DATA_SOURCE_FIELD_LABEL,
    markets: unique(persona.marketScope ?? []),
    sourceClasses: ["not_declared"],
    status: sourceStatus,
    tone: dataSourceTone(sourceStatus),
    credentialState: credentialStateFor(sourceStatus),
    readOnly: status.readOnly ?? true,
    orderCapableProvider: false,
    orderSideEffectsAllowed: status.orderSideEffectsAllowed ?? false,
    capitalSideEffectsAllowed: status.capitalSideEffectsAllowed ?? false,
    liveIngestionEnabled: status.liveIngestionEnabled ?? false,
    consumerPersonaIds: [persona.personaId],
    consumerPersonaNames: [cleanSourceToken(persona.personaName) || persona.personaId],
    evidenceRefs: unique([
      ...(status.readbackRefs ?? []),
      status.researchDatasetRef,
      status.researchDatasetManifestRef,
    ]),
    unavailableRefs: unique(status.unavailableRefs ?? []),
    lastReadbackAt: cleanSourceToken(status.readbackCapturedAt),
    reasons: unique([status.summary]),
  };
}

export function personaDataSourceRecords(persona: ManagementPersonaFleetRow): SystemDataSourceRecord[] {
  const records = personaFleetDataSources(persona).map((source) => personaSourceRecord(persona, source));
  if (records.length > 0) return records;
  const fallback = fallbackPersonaSourceRecord(persona);
  return fallback ? [fallback] : [];
}

function summarizeFocusedPersona(
  persona: ManagementPersonaFleetRow,
  records: SystemDataSourceRecord[],
  sourceFocus: string,
): SystemDataSourceSummary {
  if (sourceFocus) return summarizeSystemDataSources(records);

  const counts = dataSourceProviderStatusCounts(persona);
  const counted = Object.values(counts).reduce((total, count) => total + count, 0);
  const providerCount = dataSourceProviderCount(persona);
  if (counted === 0 && providerCount <= records.length) return summarizeSystemDataSources(records);

  const markets = new Set<string>();
  records.forEach((record) => record.markets.forEach((market) => markets.add(market)));
  const status = dataSourceStatus(persona);
  const total = providerCount || counted || records.length;
  const readable = Object.entries(counts)
    .filter(([state]) => dataSourceTone(state) === "ok")
    .reduce((sum, [, count]) => sum + count, 0);
  const degraded = Object.entries(counts)
    .filter(([state]) => {
      const tone = dataSourceTone(state);
      return tone === "warn" || tone === "bad";
    })
    .reduce((sum, [, count]) => sum + count, 0);

  return {
    total,
    readable: counted > 0 ? readable : records.filter((record) => record.tone === "ok").length,
    degraded: counted > 0 ? degraded : records.filter((record) => record.tone === "warn" || record.tone === "bad").length,
    credentialMissing: records.filter((record) => record.credentialState === "missing").length,
    liveIngestionOn: status?.liveIngestionEnabled ? total : 0,
    orderSideEffectsOn: status?.orderSideEffectsAllowed || status?.capitalSideEffectsAllowed ? total : 0,
    markets: Array.from(markets).sort(),
    consumerPersonas: total > 0 ? 1 : 0,
  };
}

export function DataSourceControlCenter() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  const personaFocus = searchParams.get("persona")?.trim() ?? "";
  const sourceFocus = searchParams.get("source")?.trim() ?? "";
  const activeTabParam = (searchParams.get("tab")?.trim() as ControlCenterTab) || "instances";
  const instanceParam = searchParams.get("instance")?.trim() ?? null;

  const [activeTab, setActiveTab] = useState<ControlCenterTab>(activeTabParam);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(instanceParam);
  const [selectedV2DTO, setSelectedV2DTO] = useState<ManagementDataSourceV2DTO | null>(null);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState<boolean>(Boolean(instanceParam));

  const [wizardOpen, setWizardOpen] = useState<boolean>(false);
  const [wizardPreselectedDef, setWizardPreselectedDef] = useState<string | null>(null);

  const [commandDialogOpen, setCommandDialogOpen] = useState<boolean>(false);
  const [commandAction, setCommandAction] = useState<DataSourceActionKey | null>(null);
  const [commandTargetSource, setCommandTargetSource] = useState<ManagementDataSourceV2DTO | null>(null);

  const liveSourcesRes = useV5Live((signal) => managementConsoleReads.dataSources({ signal }), [], { cacheKey: "oversight.dataSources" }) ?? {
    data: undefined,
    loading: false,
    refresh: () => {},
  };
  const { data, loading, refresh } = liveSourcesRes;

  const liveFleetRes = useV5Live((signal) => mgmt.personaFleet.get({}, { signal }), [], { cacheKey: "oversight.personaFleet" }) ?? {
    data: undefined,
    loading: false,
    refresh: () => {},
  };
  const { data: fleetRows, loading: fleetLoading } = liveFleetRes;

  const rawItems = useMemo(
    () =>
      extractDataSourceEnvelopeItems<
        ManagementDataSourceV2DTO | SystemDataSourceRecord
      >(data),
    [data],
  );

  const v2Sources = useMemo(() => rawItems.filter(isV2), [rawItems]);

  const legacyRecords: SystemDataSourceRecord[] = useMemo(() => {
    return rawItems.map((item) => (isV2(item) ? v2ToLegacyRecord(item) : (item as SystemDataSourceRecord)));
  }, [rawItems]);

  const focusedPersona = useMemo(
    () => (Array.isArray(fleetRows) ? fleetRows.find((row) => row.personaId === personaFocus) : undefined),
    [fleetRows, personaFocus],
  );


  const personaRecords = useMemo(() => {
    if (!focusedPersona) return [];
    return personaDataSourceRecords(focusedPersona);
  }, [focusedPersona]);

  const visibleRecords = useMemo(() => {
    if (personaFocus) {
      if (!sourceFocus) return personaRecords;
      return personaRecords.filter((record) => sourceMatchesRecord(record, sourceFocus));
    }
    if (!sourceFocus) return rawItems;
    return rawItems.filter((item) =>
      isV2(item)
        ? sourceMatchesV2(item, sourceFocus)
        : sourceMatchesRecord(item as SystemDataSourceRecord, sourceFocus),
    );
  }, [personaFocus, personaRecords, rawItems, sourceFocus]);

  const summary = useMemo(() => {
    if (focusedPersona) {
      return summarizeFocusedPersona(focusedPersona, visibleRecords as SystemDataSourceRecord[], sourceFocus);
    }
    return summarizeSystemDataSources(legacyRecords);
  }, [focusedPersona, sourceFocus, visibleRecords, legacyRecords]);

  const hasFocus = Boolean(personaFocus || sourceFocus);
  const focusLoading = Boolean(personaFocus && fleetLoading && fleetRows === undefined);
  const personaMatched = !personaFocus || Boolean(focusedPersona);
  const sourceMatched = !sourceFocus || visibleRecords.length > 0;
  const focusMatched = focusLoading || (personaMatched && sourceMatched);
  const focusCount = visibleRecords.length;
  const sourceLabel = sourceFocus || t("mgmt.dataSources.allSources");

  const hasLegacyItems = useMemo(
    () => !personaFocus && visibleRecords.length > 0 && visibleRecords.some((r) => !isV2(r)),
    [personaFocus, visibleRecords],
  );

  const surfaceState = useMemo(
    () =>
      resolveDataSourceSurfaceState(data, {
        loading: loading || focusLoading,
        itemCount: visibleRecords.length,
        hasLegacyItems,
      }),
    [data, loading, focusLoading, visibleRecords.length, hasLegacyItems],
  );

  const isAuthoritativeEmpty = surfaceState.isAuthoritativeEmpty;
  const isUnavailable = surfaceState.isUnavailable;
  const isDegraded = surfaceState.isDegraded;
  const isDegradedLegacy = surfaceState.isDegraded || surfaceState.isLegacyProjection;
  const translatedSurfaceStatus = translateDataSourceSurfaceStatus(surfaceState.status, t);
  const translatedSurfaceReason = translateDataSourceSurfaceReason(surfaceState.reasonCode, t);

  const writesLive = realWritesEnabled();

  const handleTabChange = (tab: string) => {
    setActiveTab(tab as ControlCenterTab);
    const newParams = new URLSearchParams(searchParams);
    if (tab === "instances") newParams.delete("tab");
    else newParams.set("tab", tab);
    setSearchParams(newParams);
  };

  const handleSelectSource = (sourceId: string, item: ManagementDataSourceV2DTO | null) => {
    setSelectedInstanceId(sourceId);
    setSelectedV2DTO(item);
    setDetailDrawerOpen(true);
  };

  const handleExecuteAction = (actionKey: DataSourceActionKey, target: ManagementDataSourceV2DTO) => {
    setCommandAction(actionKey);
    setCommandTargetSource(target);
    setCommandDialogOpen(true);
  };

  const handleCreateFromDefinition = (defId: string) => {
    setWizardPreselectedDef(defId);
    setWizardOpen(true);
  };

  const showSurfaceNonOk = !personaFocus && !loading && !focusLoading && (isUnavailable || isDegraded);

  const metricsDisplay = useMemo(() => {
    if (!personaFocus && (loading || focusLoading) && visibleRecords.length === 0) {
      return {
        total: "—",
        totalSubtext: undefined,
        totalTone: undefined as "ok" | "warn" | "bad" | undefined,
        readable: "—",
        readableSubtext: undefined,
        readableTone: undefined as "ok" | "warn" | "bad" | undefined,
        degraded: "—",
        degradedSubtext: undefined,
        degradedTone: undefined as "ok" | "warn" | "bad" | undefined,
        credentials: "—",
        credentialsTone: undefined as "ok" | "warn" | "bad" | undefined,
        consumers: "—",
        markets: "—",
      };
    }

    if (!personaFocus && (isUnavailable || (isDegraded && summary.total === 0))) {
      const tone: "warn" | "bad" = isUnavailable ? "bad" : "warn";
      return {
        total: translatedSurfaceStatus,
        totalSubtext: translatedSurfaceReason,
        totalTone: tone,
        readable: translatedSurfaceStatus,
        readableSubtext: translatedSurfaceReason,
        readableTone: "warn" as const,
        degraded: translatedSurfaceStatus,
        degradedSubtext: translatedSurfaceReason,
        degradedTone: "warn" as const,
        credentials: MISSING_DATA_SOURCE_FIELD_LABEL,
        credentialsTone: "warn" as const,
        consumers: MISSING_DATA_SOURCE_FIELD_LABEL,
        markets: MISSING_DATA_SOURCE_FIELD_LABEL,
      };
    }

    if (!personaFocus && isDegraded) {
      return {
        total: String(summary.total),
        totalSubtext: surfaceState.isLegacyProjection
          ? t("mgmt.dataSources.legacyProjectionSource")
          : translatedSurfaceReason,
        totalTone: "warn" as const,
        readable:
          summary.readable > 0 && summary.total > 0
            ? `${summary.readable}/${summary.total}`
            : MISSING_DATA_SOURCE_FIELD_LABEL,
        readableSubtext: surfaceState.isLegacyProjection
          ? t("mgmt.dataSources.legacyProjectionSource")
          : undefined,
        readableTone: "warn" as const,
        degraded:
          summary.degraded > 0 ? String(summary.degraded) : translatedSurfaceStatus,
        degradedSubtext: translatedSurfaceReason,
        degradedTone: "warn" as const,
        credentials:
          summary.credentialMissing > 0
            ? String(summary.credentialMissing)
            : MISSING_DATA_SOURCE_FIELD_LABEL,
        credentialsTone: (summary.credentialMissing > 0 ? "bad" : "warn") as "bad" | "warn",
        consumers:
          summary.consumerPersonas > 0
            ? String(summary.consumerPersonas)
            : MISSING_DATA_SOURCE_FIELD_LABEL,
        markets: summary.markets.join(" / ") || MISSING_DATA_SOURCE_FIELD_LABEL,
      };
    }

    return {
      total: String(summary.total),
      totalSubtext: undefined,
      totalTone: undefined as "ok" | "warn" | "bad" | undefined,
      readable: `${summary.readable}/${summary.total}`,
      readableSubtext: undefined,
      readableTone: (summary.readable === summary.total && summary.total > 0 ? "ok" : "warn") as "ok" | "warn",
      degraded: String(summary.degraded),
      degradedSubtext: undefined,
      degradedTone: (summary.degraded > 0 ? "warn" : "ok") as "ok" | "warn",
      credentials: String(summary.credentialMissing),
      credentialsTone: (summary.credentialMissing > 0 ? "bad" : "ok") as "ok" | "bad",
      consumers: String(summary.consumerPersonas),
      markets: summary.markets.join(" / ") || "—",
    };
  }, [
    personaFocus,
    loading,
    focusLoading,
    visibleRecords.length,
    isUnavailable,
    isDegraded,
    summary,
    translatedSurfaceStatus,
    translatedSurfaceReason,
    surfaceState.isLegacyProjection,
    t,
  ]);

  return (
    <section className="p-6 space-y-5" aria-label={t("mgmt.dataSources.title")}>
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Database className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold text-foreground tracking-tight">
              {t("mgmt.dataSources.title")}
            </h1>
            <Badge
              variant="outline"
              className={
                writesLive
                  ? "bg-status-success/10 text-status-success border-status-success/30"
                  : "bg-muted text-muted-foreground"
              }
            >
              {writesLive ? (
                <ShieldCheck className="h-3 w-3 mr-1 inline" />
              ) : (
                <Shield className="h-3 w-3 mr-1 inline" />
              )}
              {writesLive
                ? t("mgmt.dataSources.header.realWritesOn")
                : t("mgmt.dataSources.header.realWritesOff")}
            </Badge>
            {showSurfaceNonOk && (
              <Badge
                variant="outline"
                className={isUnavailable ? toneClass.bad : toneClass.warn}
                data-testid="data-sources-header-state"
              >
                {translatedSurfaceStatus}
              </Badge>
            )}
            {showSurfaceNonOk && surfaceState.isLegacyProjection && (
              <Badge
                variant="outline"
                className="font-mono text-xs"
                data-testid="data-sources-header-source"
              >
                {t("mgmt.dataSources.legacyProjectionBadge")}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">{t("mgmt.dataSources.subtitle")}</p>
          {showSurfaceNonOk && translatedSurfaceReason && (
            <p
              className="text-xs text-status-warning mt-1"
              data-testid="data-sources-header-reason"
            >
              {t("mgmt.dataSources.surfaceReasonFmt", { reason: translatedSurfaceReason })}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => {
              setWizardPreselectedDef(null);
              setWizardOpen(true);
            }}
            disabled={!writesLive}
            title={!writesLive ? t("mgmt.dataSources.realWritesRequired") : undefined}
            className="shadow-sm"
          >
            <Plus className="h-4 w-4 mr-1" />
            {t("mgmt.dataSources.header.addDataSource")}
          </Button>

          <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
            <RefreshCcw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            {t("mgmt.actions.refresh")}
          </Button>
        </div>
      </header>

      {/* Focus Warning Card if persona or source query parameter active */}
      {hasFocus && (
        <Card
          className={`p-3 text-xs ${
            focusMatched
              ? "border-primary/30 bg-primary/5"
              : "border-status-warning/30 bg-status-warning/10"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-foreground">
              {focusLoading
                ? t("mgmt.dataSources.focusLoadingFmt", {
                    persona: cleanSourceToken(personaFocus) || MISSING_DATA_SOURCE_FIELD_LABEL,
                    source: sourceLabel,
                  })
                : focusMatched
                  ? t("mgmt.dataSources.focusedFmt", {
                      persona: cleanSourceToken(personaFocus) || MISSING_DATA_SOURCE_FIELD_LABEL,
                      source: sourceLabel,
                      count: focusCount,
                    })
                  : t("mgmt.dataSources.focusMissingFmt", {
                      persona: cleanSourceToken(personaFocus) || MISSING_DATA_SOURCE_FIELD_LABEL,
                      source: sourceLabel,
                    })}
            </span>
            <Button asChild size="sm" variant="outline" className="h-7 text-xs">
              <Link to="/management/data-sources">{t("mgmt.dataSources.showAll")}</Link>
            </Button>
          </div>
        </Card>
      )}

      {/* Focused Persona Context Header (Backwards compatibility) */}
      {focusedPersona && (
        <PersonaSourceContext
          persona={focusedPersona}
          records={personaRecords}
          sourceFocus={sourceFocus}
        />
      )}

      {/* Metrics Row */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 text-xs">
        <MetricCard
          label={t("mgmt.dataSources.total")}
          value={metricsDisplay.total}
          subtext={metricsDisplay.totalSubtext}
          tone={metricsDisplay.totalTone}
        />
        <MetricCard
          label={t("mgmt.dataSources.readable")}
          value={metricsDisplay.readable}
          subtext={metricsDisplay.readableSubtext}
          tone={metricsDisplay.readableTone}
        />
        <MetricCard
          label={t("mgmt.dataSources.degraded")}
          value={metricsDisplay.degraded}
          subtext={metricsDisplay.degradedSubtext}
          tone={metricsDisplay.degradedTone}
        />
        <MetricCard
          label={t("mgmt.dataSources.credentials")}
          value={metricsDisplay.credentials}
          tone={metricsDisplay.credentialsTone}
        />
        <MetricCard
          label={t("mgmt.dataSources.consumers")}
          value={metricsDisplay.consumers}
        />
        <MetricCard
          label={t("mgmt.dataSources.markets")}
          value={metricsDisplay.markets}
        />
      </div>

      {/* When Persona focus is active, show persona focus table */}
      {personaFocus ? (
        <div className="space-y-4">
          {(loading || focusLoading) && visibleRecords.length === 0 && (
            <Card className="p-8 text-center text-sm text-muted-foreground" data-testid="persona-loading">
              {t("mgmt.dataSources.loadingLive")}
            </Card>
          )}

          {!loading && !focusLoading && visibleRecords.length === 0 && (
            <Card className="p-8 text-center text-sm" data-testid="persona-no-rows">
              <div className="font-medium text-foreground">
                {t("mgmt.dataSources.focusNoRowsTitle")}
              </div>
              <p className="mt-1 text-muted-foreground text-xs">
                {t("mgmt.dataSources.focusNoRowsBody")}
              </p>
            </Card>
          )}

          {visibleRecords.length > 0 && (
            <PersonaDataSourceTable records={visibleRecords as SystemDataSourceRecord[]} />
          )}
        </div>
      ) : (
        /* Main Tabs Navigation for General Control Center */
        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
          <TabsList className="grid grid-cols-4 w-full max-w-lg text-xs">
            <TabsTrigger value="instances" className="flex items-center gap-1.5">
              <Database className="h-3.5 w-3.5" />
              {t("mgmt.dataSources.tabs.instances")}
            </TabsTrigger>
            <TabsTrigger value="catalog" className="flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5" />
              {t("mgmt.dataSources.tabs.catalog")}
            </TabsTrigger>
            <TabsTrigger value="runs" className="flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5" />
              {t("mgmt.dataSources.tabs.runs")}
            </TabsTrigger>
            <TabsTrigger value="receipts" className="flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              {t("mgmt.dataSources.tabs.receipts")}
            </TabsTrigger>
          </TabsList>

          {/* Tab 1: Instances Table */}
          <TabsContent value="instances" className="space-y-4">
            {/* Loading State */}
            {loading && visibleRecords.length === 0 && (
              <Card className="p-8 text-center text-sm text-muted-foreground" data-testid="data-sources-loading">
                <div className="flex items-center justify-center gap-2">
                  <RefreshCcw className="h-4 w-4 animate-spin text-primary" />
                  <span>{t("mgmt.dataSources.loadingLive")}</span>
                </div>
              </Card>
            )}

            {/* Authoritative Empty State */}
            {!loading && visibleRecords.length === 0 && isAuthoritativeEmpty && !isUnavailable && !isDegraded && (
              <Card className="p-8 text-center text-sm space-y-3" data-testid="data-sources-authoritative-empty">
                <div className="mx-auto w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <Database className="h-5 w-5" />
                </div>
                <div className="font-semibold text-foreground text-base">
                  {t("mgmt.dataSources.emptyTitle")}
                </div>
                <p className="text-muted-foreground text-xs max-w-md mx-auto">
                  {t("mgmt.dataSources.emptyBody")}
                </p>
                <div className="pt-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      setWizardPreselectedDef(null);
                      setWizardOpen(true);
                    }}
                    disabled={!writesLive}
                    title={!writesLive ? t("mgmt.dataSources.realWritesRequired") : undefined}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    {t("mgmt.dataSources.header.addDataSource")}
                  </Button>
                </div>
              </Card>
            )}

            {/* Unavailable State */}
            {!loading && visibleRecords.length === 0 && isUnavailable && (
              <Card className="p-8 text-center text-sm space-y-3 border-status-warning/30 bg-status-warning/5" data-testid="data-sources-unavailable">
                <div className="mx-auto w-10 h-10 rounded-full bg-status-warning/10 flex items-center justify-center text-status-warning">
                  <Shield className="h-5 w-5" />
                </div>
                <div className="font-semibold text-foreground text-base">
                  {t("mgmt.dataSources.liveDataUnavailableTitle")}
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
                  <Badge variant="outline" className={toneClass.bad}>
                    {translatedSurfaceStatus}
                  </Badge>
                  {translatedSurfaceReason && (
                    <span className="text-muted-foreground">
                      {t("mgmt.dataSources.surfaceReasonFmt", { reason: translatedSurfaceReason })}
                    </span>
                  )}
                </div>
                <p className="text-muted-foreground text-xs max-w-md mx-auto">
                  {t("mgmt.dataSources.liveDataUnavailableBody")}
                </p>
                <div className="pt-2">
                  <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
                    <RefreshCcw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
                    {t("mgmt.actions.refresh")}
                  </Button>
                </div>
              </Card>
            )}

            {/* Degraded / Legacy Projection Banner */}
            {!loading && isDegradedLegacy && (
              <Card className="p-3.5 border-status-warning/40 bg-status-warning/10 text-xs flex items-start gap-2.5 text-status-warning" data-testid="degraded-legacy-banner">
                <Shield className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-foreground">
                      {t("mgmt.dataSources.degradedLegacyBannerTitle")}
                    </span>
                    <Badge variant="outline" className={toneClass.warn}>
                      {translatedSurfaceStatus}
                    </Badge>
                    {surfaceState.isLegacyProjection && (
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {t("mgmt.dataSources.legacyProjectionSource")}
                      </Badge>
                    )}
                  </div>
                  {translatedSurfaceReason && (
                    <div className="text-foreground">
                      {t("mgmt.dataSources.surfaceReasonFmt", { reason: translatedSurfaceReason })}
                    </div>
                  )}
                  <p className="text-muted-foreground">
                    {t("mgmt.dataSources.degradedLegacyBannerDesc")}
                  </p>
                </div>
              </Card>
            )}

            {/* Instances Table */}
            {!loading && (visibleRecords.length > 0 || isUnavailable || isDegraded) && (
              <DataSourceInstancesTable
                records={visibleRecords}
                surfaceStatus={surfaceState.status}
                surfaceSource={surfaceState.source}
                surfaceReason={translatedSurfaceReason}
                isLegacyProjection={surfaceState.isLegacyProjection}
                onSelectSource={handleSelectSource}
                onExecuteAction={handleExecuteAction}
              />
            )}
          </TabsContent>

          {/* Tab 2: Catalog Panel */}
          <TabsContent value="catalog">
            <DataSourceCatalogPanel onCreateFromDefinition={handleCreateFromDefinition} />
          </TabsContent>

          {/* Tab 3: Runs & Health */}
          <TabsContent value="runs">
            <DataSourceRunsPanel
              sources={v2Sources}
              onSelectSource={(id) => handleSelectSource(id, null)}
            />
          </TabsContent>

          {/* Tab 4: Change History Receipts */}
          <TabsContent value="receipts">
            <DataSourceReceiptPanel sources={v2Sources} />
          </TabsContent>
        </Tabs>
      )}

      {/* Add Wizard Modal */}
      <DataSourceAddWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        preselectedDefinitionId={wizardPreselectedDef}
        onSourceCreated={() => {
          refresh();
        }}
      />

      {/* Detail Drawer */}
      <DataSourceDetailDrawer
        open={detailDrawerOpen}
        onOpenChange={setDetailDrawerOpen}
        sourceInstanceId={selectedInstanceId}
        initialSource={selectedV2DTO}
        onSourceUpdated={() => {
          refresh();
        }}
      />

      {/* Governed Action Command Dialog */}
      <DataSourceCommandDialog
        open={commandDialogOpen}
        onOpenChange={setCommandDialogOpen}
        actionKey={commandAction}
        targetSource={commandTargetSource}
        onCommandSuccess={() => {
          refresh();
        }}
      />
    </section>
  );
}

function PersonaSourceContext({
  persona,
  records,
  sourceFocus,
}: {
  persona: ManagementPersonaFleetRow;
  records: SystemDataSourceRecord[];
  sourceFocus: string;
}) {
  const { t } = useTranslation();
  const status = dataSourceStatus(persona);
  const refs = [...(status?.readbackRefs ?? []), ...(status?.unavailableRefs ?? [])]
    .map((r) => cleanSourceToken(r))
    .filter((r): r is string => Boolean(r))
    .slice(0, 4);
  const stateToken = cleanSourceToken(dataSourceState(persona));

  return (
    <Card className="border-primary/20 px-3 py-3 text-xs space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-foreground">
          {cleanSourceToken(persona.personaName) || cleanSourceToken(persona.personaId) || MISSING_DATA_SOURCE_FIELD_LABEL}
        </span>
        <code className="text-muted-foreground">
          {cleanSourceToken(persona.personaId) || MISSING_DATA_SOURCE_FIELD_LABEL}
        </code>
        <Badge
          variant="outline"
          className={records.length > 0 ? "bg-status-success/10 text-status-success" : "bg-status-warning/10 text-status-warning"}
        >
          {records.length} {t("mgmt.dataSources.total").toLowerCase()}
        </Badge>
        {cleanSourceToken(sourceFocus) && <Badge variant="outline">{cleanSourceToken(sourceFocus)}</Badge>}
        {stateToken && <Badge variant="outline">{fmtToken(stateToken, MISSING_DATA_SOURCE_FIELD_LABEL)}</Badge>}
      </div>
      {cleanSourceToken(status?.summary) && (
        <p className="mt-1 text-muted-foreground">{cleanSourceToken(status?.summary)}</p>
      )}
      {refs.length > 0 && (
        <div className="mt-2 space-y-1">
          {refs.map((ref) => (
            <div key={ref} className="truncate font-mono text-muted-foreground">
              {ref}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function PersonaDataSourceTable({ records }: { records: SystemDataSourceRecord[] }) {
  const { t } = useTranslation();
  return (
    <Card>
      <ManagementTableScroll minScrollWidth={1120}>
        <table className="w-full min-w-[1120px] text-sm">
          <thead className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2">{t("mgmt.dataSources.source")}</th>
              <th className="px-3 py-2">{t("mgmt.dataSources.health")}</th>
              <th className="px-3 py-2">{t("mgmt.dataSources.connection")}</th>
              <th className="px-3 py-2">{t("mgmt.dataSources.consumers")}</th>
              <th className="px-3 py-2">{t("mgmt.dataSources.evidence")}</th>
              <th className="px-3 py-2">{t("mgmt.dataSources.controls")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {records.map((record, index) => (
              <PersonaDataSourceRow
                key={`${record.providerKey}-${index}`}
                record={record}
              />
            ))}
          </tbody>
        </table>
      </ManagementTableScroll>
    </Card>
  );
}

function PersonaDataSourceRow({ record }: { record: SystemDataSourceRecord }) {
  const { t } = useTranslation();
  const refs = [...record.evidenceRefs, ...record.unavailableRefs]
    .map((r) => cleanSourceToken(r))
    .filter((r): r is string => Boolean(r))
    .slice(0, 2);
  const sideEffectsOn = record.orderSideEffectsAllowed || record.capitalSideEffectsAllowed;
  const providerLabel = cleanSourceToken(record.provider) || MISSING_DATA_SOURCE_FIELD_LABEL;
  const providerKeyLabel = cleanSourceToken(record.providerKey) || MISSING_DATA_SOURCE_FIELD_LABEL;
  const statusLabelText = fmtToken(record.status, MISSING_DATA_SOURCE_FIELD_LABEL);
  const credentialLabelText = fmtToken(record.credentialState, MISSING_DATA_SOURCE_FIELD_LABEL);

  return (
    <tr className="border-b border-border/50 align-top text-xs">
      <td className="px-3 py-3 min-w-[220px]">
        <div className="font-medium text-foreground">{providerLabel}</div>
        <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">{providerKeyLabel}</div>
        <div className="mt-1 flex flex-wrap gap-1">
          {record.markets
            .map((m) => cleanSourceToken(m))
            .filter((m): m is string => Boolean(m))
            .map((market) => (
              <Badge key={market} variant="outline" className="text-[10px]">
                {market}
              </Badge>
            ))}
          {record.sourceClasses
            .map((sc) => cleanSourceToken(sc))
            .filter((sc): sc is string => Boolean(sc))
            .map((sourceClass) => (
              <Badge key={sourceClass} variant="outline" className="text-[10px]">
                {fmtToken(sourceClass, MISSING_DATA_SOURCE_FIELD_LABEL)}
              </Badge>
            ))}
        </div>
      </td>
      <td className="px-3 py-3 min-w-[180px]">
        <Badge variant="outline" className={toneClass[record.tone]}>
          {statusLabelText}
        </Badge>
        <div className="mt-1 text-muted-foreground">
          {cleanSourceToken(record.lastReadbackAt)
            ? cleanSourceToken(record.lastReadbackAt)!.slice(0, 19).replace("T", " ")
            : t("mgmt.dataSources.noReadback")}
        </div>
      </td>
      <td className="px-3 py-3 min-w-[180px] space-y-0.5">
        <div>
          {t("mgmt.dataSources.credential")}: <span className="font-mono text-foreground">{credentialLabelText}</span>
        </div>
        <div>{record.liveIngestionEnabled ? t("mgmt.dataSources.liveOn") : t("mgmt.dataSources.liveOff")}</div>
        <div>{record.readOnly ? t("mgmt.dataSources.readOnly") : t("mgmt.dataSources.writeCapable")}</div>
      </td>
      <td className="px-3 py-3 min-w-[220px]">
        <div className="flex flex-wrap gap-1">
          {record.consumerPersonaIds.map((personaId, index) => (
            <Link
              key={personaId}
              to={`/management/personas/${encodeURIComponent(personaId)}`}
              className="font-mono text-primary hover:underline"
            >
              {cleanSourceToken(record.consumerPersonaNames[index]) ?? personaId}
            </Link>
          ))}
        </div>
      </td>
      <td className="px-3 py-3 min-w-[260px]">
        {refs.length === 0 ? (
          <span className="text-muted-foreground">{t("mgmt.dataSources.noEvidence")}</span>
        ) : (
          <div className="space-y-1">
            {refs.map((ref) => (
              <div key={ref} className="font-mono text-muted-foreground truncate max-w-[320px]">
                {ref}
              </div>
            ))}
          </div>
        )}
      </td>
      <td className="px-3 py-3 min-w-[190px]">
        <div className="flex flex-wrap gap-1">
          <Badge variant="outline" className={sideEffectsOn ? toneClass.warn : toneClass.ok}>
            {sideEffectsOn ? t("mgmt.dataSources.sideEffectsOn") : t("mgmt.dataSources.sideEffectsOff")}
          </Badge>
          {record.orderCapableProvider && (
            <Badge variant="outline" className="text-[10px]">
              {t("mgmt.dataSources.orderCapable")}
            </Badge>
          )}
        </div>
        <Button asChild size="sm" variant="outline" className="mt-2 h-7 px-2 text-xs">
          <Link to="/management/evidence">{t("mgmt.actions.evidence")}</Link>
        </Button>
      </td>
    </tr>
  );
}

function MetricCard({
  label,
  value,
  subtext,
  tone,
}: {
  label: string;
  value: string;
  subtext?: string;
  tone?: "ok" | "warn" | "bad";
}) {
  const color =
    tone === "bad"
      ? "text-status-failed"
      : tone === "warn"
        ? "text-status-warning"
        : tone === "ok"
          ? "text-status-success"
          : "text-foreground";

  return (
    <Card className="p-3">
      <div className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className={`mt-1 font-mono text-base font-semibold ${color} truncate`}>{value}</div>
      {subtext && (
        <div className="mt-0.5 text-[11px] text-muted-foreground truncate" title={subtext}>
          {subtext}
        </div>
      )}
    </Card>
  );
}
