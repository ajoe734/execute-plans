import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Database, RefreshCcw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { mgmt } from "@/lib/bff-v1";
import {
  buildSystemDataSourceRegistry,
  summarizeSystemDataSources,
  type DataSourceHealthTone,
  type SystemDataSourceRecord,
} from "@/lib/v5/management/systemDataSources";
import { useV5Live } from "@/management/pages/v5/useV5Live";
import { PERSONA_FLEET_SEED } from "./_core";

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

export function DataSourceManagementPage() {
  const { t } = useTranslation();
  const { data, loading, refresh } = useV5Live(() => mgmt.personaFleet.get(() => PERSONA_FLEET_SEED), []);
  const rows = data ?? PERSONA_FLEET_SEED;
  const records = useMemo(() => buildSystemDataSourceRegistry(rows), [rows]);
  const summary = useMemo(() => summarizeSystemDataSources(records), [records]);

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

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Metric label={t("mgmt.dataSources.total")} value={String(summary.total)} />
        <Metric label={t("mgmt.dataSources.readable")} value={`${summary.readable}/${summary.total}`} tone={summary.readable === summary.total ? "ok" : "warn"} />
        <Metric label={t("mgmt.dataSources.degraded")} value={String(summary.degraded)} tone={summary.degraded > 0 ? "warn" : "ok"} />
        <Metric label={t("mgmt.dataSources.credentials")} value={String(summary.credentialMissing)} tone={summary.credentialMissing > 0 ? "bad" : "ok"} />
        <Metric label={t("mgmt.dataSources.consumers")} value={String(summary.consumerPersonas)} />
        <Metric label={t("mgmt.dataSources.markets")} value={joinOrDash(summary.markets)} />
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
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
      </Card>
    </section>
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
