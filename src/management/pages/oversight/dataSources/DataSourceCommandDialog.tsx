// Governed action command dialog with real-write gating, confirmations, and receipt polling (SD-SRCM-04).

import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  managementDataSourceWrites,
  type ManagementDataSourceV2DTO,
  type SourceCommandReceipt,
} from "@/lib/bff-v1/managementDataSources";
import { realWritesEnabled } from "@/lib/bff-v1/liveTransport";
import {
  DATA_SOURCE_ACTIONS,
  type DataSourceActionKey,
} from "./dataSourceActions";
import { fmtToken, formatTime, receiptStatusTone, toneClass } from "./dataSourceModels";

export interface DataSourceCommandDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actionKey: DataSourceActionKey | null;
  targetSource: ManagementDataSourceV2DTO | null;
  onCommandSuccess?: (receipt: SourceCommandReceipt) => void;
}

export function DataSourceCommandDialog({
  open,
  onOpenChange,
  actionKey,
  targetSource,
  onCommandSuccess,
}: DataSourceCommandDialogProps) {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState(false);
  const [retireConfirmText, setRetireConfirmText] = useState("");
  const [acknowledgeMigrationPlan, setAcknowledgeMigrationPlan] = useState(true);
  const [replacementSourceId, setReplacementSourceId] = useState("");
  const [scheduleCadence, setScheduleCadence] = useState("0 19 * * 1-5");
  const [scheduleTimezone, setScheduleTimezone] = useState("Asia/Taipei");
  const [scheduleJitter, setScheduleJitter] = useState(120);
  const [scheduleEnabled, setScheduleEnabled] = useState(true);

  const [executing, setExecuting] = useState(false);
  const [polling, setPolling] = useState(false);
  const [receipt, setReceipt] = useState<SourceCommandReceipt | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!actionKey || !targetSource) return null;

  const actionDef = DATA_SOURCE_ACTIONS.find((a) => a.key === actionKey);
  const sourceId = targetSource.source_instance_id || targetSource.connector_id;
  const currentRevision = targetSource.desired?.revision ?? targetSource.instance?.revision ?? 1;
  const writesLive = realWritesEnabled();

  const handleClose = () => {
    if (executing || polling) return;
    setReason("");
    setConfirmation(false);
    setRetireConfirmText("");
    setAcknowledgeMigrationPlan(true);
    setReplacementSourceId("");
    setReceipt(null);
    setErrorMsg(null);
    onOpenChange(false);
  };

  const handleExecute = async () => {
    if (actionDef?.reasonRequired && !reason.trim()) {
      setErrorMsg(t("mgmt.dataSources.dialog.reasonRequiredMsg"));
      return;
    }
    if (actionKey === "retire") {
      if (retireConfirmText.trim() !== "RETIRE") {
        setErrorMsg(t("mgmt.dataSources.dialog.retireTypedPrompt"));
        return;
      }
    } else if (actionDef?.confirmationRequired && !confirmation) {
      setErrorMsg(t("mgmt.dataSources.dialog.confirmationRequiredMsg"));
      return;
    }
    if (actionKey === "replace" && !replacementSourceId.trim()) {
      setErrorMsg(t("mgmt.dataSources.dialog.replacementRequiredMsg"));
      return;
    }

    setExecuting(true);
    setErrorMsg(null);
    setReceipt(null);

    try {
      let initialReceipt: SourceCommandReceipt;
      const baseInput = {
        sourceInstanceId: sourceId,
        expectedRevision: currentRevision,
        reason: reason.trim(),
        confirmation: actionKey === "retire" ? true : confirmation,
      };

      switch (actionKey) {
        case "validate":
          initialReceipt = await managementDataSourceWrites.validateDataSource(baseInput);
          break;
        case "canary":
          initialReceipt = await managementDataSourceWrites.canaryDataSource(baseInput);
          break;
        case "enable":
          initialReceipt = await managementDataSourceWrites.enableDataSource({
            ...baseInput,
            confirmation: true,
          });
          break;
        case "disable":
          initialReceipt = await managementDataSourceWrites.disableDataSource(baseInput);
          break;
        case "degrade":
          initialReceipt = await managementDataSourceWrites.degradeDataSource(baseInput);
          break;
        case "resume":
          initialReceipt = await managementDataSourceWrites.resumeDataSource(baseInput);
          break;
        case "schedule":
          initialReceipt = await managementDataSourceWrites.changeSchedule({
            sourceInstanceId: sourceId,
            expectedRevision: currentRevision,
            reason: reason.trim(),
            schedule: {
              enabled: scheduleEnabled,
              cadence: scheduleCadence.trim(),
              timezone: scheduleTimezone.trim(),
              jitter_seconds: Number(scheduleJitter),
            },
          });
          break;
        case "replace":
          initialReceipt = await managementDataSourceWrites.replaceDataSource({
            ...baseInput,
            confirmation: true,
            replacementSourceId: replacementSourceId.trim(),
          });
          break;
        case "retire":
          initialReceipt = await managementDataSourceWrites.retireDataSource({
            ...baseInput,
            confirmation: true,
          });
          break;
        default:
          throw new Error(`Unsupported action: ${actionKey}`);
      }

      setReceipt(initialReceipt);
      setExecuting(false);

      // If accepted/running, poll for readback
      if (initialReceipt.status === "accepted" || initialReceipt.status === "running") {
        setPolling(true);
        const finalReceipt = await managementDataSourceWrites.pollReceiptUntilTerminal(
          initialReceipt.receipt_id,
        );
        setReceipt(finalReceipt);
        setPolling(false);
        if (finalReceipt.status === "succeeded") {
          onCommandSuccess?.(finalReceipt);
        } else if (finalReceipt.status === "failed" || finalReceipt.status === "rejected") {
          setErrorMsg(
            finalReceipt.failure?.message ||
              `Command ended with status ${finalReceipt.status}`,
          );
        }
      } else if (initialReceipt.status === "succeeded") {
        onCommandSuccess?.(initialReceipt);
      } else if (initialReceipt.status === "failed" || initialReceipt.status === "rejected") {
        setErrorMsg(
          initialReceipt.failure?.message ||
            `Command rejected: ${initialReceipt.status}`,
        );
      }
    } catch (err: unknown) {
      setExecuting(false);
      setPolling(false);
      const e = err as { message?: string; code?: string; details?: { reason?: string } };
      const formatted = e.code ? `[${e.code}] ${e.message || t("mgmt.dataSources.dialog.commandFailedGeneric")}` : e.message || t("mgmt.dataSources.dialog.commandFailedGeneric");
      setErrorMsg(formatted);
    }
  };

  const actionLabel = actionDef ? t(actionDef.labelKey) : actionKey;
  const isStaleRevision = Boolean(
    errorMsg &&
      (/stale_revision/i.test(errorMsg) ||
        /revision mismatch/i.test(errorMsg) ||
        /stale revision/i.test(errorMsg)),
  );

  const dependentRefs = targetSource.observed?.dependent_refs ?? [];

  const isExecuteDisabled =
    executing ||
    polling ||
    !writesLive ||
    (actionDef?.reasonRequired && !reason.trim()) ||
    (actionKey === "replace" && !replacementSourceId.trim()) ||
    (actionKey === "replace" && dependentRefs.length > 0 && !acknowledgeMigrationPlan) ||
    (actionKey === "retire" && retireConfirmText.trim() !== "RETIRE") ||
    (actionKey !== "retire" && actionDef?.confirmationRequired && !confirmation);

  const canaryLimits =
    targetSource.desired?.limits ?? targetSource.definition?.default_limits;
  const canaryMaxRecords = canaryLimits?.max_records;
  const canaryMaxBytes = canaryLimits?.max_bytes;
  const canaryTimeout = canaryLimits?.timeout_seconds;
  const canaryAllowedHosts =
    targetSource.desired?.allowed_hosts ??
    targetSource.definition?.allowed_host_patterns ??
    [];

  const definitionState = targetSource.definition?.definition_state || "unknown";
  const validationState = targetSource.observed?.validation_state || "unknown";
  const canaryState = targetSource.observed?.canary_state || "unknown";
  const credentialState = targetSource.observed?.credential_state || "unknown";
  const scheduleActive = Boolean(targetSource.desired?.schedule?.enabled);
  const scheduleCadenceText = targetSource.desired?.schedule?.cadence || (scheduleActive ? "Enabled" : "Disabled");
  const egressText = canaryAllowedHosts.length > 0 ? `${canaryAllowedHosts.length} hosts` : t("mgmt.dataSources.dialog.canaryAllowedHostsNone", "None declared / unrestricted");
  const serverAllowedActions = targetSource.allowed_actions ?? targetSource.allowedActions;
  const serverBlockedReasons = serverAllowedActions?.blockedReasons ?? [];
  const enablePreconditionsMet = Boolean(
    serverAllowedActions?.canEnable ??
      (validationState === "passed" && canaryState === "passed" && definitionState === "supported"),
  );

  const resumeWillRerunChecks = validationState !== "passed" || canaryState !== "passed";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {actionDef?.destructive ? (
              <AlertTriangle className="h-5 w-5 text-status-failed" />
            ) : (
              <Clock className="h-5 w-5 text-primary" />
            )}
            {t("mgmt.dataSources.dialog.title", { action: actionLabel })}
          </DialogTitle>
          <DialogDescription>
            {actionDef ? t(actionDef.descKey) : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Target Metadata Bar */}
          <Card className="p-3 bg-muted/40 text-xs space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">{t("mgmt.dataSources.dialog.targetSource")}:</span>
              <span className="font-mono font-medium text-foreground">{sourceId}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">{t("mgmt.dataSources.dialog.expectedRevision")}:</span>
              <Badge variant="outline" className="font-mono">
                Rev {currentRevision}
              </Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">{t("mgmt.dataSources.provider")}:</span>
              <span className="font-medium text-foreground">{targetSource.provider}</span>
            </div>
          </Card>

          {/* Real write warning if disabled */}
          {!writesLive && (
            <Card className="p-3 bg-status-warning/10 border-status-warning/30 text-xs text-status-warning flex items-start gap-2">
              <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">{t("mgmt.dataSources.dialog.writeGateDisabledTitle")}</p>
                <p className="mt-0.5 text-muted-foreground">
                  {t("mgmt.dataSources.dialog.writeGateDisabledDesc")}
                </p>
              </div>
            </Card>
          )}

          {/* Action Specific Warnings */}
          {actionDef?.warningKey && (
            <Card className="p-3 bg-status-failed/10 border-status-failed/30 text-xs text-status-failed flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>{t(actionDef.warningKey)}</div>
            </Card>
          )}

          {/* Canary UX: Limits, Hosts, and No-Order Safety Statement */}
          {actionKey === "canary" && !receipt && (
            <Card className="p-3 bg-primary/5 border-primary/20 text-xs space-y-2.5">
              <div className="flex items-center gap-1.5 font-medium text-foreground">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                {t("mgmt.dataSources.dialog.canaryLimitsTitle")}
              </div>
              <div className="grid grid-cols-3 gap-2 text-[11px] font-mono">
                <div className="p-1.5 rounded bg-background border">
                  <span className="text-muted-foreground block text-[10px]">{t("mgmt.dataSources.dialog.canaryMaxRecords")}</span>
                  <span className="font-semibold text-foreground">
                    {canaryMaxRecords !== undefined ? canaryMaxRecords : "—"}
                  </span>
                </div>
                <div className="p-1.5 rounded bg-background border">
                  <span className="text-muted-foreground block text-[10px]">{t("mgmt.dataSources.dialog.canaryMaxBytes")}</span>
                  <span className="font-semibold text-foreground">
                    {canaryMaxBytes !== undefined ? `${canaryMaxBytes} B` : "—"}
                  </span>
                </div>
                <div className="p-1.5 rounded bg-background border">
                  <span className="text-muted-foreground block text-[10px]">{t("mgmt.dataSources.dialog.canaryTimeout")}</span>
                  <span className="font-semibold text-foreground">
                    {canaryTimeout !== undefined ? `${canaryTimeout}s` : "—"}
                  </span>
                </div>
              </div>
              <div className="text-[11px] font-mono">
                <span className="text-muted-foreground block text-[10px]">{t("mgmt.dataSources.dialog.canaryAllowedHosts")}:</span>
                <span className="text-foreground">
                  {canaryAllowedHosts.length > 0 ? canaryAllowedHosts.join(", ") : t("mgmt.dataSources.dialog.canaryAllowedHostsNone", "None declared / unrestricted")}
                </span>
              </div>
              <div className="p-2 rounded bg-muted/60 text-[11px] text-muted-foreground border">
                {t("mgmt.dataSources.dialog.canarySafetyNotice")}
              </div>
            </Card>
          )}

          {/* Enable UX: Preconditions Gate */}
          {actionKey === "enable" && !receipt && (
            <Card className="p-3 border text-xs space-y-2">
              <div className="font-medium text-foreground flex items-center justify-between">
                <span>{t("mgmt.dataSources.dialog.enablePreconditionsTitle")}</span>
                <Badge variant="outline" className={enablePreconditionsMet ? toneClass.ok : toneClass.warning}>
                  {enablePreconditionsMet ? "Preconditions Passed" : "Preconditions Incomplete"}
                </Badge>
              </div>
              <div className="grid grid-cols-3 gap-2 text-[11px] font-mono">
                <div className="p-1.5 rounded bg-muted/40 border">
                  <span className="text-muted-foreground block text-[10px]">{t("mgmt.dataSources.dialog.definitionStateLabel")}</span>
                  <span className={definitionState === "supported" ? "text-status-success font-semibold" : "text-status-warning font-semibold"}>
                    {definitionState}
                  </span>
                </div>
                <div className="p-1.5 rounded bg-muted/40 border">
                  <span className="text-muted-foreground block text-[10px]">{t("mgmt.dataSources.dialog.validationStateLabel")}</span>
                  <span className={validationState === "passed" ? "text-status-success font-semibold" : "text-status-warning font-semibold"}>
                    {validationState}
                  </span>
                </div>
                <div className="p-1.5 rounded bg-muted/40 border">
                  <span className="text-muted-foreground block text-[10px]">{t("mgmt.dataSources.dialog.canaryStateLabel")}</span>
                  <span className={canaryState === "passed" ? "text-status-success font-semibold" : "text-status-warning font-semibold"}>
                    {canaryState}
                  </span>
                </div>
                <div className="p-1.5 rounded bg-muted/40 border">
                  <span className="text-muted-foreground block text-[10px]">{t("mgmt.dataSources.dialog.credentialStateLabel")}</span>
                  <span className="text-foreground font-semibold">{credentialState}</span>
                </div>
                <div className="p-1.5 rounded bg-muted/40 border">
                  <span className="text-muted-foreground block text-[10px]">{t("mgmt.dataSources.dialog.scheduleStateLabel")}</span>
                  <span className="text-foreground font-semibold">{scheduleCadenceText}</span>
                </div>
                <div className="p-1.5 rounded bg-muted/40 border">
                  <span className="text-muted-foreground block text-[10px]">{t("mgmt.dataSources.dialog.egressStateLabel")}</span>
                  <span className="text-foreground font-semibold">{egressText}</span>
                </div>
              </div>
              {serverBlockedReasons.length > 0 && (
                <div className="p-1.5 rounded bg-status-failed/10 border border-status-failed/20 text-[10px] text-status-failed">
                  <span className="font-semibold block">{t("mgmt.dataSources.dialog.serverBlockedReasonsLabel")}:</span>
                  <span>{serverBlockedReasons.join(", ")}</span>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">
                {enablePreconditionsMet
                  ? t("mgmt.dataSources.dialog.preconditionsPassed")
                  : t("mgmt.dataSources.dialog.preconditionsWarning")}
              </p>
            </Card>
          )}

          {/* Resume UX: Rerun Truth Description */}
          {actionKey === "resume" && !receipt && (
            <Card className="p-3 bg-primary/5 border-primary/20 text-xs space-y-1.5">
              <p className="font-medium text-foreground">{t("mgmt.dataSources.dialog.resumeRerunTruthTitle")}</p>
              <p className="text-[11px] text-muted-foreground">
                {resumeWillRerunChecks
                  ? t("mgmt.dataSources.dialog.resumeRerunRequiredDesc", {
                      val: validationState,
                      can: canaryState,
                    })
                  : t("mgmt.dataSources.dialog.resumeDirectRestoreDesc")}
              </p>
            </Card>
          )}

          {/* Replace UX: Replacement ID and Dependent Migration */}
          {actionKey === "replace" && !receipt && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="replacementSourceId" className="text-xs">
                  {t("mgmt.dataSources.dialog.replacementSourceId")} *
                </Label>
                <Input
                  id="replacementSourceId"
                  placeholder="e.g. ds-twse-market-v2"
                  value={replacementSourceId}
                  onChange={(e) => setReplacementSourceId(e.target.value)}
                  disabled={executing || polling}
                  className="text-xs font-mono"
                />
              </div>

              <Card className="p-3 bg-muted/30 border text-xs space-y-2">
                <div className="font-medium text-foreground">
                  {t("mgmt.dataSources.dialog.replaceMigrationTitle")}
                </div>
                {dependentRefs.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">
                    {t("mgmt.dataSources.dialog.noDependentsToMigrate")}
                  </p>
                ) : (
                  <>
                    <p className="text-[11px] text-muted-foreground">
                      {t("mgmt.dataSources.dialog.replaceMigrationDesc")}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {dependentRefs.map((ref) => (
                        <Badge key={ref} variant="outline" className="font-mono text-[10px] bg-primary/5 text-primary">
                          {ref}
                        </Badge>
                      ))}
                    </div>
                    <div className="flex items-center space-x-2 pt-1">
                      <Checkbox
                        id="migrateDependentsCheck"
                        checked={acknowledgeMigrationPlan}
                        onCheckedChange={(checked) => setAcknowledgeMigrationPlan(Boolean(checked))}
                        disabled={executing || polling}
                      />
                      <Label htmlFor="migrateDependentsCheck" className="text-xs cursor-pointer">
                        {t("mgmt.dataSources.dialog.confirmMigrateDependents")}
                      </Label>
                    </div>
                  </>
                )}
              </Card>
            </div>
          )}

          {/* Schedule UX */}
          {actionKey === "schedule" && !receipt && (
            <div className="space-y-3 p-3 border rounded-md bg-card">
              <div className="flex items-center justify-between">
                <Label htmlFor="scheduleEnabled" className="text-xs font-medium">
                  {t("mgmt.dataSources.dialog.scheduleEnabled")}
                </Label>
                <Checkbox
                  id="scheduleEnabled"
                  checked={scheduleEnabled}
                  onCheckedChange={(checked) => setScheduleEnabled(Boolean(checked))}
                  disabled={executing || polling}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="scheduleCadence" className="text-xs">
                  {t("mgmt.dataSources.dialog.cadenceCron")} (cron)
                </Label>
                <Input
                  id="scheduleCadence"
                  value={scheduleCadence}
                  onChange={(e) => setScheduleCadence(e.target.value)}
                  disabled={executing || polling}
                  className="text-xs font-mono"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="scheduleTimezone" className="text-xs">
                    {t("mgmt.dataSources.dialog.timezone")}
                  </Label>
                  <Input
                    id="scheduleTimezone"
                    value={scheduleTimezone}
                    onChange={(e) => setScheduleTimezone(e.target.value)}
                    disabled={executing || polling}
                    className="text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="scheduleJitter" className="text-xs">
                    {t("mgmt.dataSources.dialog.jitterSeconds")}
                  </Label>
                  <Input
                    id="scheduleJitter"
                    type="number"
                    value={scheduleJitter}
                    onChange={(e) => setScheduleJitter(Number(e.target.value))}
                    disabled={executing || polling}
                    className="text-xs font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Retire UX: Typed "RETIRE" Confirmation Input */}
          {actionKey === "retire" && !receipt && (
            <div className="space-y-2 p-3 border rounded-md bg-status-failed/5 border-status-failed/30">
              <Label htmlFor="retireConfirmText" className="text-xs font-medium text-status-failed block">
                {t("mgmt.dataSources.dialog.retireTypedPrompt")}
              </Label>
              <Input
                id="retireConfirmText"
                placeholder={t("mgmt.dataSources.dialog.retireTypedPlaceholder")}
                value={retireConfirmText}
                onChange={(e) => setRetireConfirmText(e.target.value)}
                disabled={executing || polling}
                className="text-xs font-mono border-status-failed/40 text-status-failed"
              />
            </div>
          )}

          {/* Reason Input */}
          {!receipt && (
            <div className="space-y-1.5">
              <Label htmlFor="commandReason" className="text-xs">
                {t("mgmt.dataSources.dialog.reasonLabel")} {actionDef?.reasonRequired && "*"}
              </Label>
              <Textarea
                id="commandReason"
                placeholder={t("mgmt.dataSources.dialog.reasonPlaceholder")}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={executing || polling}
                rows={2}
                className="text-xs resize-none"
              />
            </div>
          )}

          {/* Generic Confirmation Checkbox (for actions other than retire) */}
          {actionDef?.confirmationRequired && actionKey !== "retire" && !receipt && (
            <div className="flex items-start space-x-2 pt-1">
              <Checkbox
                id="confirmCheckbox"
                checked={confirmation}
                onCheckedChange={(checked) => setConfirmation(Boolean(checked))}
                disabled={executing || polling}
                className="mt-0.5"
              />
              <Label
                htmlFor="confirmCheckbox"
                className="text-xs font-medium text-foreground leading-snug cursor-pointer"
              >
                {t("mgmt.dataSources.dialog.confirmActionPrompt", { action: actionLabel })}
              </Label>
            </div>
          )}

          {/* Progress / Polling State */}
          {(executing || polling) && (
            <Card className="p-3 border-primary/30 bg-primary/5 text-xs space-y-2">
              <div className="flex items-center gap-2 text-primary font-medium">
                <Loader2 className="h-4 w-4 animate-spin" />
                {polling
                  ? t("mgmt.dataSources.dialog.pollingReceipt")
                  : t("mgmt.dataSources.dialog.submittingCommand")}
              </div>
              <p className="text-muted-foreground text-[11px]">
                {t("mgmt.dataSources.dialog.pollingReceiptHint")}
              </p>
            </Card>
          )}

          {/* STALE_REVISION Corrective Action Banner */}
          {isStaleRevision && (
            <Card className="p-3 bg-status-warning/15 border-status-warning/40 text-xs space-y-2" data-testid="stale-revision-alert">
              <div className="flex items-center gap-2 text-status-warning font-semibold">
                <AlertTriangle className="h-4 w-4" />
                {t("mgmt.dataSources.dialog.staleRevisionTitle")}
              </div>
              <p className="text-muted-foreground text-[11px]">
                {t("mgmt.dataSources.dialog.staleRevisionDesc")}
              </p>
              <Button
                size="sm"
                variant="outline"
                className="text-xs h-7 border-status-warning/30 hover:bg-status-warning/10"
                onClick={() => {
                  onCommandSuccess?.(
                    receipt ?? {
                      receipt_id: `reload-${sourceId}`,
                      command_id: `reload-${sourceId}`,
                      source_instance_id: sourceId,
                      command_type: actionKey,
                      status: "rejected",
                    },
                  );
                  handleClose();
                }}
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1" />
                {t("mgmt.dataSources.dialog.reloadRevisionAction")}
              </Button>
            </Card>
          )}

          {/* General Error Banner */}
          {errorMsg && !isStaleRevision && (
            <Card className="p-3 bg-status-failed/10 border-status-failed/30 text-xs text-status-failed flex items-start gap-2" data-testid="command-error-banner">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">{t("mgmt.dataSources.dialog.errorTitle")}</p>
                <p className="mt-0.5">{errorMsg}</p>
              </div>
            </Card>
          )}

          {/* Success Receipt Details */}
          {receipt && receipt.status === "succeeded" && (
            <Card className="p-3 border-status-success/30 bg-status-success/5 text-xs space-y-2" data-testid="command-success-card">
              <div className="flex items-center gap-2 text-status-success font-medium">
                <CheckCircle2 className="h-4 w-4" />
                {t("mgmt.dataSources.dialog.commandSucceededTitle")}
              </div>
              <div className="space-y-1 text-muted-foreground font-mono text-[11px]">
                <div>Receipt ID: {receipt.receipt_id}</div>
                <div>Status: {receipt.status}</div>
                {receipt.after_revision !== undefined && (
                  <div>
                    Revision: {receipt.before_revision ?? currentRevision} → {receipt.after_revision}
                  </div>
                )}
                {receipt.readback?.reconciliation_status && (
                  <div>Reconciliation: {receipt.readback.reconciliation_status}</div>
                )}
              </div>
            </Card>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {receipt?.status === "succeeded" ? (
            <Button size="sm" onClick={handleClose}>
              {t("mgmt.actions.close")}
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleClose}
                disabled={executing || polling}
              >
                {t("mgmt.actions.cancel")}
              </Button>
              <Button
                variant={actionDef?.destructive ? "destructive" : "default"}
                size="sm"
                onClick={handleExecute}
                disabled={isExecuteDisabled}
                title={!writesLive ? t("mgmt.dataSources.realWritesRequired") : undefined}
              >
                {executing ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5 mr-1" />
                )}
                {t("mgmt.dataSources.dialog.executeAction", { action: actionLabel })}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
