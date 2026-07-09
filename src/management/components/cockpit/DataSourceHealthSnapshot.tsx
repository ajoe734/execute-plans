import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Database } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ManagementPersonaFleetRow } from "@/lib/bff-v1/management";
import {
  buildSystemDataSourceRegistry,
  summarizeSystemDataSources,
  type DataSourceHealthTone,
} from "@/lib/v5/management/systemDataSources";

const toneClass: Record<DataSourceHealthTone, string> = {
  ok: "bg-status-success/10 text-status-success border-status-success/30",
  warn: "bg-status-warning/15 text-status-warning border-status-warning/30",
  bad: "bg-status-failed/10 text-status-failed border-status-failed/30",
  muted: "bg-muted text-muted-foreground",
};

function fmtToken(value: string): string {
  return value.replace(/_/g, " ");
}

export function DataSourceHealthSnapshot({ rows }: { rows: ManagementPersonaFleetRow[] }) {
  const { t } = useTranslation();
  const records = buildSystemDataSourceRegistry(rows);
  const summary = summarizeSystemDataSources(records);
  const attention = records.filter((record) => record.tone === "bad" || record.tone === "warn").slice(0, 3);

  return (
    <Card className="p-4">
      <header className="flex items-center justify-between mb-3 gap-3">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Database className="h-4 w-4 text-muted-foreground" />
          {t("mgmt.dataSources.cockpitTitle")}
        </h3>
        <Link to="/management/data-sources" className="text-xs text-primary hover:underline">
          {t("mgmt.actions.openDetail")} →
        </Link>
      </header>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <Stat label={t("mgmt.dataSources.total")} value={String(summary.total)} />
        <Stat label={t("mgmt.dataSources.readable")} value={`${summary.readable}/${summary.total}`} tone={summary.readable === summary.total ? "ok" : "warn"} />
        <Stat label={t("mgmt.dataSources.degraded")} value={String(summary.degraded)} tone={summary.degraded > 0 ? "warn" : "ok"} />
        <Stat label={t("mgmt.dataSources.credentials")} value={String(summary.credentialMissing)} tone={summary.credentialMissing > 0 ? "bad" : "ok"} />
        <Stat label={t("mgmt.dataSources.liveIngestion")} value={`${summary.liveIngestionOn}/${summary.total}`} />
        <Stat label={t("mgmt.dataSources.orderSideEffects")} value={String(summary.orderSideEffectsOn)} tone={summary.orderSideEffectsOn > 0 ? "warn" : "ok"} />
      </div>

      <div className="mt-3 pt-3 border-t border-border space-y-1.5">
        {attention.length === 0 ? (
          <div className="text-xs text-muted-foreground">{t("mgmt.dataSources.noAttention")}</div>
        ) : attention.map((record) => (
          <div key={record.providerKey} className="flex items-center justify-between gap-2 text-xs">
            <span className="font-mono text-foreground truncate">{record.providerKey}</span>
            <Badge variant="outline" className={toneClass[record.tone]}>{fmtToken(record.status)}</Badge>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Stat({
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
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground truncate">{label}</span>
      <span className={`font-mono ${color}`}>{value}</span>
    </div>
  );
}
