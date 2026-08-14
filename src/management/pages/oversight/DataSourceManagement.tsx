import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Database, RefreshCcw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ManagementTableScroll } from "@/management/components/ManagementTableScroll";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { managementConsoleReads, mgmt } from "@/lib/bff-v1";
import type { ManagementDataSource, ManagementPersonaFleetRow } from "@/lib/bff-v1/management";
import {
  dataSourceTone,
  summarizeSystemDataSources,
  type DataSourceHealthTone,
  type SystemDataSourceSummary,
  type SystemDataSourceRecord,
} from "@/lib/v5/management/systemDataSources";
import { useV5Live } from "@/management/pages/v5/useV5Live";
import {
  dataSourceProviderCount,
  dataSourceProviderStatusCounts,
  dataSourceState,
  dataSourceStatus,
  personaFleetDataSources,
} from "./personaFleetDataSources";

const toneClass: Record<DataSourceHealthTone, string> = {
  ok: "bg-status-success/10 text-status-success border-status-success/30",
  warn: "bg-status-warning/15 text-status-warning border-status-warning/30",
  bad: "bg-status-failed/10 text-status-failed border-status-failed/30",
  muted: "bg-muted text-muted-foreground",
};

function fmtToken(value?: string): string {
  return value ? value.replace(/_/g, " ") : "—";
}

function joinOrDash(values: string[]): string {
  return values.length ? values.join(" / ") : "—";
}

function matchesToken(needle: string, values: string[]): boolean {
  const normalized = needle.trim().toLowerCase();
  return values.some((value) => value.trim().toLowerCase() === normalized);
}

function unique(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function sourceMatches(record: SystemDataSourceRecord, sourceFocus: string): boolean {
  return matchesToken(sourceFocus, [
    record.providerKey,
    record.provider,
    ...record.sourceClasses,
  ]);
}

function credentialStateFor(status: string, source?: ManagementDataSource): SystemDataSourceRecord["credentialState"] {
  if (/credential/i.test(status)) return "missing";
  if (dataSourceTone(status) === "ok") return "configured";
  if (source?.sourceClass === "official_reference") return "not_required";
  return "unknown";
}

function refsForProvider(refs: string[] | undefined, providerKey: string): string[] {
  const normalized = providerKey.toLowerCase();
  const matches = (refs ?? []).filter((ref) => ref.toLowerCase().includes(normalized));
  return matches.length > 0 ? matches : refs ?? [];
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

function personaSourceRecord(persona: ManagementPersonaFleetRow, source: ManagementDataSource): SystemDataSourceRecord {
  const status = dataSourceStatus(persona);
  const providerKey = source.providerKey || "nan";
  const sourceStatus = source.status || dataSourceState(persona) || "nan";
  return {
    providerKey,
    provider: source.provider || providerKey || "nan",
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
    consumerPersonaNames: [persona.personaName || persona.personaId],
    evidenceRefs: unique([
      source.evidenceRef,
      ...refsForProvider(status?.readbackRefs, providerKey),
      status?.researchDatasetRef,
      status?.researchDatasetManifestRef,
    ]),
    unavailableRefs: refsForProvider(status?.unavailableRefs, providerKey),
    lastReadbackAt: status?.readbackCapturedAt,
    reasons: unique([source.reason, status?.summary]),
  };
}

function fallbackPersonaSourceRecord(persona: ManagementPersonaFleetRow): SystemDataSourceRecord | null {
  const status = dataSourceStatus(persona);
  if (!status) return null;
  const sourceStatus = dataSourceState(persona) || firstStatusCount(persona) || "nan";
  return {
    providerKey: "nan",
    provider: "nan",
    markets: persona.marketScope ?? [],
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
    consumerPersonaNames: [persona.personaName || persona.personaId],
    evidenceRefs: unique([
      ...(status.readbackRefs ?? []),
      status.researchDatasetRef,
      status.researchDatasetManifestRef,
    ]),
    unavailableRefs: status.unavailableRefs ?? [],
    lastReadbackAt: status.readbackCapturedAt,
    reasons: unique([status.summary]),
  };
}

function personaDataSourceRecords(persona: ManagementPersonaFleetRow): SystemDataSourceRecord[] {
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

export function DataSourceManagementPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const personaFocus = searchParams.get("persona")?.trim() ?? "";
  const sourceFocus = searchParams.get("source")?.trim() ?? "";
  const { data, loading, refresh } = useV5Live(() => managementConsoleReads.dataSources(), []);
  const { data: fleetRows, loading: fleetLoading } = useV5Live(() => mgmt.personaFleet.get(), []);
  const records: SystemDataSourceRecord[] = useMemo(() => data?.items ?? [], [data]);
  const focusedPersona = useMemo(
    () => (fleetRows ?? []).find((row) => row.personaId === personaFocus),
    [fleetRows, personaFocus],
  );
  const personaRecords = useMemo(() => {
    if (!focusedPersona) return [];
    return personaDataSourceRecords(focusedPersona);
  }, [focusedPersona]);
  const visibleRecords = useMemo(() => {
    const scoped = personaFocus ? personaRecords : records;
    if (!sourceFocus) return scoped;
    return scoped.filter((record) => sourceMatches(record, sourceFocus));
  }, [personaFocus, personaRecords, records, sourceFocus]);
  const summary = useMemo(
    () => (focusedPersona
      ? summarizeFocusedPersona(focusedPersona, visibleRecords, sourceFocus)
      : summarizeSystemDataSources(visibleRecords)),
    [focusedPersona, sourceFocus, visibleRecords],
  );
  const hasFocus = Boolean(personaFocus || sourceFocus);
  const focusLoading = Boolean(personaFocus && fleetLoading && fleetRows === undefined);
  const personaMatched = !personaFocus || Boolean(focusedPersona);
  const sourceMatched = !sourceFocus || visibleRecords.length > 0;
  const focusMatched = focusLoading || (personaMatched && sourceMatched);
  const focusCount = visibleRecords.length;
  const sourceLabel = sourceFocus || t("mgmt.dataSources.allSources");

  return (
    <section className="p-6 space-y-4" aria-label={t("mgmt.dataSources.title")}>
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <Database className="h-6 w-6 text-muted-foreground" />
            {t("mgmt.dataSources.title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("mgmt.dataSources.subtitle")}</p>
        </div>
        <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
          <RefreshCcw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
          {t("mgmt.actions.refresh")}
        </Button>
      </header>

      {hasFocus && (
        <Card className={`p-3 text-sm ${focusMatched ? "border-primary/30 bg-primary/5" : "border-status-warning/30 bg-status-warning/10"}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-foreground">
              {focusLoading
                ? t("mgmt.dataSources.focusLoadingFmt", { persona: personaFocus, source: sourceLabel })
                : focusMatched
                  ? t("mgmt.dataSources.focusedFmt", { persona: personaFocus || "nan", source: sourceLabel, count: focusCount })
                  : t("mgmt.dataSources.focusMissingFmt", { persona: personaFocus || "nan", source: sourceLabel })}
            </span>
            <Button asChild size="sm" variant="outline">
              <Link to="/management/data-sources">{t("mgmt.dataSources.showAll")}</Link>
            </Button>
          </div>
        </Card>
      )}

      {focusedPersona && (
        <PersonaSourceContext
          persona={focusedPersona}
          records={visibleRecords}
          sourceFocus={sourceFocus}
        />
      )}

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Metric label={t("mgmt.dataSources.total")} value={String(summary.total)} />
        <Metric label={t("mgmt.dataSources.readable")} value={`${summary.readable}/${summary.total}`} tone={summary.readable === summary.total ? "ok" : "warn"} />
        <Metric label={t("mgmt.dataSources.degraded")} value={String(summary.degraded)} tone={summary.degraded > 0 ? "warn" : "ok"} />
        <Metric label={t("mgmt.dataSources.credentials")} value={String(summary.credentialMissing)} tone={summary.credentialMissing > 0 ? "bad" : "ok"} />
        <Metric label={t("mgmt.dataSources.consumers")} value={String(summary.consumerPersonas)} />
        <Metric label={t("mgmt.dataSources.markets")} value={joinOrDash(summary.markets)} />
      </div>

      {(loading || focusLoading) && visibleRecords.length === 0 && (
        <Card className="p-4 text-sm text-muted-foreground">
          {t("mgmt.dataSources.loadingLive")}
        </Card>
      )}

      {!loading && !focusLoading && visibleRecords.length === 0 && (
        <Card className="p-4 text-sm">
          <div className="font-medium text-foreground">
            {hasFocus ? t("mgmt.dataSources.focusNoRowsTitle") : t("mgmt.dataSources.liveDataUnavailableTitle")}
          </div>
          <p className="mt-1 text-muted-foreground">
            {hasFocus ? t("mgmt.dataSources.focusNoRowsBody") : t("mgmt.dataSources.liveDataUnavailableBody")}
          </p>
        </Card>
      )}

      {visibleRecords.length > 0 && (
        <DataSourceTable records={visibleRecords} />
      )}
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
  const refs = [...(status?.readbackRefs ?? []), ...(status?.unavailableRefs ?? [])].slice(0, 4);

  return (
    <Card className="border-primary/20 px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-foreground">{persona.personaName ?? persona.personaId}</span>
        <code className="text-xs text-muted-foreground">{persona.personaId}</code>
        <Badge variant="outline" className={records.length > 0 ? toneClass.ok : toneClass.warn}>
          {records.length} {t("mgmt.dataSources.total").toLowerCase()}
        </Badge>
        {sourceFocus && <Badge variant="outline">{sourceFocus}</Badge>}
        {dataSourceState(persona) && <Badge variant="outline">{fmtToken(dataSourceState(persona))}</Badge>}
      </div>
      {status?.summary && <p className="mt-1 text-xs text-muted-foreground">{status.summary}</p>}
      {refs.length > 0 && (
        <div className="mt-2 space-y-1">
          {refs.map((ref) => (
            <div key={ref} className="truncate font-mono text-xs text-muted-foreground">{ref}</div>
          ))}
        </div>
      )}
    </Card>
  );
}

function DataSourceTable({ records }: { records: SystemDataSourceRecord[] }) {
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
        <tbody>
          {records.map((record) => (
            <DataSourceRow key={record.providerKey} record={record} />
          ))}
        </tbody>
      </table>
      </ManagementTableScroll>
    </Card>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn" | "bad";
}) {
  const color = tone === "bad"
    ? "text-status-failed"
    : tone === "warn"
      ? "text-status-warning"
      : tone === "ok"
        ? "text-status-success"
        : "text-foreground";
  return (
    <Card className="p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 font-mono text-lg ${color}`}>{value}</div>
    </Card>
  );
}

function DataSourceRow({ record }: { record: SystemDataSourceRecord }) {
  const { t } = useTranslation();
  const refs = [...record.evidenceRefs, ...record.unavailableRefs].slice(0, 2);
  const sideEffectsOn = record.orderSideEffectsAllowed || record.capitalSideEffectsAllowed;

  return (
    <tr className="border-b border-border/50 align-top">
      <td className="px-3 py-3 min-w-[220px]">
        <div className="font-medium text-foreground">{record.provider}</div>
        <div className="mt-0.5 font-mono text-xs text-muted-foreground">{record.providerKey}</div>
        <div className="mt-1 flex flex-wrap gap-1">
          {record.markets.map((market) => <Badge key={market} variant="outline" className="text-[10px]">{market}</Badge>)}
          {record.sourceClasses.map((sourceClass) => <Badge key={sourceClass} variant="outline" className="text-[10px]">{fmtToken(sourceClass)}</Badge>)}
        </div>
      </td>
      <td className="px-3 py-3 min-w-[180px]">
        <Badge variant="outline" className={toneClass[record.tone]}>{fmtToken(record.status)}</Badge>
        <div className="mt-1 text-xs text-muted-foreground">
          {record.lastReadbackAt ? record.lastReadbackAt.slice(0, 19).replace("T", " ") : t("mgmt.dataSources.noReadback")}
        </div>
      </td>
      <td className="px-3 py-3 min-w-[180px] text-xs">
        <div>{t("mgmt.dataSources.credential")}: <span className="font-mono text-foreground">{fmtToken(record.credentialState)}</span></div>
        <div>{record.liveIngestionEnabled ? t("mgmt.dataSources.liveOn") : t("mgmt.dataSources.liveOff")}</div>
        <div>{record.readOnly ? t("mgmt.dataSources.readOnly") : t("mgmt.dataSources.writeCapable")}</div>
      </td>
      <td className="px-3 py-3 min-w-[220px]">
        <div className="flex flex-wrap gap-1">
          {record.consumerPersonaIds.map((personaId, index) => (
            <Link
              key={personaId}
              to={`/management/personas/${encodeURIComponent(personaId)}`}
              className="font-mono text-xs text-primary hover:underline"
            >
              {record.consumerPersonaNames[index] ?? personaId}
            </Link>
          ))}
        </div>
      </td>
      <td className="px-3 py-3 min-w-[260px]">
        {refs.length === 0 ? (
          <span className="text-xs text-muted-foreground">{t("mgmt.dataSources.noEvidence")}</span>
        ) : (
          <div className="space-y-1">
            {refs.map((ref) => (
              <div key={ref} className="font-mono text-xs text-muted-foreground truncate max-w-[320px]">{ref}</div>
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
            <Badge variant="outline" className="text-[10px]">{t("mgmt.dataSources.orderCapable")}</Badge>
          )}
        </div>
        <Button asChild size="sm" variant="outline" className="mt-2 h-7 px-2 text-xs">
          <Link to="/management/evidence">{t("mgmt.actions.evidence")}</Link>
        </Button>
      </td>
    </tr>
  );
}
