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
    if (actionDef?.confirmationRequired && !confirmation) {
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
        confirmation,
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
      setErrorMsg(e.message || t("mgmt.dataSources.dialog.commandFailedGeneric"));
    }
  };

  const actionLabel = actionDef ? t(actionDef.labelKey) : actionKey;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[540px]" aria-describedby="command-dialog-description">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {actionDef?.destructive ? (
              <AlertTriangle className="h-5 w-5 text-status-failed" />
            ) : (
              <Clock className="h-5 w-5 text-primary" />
            )}
            {t("mgmt.dataSources.dialog.title", { action: actionLabel })}
          </DialogTitle>
          <DialogDescription id="command-dialog-description">
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

          {/* Command Specific Input Fields */}
          {actionKey === "replace" && !receipt && (
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
          )}

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

          {/* Confirmation Checkbox */}
          {actionDef?.confirmationRequired && !receipt && (
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

          {/* Error Banner */}
          {errorMsg && (
            <Card className="p-3 bg-status-failed/10 border-status-failed/30 text-xs text-status-failed flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">{t("mgmt.dataSources.dialog.errorTitle")}</p>
                <p className="mt-0.5">{errorMsg}</p>
              </div>
            </Card>
          )}

          {/* Success Receipt Details */}
          {receipt && receipt.status === "succeeded" && (
            <Card className="p-3 border-status-success/30 bg-status-success/5 text-xs space-y-2">
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
                disabled={
                  executing ||
                  polling ||
                  (actionDef?.reasonRequired && !reason.trim()) ||
                  (actionDef?.confirmationRequired && !confirmation)
                }
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
