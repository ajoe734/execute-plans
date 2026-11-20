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
  MISSING_DATA_SOURCE_FIELD_LABEL,
  canaryTone,
  cleanSourceToken,
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
  translateDataSourceSurfaceStatus,
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
  surfaceStatus?: string;
  surfaceSource?: string;
  surfaceReason?: string;
  isLegacyProjection?: boolean;
}

export function DataSourceInstancesTable({
  records,
  onSelectSource,
  onExecuteAction,
  surfaceStatus,
  surfaceSource,
  surfaceReason,
  isLegacyProjection,
}: DataSourceInstancesTableProps) {
  const { t } = useTranslation();
  const normalizedStatus = (cleanSourceToken(surfaceStatus) ?? "").toLowerCase();
  const legacyMode =
    Boolean(isLegacyProjection) ||
    (cleanSourceToken(surfaceSource) ?? "").toLowerCase() === "legacy_projection";
  const showSurfaceBar =
    normalizedStatus === "unavailable" ||
    normalizedStatus === "degraded" ||
    legacyMode;
  const effectiveStatus =
    normalizedStatus || (legacyMode ? "degraded" : "ok");
  const statusToneKey =
    effectiveStatus === "unavailable"
      ? "bad"
      : effectiveStatus === "degraded"
        ? "warn"
        : "ok";

  return (
    <Card className="overflow-hidden border">
      {showSurfaceBar && (
        <div
          className="px-3 py-2 border-b border-border bg-status-warning/5 flex flex-wrap items-center gap-2 text-xs"
          data-testid="instances-table-surface-status"
        >
          <Badge variant="outline" className={toneClass[statusToneKey]}>
            {translateDataSourceSurfaceStatus(effectiveStatus, t)}
          </Badge>
          {legacyMode && (
            <Badge variant="outline" className="font-mono text-[10px]">
              {t("mgmt.dataSources.legacyProjectionBadge")}
            </Badge>
          )}
          {surfaceReason && (
            <span className="text-muted-foreground">
              {t("mgmt.dataSources.surfaceReasonFmt", { reason: surfaceReason })}
            </span>
          )}
        </div>
      )}
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
            {records.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-4 py-6 text-center text-xs text-muted-foreground"
                  data-testid="instances-table-empty-row"
                >
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <span className="font-medium text-foreground">
                      {effectiveStatus === "ok"
                        ? t("mgmt.dataSources.emptyTitle")
                        : translateDataSourceSurfaceStatus(effectiveStatus, t)}
                    </span>
                    {legacyMode && (
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {t("mgmt.dataSources.legacyProjectionSource")}
                      </Badge>
                    )}
                    {surfaceReason && (
                      <span>
                        {t("mgmt.dataSources.surfaceReasonFmt", { reason: surfaceReason })}
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              records.map((item, index) => {
                if (isV2(item)) {
                  const keyId =
                    cleanSourceToken(item.source_instance_id) ||
                    cleanSourceToken(item.connector_id) ||
                    `v2-${index}`;
                  return (
                    <V2DataSourceRow
                      key={keyId}
                      dto={item}
                      isLegacyProjection={legacyMode}
                      onSelect={() => onSelectSource(keyId, item)}
                      onAction={(action) => onExecuteAction(action, item)}
                    />
                  );
                }
                const legacyItem = item as SystemDataSourceRecord;
                const legacyKey = cleanSourceToken(legacyItem.providerKey) || `legacy-${index}`;
                return (
                  <LegacyDataSourceRow
                    key={legacyKey}
                    record={legacyItem}
                    onSelect={() => onSelectSource(legacyKey, null)}
                  />
                );
              })
            )}
          </tbody>
        </table>
      </ManagementTableScroll>
    </Card>
  );
}

function V2DataSourceRow({
  dto,
  isLegacyProjection,
  onSelect,
  onAction,
}: {
  dto: ManagementDataSourceV2DTO;
  isLegacyProjection?: boolean;
  onSelect: () => void;
  onAction: (actionKey: DataSourceActionKey) => void;
}) {
  const { t } = useTranslation();
  const sourceId =
    cleanSourceToken(dto.source_instance_id) ||
    cleanSourceToken(dto.connector_id) ||
    MISSING_DATA_SOURCE_FIELD_LABEL;
  const providerLabel =
    cleanSourceToken(dto.provider) ||
    cleanSourceToken(dto.definition?.provider) ||
    cleanSourceToken(dto.source_instance_id) ||
    cleanSourceToken(dto.connector_id) ||
    MISSING_DATA_SOURCE_FIELD_LABEL;
  const divergence = hasDivergence(dto);
  const allowedActions = dto.allowed_actions || dto.allowedActions;
  const desiredLifecycle =
    cleanSourceToken(dto.desired?.desired_lifecycle) ||
    cleanSourceToken(dto.instance?.lifecycle_state) ||
    MISSING_DATA_SOURCE_FIELD_LABEL;
  const healthState =
    cleanSourceToken(dto.observed?.health_state) ||
    MISSING_DATA_SOURCE_FIELD_LABEL;
  const reconciliationStatus =
    cleanSourceToken(dto.observed?.reconciliation_status) ||
    MISSING_DATA_SOURCE_FIELD_LABEL;
  const credentialState =
    cleanSourceToken(dto.observed?.credential_state) ||
    MISSING_DATA_SOURCE_FIELD_LABEL;
  const definitionState =
    cleanSourceToken(dto.definition?.definition_state) ||
    MISSING_DATA_SOURCE_FIELD_LABEL;

  const writesLive = realWritesEnabled();

  return (
    <tr className="hover:bg-muted/30 transition-colors align-top">
      {/* 1. Source / Provider */}
      <td className="px-3 py-3 min-w-[210px]">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-foreground cursor-pointer hover:underline" onClick={onSelect}>
            {providerLabel}
          </span>
          {divergence && (
            <span title={t("mgmt.dataSources.detail.divergenceTitle")}>
              <AlertTriangle className="h-3.5 w-3.5 text-status-warning inline" />
            </span>
          )}
        </div>
        <div className="font-mono text-[11px] text-muted-foreground mt-0.5">{sourceId}</div>
        <div className="flex flex-wrap gap-1 mt-1.5">
          {(dto.instance?.markets ?? dto.definition?.markets ?? [])
            .map((m) => cleanSourceToken(m))
            .filter((m): m is string => Boolean(m))
            .map((m) => (
              <Badge key={m} variant="outline" className="text-[10px] px-1 py-0 font-mono">
                {m}
              </Badge>
            ))}
          {cleanSourceToken(dto.source_class) && (
            <Badge key={dto.source_class} variant="outline" className="text-[10px] px-1 py-0">
              {fmtToken(dto.source_class, MISSING_DATA_SOURCE_FIELD_LABEL)}
            </Badge>
          )}
        </div>
      </td>

      {/* 2. Support / Deployment */}
      <td className="px-3 py-3 min-w-[170px]">
        <div className="flex flex-wrap items-center gap-1">
          <Badge
            variant="outline"
            className={
              definitionState === "supported"
                ? "bg-status-success/10 text-status-success border-status-success/30 text-[10px]"
                : "text-[10px]"
            }
          >
            {fmtToken(definitionState, MISSING_DATA_SOURCE_FIELD_LABEL)}
          </Badge>
          {isLegacyProjection && (
            <Badge variant="outline" className="text-[10px] font-mono">
              {t("mgmt.dataSources.legacyProjectionSource")}
            </Badge>
          )}
        </div>
        <div className="font-mono text-[10px] text-muted-foreground mt-1 truncate max-w-[150px]">
          {cleanSourceToken(dto.definition?.definition_id) || "—"}
        </div>
        {cleanSourceToken(dto.definition?.deployment_sha) && (
          <div className="font-mono text-[10px] text-muted-foreground truncate max-w-[150px]">
            sha: {dto.definition.deployment_sha!.slice(0, 8)}
          </div>
        )}
      </td>

      {/* 3. Desired Lifecycle */}
      <td className="px-3 py-3 min-w-[150px]">
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className={lifecycleTone(desiredLifecycle)}>
            {fmtToken(desiredLifecycle, MISSING_DATA_SOURCE_FIELD_LABEL)}
          </Badge>
          <Badge variant="outline" className="font-mono text-[10px]">
            {dto.desired?.revision !== undefined && dto.desired.revision >= 1 ? `r${dto.desired.revision}` : (dto.instance?.revision !== undefined && dto.instance.revision >= 1 ? `r${dto.instance.revision}` : "r—")}
          </Badge>
        </div>
      </td>

      {/* 4. Observed Health / Freshness */}
      <td className="px-3 py-3 min-w-[200px]">
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className={healthStateTone(healthState)}>
            {fmtToken(healthState, MISSING_DATA_SOURCE_FIELD_LABEL)}
          </Badge>
          <Badge variant="outline" className={reconciliationTone(reconciliationStatus)}>
            {fmtToken(reconciliationStatus, MISSING_DATA_SOURCE_FIELD_LABEL)}
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
          <Badge variant="outline" className={credentialTone(credentialState)}>
            {fmtToken(credentialState, MISSING_DATA_SOURCE_FIELD_LABEL)}
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
            {dto.desired?.schedule?.enabled !== undefined ? (dto.desired.schedule.enabled ? t("mgmt.dataSources.liveOn") : t("mgmt.dataSources.liveOff")) : "—"}
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
              Rows: <span className="font-mono font-medium">{dto.observed.last_run.row_count !== undefined ? dto.observed.last_run.row_count : "—"}</span>
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
                <span>({String(dto.observed.usage.calls_today)} reqs)</span>
              )}
              {dto.observed?.quota?.used_percent !== undefined && (
                <span>{t("mgmt.dataSources.quotaLabel")}: {String(dto.observed.quota.used_percent)}%</span>
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
  const providerLabel = cleanSourceToken(record.provider) || MISSING_DATA_SOURCE_FIELD_LABEL;
  const providerKeyLabel = cleanSourceToken(record.providerKey) || MISSING_DATA_SOURCE_FIELD_LABEL;
  const statusLabelText = fmtToken(record.status, MISSING_DATA_SOURCE_FIELD_LABEL);
  const credentialLabelText = fmtToken(record.credentialState, MISSING_DATA_SOURCE_FIELD_LABEL);

  return (
    <tr className="hover:bg-muted/30 transition-colors align-top">
      <td className="px-3 py-3 min-w-[210px]">
        <div className="font-semibold text-foreground cursor-pointer hover:underline" onClick={onSelect}>
          {providerLabel}
        </div>
        <div className="font-mono text-[11px] text-muted-foreground mt-0.5">{providerKeyLabel}</div>
        <div className="flex flex-wrap gap-1 mt-1.5">
          {record.markets
            .map((m) => cleanSourceToken(m))
            .filter((m): m is string => Boolean(m))
            .map((m) => (
              <Badge key={m} variant="outline" className="text-[10px] px-1 py-0 font-mono">
                {m}
              </Badge>
            ))}
          {record.sourceClasses
            .map((sc) => cleanSourceToken(sc))
            .filter((sc): sc is string => Boolean(sc))
            .map((sc) => (
              <Badge key={sc} variant="outline" className="text-[10px] px-1 py-0">
                {fmtToken(sc, MISSING_DATA_SOURCE_FIELD_LABEL)}
              </Badge>
            ))}
        </div>
      </td>

      <td className="px-3 py-3 min-w-[170px]">
        <Badge variant="outline" className="text-[10px] font-mono">
          {t("mgmt.dataSources.legacyProjectionSource")}
        </Badge>
      </td>

      <td className="px-3 py-3 min-w-[150px]">
        <Badge variant="outline" className={record.tone === "ok" ? toneClass.ok : toneClass.muted}>
          {statusLabelText}
        </Badge>
      </td>

      <td className="px-3 py-3 min-w-[200px]">
        <Badge variant="outline" className={toneClass[record.tone]}>
          {statusLabelText}
        </Badge>
        <div className="text-[11px] text-muted-foreground mt-1">
          {record.lastReadbackAt ? formatTime(record.lastReadbackAt) : t("mgmt.dataSources.noReadback")}
        </div>
      </td>

      <td className="px-3 py-3 min-w-[160px]">
        <Badge variant="outline" className={credentialTone(record.credentialState)}>
          {credentialLabelText}
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
