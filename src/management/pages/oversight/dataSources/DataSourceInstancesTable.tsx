// Data source instances table with 9 canonical columns and server-governed allowedActions (SD-SRCM-04).

import React from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  ExternalLink,
  Eye,
  KeyRound,
  MoreHorizontal,
  Shield,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ManagementTableScroll } from "@/management/components/ManagementTableScroll";
import type { ManagementDataSourceV2DTO } from "@/lib/bff-v1/managementDataSources";
import type { SystemDataSourceRecord } from "@/lib/v5/management/systemDataSources";
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
  isV2,
  joinOrDash,
  lifecycleTone,
  reconciliationTone,
  toneClass,
} from "./dataSourceModels";
import {
  DATA_SOURCE_ACTIONS,
  isActionAllowed,
  type DataSourceActionKey,
} from "./dataSourceActions";

export interface DataSourceInstancesTableProps {
  records: Array<ManagementDataSourceV2DTO | SystemDataSourceRecord>;
  onSelectSource: (sourceId: string, item: ManagementDataSourceV2DTO | null) => void;
  onExecuteAction: (actionKey: DataSourceActionKey, source: ManagementDataSourceV2DTO) => void;
}

export function DataSourceInstancesTable({
  records,
  onSelectSource,
  onExecuteAction,
}: DataSourceInstancesTableProps) {
  const { t } = useTranslation();

  return (
    <Card className="overflow-hidden border">
      <ManagementTableScroll minScrollWidth={1380}>
        <table className="w-full min-w-[1380px] text-xs" aria-label={t("mgmt.dataSources.title")}>
          <thead className="border-b border-border bg-muted/40 text-left uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5 font-medium">{t("mgmt.dataSources.columns.sourceProvider")}</th>
              <th className="px-3 py-2.5 font-medium">{t("mgmt.dataSources.columns.supportDeployment")}</th>
              <th className="px-3 py-2.5 font-medium">{t("mgmt.dataSources.columns.desiredLifecycle")}</th>
              <th className="px-3 py-2.5 font-medium">{t("mgmt.dataSources.columns.observedHealth")}</th>
              <th className="px-3 py-2.5 font-medium">{t("mgmt.dataSources.columns.credentialLicense")}</th>
              <th className="px-3 py-2.5 font-medium">{t("mgmt.dataSources.columns.scheduleWatermark")}</th>
              <th className="px-3 py-2.5 font-medium">{t("mgmt.dataSources.columns.latestRunSearch")}</th>
              <th className="px-3 py-2.5 font-medium">{t("mgmt.dataSources.columns.consumersCost")}</th>
              <th className="px-3 py-2.5 font-medium text-right">{t("mgmt.dataSources.columns.actions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {records.map((item, index) => {
              if (isV2(item)) {
                return (
                  <V2DataSourceRow
                    key={item.source_instance_id || item.connector_id || `v2-${index}`}
                    dto={item}
                    onSelect={() => onSelectSource(item.source_instance_id || item.connector_id, item)}
                    onAction={(action) => onExecuteAction(action, item)}
                  />
                );
              }
              return (
                <LegacyDataSourceRow
                  key={(item as SystemDataSourceRecord).providerKey || `legacy-${index}`}
                  record={item as SystemDataSourceRecord}
                  onSelect={() => onSelectSource((item as SystemDataSourceRecord).providerKey, null)}
                />
              );
            })}
          </tbody>
        </table>
      </ManagementTableScroll>
    </Card>
  );
}

function V2DataSourceRow({
  dto,
  onSelect,
  onAction,
}: {
  dto: ManagementDataSourceV2DTO;
  onSelect: () => void;
  onAction: (actionKey: DataSourceActionKey) => void;
}) {
  const { t } = useTranslation();
  const sourceId = dto.source_instance_id || dto.connector_id;
  const divergence = hasDivergence(dto);
  const allowedActions = dto.allowed_actions || dto.allowedActions;
  const isEnabled = dto.desired?.desired_lifecycle === "enabled";

  const writesLive = realWritesEnabled();

  return (
    <tr className="hover:bg-muted/30 transition-colors align-top">
      {/* 1. Source / Provider */}
      <td className="px-3 py-3 min-w-[210px]">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-foreground cursor-pointer hover:underline" onClick={onSelect}>
            {dto.provider || dto.definition?.provider || sourceId}
          </span>
          {divergence && (
            <span title={t("mgmt.dataSources.detail.divergenceTitle")}>
              <AlertTriangle className="h-3.5 w-3.5 text-status-warning inline" />
            </span>
          )}
        </div>
        <div className="font-mono text-[11px] text-muted-foreground mt-0.5">{sourceId}</div>
        <div className="flex flex-wrap gap-1 mt-1.5">
          {(dto.instance?.markets ?? dto.definition?.markets ?? []).map((m) => (
            <Badge key={m} variant="outline" className="text-[10px] px-1 py-0 font-mono">
              {m}
            </Badge>
          ))}
          {dto.source_class && (
            <Badge key={dto.source_class} variant="outline" className="text-[10px] px-1 py-0">
              {fmtToken(dto.source_class)}
            </Badge>
          )}
        </div>
      </td>

      {/* 2. Support / Deployment */}
      <td className="px-3 py-3 min-w-[170px]">
        <div className="flex items-center gap-1">
          <Badge
            variant="outline"
            className={
              dto.definition?.definition_state === "supported"
                ? "bg-status-success/10 text-status-success border-status-success/30 text-[10px]"
                : "text-[10px]"
            }
          >
            {fmtToken(dto.definition?.definition_state || "supported")}
          </Badge>
        </div>
        <div className="font-mono text-[10px] text-muted-foreground mt-1 truncate max-w-[150px]">
          {dto.definition?.definition_id || "—"}
        </div>
        {dto.definition?.deployment_sha && (
          <div className="font-mono text-[10px] text-muted-foreground truncate max-w-[150px]">
            sha: {dto.definition.deployment_sha.slice(0, 8)}
          </div>
        )}
      </td>

      {/* 3. Desired Lifecycle */}
      <td className="px-3 py-3 min-w-[150px]">
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className={lifecycleTone(dto.desired?.desired_lifecycle)}>
            {fmtToken(dto.desired?.desired_lifecycle || dto.instance?.lifecycle_state || "configured_disabled")}
          </Badge>
          <Badge variant="outline" className="font-mono text-[10px]">
            r{dto.desired?.revision ?? dto.instance?.revision ?? 1}
          </Badge>
        </div>
      </td>

      {/* 4. Observed Health / Freshness */}
      <td className="px-3 py-3 min-w-[200px]">
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className={healthStateTone(dto.observed?.health_state)}>
            {fmtToken(dto.observed?.health_state || "healthy")}
          </Badge>
          <Badge variant="outline" className={reconciliationTone(dto.observed?.reconciliation_status)}>
            {fmtToken(dto.observed?.reconciliation_status || "converged")}
          </Badge>
        </div>
        <div className="text-[11px] text-muted-foreground mt-1 space-y-0.5">
          <div>Age: {formatAgeSeconds(dto.observed?.freshness?.age_seconds)}</div>
          {dto.observed?.freshness?.watermark && (
            <div className="font-mono text-[10px] truncate max-w-[180px]">
              wm: {dto.observed.freshness.watermark}
            </div>
          )}
        </div>
      </td>

      {/* 5. Credential / License */}
      <td className="px-3 py-3 min-w-[160px]">
        <div className="flex items-center gap-1">
          <Badge variant="outline" className={credentialTone(dto.observed?.credential_state)}>
            {fmtToken(dto.observed?.credential_state || "configured")}
          </Badge>
        </div>
        <div className="text-[11px] font-mono text-muted-foreground mt-1 truncate max-w-[150px]">
          {dto.desired?.connector_config?.secret_ref_id ? (
            <span title={dto.desired.connector_config.secret_ref_id}>
              {dto.desired.connector_config.secret_ref_id}
            </span>
          ) : (
            dto.instance?.license_scope || "—"
          )}
        </div>
      </td>

      {/* 6. Schedule / Watermark */}
      <td className="px-3 py-3 min-w-[160px]">
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className={dto.desired?.schedule?.enabled ? toneClass.ok : toneClass.muted}>
            {dto.desired?.schedule?.enabled ? t("mgmt.dataSources.liveOn") : t("mgmt.dataSources.liveOff")}
          </Badge>
        </div>
        {dto.desired?.schedule?.cadence && (
          <div className="font-mono text-[10px] text-muted-foreground mt-1">
            {dto.desired.schedule.cadence} ({dto.desired.schedule.timezone || "UTC"})
          </div>
        )}
      </td>

      {/* 7. Latest Run / Search */}
      <td className="px-3 py-3 min-w-[180px]">
        {dto.observed?.last_run ? (
          <div className="space-y-0.5">
            <div>
              Rows: <span className="font-mono font-medium">{dto.observed.last_run.row_count ?? 0}</span>
              {dto.observed.last_run.rejected_count ? (
                <span className="text-status-failed ml-1 font-mono">
                  (rej: {dto.observed.last_run.rejected_count})
                </span>
              ) : null}
            </div>
            {dto.observed.last_run.evidence_bundle_id && (
              <div className="font-mono text-[10px] text-muted-foreground truncate max-w-[160px]">
                <Link to="/management/evidence" className="text-primary hover:underline">
                  {dto.observed.last_run.evidence_bundle_id}
                </Link>
              </div>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground text-[11px]">—</span>
        )}
      </td>

      {/* 8. Consumers / Cost */}
      <td className="px-3 py-3 min-w-[170px]">
        <div className="space-y-1">
          <div className="flex flex-wrap gap-1 items-center">
            {(dto.observed?.dependent_refs ?? []).length === 0 ? (
              <span className="text-muted-foreground text-[11px]">—</span>
            ) : (
              <>
                <span className="text-[10px] text-muted-foreground font-medium mr-0.5">
                  {t("mgmt.dataSources.consumersCount", { count: dto.observed!.dependent_refs!.length })}:
                </span>
                {dto.observed!.dependent_refs!.slice(0, 3).map((ref) => (
                  <Link
                    key={ref}
                    to={`/management/personas/${encodeURIComponent(ref)}`}
                    className="font-mono text-[10px] text-primary hover:underline bg-primary/5 px-1 py-0.5 rounded border border-primary/20"
                  >
                    {ref}
                  </Link>
                ))}
              </>
            )}
          </div>
          {/* Usage & Cost Summary */}
          {(dto.observed?.usage || dto.observed?.quota) ? (
            <div className="text-[10px] text-muted-foreground font-mono flex flex-wrap gap-x-2 gap-y-0.5">
              {dto.observed?.usage?.cost_usd !== undefined && (
                <span>{t("mgmt.dataSources.costLabel")}: ${Number(dto.observed.usage.cost_usd).toFixed(2)}</span>
              )}
              {dto.observed?.usage?.calls_today !== undefined && (
                <span>({dto.observed.usage.calls_today} reqs)</span>
              )}
              {dto.observed?.quota?.used_percent !== undefined && (
                <span>{t("mgmt.dataSources.quotaLabel")}: {dto.observed.quota.used_percent}%</span>
              )}
              {dto.observed?.dlq_unresolved_count !== undefined && dto.observed.dlq_unresolved_count > 0 && (
                <Badge variant="outline" className="bg-status-failed/10 text-status-failed text-[9px] px-1 py-0 font-mono">
                  DLQ: {dto.observed.dlq_unresolved_count}
                </Badge>
              )}
            </div>
          ) : (
            <div className="text-[10px] text-muted-foreground font-mono">
              {t("mgmt.dataSources.costLabel")}: —
            </div>
          )}
        </div>
      </td>

      {/* 9. Actions Dropdown */}
      <td className="px-3 py-3 min-w-[120px] text-right">
        <div className="flex items-center justify-end gap-1">
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onSelect}>
            <Eye className="h-3.5 w-3.5 mr-1" />
            {t("mgmt.actions.view")}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-7 w-7 p-0" aria-label="More actions">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 text-xs">
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                {t("mgmt.dataSources.columns.actions")}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {DATA_SOURCE_ACTIONS.map((act) => {
                const { allowed, reasons } = isActionAllowed(act.key, allowedActions, writesLive);
                const displayReason = !writesLive ? t("mgmt.dataSources.realWritesRequired") : reasons[0];
                return (
                  <DropdownMenuItem
                    key={act.key}
                    disabled={!allowed}
                    onClick={() => onAction(act.key)}
                    className={act.destructive ? "text-status-failed focus:text-status-failed" : ""}
                  >
                    <div className="flex flex-col">
                      <span>{t(act.labelKey)}</span>
                      {!allowed && displayReason && (
                        <span className="text-[10px] text-muted-foreground font-normal">
                          {displayReason}
                        </span>
                      )}
                    </div>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </td>
    </tr>
  );
}

function LegacyDataSourceRow({
  record,
  onSelect,
}: {
  record: SystemDataSourceRecord;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const sideEffectsOn = record.orderSideEffectsAllowed || record.capitalSideEffectsAllowed;

  return (
    <tr className="hover:bg-muted/30 transition-colors align-top">
      <td className="px-3 py-3 min-w-[210px]">
        <div className="font-semibold text-foreground cursor-pointer hover:underline" onClick={onSelect}>
          {record.provider}
        </div>
        <div className="font-mono text-[11px] text-muted-foreground mt-0.5">{record.providerKey}</div>
        <div className="flex flex-wrap gap-1 mt-1.5">
          {record.markets.map((m) => (
            <Badge key={m} variant="outline" className="text-[10px] px-1 py-0 font-mono">
              {m}
            </Badge>
          ))}
          {record.sourceClasses.map((sc) => (
            <Badge key={sc} variant="outline" className="text-[10px] px-1 py-0">
              {fmtToken(sc)}
            </Badge>
          ))}
        </div>
      </td>

      <td className="px-3 py-3 min-w-[170px]">
        <Badge variant="outline" className="text-[10px]">
          legacy_projection
        </Badge>
      </td>

      <td className="px-3 py-3 min-w-[150px]">
        <Badge variant="outline" className={record.tone === "ok" ? toneClass.ok : toneClass.muted}>
          {fmtToken(record.status)}
        </Badge>
      </td>

      <td className="px-3 py-3 min-w-[200px]">
        <Badge variant="outline" className={toneClass[record.tone]}>
          {fmtToken(record.status)}
        </Badge>
        <div className="text-[11px] text-muted-foreground mt-1">
          {record.lastReadbackAt ? formatTime(record.lastReadbackAt) : t("mgmt.dataSources.noReadback")}
        </div>
      </td>

      <td className="px-3 py-3 min-w-[160px]">
        <Badge variant="outline" className={credentialTone(record.credentialState)}>
          {fmtToken(record.credentialState)}
        </Badge>
      </td>

      <td className="px-3 py-3 min-w-[160px]">
        <Badge variant="outline" className={record.liveIngestionEnabled ? toneClass.ok : toneClass.muted}>
          {record.liveIngestionEnabled ? t("mgmt.dataSources.liveOn") : t("mgmt.dataSources.liveOff")}
        </Badge>
      </td>

      <td className="px-3 py-3 min-w-[180px]">
        <div className="space-y-0.5">
          {record.evidenceRefs.slice(0, 1).map((ref) => (
            <div key={ref} className="font-mono text-[10px] text-muted-foreground truncate max-w-[160px]">
              {ref}
            </div>
          ))}
        </div>
      </td>

      <td className="px-3 py-3 min-w-[160px]">
        <div className="flex flex-wrap gap-1">
          {record.consumerPersonaIds.map((personaId, idx) => (
            <Link
              key={personaId}
              to={`/management/personas/${encodeURIComponent(personaId)}`}
              className="font-mono text-[10px] text-primary hover:underline"
            >
              {record.consumerPersonaNames[idx] ?? personaId}
            </Link>
          ))}
        </div>
      </td>

      <td className="px-3 py-3 min-w-[120px] text-right">
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onSelect}>
          <Eye className="h-3.5 w-3.5 mr-1" />
          {t("mgmt.actions.view")}
        </Button>
      </td>
    </tr>
  );
}
